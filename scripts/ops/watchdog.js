#!/usr/bin/env node
// anzo-watchdog.timer (every 2 minutes, root): probe GET /api/live — never /api/health, so a missing clip never causes
// a restart. Decision: watchdog-lib.js. State and the System page tile: /var/spool/anzo/status/watchdog.json;
// before a restart status/restart.json records why (the App tile shows it). Log: /var/log/anzo/watchdog.log.
// Options (tests, the scratch restore): --url <live url> --restart-cmd "<command>" --spool <dir> --log <file>
// --unit <systemd unit> (default anzo; `none`: no systemd state, every failure counts)
import { execFileSync, execSync } from 'node:child_process';
import { decide, parseUnitState, UNIT_PROPERTIES } from './watchdog-lib.js';
import { jobLogger } from './joblog.js';
import { readStatus, writeStatus } from '../../server/src/ops/spool.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const url = opt('--url', 'http://127.0.0.1:3000/api/live');
// reset-failed first: after StartLimitBurst failures systemd refuses a plain restart.
const restartCmd = opt('--restart-cmd', 'systemctl reset-failed anzo; systemctl restart anzo');
const spool = opt('--spool', process.env.ANZO_SPOOL_DIR || '/var/spool/anzo');
const log = jobLogger('watchdog', opt('--log', '/var/log/anzo/watchdog.log'));
const unitName = opt('--unit', 'anzo');

async function probe() {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok ? { ok: true } : { ok: false, error: `status ${res.status}` };
  } catch (err) {
    return { ok: false, error: err.cause?.code ?? err.name ?? err.message };
  }
}

/** systemd's view of the service (null without systemctl, e.g. the scratch restore: then every failure counts). */
function unitState() {
  if (unitName === 'none') return null;
  try {
    return parseUnitState(execFileSync('systemctl', ['show', unitName, '-p', UNIT_PROPERTIES, '--timestamp=unix'], { encoding: 'utf8', timeout: 10_000 }));
  } catch {
    return null;
  }
}

const state = readStatus(spool, 'watchdog') ?? {};
const probed = await probe();
const result = decide(state, probed, Date.now(), unitState());
if (result.action === 'skip') {
  log({ level: 'info', msg: 'watchdog check skipped', reason: result.reason });
} else if (result.action === 'restart') {
  log({ level: 'error', msg: 'restarting anzo', reason: result.reason, command: restartCmd });
  writeStatus(spool, 'restart', { at: new Date().toISOString(), by: 'watchdog', reason: result.reason });
  try {
    execSync(restartCmd, { stdio: 'pipe', timeout: 60_000 });
    log({ level: 'warn', msg: 'anzo restarted by the watchdog', reason: result.reason });
  } catch (err) {
    log({ level: 'error', msg: 'restart failed', error: String(err.stderr || err.message).trim().slice(0, 500) });
  }
} else if (result.action === 'give-up') {
  log({ level: 'error', msg: 'watchdog stopped restarting anzo', reason: result.reason });
} else if (result.action === 'recovered') {
  log({ level: 'info', msg: 'anzo answers /api/live again' });
} else if (result.reason) {
  log({ level: 'warn', msg: 'anzo did not answer /api/live', reason: result.reason });
}
writeStatus(spool, 'watchdog', result.state);
