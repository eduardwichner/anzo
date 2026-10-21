#!/usr/bin/env node
// anzo-cleanup.timer (Sundays 05:00, root): remove temp leftovers older than 2 days that match cleanup-lib.js's list,
// expired logins from the database (as anzo), and spool request/result files older than 90 days (the corrections stay
// in the database). Counts go to jobs.log. Options: --tmp DIR --spool DIR --db FILE --dry-run (tests).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { MAX_AGE_MS, matchTmp, SPOOL_MAX_AGE_MS } from './cleanup-lib.js';
import { jobLogger } from './joblog.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const tmpDir = opt('--tmp', '/tmp');
const spool = opt('--spool', process.env.ANZO_SPOOL_DIR || '/var/spool/anzo');
const dbFile = opt('--db', '/opt/anzo/data/anzo.sqlite');
const dry = args.includes('--dry-run');
const log = jobLogger('cleanup');
const now = Date.now();

const removed = {};
let bytes = 0;
const du = (p) => {
  try {
    return Number(execFileSync('du', ['-sb', p], { encoding: 'utf8' }).split('\t')[0]);
  } catch {
    return 0;
  }
};
for (const name of fs.readdirSync(tmpDir)) {
  const full = path.join(tmpDir, name);
  let st;
  try {
    st = fs.lstatSync(full);
  } catch {
    continue;
  }
  if (st.isSymbolicLink() || now - st.mtimeMs < MAX_AGE_MS) continue;
  let children;
  if (st.isDirectory()) {
    try {
      children = fs.readdirSync(full);
    } catch {
      children = [];
    }
  }
  const id = matchTmp({ name, isDir: st.isDirectory(), children });
  if (!id) continue;
  bytes += du(full);
  if (!dry) fs.rmSync(full, { recursive: true, force: true });
  removed[id] = (removed[id] ?? 0) + 1;
}

let sessions = null;
if (fs.existsSync(dbFile)) {
  try {
    const sql = "DELETE FROM sessions WHERE expire < strftime('%Y-%m-%dT%H:%M:%fZ','now'); SELECT changes();";
    const asAnzo = process.getuid?.() === 0 ? ['runuser', ['-u', 'anzo', '--', 'sqlite3', '-cmd', '.timeout 5000', dbFile, dry ? "SELECT COUNT(*) FROM sessions WHERE expire < strftime('%Y-%m-%dT%H:%M:%fZ','now');" : sql]]
      : ['sqlite3', ['-cmd', '.timeout 5000', dbFile, dry ? "SELECT COUNT(*) FROM sessions WHERE expire < strftime('%Y-%m-%dT%H:%M:%fZ','now');" : sql]];
    sessions = Number(execFileSync(asAnzo[0], asAnzo[1], { encoding: 'utf8' }).trim().split('\n').pop());
  } catch (err) {
    log({ level: 'warn', msg: 'cleanup could not remove expired logins', error: String(err.stderr || err.message).trim().slice(0, 300) });
  }
}

let spoolFiles = 0;
for (const sub of ['processed', 'requests', 'results']) {
  const dir = path.join(spool, sub);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (/\.json$/.test(f) && now - fs.statSync(full).mtimeMs > SPOOL_MAX_AGE_MS) {
      if (!dry) fs.rmSync(full, { force: true });
      spoolFiles += 1;
    }
  }
}

const summary = { tmp: removed, tmpEntries: Object.values(removed).reduce((a, b) => a + b, 0), tmpMB: Math.round(bytes / 1024 ** 2), expiredLogins: sessions, spoolFiles, dryRun: dry };
log({ level: 'info', msg: 'cleanup done', ...summary });
