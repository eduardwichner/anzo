// The migration runner: one transaction per file, and table rebuilds (`-- anzo:foreign-keys-off`) that never cascade.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/db/index.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-mig-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function migrationsDir(name, files) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir);
  for (const [f, sql] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), sql);
  return dir;
}
const BASE = {
  '001_base.sql': `CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT, old TEXT CHECK (old IN ('a')));
    CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id) ON DELETE CASCADE);
    INSERT INTO parent VALUES (1, 'p', 'a'); INSERT INTO child VALUES (10, 1), (11, 1);`,
};
const REBUILD = `CREATE TABLE parent_new (id INTEGER PRIMARY KEY, name TEXT);
  INSERT INTO parent_new SELECT id, name FROM parent; DROP TABLE parent; ALTER TABLE parent_new RENAME TO parent;`;
const open = () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
};

describe('migration runner', () => {
  it('a rebuild marked anzo:foreign-keys-off keeps every child row, and foreign keys are on again afterwards', () => {
    const db = open();
    runMigrations(db, migrationsDir('ok', { ...BASE, '002_rebuild.sql': `-- anzo:foreign-keys-off\n${REBUILD}` }));
    expect(db.prepare('SELECT COUNT(*) FROM child').pluck().get()).toBe(2);
    expect(db.prepare('SELECT name FROM pragma_table_info(?)').pluck().all('parent')).toEqual(['id', 'name']);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.prepare('SELECT version FROM schema_migrations').pluck().all()).toEqual([1, 2]);
  });

  it('the same rebuild without the marker would cascade (why the marker exists)', () => {
    const db = open();
    runMigrations(db, migrationsDir('cascade', { ...BASE, '002_rebuild.sql': REBUILD }));
    expect(db.prepare('SELECT COUNT(*) FROM child').pluck().get()).toBe(0);
  });

  it('a rebuild that leaves a broken reference is rolled back and not recorded', () => {
    const db = open();
    const dir = migrationsDir('broken', {
      ...BASE,
      '002_rebuild.sql': `-- anzo:foreign-keys-off\n${REBUILD}\nDELETE FROM parent;`,
    });
    expect(() => runMigrations(db, dir)).toThrow(/foreign key check failed/);
    expect(db.prepare('SELECT COUNT(*) FROM parent').pluck().get()).toBe(1);
    expect(db.prepare('SELECT version FROM schema_migrations').pluck().all()).toEqual([1]);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});
