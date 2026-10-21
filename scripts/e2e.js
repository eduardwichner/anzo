#!/usr/bin/env node
// npm run test:e2e — build the client, start an isolated server on :3999 with a fresh temp data dir
// (new DB, seeded users) and the real audio/ dir read-only, run Playwright (desktop, mobile, mobile-webkit),
// stop the server, delete the temp dir.
// Extra args are passed to Playwright, e.g. `npm run test:e2e -- --project=mobile`.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { machine } from './lib/machine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3999;
const BASE_URL = `http://localhost:${PORT}`;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/** Up = /api/live answers; then /api/health must be 200 (its problems are printed when it is not, e.g. missing clips). */
async function waitForHealth(timeoutMs = 20_000, exited = () => null) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exited()) throw new Error(`test server ${exited()} before it answered`);
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/api/live`)).ok) {
        const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
        if (res.ok) return;
        const body = await res.json().catch(() => ({}));
        throw new Error(`test server is up but unhealthy: ${(body.problems ?? [`status ${res.status}`]).join('; ')}`);
      }
    } catch (err) {
      if (String(err.message).startsWith('test server')) throw err;
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`test server did not answer /api/live on :${PORT}`);
}

/** The instant of `hour`:00 Amsterdam time on the day 'YYYY-MM-DD'. */
function amsterdamAt(day, hour) {
  const [y, m, d] = day.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d, hour);
  for (let i = 0; i < 2; i += 1) {
    const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t)));
    t -= (h - hour) * 3_600_000;
  }
  return new Date(t);
}

// The test server reads the real pre-rendered audio (read-only); it is never re-rendered here.
const audioDir = process.env.ANZO_AUDIO_DIR || path.join(root, 'audio');
if (!fs.existsSync(path.join(audioDir, 'manifest.json'))) {
  console.error(`[e2e] ${audioDir}/manifest.json is missing; run npm run audio:render first`);
  process.exit(1);
}

// A run killed outright (SIGKILL, a lost session) cannot clean up: its server's pid and temp dir are in this file, so the next
// run stops that server and removes its dir first — only when the pid is really an Anzo server.
const LEFT = path.join(os.tmpdir(), 'anzo-e2e-server.json');
try {
  const left = JSON.parse(fs.readFileSync(LEFT, 'utf8'));
  const cmd = fs.readFileSync(`/proc/${left.pid}/cmdline`, 'utf8');
  if (cmd.includes('server/src/index.js')) {
    process.kill(left.pid, 'SIGKILL');
    console.log(`[e2e] stopped the test server a killed run left (pid ${left.pid})`);
  }
  if (typeof left.dataDir === 'string' && path.basename(left.dataDir).startsWith('anzo-e2e-')) fs.rmSync(left.dataDir, { recursive: true, force: true });
} catch { /* nothing left */ }
fs.rmSync(LEFT, { force: true });
await new Promise((r) => setTimeout(r, 300));

// A server left on the port by a cut-off run would be tested instead of this run's: refuse.
try {
  if ((await fetch(`http://127.0.0.1:${PORT}/api/live`)).ok) {
    console.error(`[e2e] something already answers on :${PORT} (a cut-off earlier run?): ss -ltnp 'sport = :${PORT}' names it; stop it first`);
    process.exit(1);
  }
} catch { /* free: good */ }

// The e2e server serves its own build (client/dist-e2e): a test run never rebuilds client/dist, which the live service
// serves (a rebuilt live client against the old server would show learners new screens before the restart).
// Build only when a client source is newer than the last e2e build (−30–60 s per re-run); ANZO_E2E_BUILD=1 forces it.
const e2eDist = path.join(root, 'client/dist-e2e');
const newest = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((m, e) => {
  const f = path.join(dir, e.name);
  return Math.max(m, e.isDirectory() ? newest(f) : fs.statSync(f).mtimeMs);
}, 0);
const built = fs.existsSync(path.join(e2eDist, 'index.html')) ? fs.statSync(path.join(e2eDist, 'index.html')).mtimeMs : 0;
const sources = Math.max(newest(path.join(root, 'client/src')), newest(path.join(root, 'client/public')),
  ...['client/vite.config.js', 'client/index.html', 'client/package.json'].map((f) => fs.statSync(path.join(root, f)).mtimeMs));
