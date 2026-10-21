// scripts/backup-db.sh and scripts/restore-db.sh against a temporary database (never the live one).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';
import { openDb, runMigrations } from '../src/db/index.js';
import { seedUsers } from '../src/lib/users.js';

const scripts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-backup-test-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const run = (script, args) => spawnSync('bash', [path.join(scripts, script), ...args], { encoding: 'utf8' });

// A live-style database: WAL mode, migrations, seeded users, open while the backup runs.
const dataDir = path.join(tmp, 'data');
const db = openDb(dataDir);
runMigrations(db);
seedUsers(db);
const DB = path.join(dataDir, 'anzo.sqlite');
const dest = path.join(tmp, 'backups');
const logFile = path.join(tmp, 'backup.log');
const stamp = (i) => `20260101-${String(i).padStart(6, '0')}`;

describe('backup-db.sh', () => {
  it('17 runs keep the newest 15 backups, each a gzipped, intact copy', () => {
    for (let i = 1; i <= 17; i++) {
      db.prepare("UPDATE users SET display_name = ? WHERE username = 'kid1'").run(`Sam ${i}`);
      const r = run('backup-db.sh', ['--db', DB, '--dest', dest, '--keep', '15', '--stamp', stamp(i), '--log', logFile]);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(new RegExp(`ok file=.*anzo-${stamp(i)}\\.sqlite\\.gz .*integrity=ok kept=${Math.min(i, 15)} deleted=${i > 15 ? 1 : 0}`));
    }
    const files = fs.readdirSync(dest).sort();
    expect(files).toEqual(Array.from({ length: 15 }, (_, k) => `anzo-${stamp(k + 3)}.sqlite.gz`));
    expect(fs.readFileSync(logFile, 'utf8').trim().split('\n')).toHaveLength(17);

    // The newest backup holds the state at that moment.
    const copy = path.join(tmp, 'newest.sqlite');
    fs.writeFileSync(copy, zlib.gunzipSync(fs.readFileSync(path.join(dest, files.at(-1)))));
    const restored = new Database(copy, { readonly: true });
    expect(restored.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(restored.prepare("SELECT display_name FROM users WHERE username = 'kid1'").pluck().get()).toBe('Sam 17');
    restored.close();
  });

  it('manual backups (--manual, npm run backup:db) have their own name and retention: they never push weekly ones out', () => {
    const d = path.join(tmp, 'backups-manual');
    for (let i = 1; i <= 3; i++) expect(run('backup-db.sh', ['--db', DB, '--dest', d, '--keep', '2', '--stamp', stamp(i), '--log', '']).status).toBe(0);
    for (let i = 10; i <= 13; i++) {
      const r = run('backup-db.sh', ['--db', DB, '--dest', d, '--keep', '2', '--manual', '--keep-manual', '3', '--stamp', stamp(i), '--log', '']);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(new RegExp(`anzo-manual-${stamp(i)}\\.sqlite\\.gz .*kept=${Math.min(i - 9, 3)} deleted=${i === 13 ? 1 : 0}`));
    }
    expect(fs.readdirSync(d).sort()).toEqual([
      `anzo-${stamp(2)}.sqlite.gz`, `anzo-${stamp(3)}.sqlite.gz`,
      `anzo-manual-${stamp(11)}.sqlite.gz`, `anzo-manual-${stamp(12)}.sqlite.gz`, `anzo-manual-${stamp(13)}.sqlite.gz`,
    ]);
    // a weekly run deletes only weekly backups
    expect(run('backup-db.sh', ['--db', DB, '--dest', d, '--keep', '2', '--stamp', stamp(4), '--log', '']).stdout).toMatch(/kept=2 deleted=1/);
    expect(fs.readdirSync(d).filter((f) => f.startsWith('anzo-manual-'))).toHaveLength(3);
    expect(run('backup-db.sh', ['--db', DB, '--dest', d, '--manual', '--keep-manual', '0', '--log', '']).status).not.toBe(0);
  });

  it('fails loudly (non-zero, logged) and leaves no temp files on a bad database or an existing name', () => {
    const missing = run('backup-db.sh', ['--db', path.join(tmp, 'nope.sqlite'), '--dest', dest, '--log', logFile]);
    expect(missing.status).toBe(1);
    expect(missing.stdout).toMatch(/FAILED: database not readable/);

    const junk = path.join(tmp, 'junk.sqlite');
    fs.writeFileSync(junk, 'this is not a database');
    const bad = run('backup-db.sh', ['--db', junk, '--dest', dest, '--stamp', '20270101-000000', '--log', logFile]);
    expect(bad.status).toBe(1);
    expect(bad.stdout).toMatch(/FAILED/);

    const dup = run('backup-db.sh', ['--db', DB, '--dest', dest, '--stamp', stamp(17), '--log', '']);
    expect(dup.status).toBe(1);
    expect(dup.stdout).toMatch(/already exists/);
    expect(fs.readdirSync(dest).filter((f) => f.startsWith('.'))).toEqual([]);
    expect(fs.readFileSync(logFile, 'utf8')).toMatch(/FAILED: database not readable/);
  });
});

describe('restore-db.sh --data-dir (scratch copy, no service)', () => {
  it('verifies the backup, keeps the current database aside and restores', () => {
    const scratch = path.join(tmp, 'scratch');
    fs.mkdirSync(scratch);
    const current = new Database(path.join(scratch, 'anzo.sqlite'));
    current.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT); INSERT INTO users (username) VALUES ('current-only');");
    current.close();

    const backup = path.join(dest, fs.readdirSync(dest).sort().at(-1));
    const r = run('restore-db.sh', [backup, '--data-dir', scratch]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/backup verified: integrity_check=ok users=3/);
    const kept = fs.readdirSync(scratch).filter((f) => f.startsWith('anzo.sqlite.before-restore-'));
    expect(kept).toHaveLength(1);

    const restored = new Database(path.join(scratch, 'anzo.sqlite'), { readonly: true });
    expect(restored.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(restored.prepare('SELECT username FROM users ORDER BY id').pluck().all()).toEqual(['kid1', 'kid2', 'admin']);
    restored.close();
    const before = new Database(path.join(scratch, kept[0]), { readonly: true });
    expect(before.prepare('SELECT username FROM users').pluck().all()).toEqual(['current-only']);
    before.close();
  });

  it('a corrupt backup changes nothing', () => {
    const scratch = path.join(tmp, 'scratch2');
    fs.mkdirSync(scratch);
    fs.writeFileSync(path.join(scratch, 'anzo.sqlite'), 'current');
    const bad = path.join(tmp, 'bad.sqlite.gz');
    fs.writeFileSync(bad, zlib.gzipSync('not a database at all'));
    const r = run('restore-db.sh', [bad, '--data-dir', scratch]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/FAILED/);
    expect(fs.readdirSync(scratch)).toEqual(['anzo.sqlite']);
    expect(fs.readFileSync(path.join(scratch, 'anzo.sqlite'), 'utf8')).toBe('current');
  });
});
