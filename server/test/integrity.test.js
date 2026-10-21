// scripts/check-integrity.js core: progress rows checked against the current content.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { openMemoryDb, runMigrations } from '../src/db/index.js';
import { loadContent } from '../src/content/loader.js';
import { seedUsers } from '../src/lib/users.js';
import { completeLesson, recordAttempt, resetProgress } from '../src/lib/progress.js';
import { checkIntegrity } from '../src/lib/integrity.js';
import { markLegacyAttempts } from '../src/lib/legacy.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const content = loadContent({ contentDir: path.resolve(here, '../../content') });

function setup() {
  const db = openMemoryDb();
  seedUsers(db);
  const id = (u) => db.prepare('SELECT id FROM users WHERE username = ?').pluck().get(u);
  const lesson = content.lessons.get('fr-a1-1-u01-l01');
  const ex = lesson.lesson.exercises[0];
  const now = new Date('2026-09-30T08:00:00Z');
  recordAttempt(db, { userId: id('kid2'), lessonId: 'fr-a1-1-u01-l01', exerciseId: ex.id, itemIds: ex.items, correct: true, givenAnswer: 'x', now });
  completeLesson(db, { userId: id('kid2'), lessonId: 'fr-a1-1-u01-l01', firstTryCorrect: 10, total: lesson.playableCount, now });
  return { db, id };
}

describe('checkIntegrity', () => {
  it('a consistent database passes, with a per-user summary', () => {
    const { db } = setup();
    const r = checkIntegrity(db, content, { today: '2026-10-01' });
    expect(r.errors).toEqual([]);
    const kid2 = r.users.find((u) => u.username === 'kid2');
    expect(kid2.stats).toMatchObject({ lastActiveDate: '2026-09-30', streak: 1 });
    expect(kid2.attempts).toMatchObject({ total: 1, correct: 1, byType: { multiple_choice: { correct: 1, wrong: 0 } } });
    expect(kid2.lessons).toEqual([{ lessonId: 'fr-a1-1-u01-l01', bestScore: expect.any(Number), timesCompleted: 1 }]);
  });

  it('orphans fail: a lesson, exercise or item id that is not in the content', () => {
    const { db, id } = setup();
    db.prepare("UPDATE lesson_progress SET lesson_id = 'fr-a1-1-u99-l01'").run();
    db.prepare("INSERT INTO attempts (user_id, lesson_id, exercise_id, item_ids, correct) VALUES (?, 'fr-a1-1-u01-l01', 'fr-a1-1-u01-l01-e77', '[\"fr.nope\"]', 1)").run(id('kid2'));
    db.prepare("INSERT INTO item_strength (user_id, item_id, strength, last_seen_at, next_review_at) VALUES (?, 'en.gone', 1, 'a', 'b')").run(id('kid1'));
    const { errors } = checkIntegrity(db, content, { today: '2026-10-01' });
    expect(errors.join('\n')).toMatch(/lesson_progress: lesson "fr-a1-1-u99-l01" does not exist/);
    expect(errors.join('\n')).toMatch(/exercise "fr-a1-1-u01-l01-e77" does not exist/);
    expect(errors.join('\n')).toMatch(/item "fr.nope" does not exist/);
    expect(errors.join('\n')).toMatch(/item_strength: item "en.gone" does not exist/);
  });

  it('next_review_at before last_seen_at: fine at strength 0 (due at once), an error above it', () => {
    const { db, id } = setup();
    const ins = db.prepare('INSERT INTO item_strength (user_id, item_id, strength, last_seen_at, next_review_at) VALUES (?, ?, ?, ?, ?)');
    ins.run(id('kid2'), 'fr.chat', 0, '2026-09-30T08:02:00.000Z', '2026-09-30T08:00:00.000Z');
    expect(checkIntegrity(db, content, { today: '2026-10-01' }).errors).toEqual([]);
    db.prepare('UPDATE item_strength SET strength = 2 WHERE item_id = ?').run('fr.chat');
    expect(checkIntegrity(db, content, { today: '2026-10-01' }).errors.join('\n')).toMatch(/fr.chat: next_review_at before last_seen_at/);
  });

  it('XP that is not the sum of the completions, or a wrong streak date, fails', () => {
    const { db, id } = setup();
    db.prepare('UPDATE user_stats SET xp = xp + 5, last_active_date = ? WHERE user_id = ?').run('2026-09-29', id('kid2'));
    const { errors } = checkIntegrity(db, content, { today: '2026-10-01' });
    expect(errors.join('\n')).toMatch(/user_stats.xp \d+ ≠ SUM/);
    expect(errors.join('\n')).toMatch(/last_active_date 2026-09-29 is before the Amsterdam date of the last completion \(2026-09-30\)/);
  });

  it('a progress reset keeps the streak date while removing the completions it pointed to: still consistent', () => {
    const { db, id } = setup();
    const later = content.lessons.get('fr-a1-u01-l01');
    completeLesson(db, { userId: id('kid2'), lessonId: 'fr-a1-u01-l01', firstTryCorrect: 3, total: later.playableCount, now: new Date('2026-10-02T09:00:00Z') });
    resetProgress(db, content, id('kid2'), { packId: 'fr-a1' });
    const r = checkIntegrity(db, content, { today: '2026-10-03' });
    expect(r.errors).toEqual([]);
    expect(r.users.find((u) => u.username === 'kid2').stats.lastActiveDate).toBe('2026-10-02');
  });

  it('courses: progress belongs to a course the user is (or was) enrolled in; the active course is enrolled and visible', () => {
    const { db, id } = setup();
    const kid2 = id('kid2');
    // Hidden ("removed") course: its progress is still the user's.
    db.prepare("UPDATE user_courses SET hidden = 1 WHERE user_id = ? AND track = 'fr'").run(kid2);
    db.prepare("INSERT INTO user_courses (user_id, track) VALUES (?, 'en')").run(kid2);
    db.prepare("UPDATE users SET active_track = 'en' WHERE id = ?").run(kid2);
    expect(checkIntegrity(db, content, { today: '2026-10-01' }).errors).toEqual([]);
    // Active course hidden, or not enrolled at all.
    db.prepare("UPDATE users SET active_track = 'fr' WHERE id = ?").run(kid2);
    expect(checkIntegrity(db, content, { today: '2026-10-01' }).errors.join('\n')).toMatch(/active_track "fr" is a hidden course/);
    db.prepare("DELETE FROM user_courses WHERE user_id = ? AND track = 'fr'").run(kid2);
    db.prepare("UPDATE users SET active_track = 'en' WHERE id = ?").run(kid2);
    const errors = checkIntegrity(db, content, { today: '2026-10-01' }).errors.join('\n');
    expect(errors).toMatch(/lesson_progress for lesson fr-a1-1-u01-l01 in course "fr", which the user is not enrolled in/);
    expect(errors).toMatch(/attempts in course "fr", which the user is not enrolled in/);
    // Enrolment rows themselves: a real course, a start level of that course; a known native language.
    db.prepare("INSERT INTO user_courses (user_id, track, start_pack) VALUES (?, 'fr', 'en-a1')").run(kid2);
    db.prepare("UPDATE users SET native_lang = 'xx' WHERE id = ?").run(kid2);
    const more = checkIntegrity(db, content, { today: '2026-10-01' }).errors.join('\n');
    expect(more).toMatch(/start_pack "en-a1" is not a level of that course/);
    expect(more).toMatch(/native_lang "xx" is not a native language/);
  });
});

