#!/usr/bin/env node
// npm run backup:full (now) / anzo-full-backup.timer (Sundays 04:00, after the 03:30 database backup). Runs as root.
// Writes /var/backups/anzo/full/anzo-full-<YYYYmmdd-HHMMSS>.tar (root:anzo 640, in a folder only root writes): a git bundle of the repository, .env,
// the newest database backup (a fresh one if the newest is older than 8 days), content/reference, the local documents git
// ignores (LOCAL_DOCS → local/), models, audio,
// RESTORE.txt and MANIFEST.json. Keeps the newest 3 while they take ≤ 25 % of the disk and ≥ 4 GB stays free, else 2 (else 1). Log: full-backup.log; status:
// spool status/archive.json (Admin → System). Contents and retention: archive-lib.js.
// Options: --repo DIR --dest DIR --db-dir DIR --log FILE --spool DIR (tests and scratch runs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ARCHIVE_ENTRIES, LOCAL_DOCS, missingEntries, restoreText, retention, spaceForArchive } from './archive-lib.js';
import { writeStatus } from '../../server/src/ops/spool.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const repo = path.resolve(opt('--repo', '/opt/anzo'));
const dest = path.resolve(opt('--dest', '/var/backups/anzo/full'));
const dbDir = path.resolve(opt('--db-dir', '/var/backups/anzo/db'));
const logFile = opt('--log', '/var/log/anzo/full-backup.log');
const spool = opt('--spool', process.env.ANZO_SPOOL_DIR || '/var/spool/anzo');

