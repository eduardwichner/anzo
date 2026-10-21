#!/usr/bin/env node
// npm run check:integrity [-- <db file>] [-- --json] [-- --status]
// Read-only consistency check of stored progress against the current content: XP = sum of lesson completions +
// practice sessions, streak dates, and every lesson / exercise / item id in lesson_progress, lesson_completions,
// attempts, item_strength and practice_sessions still exists in the packs. Exit 1 on any inconsistency.
// Without a db file it checks a fresh `.backup` copy of the live database (made as the service user `anzo`,
// WAL-safe; the live file is never opened for writing) and removes the copy afterwards. Legacy attempts and progress on
// exercises hidden by an admin correction are reported as info. --status also writes the result to the spool
// (status/integrity.json) for Admin → System; the nightly anzo-integrity.timer runs it that way, as `anzo`.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { loadContent } from '../server/src/content/loader.js';
import { checkIntegrity } from '../server/src/lib/integrity.js';
import { readRuntimeLock } from '../server/src/content/store.js';
import { writeStatus } from '../server/src/ops/spool.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const json = args.includes('--json');
const status = args.includes('--status');
const contentIdx = args.indexOf('--content');
const contentDir = contentIdx > -1 ? path.resolve(args[contentIdx + 1]) : process.env.ANZO_CONTENT_DIR || path.join(root, 'content');
const dbArg = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--content');
const LIVE_DB = path.join(process.env.ANZO_DATA_DIR || path.join(root, 'data'), 'anzo.sqlite');

let dbFile = dbArg ? path.resolve(dbArg) : null;
let cleanup = () => {};
if (!dbFile) {
  // The live data dir belongs to `anzo` (750): let that user write the backup copy into /tmp.
  const copy = path.join(os.tmpdir(), `anzo-integrity-${process.pid}-${Date.now()}.sqlite`);
  try {
    // already the service user (the nightly timer): no sudo attempt (it only logs "no new privileges" there)
    if (os.userInfo().username === 'anzo') throw new Error('no sudo needed');
    execFileSync('sudo', ['-n', '-u', 'anzo', 'sqlite3', LIVE_DB, `.backup '${copy}'`], { stdio: ['ignore', 'ignore', 'inherit'] });
    // A plain rollback-journal file: opening it read-only then leaves no -wal/-shm behind.
    execFileSync('sudo', ['-n', '-u', 'anzo', 'sqlite3', copy, 'PRAGMA journal_mode=DELETE;'], { stdio: 'ignore' });
    cleanup = () => execFileSync('sudo', ['-n', '-u', 'anzo', 'rm', '-f', copy, `${copy}-wal`, `${copy}-shm`]);
  } catch {
    // Not allowed to sudo (e.g. running as anzo or root already): back up directly.
    const live = new Database(LIVE_DB, { readonly: true, fileMustExist: true });
    await live.backup(copy);
    live.close();
    const c = new Database(copy);
    c.pragma('journal_mode = DELETE');
    c.close();
    cleanup = () => ['', '-wal', '-shm'].forEach((x) => fs.rmSync(`${copy}${x}`, { force: true }));
  }
  dbFile = copy;
  if (!json) console.log(`Checking a fresh copy of ${LIVE_DB}`);
}

let result;
const started = Date.now();
let content;
try {
  content = loadContent({ contentDir });
} catch (err) {
  // The packs in the working tree do not load (an authoring session half-way: the nightly check
  // crashed and the System page kept the green of the night before): say so, amber, instead of nothing.
  cleanup();
  const why = String(err.message).split('\n').slice(0, 3).join(' ');
  console.error(`Integrity check SKIPPED: the content does not load: ${why}`);
  if (status) {
    writeStatus(process.env.ANZO_SPOOL_DIR || '/var/spool/anzo', 'integrity', {
      ok: true, skipped: true, ms: Date.now() - started, users: 0, errors: [],
      warnings: [`not checked: the lessons in ${contentDir} do not load (${why.slice(0, 300)})`], info: [],
    });
  }
  process.exit(2);
}
try {
  content.retired = new Map(Object.entries(readRuntimeLock(contentDir)?.retired || {}));
  const db = new Database(dbFile, { readonly: true, fileMustExist: true });
  result = checkIntegrity(db, content);
  db.close();
} finally {
  cleanup();
}

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  for (const u of result.users) {
    const s = u.stats;
    const courses = (u.courses ?? []).map((c) => `${c.track}${c.track === u.activeTrack ? '*' : ''}${c.hidden ? ' (hidden)' : ''}${c.startPack ? ` from ${c.startPack}` : ''}`);
    console.log(`\n${u.username} (${u.role}${courses.length ? `, courses: ${courses.join(', ')}` : ''})`);
    console.log(`  stats: xp ${s?.xp}, streak ${s?.streak} (best ${s?.streakBest}), last active ${s?.lastActiveDate ?? '—'}`);
    console.log(`  completions: ${u.completions.length}${u.completions.length ? ` — ${u.completions.map((c) => `${c.lessonId ?? '(pre-003 total)'} ${c.score}% +${c.xp}`).join(', ')}` : ''}`);
    console.log(`  lessons done: ${u.lessons.length}${u.lessons.length ? ` — ${u.lessons.map((l) => `${l.lessonId} best ${l.bestScore}% ×${l.timesCompleted}`).join(', ')}` : ''}`);
    const a = u.attempts;
    console.log(`  attempts: ${a.total} (${a.correct} correct / ${a.wrong} wrong${a.legacy ? `, ${a.legacy} legacy` : ""})${a.total ? ` — ${Object.entries(a.byType).map(([t, n]) => `${t} ${n.correct}/${n.wrong}`).join(', ')}` : ''}`);
    if (u.practice) console.log(`  practice: ${u.practice.finished} finished of ${u.practice.sessions} started, +${u.practice.xp} XP`);
    if (u.badges) console.log(`  badges: ${u.badges.length ? u.badges.join(', ') : '—'}`);
    const is = u.itemStrength;
    console.log(`  item_strength: ${is.rows} rows${is.rows ? `, strength ${is.strength[0]}–${is.strength[1]}, next review ${is.nextReviewAt[0]} … ${is.nextReviewAt[1]}` : ''}`);
  }
  for (const i of result.info) console.log(`info: ${i}`);
  for (const w of result.warnings) console.log(`warning: ${w}`);
  if (result.errors.length) {
    console.error(`\nIntegrity check FAILED with ${result.errors.length} inconsistenc${result.errors.length === 1 ? 'y' : 'ies'}:`);
    for (const e of result.errors) console.error(`  ${e}`);
  } else {
    console.log(`\nIntegrity OK: ${result.users.length} users, 0 orphans, XP (lessons + practice) and streaks consistent`);
  }
}
if (status) {
  const spoolDir = process.env.ANZO_SPOOL_DIR || '/var/spool/anzo';
  writeStatus(spoolDir, 'integrity', {
    ok: result.errors.length === 0, ms: Date.now() - started, users: result.users.length,
    errors: result.errors.slice(0, 30), warnings: result.warnings.slice(0, 30), info: result.info.slice(0, 30),
  });
}
process.exit(result.errors.length ? 1 : 0);
