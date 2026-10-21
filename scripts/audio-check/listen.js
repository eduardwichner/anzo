// The Listen check's fix queue for audio:check: clips heard as Bad in Admin → Listen check
// (table listen_checks, server/src/lib/listen.js) whose latest verdict is still Bad. audio:check flags such a clip `listen`
// while its file is the one heard (an `accepted` explanation never hides it); audio:fix then renders it again, and the new
// file goes back to the Listen check to be heard once more.
// The live database belongs to the service user (data/ is 750): it is read with `sudo -n -u anzo sqlite3 -json`, as
// check:integrity does; ANZO_LISTEN_DB names a database file to read directly instead (tests, a backup copy).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const QUERY = `SELECT file, track, speed, text, reason, note, heard_at FROM listen_checks
  WHERE id IN (SELECT MAX(id) FROM listen_checks GROUP BY file) AND verdict = 'bad' ORDER BY id`;

/** Map(file → { reason, note, heardAt }) of the clips heard Bad, or null when the database cannot be read (said why). */
export async function readListenBad(root, { log = console.error } = {}) {
  const direct = process.env.ANZO_LISTEN_DB;
  const live = path.join(process.env.ANZO_DATA_DIR || path.join(root, 'data'), 'anzo.sqlite');
  let rows;
  try {
    if (direct || fs.existsSync(live) && isReadable(live)) {
      const { default: Database } = await import('better-sqlite3');
      const db = new Database(direct || live, { readonly: true, fileMustExist: true });
      try {
        const has = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'listen_checks'").get();
        rows = has ? db.prepare(QUERY).all() : [];
      } finally {
        db.close();
      }
    } else {
      const out = execFileSync('sudo', ['-n', '-u', 'anzo', 'sqlite3', '-readonly', '-json', live, QUERY], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      rows = out.trim() ? JSON.parse(out) : [];
    }
  } catch (err) {
    if (/no such table/.test(String(err.stderr ?? err.message))) return new Map();
    log(`Listen check queue not read (${String(err.stderr ?? err.message).trim().split('\n')[0]}): clips heard Bad are not flagged this time`);
    return null;
  }
  return new Map(rows.map((r) => [r.file, { reason: r.reason ?? null, note: r.note ?? null, heardAt: r.heard_at }]));
}

function isReadable(file) {
  try {
    fs.accessSync(file, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