const stamp = () => new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Amsterdam' }).replace(/[-:]/g, '').replace(' ', '-');
const isoLocal = () => execFileSync('date', ['--iso-8601=seconds'], { encoding: 'utf8' }).trim();
function log(text) {
  const line = `${isoLocal()} anzo-full-backup: ${text}`;
  console.log(line);
  try {
    fs.appendFileSync(logFile, `${line}\n`);
  } catch { /* stdout only */ }
}
const run = (cmd, a, o = {}) => execFileSync(cmd, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...o });
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sizeOf = (p) => Number(run('du', ['-sb', p]).split('\t')[0]);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-full-'));
const started = Date.now();
try {
  const name = `anzo-full-${stamp()}.tar`;
  const git = (...a) => run('git', ['-c', `safe.directory=${repo}`, '-C', repo, ...a]).trim();
  const commit = git('rev-parse', 'HEAD');

  git('bundle', 'create', path.join(work, 'anzo.bundle'), '--all');
  run('git', ['-c', `safe.directory=${repo}`, 'bundle', 'verify', path.join(work, 'anzo.bundle')], { cwd: repo, stdio: 'pipe' });
  fs.copyFileSync(path.join(repo, '.env'), path.join(work, 'env'));
  fs.chmodSync(path.join(work, 'env'), 0o600);

  // The local documents git ignores (not in the bundle): copied as they are, a symlink never followed (this runs as root).
  for (const p of LOCAL_DOCS) {
    const from = path.join(repo, p);
    let st;
    try {
      st = fs.lstatSync(from);
    } catch {
      continue;
    }
    if (st.isSymbolicLink() || !(st.isFile() || st.isDirectory())) continue;
    fs.mkdirSync(path.dirname(path.join(work, 'local', p)), { recursive: true });
    fs.cpSync(from, path.join(work, 'local', p), { recursive: true, verbatimSymlinks: true });
  }

  // The newest database backup; a fresh one when there is none from the last 8 days.
  const newest = () => (fs.existsSync(dbDir) ? fs.readdirSync(dbDir).filter((f) => /^anzo-\d{8}-\d{6}\.sqlite\.gz$/.test(f)).sort().pop() : null);
  let db = newest();
  if (!db || Date.now() - fs.statSync(path.join(dbDir, db)).mtimeMs > 8 * 86_400_000) {
    run('runuser', ['-u', 'anzo', '--', path.join(repo, 'scripts/backup-db.sh')], { stdio: 'pipe' });
    db = newest();
  }
  if (!db) throw new Error(`no database backup in ${dbDir}`);
  fs.mkdirSync(path.join(work, 'db'));
  // db/ belongs to anzo: read the file without following a symlink (O_NOFOLLOW), and only a regular file.
  const fd = fs.openSync(path.join(dbDir, db), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    if (!fs.fstatSync(fd).isFile()) throw new Error(`${db} is not a regular file`);
    fs.writeFileSync(path.join(work, 'db', db), fs.readFileSync(fd), { mode: 0o600 });
  } finally {
    fs.closeSync(fd);
  }

  const created = new Date().toISOString();
  fs.writeFileSync(path.join(work, 'RESTORE.txt'), restoreText({ file: name, commit, created }));
  const fromRepo = ['content/reference', 'models', 'audio'].filter((p) => fs.existsSync(path.join(repo, p)));
  const manifest = {
    created, commit, archive: name,
    entries: ARCHIVE_ENTRIES.map((e) => ({ ...e, present: e.path === 'MANIFEST.json' || fs.existsSync(path.join(work, e.path)) || fromRepo.includes(e.path) })),
    bundle: { bytes: fs.statSync(path.join(work, 'anzo.bundle')).size, sha256: sha256(path.join(work, 'anzo.bundle')) },
    db: { file: db, bytes: fs.statSync(path.join(work, 'db', db)).size, sha256: sha256(path.join(work, 'db', db)) },
    sizes: Object.fromEntries(fromRepo.map((p) => [p, sizeOf(path.join(repo, p))])),
  };
  fs.writeFileSync(path.join(work, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 1)}\n`);

  fs.mkdirSync(dest, { recursive: true });
  // As root, write only into a folder nobody else can write to (no planted symlinks for tar, rename, chown, chmod).
  if (process.getuid?.() === 0) {
    const st = fs.lstatSync(dest);
    if (!st.isDirectory() || st.uid !== 0 || (st.mode & 0o022)) throw new Error(`${dest} must be a directory owned by root and writable only by root (run scripts/install-ops.sh)`);
  }
  // Room first: the archive is about the work folder (bundle, .env, database) plus the folders it takes from the
  // repository; without room for it and a 1 GB reserve nothing is written (older archives may go first, never the newest).
  const listArchives = () => fs.readdirSync(dest).filter((f) => /^anzo-full-\d{8}-\d{6}\.tar$/.test(f)).map((f) => ({ name: f, bytes: fs.statSync(path.join(dest, f)).size }));
  const estimateBytes = sizeOf(work) + Object.values(manifest.sizes).reduce((a, b) => a + b, 0)
    - (manifest.sizes.models && fs.existsSync(path.join(repo, 'models/vosk')) ? sizeOf(path.join(repo, 'models/vosk')) : 0);
  // a run killed while writing (its timeout, a reboot) left a .part of ≈ 1.4 GB: gone before the space is measured
  for (const f of fs.readdirSync(dest).filter((x) => /^\.anzo-full-.*\.part$/.test(x))) fs.rmSync(path.join(dest, f), { force: true });
  const free0 = fs.statfsSync(dest);
  const room = spaceForArchive({ estimateBytes, freeBytes: free0.bavail * free0.bsize, archives: listArchives() });
  if (!room.ok) throw new Error(room.note);
  for (const f of room.remove) fs.rmSync(path.join(dest, f), { force: true });
  if (room.note) log(`space: ${room.note}`);
  const part = path.join(dest, `.${name}.part`);
  // models/: the voices and manifest only (the venvs live in tools/, not here). models/vosk (the audio check's speech
  // recognizers, ≈ 150 MB, authoring time only) is left out: scripts/fetch-models.sh downloads it again after a restore.
  const fromWork = ['anzo.bundle', 'env', 'db', ...(fs.existsSync(path.join(work, 'local')) ? ['local'] : []), 'RESTORE.txt', 'MANIFEST.json'];
  run('tar', ['-cf', part, '--exclude=models/vosk', '-C', work, ...fromWork, '-C', repo, ...fromRepo]);
  const listing = run('tar', ['-tf', part]).split('\n').filter(Boolean);
  const missing = missingEntries(listing);
  if (missing.length) throw new Error(`archive is missing ${missing.join(', ')}`);
  fs.renameSync(part, path.join(dest, name));
  try {
    run('chown', ['root:anzo', path.join(dest, name)]);
  } catch { /* not root (a test run) */ }
  fs.chmodSync(path.join(dest, name), 0o640);
  const bytes = fs.statSync(path.join(dest, name)).size;

  const archives = listArchives();
  const st = fs.statfsSync(dest);
  const r = retention(archives, { disk: { totalBytes: st.blocks * st.bsize, freeBytes: st.bavail * st.bsize } });
  for (const f of r.remove) fs.rmSync(path.join(dest, f), { force: true });
  const mb = (n) => `${(n / 1024 ** 2).toFixed(0)} MB`;
  log(`ok file=${path.join(dest, name)} bytes=${bytes} (${mb(bytes)}) commit=${commit.slice(0, 7)} db=${db} kept=${r.keep.length} deleted=${r.remove.length}`
    + ` seconds=${Math.round((Date.now() - started) / 1000)}${r.note ? ` note="${r.note}"` : ''}`);
  if (r.note) log(`retention: ${r.note}`);
  try {
    writeStatus(spool, 'archive', { ok: true, at: created, file: name, bytes, commit, db, kept: r.keep, note: r.note, budget: r.budget });
  } catch { /* no spool */ }
} catch (err) {
  const message = String(err.stderr || err.message).trim().split('\n').slice(-3).join(' ');
  log(`FAILED: ${message}`);
  try {
    writeStatus(spool, 'archive', { ok: false, at: new Date().toISOString(), error: message });
  } catch { /* no spool */ }
  process.exitCode = 1;
} finally {
  fs.rmSync(work, { recursive: true, force: true });
  for (const f of fs.existsSync(dest) ? fs.readdirSync(dest).filter((x) => x.endsWith('.part')) : []) fs.rmSync(path.join(dest, f), { force: true });
}