if (process.env.ANZO_E2E_BUILD === '1' || sources > built) run('npm', ['run', 'build'], { env: { ...process.env, ANZO_CLIENT_OUT: 'dist-e2e' } });
else console.log('[e2e] client/dist-e2e is newer than every client source: no build');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-e2e-'));
const sessionSecret = crypto.randomBytes(48).toString('hex');
// Admin → System reads these; a planted log line carries the secret, so the diagnostics spec proves it is redacted.
const logDir = path.join(dataDir, 'logs');
fs.mkdirSync(logDir, { recursive: true });
fs.writeFileSync(path.join(logDir, 'jobs.log'), `${JSON.stringify({ level: 50, time: Date.now(), source: 'content-job', msg: 'e2e planted error', error: `SESSION_SECRET=${sessionSecret}` })}\n`);
// The System page's audio-check tile shows the real result of npm run audio:check (same content and audio dir) when there is one.
try {
  const status = '/var/spool/anzo/status/audio-check.json';
  if (fs.existsSync(status)) {
    fs.mkdirSync(path.join(dataDir, 'spool', 'status'), { recursive: true });
    fs.copyFileSync(status, path.join(dataDir, 'spool', 'status', 'audio-check.json'));
  }
} catch { /* not readable from this shell: the tile says "not run yet" */ }
// A fixed clock: the server's day starts at 10:00 Amsterdam of today's date and runs on from there, so a run
// never crosses midnight (streaks, today's XP). Specs use serverNow() (ANZO_E2E_CLOCK_OFFSET_MS) for their own timestamps.
const fakeNowAt = Date.now();
const fakeNow = amsterdamAt(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date(fakeNowAt)), 10);
const server = spawn(process.execPath, ['server/src/index.js'], {
  cwd: root,
  stdio: ['ignore', 'inherit', 'inherit'],
  env: {
    ...process.env,
    ANZO_DOTENV: '0',
    ANZO_CLIENT_DIST: e2eDist,
    // the generic seed accounts (kid1, kid2, admin), whatever this machine's config/seed.local.json holds
    ANZO_SEED_FILE: path.join(root, 'config/seed.example.json'),
    NODE_ENV: 'test',
    ANZO_FAKE_NOW: fakeNow.toISOString(),
    ANZO_FAKE_NOW_AT: String(fakeNowAt),
    PORT: String(PORT),
    HOST: '127.0.0.1',
    ANZO_DATA_DIR: dataDir,
    ANZO_CONTENT_DIR: path.join(root, 'content'),
    ANZO_AUDIO_DIR: audioDir,
    SESSION_SECRET: sessionSecret,
    // Corrections are applied at once by an in-process stub (no files change); spool, logs and backups are temp dirs.
    ANZO_JOB_RUNNER: 'stub',
    ANZO_SPOOL_DIR: path.join(dataDir, 'spool'),
    ANZO_LOG_DIR: logDir,
    ANZO_BACKUP_DIR: path.join(dataDir, 'backups'),
    LOG_LEVEL: 'warn',
    // loginAdmin() probes the seeded password (a failed login) on every call; the limiter itself is unit-tested.
    ANZO_LOGIN_RATE_LIMIT: '500',
    TZ: 'Europe/Amsterdam',
  },
});

fs.writeFileSync(LEFT, JSON.stringify({ pid: server.pid, dataDir }));
// The server may die at start (a busy port, invalid content): stop waiting at once
let serverExit = null;
server.once('exit', (code, signal) => { serverExit = `exited ${code ?? signal}`; });
// Cut off (Ctrl-C, a killed tool call): stop Playwright (its own process group: the browsers too), the server and the temp
// dir. Playwright runs as an async child, so this handler runs at once (with spawnSync it would wait for Playwright to finish).
let pwChild = null;
const cleanup = () => {
  try { if (pwChild?.pid) process.kill(-pwChild.pid, 'SIGTERM'); } catch { /* gone */ }
  try { server.kill('SIGKILL'); } catch { /* gone */ }
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(LEFT, { force: true });
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { cleanup(); process.exit(130); });

let exitCode = 1;
try {
  // a small machine loads the content more slowly
  await waitForHealth(machine().small ? 60_000 : 20_000, () => serverExit);
  console.log(`[e2e] test server up on ${BASE_URL} (data: ${dataDir})`);
  pwChild = spawn('npx', ['playwright', 'test', '-c', 'e2e/playwright.config.js', ...process.argv.slice(2)], {
    cwd: root,
    stdio: 'inherit',
    detached: true,
    // ANZO_E2E_DATA_DIR: specs may read (never write) the test DB to show what the server stored.
    env: {
      ...process.env, ANZO_E2E_BASE_URL: BASE_URL, ANZO_E2E_DATA_DIR: dataDir, ANZO_E2E_SESSION_SECRET: sessionSecret, ANZO_E2E_LOG_DIR: logDir,
      ANZO_E2E_CLOCK_OFFSET_MS: String(fakeNow.getTime() - fakeNowAt),
    },
  });
  exitCode = await new Promise((resolve) => pwChild.once('exit', (code) => resolve(code ?? 1)));
} catch (err) {
  console.error(`[e2e] ${err.message}`);
} finally {
  if (!serverExit) {
    await new Promise((resolve) => {
      server.once('exit', resolve);
      server.kill('SIGTERM');
      setTimeout(() => server.kill('SIGKILL'), 5000).unref();
    });
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(LEFT, { force: true });
  console.log(`[e2e] server stopped, removed ${dataDir}`);
}
process.exit(exitCode);
