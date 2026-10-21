// Entry point: env -> content (packs, id lock, audio) -> db + migrations -> seed -> express -> listen.
// SIGHUP (`systemctl reload anzo`) reloads the content atomically; SIGTERM/SIGINT shut down.
import path from 'node:path';
import pino from 'pino';
import { loadConfig } from './config.js';
import { openDb, runMigrations } from './db/index.js';
import { countUsers, seedUsers } from './lib/users.js';
import { readSeedFile, seedFile, seedProblems } from './lib/seed.js';
import { ContentError } from './content/loader.js';
import { createContentStore, loadRuntime } from './content/store.js';
import { createApp } from './app.js';
import { backfillGamification } from './lib/badges.js';
import { markLegacyAttempts } from './lib/legacy.js';
import { checkIntegrity } from './lib/integrity.js';
import { ensureSpool, writeStatus } from './ops/spool.js';
import { gitCommit } from './ops/system.js';
import { startResultPoller } from './ops/corrections.js';
import { installTestClock } from './lib/clock.js';

const testClock = installTestClock(process.env); // NODE_ENV=test + ANZO_FAKE_NOW only (e2e)
const config = loadConfig();
const logger = pino({ level: config.logLevel, base: { app: 'anzo' } });
if (testClock) logger.warn({ fakeNow: process.env.ANZO_FAKE_NOW, offsetMs: testClock.offset }, 'test clock installed');

let runtime;
try {
  runtime = loadRuntime({ config, logger });
} catch (err) {
  if (err instanceof ContentError) {
    console.error(`[anzo] Refusing to start. ${err.message}`);
    logger.fatal({ errors: err.errors }, 'content validation failed');
    process.exit(1);
  }
  throw err;
}

const { audio } = runtime;
const audioSummary = { audioDir: config.audioDir, expected: audio.expected, present: audio.present, missing: audio.missing };
if (audio.missing) logger.warn({ ...audioSummary, missingByTrack: audio.missingByTrack }, 'audio manifest loaded with missing clips (run npm run audio:render)');
else logger.info(audioSummary, 'audio manifest loaded');
// At startup there is no older content to fall back to: a lock problem is reported (System page), not fatal.
if (runtime.lockProblems.length) logger.error({ problems: runtime.lockProblems.slice(0, 20) }, 'content breaks the id lock');

const db = openDb(config.dataDir);
const applied = runMigrations(db);
if (applied.length) logger.info({ applied }, 'migrations applied');
// an empty database (a fresh install): the seed accounts of config/seed.local.json, else config/seed.example.json (lib/seed.js)
if (countUsers(db) === 0) {
  try {
    const rows = readSeedFile(seedFile());
    const problems = await seedProblems(rows, runtime.content.manifest);
    if (problems.length) throw new Error(problems.join('; '));
    logger.info({ created: seedUsers(db, rows), from: path.basename(seedFile()) }, 'seeded users');
  } catch (err) {
    // the app still starts (without accounts); fix the seed file and run npm run seed
    logger.error({ file: seedFile(), error: err.message }, 'seed file refused: no accounts created');
  }
}
// Migration 005 introduced badges and daily goals: award what the existing history already earned, silently.
if (applied.some((f) => f.startsWith('005_'))) logger.info({ awarded: backfillGamification(db, runtime.content) }, 'badges and daily goals backfilled');

let spoolOk = true;
try {
  ensureSpool(config.spoolDir);
} catch (err) {
  spoolOk = false;
  logger.warn({ spoolDir: config.spoolDir, error: err.code || err.message }, 'spool not writable: content corrections and status files are off');
}

/** After every (re)load: legacy flags follow the content; the integrity summary goes to the spool for the content job. */
function afterLoad(rt, store) {
  const legacy = markLegacyAttempts(db, rt.content);
  if (legacy.marked || legacy.cleared) logger.info(legacy, 'legacy attempts updated');
  let integrity;
  try {
    const r = checkIntegrity(db, rt.content);
    integrity = { ok: r.errors.length === 0, errors: r.errors.slice(0, 20), warnings: r.warnings.slice(0, 20), info: r.info.slice(0, 20) };
    if (r.errors.length) logger.error({ errors: integrity.errors }, 'integrity check after content load failed');
  } catch (err) {
    integrity = { ok: false, errors: [`integrity check crashed: ${err.message}`], warnings: [], info: [] };
  }
  if (!spoolOk) return;
  try {
    writeStatus(config.spoolDir, 'content', {
      pid: process.pid,
      ...(store ? store.status() : { generation: 1, loadedAt: rt.loadedAt, lockProblems: rt.lockProblems, lastReload: null }),
      commit: gitCommit(config.rootDir),
      packs: [...rt.content.packs.keys()],
      audioMissing: rt.audio.missing,
      legacy,
      integrity,
    });
  } catch (err) {
    logger.warn({ error: err.message }, 'cannot write the content status file');
  }
}

let store;
store = createContentStore(runtime, {
  load: () => loadRuntime({ config, logger, strictLock: true }),
  logger,
  onSwap: (rt) => afterLoad(rt, store),
});
afterLoad(runtime, store);

// Nothing may die silently: a rejected promise nobody awaited is logged and the app carries on (one request failed); an
// uncaught exception leaves the process in an unknown state, so it is logged and the process exits for systemd to restart.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason instanceof Error ? reason : new Error(String(reason)) }, 'unhandled rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception, exiting');
  process.exit(1);
});

const app = createApp({ db, store, config, logger });
const server = app.listen(config.port, config.host, () => {
  logger.info(
    { host: config.host, port: config.port, dataDir: config.dataDir, packs: [...store.content.packs.keys()], version: config.version },
    'anzo listening',
  );
});
// The port taken (an old process still holding it, a test server on the wrong port): say so and exit; systemd retries after
// RestartSec, and `scripts/ops/restart-check.sh` shows who holds the port.
server.on('error', (err) => {
  logger.fatal({ err, port: config.port }, err.code === 'EADDRINUSE' ? `port ${config.port} is already in use` : 'server error');
  process.exit(1);
});
if (spoolOk) {
  writeStatus(config.spoolDir, 'service', { pid: process.pid, startedAt: new Date().toISOString(), version: config.version, commit: gitCommit(config.rootDir) });
  startResultPoller({ db, config, logger, get content() { return store.content; } });
}

process.on('SIGHUP', () => {
  logger.info('reload requested (SIGHUP)');
  const result = store.reload();
  if (!result.ok) afterLoad(store.runtime, store); // record the failed reload in the status file
});

function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    db.close();
    process.exit(0);
  });
  // Idle keep-alive connections (a proxy keeps some open) would hold close() up: drop them now, busy ones after 2 s.
  server.closeIdleConnections();
  setTimeout(() => server.closeAllConnections(), 2000).unref();
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
