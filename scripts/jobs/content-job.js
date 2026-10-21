#!/usr/bin/env node
// The content job (anzo-content-job.service, the developer account): applies the admin corrections the service spooled in
// /var/spool/anzo/requests, oldest first, one at a time, and writes each result to /var/spool/anzo/results.
// Steps and rollback: content-job-lib.js. Log: /var/log/anzo/jobs.log (JSON lines). Progress: status/content-job.json.
// Settings (env; defaults are the production ones):
//   ANZO_ROOT (the repository), ANZO_SPOOL_DIR, ANZO_AUDIO_DIR, ANZO_JOB_LOG, ANZO_HEALTH_URL,
//   ANZO_RELOAD_CMD (default "sudo -n systemctl reload anzo"), ANZO_JOB_TESTS (space-separated vitest files; "none" = skip),
//   ANZO_GIT_AUTO_PUSH=1 (in /opt/anzo/.env: push after each applied correction; a failure is reported, never blocks)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processRequest, recoverInterrupted, run } from './content-job-lib.js';
import { processRerecord } from './rerecord-lib.js';
import { readStatus, spoolPaths, writeJsonAtomic, writeStatus } from '../../server/src/ops/spool.js';
import { jobLogger } from '../ops/joblog.js';

const ROOT = path.resolve(process.env.ANZO_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'));
// .env holds ANZO_GIT_AUTO_PUSH (and the session secret, which this job never uses).
try {
  if (process.env.ANZO_DOTENV !== '0') process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  /* no .env or not readable: defaults */
}
const spoolDir = path.resolve(process.env.ANZO_SPOOL_DIR || '/var/spool/anzo');
const env = {
  root: ROOT,
  spoolDir,
  audioDir: path.resolve(process.env.ANZO_AUDIO_DIR || path.join(ROOT, 'audio')),
  reloadCmd: (process.env.ANZO_RELOAD_CMD || 'sudo -n systemctl reload anzo').split(' ').filter(Boolean),
  healthUrl: process.env.ANZO_HEALTH_URL || 'http://127.0.0.1:3000/api/health',
  testFiles: process.env.ANZO_JOB_TESTS === 'none' ? []
    : (process.env.ANZO_JOB_TESTS || 'test/validate.test.js test/idlock.test.js test/generator.test.js').split(' ').filter(Boolean),
  autoPush: process.env.ANZO_GIT_AUTO_PUSH === '1',
};
const log = jobLogger('content-job', process.env.ANZO_JOB_LOG);
env.log = log;

const dirs = spoolPaths(spoolDir);
// corrections (NNNNNN.json) and "Record again" requests (rerecord-NNNNNN.json), corrections first
const next = () => (fs.existsSync(dirs.requests) ? fs.readdirSync(dirs.requests).filter((f) => /^(rerecord-)?\d+\.json$/.test(f)).sort()[0] : null);
const resultFile = (id) => path.join(dirs.results, `${String(id).padStart(6, '0')}.json`);
const rerecordResult = (id) => path.join(dirs.results, `rerecord-${String(id).padStart(6, '0')}.json`);
// systemd stops the unit after 30 min (TimeoutStartSec); no new request starts after 20. The path unit starts the job
// again while requests wait, so a long queue is worked through in several runs.
const BUDGET_MS = 20 * 60_000;
const t0 = Date.now();

// The previous run died while working on a request: put things back and tell the admin.
const prev = readStatus(spoolDir, 'content-job');
if (prev?.state === 'running' && Number.isInteger(prev.id) && !fs.existsSync(resultFile(prev.id))) {
  const result = { ...(await recoverInterrupted(prev.id, env)), finishedAt: new Date().toISOString() };
  writeJsonAtomic(resultFile(prev.id), result);
  log({ level: 'error', msg: 'correction interrupted', id: prev.id, step: prev.step, detail: result.detail });
  writeStatus(spoolDir, 'content-job', { state: 'idle', lastId: prev.id, lastStatus: result.status, lastReason: result.reason, finishedAt: result.finishedAt });
}

// A "Record again" interrupted midway: put content/ back, let the renderer rewrite the manifest from it, report the failure.
if (prev?.state === 'running' && Number.isInteger(prev.rerecord) && !fs.existsSync(rerecordResult(prev.rerecord))) {
  run('git', ['restore', '--staged', '--worktree', '--source=HEAD', '--', 'content/'], { cwd: ROOT });
  run(process.execPath, [path.join(ROOT, 'scripts/render-audio/index.js'), '--keep-orphans'], { cwd: ROOT, env: { ANZO_AUDIO_DIR: env.audioDir } });
  writeJsonAtomic(rerecordResult(prev.rerecord), { id: prev.rerecord, phase: prev.phase, status: 'failed', finishedAt: new Date().toISOString(),
    reason: 'The content job was interrupted (for example by a restart of the server), so nothing was changed. Ask again.' });
  log({ level: 'error', msg: 'record again interrupted', id: prev.rerecord, phase: prev.phase });
  writeStatus(spoolDir, 'content-job', { state: 'idle', lastRerecord: prev.rerecord, finishedAt: new Date().toISOString() });
}

for (let f = next(); f && Date.now() - t0 < BUDGET_MS; f = next()) {
  // Move the request out first: if this process dies, the path unit does not restart it on the same request forever.
  const taken = path.join(dirs.processed, `${path.basename(f, '.json')}.request.json`);
  fs.renameSync(path.join(dirs.requests, f), taken);
  let req;
  try {
    req = JSON.parse(fs.readFileSync(taken, 'utf8'));
  } catch (err) {
    log({ level: 'error', msg: 'unreadable correction request', file: f, error: err.message });
    continue;
  }
  if (req?.kind === 'rerecord' && Number.isInteger(req.id)) {
    const started = Date.now();
    log({ level: 'info', msg: 'record again started', id: req.id, phase: req.phase, track: req.track, speed: req.speed, author: req.author });
    const progress = (step) => writeStatus(spoolDir, 'content-job', { state: 'running', rerecord: req.id, phase: req.phase, step, startedAt: new Date(started).toISOString() });
    progress('start');
    let result;
    try {
      result = await processRerecord(req, { ...env, progress });
    } catch (err) {
      result = { id: req.id, phase: req.phase, status: 'failed', reason: 'The content job failed unexpectedly.', detail: err.stack ?? String(err) };
    }
    result.finishedAt = new Date().toISOString();
    result.ms = Date.now() - started;
    writeJsonAtomic(rerecordResult(req.id), result);
    log({ level: result.status === 'failed' ? 'warn' : 'info', msg: `record again ${result.status}`, id: req.id, phase: req.phase, reason: result.reason, ms: result.ms });
    writeStatus(spoolDir, 'content-job', { state: 'idle', lastRerecord: req.id, lastStatus: result.status, lastReason: result.reason, finishedAt: result.finishedAt });
    continue;
  }
  if (!Number.isInteger(req?.id)) {
    log({ level: 'error', msg: 'correction request without a valid id', file: f });
    continue;
  }
  const started = Date.now();
  log({ level: 'info', msg: 'correction started', id: req.id, kind: req.kind, target: req.target?.id, author: req.author });
  const progress = (step) => writeStatus(spoolDir, 'content-job', { state: 'running', id: req.id, step, startedAt: new Date(started).toISOString() });
  progress('start');
  let result;
  try {
    result = await processRequest(req, { ...env, progress });
  } catch (err) {
    result = { id: req.id, status: 'rejected', reason: 'The content job failed unexpectedly.', detail: err.stack ?? String(err) };
  }
  result.finishedAt = new Date().toISOString();
  result.ms = Date.now() - started;
  writeJsonAtomic(resultFile(req.id), result);
  const level = result.status === 'applied' ? 'info' : result.rollbackClean === false ? 'error' : 'warn';
  log({
    level, msg: `correction ${result.status}`, id: req.id, reason: result.reason, commit: result.commit, step: result.failedStep,
    rendered: result.rendered, ms: result.ms, ...(result.pushed ? { pushed: result.pushed } : {}),
    ...(result.status === 'rejected' ? { detail: String(result.detail).slice(-4000) } : {}),
  });
  writeStatus(spoolDir, 'content-job', { state: 'idle', lastId: req.id, lastStatus: result.status, lastReason: result.reason, finishedAt: result.finishedAt });
}
