// SQLite handle (better-sqlite3, WAL) and the numbered-SQL migration runner.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'anzo.sqlite'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  return db;
}

/** Open an in-memory database with migrations applied (tests). */
export function openMemoryDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

/** A migration that rebuilds a table other tables reference marks itself with this line (see FK_OFF in runMigrations). */
export const FK_OFF_MARKER = /^--\s*anzo:foreign-keys-off\s*$/m;

/**
 * Apply every NNN_name.sql in migrations/ not yet recorded in schema_migrations, in order, each in one transaction.
 * A file containing the line `-- anzo:foreign-keys-off` (a table rebuild: create new, copy, DROP old, rename) runs with
 * foreign keys switched off — they cannot be switched inside a transaction, and with them on, dropping `users` would
 * cascade-delete every child row — and must leave `PRAGMA foreign_key_check` empty, or it is rolled back.
 */
export function runMigrations(db, dir = MIGRATIONS_DIR) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').pluck().all());
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  const done = [];
  for (const file of files) {
    const version = parseInt(file, 10);
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const fkOff = FK_OFF_MARKER.test(sql);
    const fkWasOn = db.pragma('foreign_keys', { simple: true }) === 1;
    if (fkOff && fkWasOn) db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(sql);
        if (fkOff) {
          const broken = db.pragma('foreign_key_check');
          if (broken.length) throw new Error(`${file}: foreign key check failed: ${JSON.stringify(broken.slice(0, 5))}`);
        }
        db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
      })();
    } finally {
      if (fkOff && fkWasOn) db.pragma('foreign_keys = ON');
    }
    done.push(file);
  }
  return done;
}
