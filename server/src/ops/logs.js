// Reading the logs for Admin → System: the newest warnings and errors of every Anzo log, merged, newest first.
// app.log, jobs.log and watchdog.log are JSON lines (pino levels: 40 warn, 50 error, 60 fatal); backup.log and
// full-backup.log are text lines "<ISO time> <source>: ok …" / "… FAILED: …". Only the tail of each file is read.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const LOG_FILES = [
  { file: 'app.log', source: 'app', format: 'json' },
  { file: 'jobs.log', source: 'jobs', format: 'json' },
  { file: 'watchdog.log', source: 'watchdog', format: 'json' },
  { file: 'backup.log', source: 'backup', format: 'text' },
  { file: 'full-backup.log', source: 'full-backup', format: 'text' },
];

/** The last `bytes` of a file as complete lines ([] when missing or unreadable). */
export function tailLines(file, bytes = 512 * 1024) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    const lines = buf.toString('utf8').split('\n');
    if (start > 0) lines.shift(); // a partial first line
    return lines.filter(Boolean);
  } catch {
    return [];
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

const LEVEL_NAME = (n) => (n >= 50 ? 'error' : n >= 40 ? 'warn' : n >= 30 ? 'info' : 'debug');

/** One readable line from a pino-style entry: its message and the most telling field. */
export function describeEntry(e) {
  const extra = e.error ?? e.reason ?? (Array.isArray(e.problems) ? e.problems.join('; ') : null) ?? e.err?.message
    ?? (Array.isArray(e.errors) ? e.errors.slice(0, 2).map((x) => (typeof x === 'string' ? x : x.message ?? JSON.stringify(x))).join('; ') : null);
  const text = `${e.msg ?? ''}${extra ? `: ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`;
  return text.replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** Parse one line into { time (ISO), level, source, message, raw } or null (not a problem / unparsable noise). */
export function parseLine(line, { source, format }, { minLevel = 40 } = {}) {
  if (format === 'json') {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      return null;
    }
    const lvl = typeof e.level === 'number' ? e.level : { warn: 40, error: 50, fatal: 60 }[e.level] ?? 30;
    if (lvl < minLevel) return null;
    return { time: new Date(e.time ?? 0).toISOString(), level: LEVEL_NAME(lvl), source: e.source ?? source, message: describeEntry(e), raw: line };
  }
  const m = line.match(/^(\S+)\s+([\w-]+):\s+(.*)$/);
  if (!m) return null;
  const failed = /FAILED|error/i.test(m[3]);
  if (!failed && minLevel >= 40) return null;
  const t = new Date(m[1]);
  return { time: Number.isNaN(t.getTime()) ? new Date(0).toISOString() : t.toISOString(), level: failed ? 'error' : 'info', source, message: m[3].slice(0, 300), raw: line };
}

/** Problems older than this drop off the System page (and the diagnostics). */
export const PROBLEM_MAX_AGE_DAYS = 14;

/** What makes two log entries "the same problem": the source and the message with every number as #. */
export const problemShape = (p) => `${p.source}|${String(p.message).replace(/\d+/g, '#')}`;
/**
 * The key of a problem: an opaque hash of its shape, so a secret in a log message never reaches the System page or
 * `problem_acks` through the key (the message itself is redacted for display).
 */
export const problemKey = (p) => `p${crypto.createHash('sha256').update(problemShape(p)).digest('hex').slice(0, 20)}`;

/**
 * The newest `limit` warnings and errors across all logs, from the last 14 days, each with its `key`. `acks`
 * ({ key: ISO time }, problem_acks) hides an entry logged at or before its key's acknowledgement — until the problem
 * occurs again. Returns { problems, acknowledged (how many were hidden) }.
 */
export function recentProblems(logDir, { limit = 50, files = LOG_FILES, now = Date.now(), acks = {} } = {}) {
  const since = new Date(now - PROBLEM_MAX_AGE_DAYS * 86_400_000).toISOString();
  const all = [];
  let acknowledged = 0;
  for (const f of files) {
    // last week's rotated file too (logrotate runs weekly): the "last 14 days" span two files; 2 MB of each
    const lines = [...tailLines(path.join(logDir, `${f.file}.1`), 2 * 1024 * 1024), ...tailLines(path.join(logDir, f.file), 2 * 1024 * 1024)];
    for (const line of lines) {
      const p = parseLine(line, f);
      if (!p || p.time < since) continue;
      const key = problemKey(p);
      if (acks[key] && p.time <= acks[key]) {
        acknowledged += 1;
        continue;
      }
      all.push({ ...p, key });
    }
  }
  return { problems: all.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0)).slice(0, limit), acknowledged };
}

/** problem_acks as { key: acked_at }. */
export const readAcks = (db) => Object.fromEntries(db.prepare('SELECT key, acked_at FROM problem_acks').all().map((r) => [r.key, r.acked_at]));

/**
 * Acknowledge problems (their keys) as of `now` — or of the newest occurrence shown, if a log's clock is ahead of the
 * service's (the e2e server runs on a fixed clock); acknowledgements older than 30 days are dropped.
 */
export function acknowledgeProblems(db, problems, by, now = new Date()) {
  const nowIso = now.toISOString();
  const latest = new Map();
  for (const p of problems) {
    const at = p.time && p.time > nowIso ? p.time : nowIso;
    if (!latest.has(p.key) || at > latest.get(p.key).at) latest.set(p.key, { at, message: p.message });
  }
  const put = db.prepare(`INSERT INTO problem_acks (key, acked_at, acked_by, message) VALUES (?, ?, ?, ?)
                          ON CONFLICT(key) DO UPDATE SET acked_at = excluded.acked_at, acked_by = excluded.acked_by, message = excluded.message`);
  db.transaction(() => {
    for (const [key, { at, message }] of latest) put.run(key, at, by, String(message ?? '').slice(0, 300));
    db.prepare('DELETE FROM problem_acks WHERE acked_at < ?').run(new Date(now.getTime() - 30 * 86_400_000).toISOString());
  })();
  return problems.length;
}

/** Text lines of a log (backup.log …), newest last. */
export const lastLines = (logDir, file, n = 10) => tailLines(path.join(logDir, file), 64 * 1024).slice(-n);

/** Service starts recorded in app.log ("anzo listening") since `sinceIso`. */
export function serviceStarts(logDir, sinceIso) {
  return tailLines(path.join(logDir, 'app.log'), 4 * 1024 * 1024)
    .filter((l) => l.includes('"anzo listening"'))
    .map((l) => {
      try {
        return new Date(JSON.parse(l).time).toISOString();
      } catch {
        return null;
      }
    })
    .filter((t) => t && t >= sinceIso);
}
