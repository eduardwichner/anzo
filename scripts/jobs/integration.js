#!/usr/bin/env node
// npm run test:content-job — the content job end to end on a scratch copy of the repository (nothing in /opt/anzo,
// the live service or its data is touched): a scratch server (port 3996, its own database, spool and audio copy)
// receives corrections through its API; the real job applies them (generate, trace, lock, Piper, tests, git, reload by
// SIGHUP, health, integrity); the server records the results. Scenarios: a Dutch-meaning fix (no audio), an English
// target fix (audio rendered, the old clip removed as an orphan), an off-level French word (rejected, tree clean),
// hiding exercises in two packs and undoing the older hide first. Prints one status line per correction and the scratch git log; exit 1 on failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeScratchRepo } from './scratch.js';
import { normalizeText } from '../../server/src/audio/clips.js';

const REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.ANZO_JOBINT_PORT || 3996);
const URL = `http://127.0.0.1:${PORT}`;
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-jobint-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server;
let failures = 0;
const check = (cond, what) => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures += 1;
};

function cookieAgent() {
  let cookie = '';
  return async (method, url, body) => {
    const go = () => fetch(`${URL}${url}`, {
      method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    // A keep-alive socket the server closed while the job ran (5 s idle timeout): try once more on a fresh one.
    const res = await go().catch(() => go());
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch { /* not JSON */ }
    return { status: res.status, body: json };
  };
}

try {
  // a server left on the port by a cut-off run would answer instead of this run's
  if ((await fetch(`${URL}/api/live`).catch(() => null))?.ok) throw new Error(`something already answers on :${PORT} (a cut-off earlier run?): ss -ltnp names it; stop it first`);
  console.log(`scratch: ${base}`);
  const s = makeScratchRepo(base, { realRoot: REAL });
  const dataDir = path.join(base, 'data');
  const jobLog = path.join(base, 'jobs.log');
  const serverEnv = {
    ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'production', ANZO_DOTENV: '0', LOG_LEVEL: 'warn',
    ANZO_SEED_FILE: path.join(REAL, 'config/seed.example.json'),
    SESSION_SECRET: crypto.randomBytes(48).toString('hex'), ANZO_DATA_DIR: dataDir, ANZO_SPOOL_DIR: s.spoolDir,
    ANZO_AUDIO_DIR: s.audioDir, ANZO_CONTENT_DIR: path.join(s.root, 'content'), ANZO_LOGIN_RATE_LIMIT: '500',
  };
  const serverLog = fs.openSync(path.join(base, 'server.log'), 'a');
  server = spawn(process.execPath, [path.join(s.root, 'server/src/index.js')], { env: serverEnv, stdio: ['ignore', serverLog, serverLog] });
  server.on('exit', (code, signal) => {
    if (!server.stopping) console.error(`scratch server exited (${code ?? signal}):\n${fs.readFileSync(path.join(base, 'server.log'), 'utf8').slice(-3000)}`);
  });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null || server.signalCode) throw new Error('the scratch server exited before it answered');
    if ((await fetch(`${URL}/api/live`).catch(() => null))?.ok) break;
    await sleep(200);
  }
  const admin = cookieAgent();
  await admin('POST', '/api/auth/login', { username: 'admin', password: 'admin' });
  await admin('POST', '/api/auth/password', { current: 'admin', next: 'scratch-admin-pw' });
  // Some progress, so the integrity check after each correction has something to check.
  const kid1 = cookieAgent();
  await kid1('POST', '/api/auth/login', { username: 'kid1', password: 'kid1' });
  const pack = (await kid1('GET', '/api/content/packs/en-pre-a1')).body;
  const lesson = pack.units[0].lessons[0];
  for (const ex of lesson.exercises) await kid1('POST', '/api/progress/attempt', { lessonId: lesson.id, exerciseId: ex.id, answer: 'x', firstTry: true });
  await kid1('POST', `/api/progress/lesson/${lesson.id}/complete`, { firstTryCorrect: 0, total: lesson.exercises.length });

  const gitS = (...a) => execFileSync('git', ['-C', s.root, ...a], { encoding: 'utf8' }).trim();
  const manifest = () => JSON.parse(fs.readFileSync(path.join(s.audioDir, 'manifest.json'), 'utf8'));
  const runJob = () => spawnSync(process.execPath, [path.join(s.root, 'scripts/jobs/content-job.js')], {
    encoding: 'utf8', timeout: 15 * 60_000,
    env: {
      ...process.env, ANZO_ROOT: s.root, ANZO_SPOOL_DIR: s.spoolDir, ANZO_AUDIO_DIR: s.audioDir, ANZO_JOB_LOG: jobLog,
      ANZO_HEALTH_URL: `${URL}/api/health`, ANZO_RELOAD_CMD: `kill -HUP ${server.pid}`, ANZO_DOTENV: '0',
    },
  });
  async function correct(label, method, url, body) {
    const t0 = Date.now();
    const res = await admin(method, url, body);
    if (res.status !== 201) throw new Error(`${label}: ${res.status} ${JSON.stringify(res.body)}`);
    const id = res.body.correction.id;
    const queued = fs.readdirSync(path.join(s.spoolDir, 'requests'));
    const job = runJob();
    let c;
    for (let i = 0; i < 50; i++) {
      c = (await admin('GET', `/api/admin/corrections/${id}`)).body.correction;
      if (c.status !== 'queued' && c.status !== 'running') break;
      await sleep(300);
    }
    const result = JSON.parse(fs.readFileSync(path.join(s.spoolDir, 'processed', `${String(id).padStart(6, '0')}.result.json`), 'utf8'));
    console.log(`\n#${id} ${label}: ${c.status} — ${c.resultReason}${c.commit ? ` — commit ${c.commit.slice(0, 7)}` : ''} — ${((Date.now() - t0) / 1000).toFixed(0)} s`
      + ` (spooled ${queued.join(',')}; job exit ${job.status}; rendered ${result.rendered ?? '-'}, orphans deleted ${result.deletedClips ?? '-'})`);
    return { c, result };
  }

  // 1. Dutch meaning
  const oldClipCount = Object.keys(manifest().files).length;
  const a = await correct('Dutch meaning of en.kitten', 'POST', '/api/admin/corrections', { id: 'en.kitten', after: { native: 'poesje, kitten' }, reason: 'word order' });
  check(a.c.status === 'applied', 'applied');
  check(a.result.rendered === 0 && !a.result.steps.includes('trace'), 'no recording made, no trace needed (Dutch only)');
  check(gitS('show', '--format=', '--name-only', 'HEAD').split('\n').every((f) => f.startsWith('content/')), 'the commit touches content/ only');
  check(Object.keys(manifest().files).length === oldClipCount, 'audio unchanged');

  // 2. English target
  const oldText = 'Our kitten is very small.';
  const oldFile = manifest().clips.en.normal[normalizeText(oldText)];
  const b = await correct('English text of en-a1-u01-s01', 'POST', '/api/admin/corrections', { id: 'en-a1-u01-s01', after: { target: 'Our kitten is very little.' }, reason: 'test of the audio path' });
  check(b.c.status === 'applied', 'applied');
  check(b.result.rendered >= 2, `new recordings made (${b.result.rendered}: normal + slow)`);
  check(Boolean(oldFile) && !fs.existsSync(path.join(s.audioDir, oldFile)), `old clip ${oldFile} removed as an orphan`);
  check(Boolean(manifest().clips.en.normal[normalizeText('Our kitten is very little.')]), 'the new text has a clip in the manifest');
  check((await kid1('GET', '/api/content/packs/en-a1')).status === 200, 'the reloaded server serves the pack');

  // 3. Off-level French word — needs the derived French word list (from the reference files, not in the repository)
  if (fs.existsSync(path.join(REAL, 'content/reference/extracted/wordlist-fr.json'))) {
    const head = gitS('rev-parse', 'HEAD');
    const c3 = await correct('French text with an off-level word', 'POST', '/api/admin/corrections', { id: 'fr-a2-u01-s01', after: { target: 'Hier, je suis allé à la piscine avec un ornithorynque.' } });
    check(c3.c.status === 'rejected' && /isn't on the A2 word list/.test(c3.c.resultReason), 'rejected with the word and the level');
    check(gitS('status', '--porcelain', '--', 'content/') === '' && gitS('rev-parse', 'HEAD') === head, 'git status clean, HEAD unchanged');
  } else {
    console.log('  skipped: off-level French word (no content/reference/extracted/wordlist-fr.json: docs/developer/content.md → "Reference files")');
  }

  // 4. Hide an exercise
  const hideId = lesson.exercises[4].id;
  const d = await correct(`hide ${hideId}`, 'POST', '/api/admin/corrections/hide', { exerciseId: hideId, reason: 'test: hide' });
  const served = async () => (await kid1('GET', '/api/content/packs/en-pre-a1')).body.units[0].lessons[0].exercises.map((e) => e.id);
  check(d.c.status === 'applied' && !(await served()).includes(hideId), 'applied; the exercise is no longer served');
  check(Boolean(JSON.parse(fs.readFileSync(path.join(s.root, 'content/ids.lock.json'), 'utf8')).retired?.[hideId]), 'retired in the id lock');
  // Sam answered that exercise before: still valid progress
  const st = JSON.parse(fs.readFileSync(path.join(s.spoolDir, 'status/content.json'), 'utf8'));
  check(st.integrity.ok && st.integrity.info.some((i) => /hidden by an admin correction/.test(i)), `integrity ok, info: ${st.integrity.info.join(' | ')}`);

  // 5. Hide an exercise in another pack (writes the id lock too), then undo the older hide first, then this one
  const a1 = (await kid1('GET', '/api/content/packs/en-a1')).body;
  const hide2Id = a1.units[0].lessons[0].exercises[3].id;
  const servedA1 = async () => (await kid1('GET', '/api/content/packs/en-a1')).body.units[0].lessons[0].exercises.map((x) => x.id);
  const d2 = await correct(`hide ${hide2Id} (another pack)`, 'POST', '/api/admin/corrections/hide', { exerciseId: hide2Id, reason: 'test: hide 2' });
  check(d2.c.status === 'applied' && !(await servedA1()).includes(hide2Id), 'applied; the second exercise is no longer served');
  const e = await correct(`undo #${d.c.id} (the older one first)`, 'POST', `/api/admin/corrections/${d.c.id}/undo`);
  check(e.c.status === 'applied' && (await served()).includes(hideId), 'applied; the first exercise is served again');
  check(!(await servedA1()).includes(hide2Id), 'the newer hide stays');
  const lockNow = JSON.parse(fs.readFileSync(path.join(s.root, 'content/ids.lock.json'), 'utf8'));
  check(Object.keys(lockNow.retired || {}).join() === hide2Id && lockNow.history.at(-1).reason === `undo of correction #${d.c.id}`,
    `lock: only ${hide2Id} retired; history "${lockNow.history.at(-1).reason}"`);
  check((await admin('GET', `/api/admin/corrections/${d.c.id}`)).body.correction.undoneBy === e.c.id, `#${d.c.id} is marked undone by #${e.c.id}`);
  const e2 = await correct(`undo #${d2.c.id}`, 'POST', `/api/admin/corrections/${d2.c.id}/undo`);
  check(e2.c.status === 'applied' && (await servedA1()).includes(hide2Id), 'applied; the second exercise is served again');

  console.log(`\nscratch git log --oneline -8:\n${gitS('log', '--oneline', '-8')}`);
  console.log(`\njobs.log: ${fs.readFileSync(jobLog, 'utf8').trim().split('\n').length} lines`);
} catch (err) {
  console.error(err);
  failures += 1;
} finally {
  if (server) server.stopping = true;
  server?.kill('SIGTERM');
  await sleep(500);
  fs.rmSync(base, { recursive: true, force: true });
}
console.log(failures ? `\ncontent job integration FAILED (${failures})` : '\ncontent job integration OK');
process.exit(failures ? 1 : 0);