describe('legacy attempts (migration 006) and retired exercises', () => {
  it('an attempt of an earlier exercise version is a warning until flagged, then info only (the check stays green)', () => {
    const { db, id } = setup();
    const ex = content.lessons.get('fr-a1-1-u01-l01').lesson.exercises[1];
    recordAttempt(db, { userId: id('kid2'), lessonId: 'fr-a1-1-u01-l01', exerciseId: ex.id, itemIds: ['fr.chat'], correct: false, givenAnswer: 'x', now: new Date('2026-09-30T08:00:00Z') });
    let r = checkIntegrity(db, content, { today: '2026-10-01' });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join('\n')).toMatch(/not marked legacy yet/);
    expect(markLegacyAttempts(db, content)).toMatchObject({ marked: 1 });
    r = checkIntegrity(db, content, { today: '2026-10-01' });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.info.join('\n')).toMatch(new RegExp(`kid2 \\(id \\d+\\): 1 legacy attempt\\(s\\).*${ex.id} ×1`));
    expect(r.users.find((u) => u.username === 'kid2').attempts.legacy).toBe(1);
  });

  it('attempts on an exercise hidden by an admin correction (retired in the lock) are info, not an orphan error', () => {
    const { db, id } = setup();
    const ex = content.lessons.get('fr-a1-1-u01-l01').lesson.exercises[0];
    const hidden = { ...content, exercises: new Map([...content.exercises].filter(([k]) => k !== ex.id)) };
    expect(checkIntegrity(db, hidden, { today: '2026-10-01' }).errors.join('\n')).toMatch(/does not exist in the content/);
    hidden.retired = new Map([[ex.id, { key: 'x', reason: 'admin correction #1', date: '2026-10-02' }]]);
    expect(markLegacyAttempts(db, hidden)).toMatchObject({ marked: 1 });
    const r = checkIntegrity(db, hidden, { today: '2026-10-01' });
    expect(r.errors).toEqual([]);
    expect(r.info.join('\n')).toMatch(/1 attempt\(s\) on exercises hidden by an admin correction/);
    // Undo: the exercise is back with the same items, the flag clears again.
    expect(markLegacyAttempts(db, content)).toMatchObject({ cleared: 1, legacy: 0 });
  });

  it('migration 006 on a database with attempts: column added with 0 everywhere, then the flag follows the content', () => {
    const migrations = path.resolve(here, '../src/db/migrations');
    const upTo005 = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-mig-'));
    for (const f of fs.readdirSync(migrations).filter((f) => parseInt(f, 10) <= 5)) fs.copyFileSync(path.join(migrations, f), path.join(upTo005, f));
    const db = new Database(':memory:');
    runMigrations(db, upTo005);
    fs.rmSync(upTo005, { recursive: true, force: true });
    db.prepare("INSERT INTO users (username, password_hash, role, display_name, track) VALUES ('kid2', 'h', 'child', 'Alex', 'fr')").run();
    const kid2 = db.prepare("SELECT id FROM users WHERE username = 'kid2'").pluck().get();
    const ex = content.lessons.get('fr-a1-1-u01-l01').lesson.exercises[2];
    db.prepare("INSERT INTO attempts (user_id, lesson_id, exercise_id, item_ids, correct) VALUES (?, 'fr-a1-1-u01-l01', ?, ?, 0)").run(kid2, ex.id, JSON.stringify(ex.items));
    db.prepare("INSERT INTO attempts (user_id, lesson_id, exercise_id, item_ids, correct) VALUES (?, 'fr-a1-1-u01-l01', ?, '[\"fr.autre\"]', 0)").run(kid2, ex.id);
    expect(runMigrations(db)).toEqual(['006_corrections_reports.sql', '007_courses.sql', '008_drop_user_track.sql', '009_attempt_run.sql', '010_autoplay.sql', '011_problem_acks.sql', '012_completion_run.sql', '013_family_board.sql', '014_audio_lab.sql', '015_lab_both_bad.sql', '016_listen_checks.sql', '017_clip_rerecords.sql', '018_drop_lab_votes.sql', '019_listen_compare.sql', '020_drop_listen_compare.sql', '021_theme.sql', '022_audio_sample_votes.sql']);
    expect(db.prepare('SELECT legacy, COUNT(*) AS n FROM attempts GROUP BY legacy').all()).toEqual([{ legacy: 0, n: 2 }]);
    expect(markLegacyAttempts(db, content)).toEqual({ total: 2, legacy: 1, marked: 1, cleared: 0 });
    expect(db.prepare('SELECT legacy, COUNT(*) AS n FROM attempts GROUP BY legacy').all()).toEqual([{ legacy: 0, n: 1 }, { legacy: 1, n: 1 }]);
  });
});

describe('integrity: further checks', () => {
  it('D6: finished lessons and a start level in a level withdrawn to preview are warnings; D9: orphans in every USER_TABLES table', () => {
    const { db, id } = setup();
    db.prepare("UPDATE user_courses SET start_pack = 'fr-a1-1' WHERE user_id = ?").run(id('kid2'));
    const withdrawn = { ...content, packs: new Map([...content.packs].map(([k, p]) => [k, k === 'fr-a1-1' ? { ...p, preview: true } : p])) };
    const r = checkIntegrity(db, withdrawn, { today: '2026-10-01' });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join('\n')).toMatch(/1 finished lesson\(s\) in a level withdrawn to preview/);
    expect(r.warnings.join('\n')).toMatch(/start_pack "fr-a1-1" is a level withdrawn to preview/);
    db.pragma('foreign_keys = OFF');
    db.prepare("INSERT INTO user_courses (user_id, track, enrolled_at) VALUES (999, 'en', '2026-10-01')").run();
    expect(checkIntegrity(db, content, { today: '2026-10-01' }).errors).toContain('user_courses: 1 row(s) of users that do not exist');
  });
});

describe('the nightly check when the lessons do not load', () => {
  it('writes a skipped (amber) status instead of crashing without one', async () => {
    const { execFileSync } = await import('node:child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-integrity-'));
    fs.mkdirSync(path.join(dir, 'c/packs'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'c/packs/manifest.json'), '{"tracks":[{"id":"en","packs":[]}]}');
    const db = new Database(path.join(dir, 'x.sqlite'));
    runMigrations(db);
    db.close();
    let code = 0;
    try {
      execFileSync(process.execPath, [path.resolve(here, '../../scripts/check-integrity.js'), path.join(dir, 'x.sqlite'), '--content', path.join(dir, 'c'), '--status'],
        { env: { ...process.env, ANZO_SPOOL_DIR: path.join(dir, 'spool') }, stdio: 'pipe' });
    } catch (err) { code = err.status; }
    expect(code).toBe(2);
    const st = JSON.parse(fs.readFileSync(path.join(dir, 'spool/status/integrity.json'), 'utf8'));
    expect(st).toMatchObject({ ok: true, skipped: true });
    expect(st.warnings[0]).toMatch(/^not checked: the lessons in .* do not load/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
