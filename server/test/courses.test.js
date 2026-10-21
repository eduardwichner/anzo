// Courses decoupled from users — migrations 007/008, enrolment rules, per-course practice, reset and
// badges, and the adult wording.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import pino from 'pino';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openMemoryDb, runMigrations } from '../src/db/index.js';
import { loadContent } from '../src/content/loader.js';
import { loadAudio } from '../src/audio/manifest.js';
import { seedUsers } from '../src/lib/users.js';
import { activeTrack, enrol, hideCourse, offeredCourses, visibleCourses } from '../src/lib/courses.js';
import { completeLesson, recordAttempt, resetProgress } from '../src/lib/progress.js';
import { checkIntegrity } from '../src/lib/integrity.js';
import { practiceCandidates, startPractice } from '../src/practice/index.js';
import { defaultMessage } from '../src/ops/reports.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(here, '../../content');
const MIGRATIONS = path.resolve(here, '../src/db/migrations');
const content = loadContent({ contentDir: CONTENT_DIR });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-courses-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const userRow = (db, username) => db.prepare('SELECT * FROM users WHERE username = ?').get(username);
const EN1 = 'en-pre-a1-u01-l01';
const FR1 = 'fr-a1-1-u01-l01';
const play = (db, userId, lessonId, now) => {
  const entry = content.lessons.get(lessonId);
  for (const ex of entry.lesson.exercises) {
    recordAttempt(db, { userId, lessonId, exerciseId: ex.id, itemIds: ex.items, correct: true, givenAnswer: 'x', firstTry: true, now });
  }
  return completeLesson(db, { userId, lessonId, firstTryCorrect: entry.playableCount, total: entry.playableCount, now });
};

describe('migrations 007 + 008 on a database of the shape before them (Sam none, Alex one French lesson)', () => {
  it('each learner gets one enrolment with the start level, active_track set; progress, XP, streak, badges unchanged', () => {
    const upTo006 = path.join(tmp, 'mig006');
    fs.mkdirSync(upTo006);
    for (const f of fs.readdirSync(MIGRATIONS).filter((x) => parseInt(x, 10) <= 6)) fs.copyFileSync(path.join(MIGRATIONS, f), path.join(upTo006, f));
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db, upTo006);
    const ins = db.prepare('INSERT INTO users (username, password_hash, role, display_name, track, avatar, start_pack) VALUES (?, ?, ?, ?, ?, ?, ?)');
    ins.run('kid1', 'h', 'child', 'Sam', 'en', 'cat', null);
    ins.run('kid2', 'h', 'child', 'Alex', 'fr', 'rabbit', null);
    ins.run('admin', 'h', 'admin', 'Beheer', null, 'owl', null);
    ins.run('mover', 'h', 'child', 'Mover', 'en', 'fox', 'en-a1');
    db.prepare('INSERT INTO user_stats (user_id) SELECT id FROM users').run();
    const kid2 = 2;
    const t = new Date('2026-09-30T07:54:05Z');
    for (const ex of content.lessons.get(FR1).lesson.exercises) {
      db.prepare(`INSERT INTO attempts (user_id, lesson_id, exercise_id, item_ids, correct, given_answer, created_at, first_try)
                  VALUES (?, ?, ?, ?, 1, '"x"', ?, 1)`).run(kid2, FR1, ex.id, JSON.stringify(ex.items), t.toISOString());
    }
    db.prepare("INSERT INTO lesson_completions (user_id, lesson_id, score, xp, completed_at) VALUES (?, ?, 83, 130, ?)").run(kid2, FR1, t.toISOString());
    db.prepare("INSERT INTO lesson_progress (user_id, lesson_id, best_score, first_completed_at, last_completed_at) VALUES (?, ?, 83, ?, ?)").run(kid2, FR1, t.toISOString(), t.toISOString());
    db.prepare("UPDATE user_stats SET xp = 130, streak_current = 1, streak_best = 1, last_active_date = '2026-09-30' WHERE user_id = ?").run(kid2);
    db.prepare("INSERT INTO user_badges (user_id, badge_id, earned_at, silent) VALUES (?, 'first-lesson', ?, 1)").run(kid2, t.toISOString());
    db.prepare("INSERT INTO daily_goal_days (user_id, day, goal, xp, reached_at) VALUES (?, '2026-09-30', 20, 130, ?)").run(kid2, t.toISOString());
    db.prepare("INSERT INTO item_strength (user_id, item_id, strength, last_seen_at, next_review_at) VALUES (?, 'fr.bonjour', 2, ?, ?)").run(kid2, t.toISOString(), t.toISOString());
    // Progress kept from an earlier track (a track change): becomes a hidden enrolment.
    db.prepare("INSERT INTO item_strength (user_id, item_id, strength, last_seen_at, next_review_at) VALUES (4, 'fr.chat', 1, ?, ?)").run(t.toISOString(), t.toISOString());
    const snapshot = (tables) => Object.fromEntries(tables.map((x) => [x, db.prepare(`SELECT * FROM ${x} ORDER BY 1, 2`).all()]));
    const TABLES = ['user_stats', 'lesson_progress', 'lesson_completions', 'attempts', 'item_strength', 'user_badges', 'daily_goal_days'];
    const before = snapshot(TABLES);

    expect(runMigrations(db)).toEqual(['007_courses.sql', '008_drop_user_track.sql', '009_attempt_run.sql', '010_autoplay.sql', '011_problem_acks.sql', '012_completion_run.sql', '013_family_board.sql', '014_audio_lab.sql', '015_lab_both_bad.sql', '016_listen_checks.sql', '017_clip_rerecords.sql', '018_drop_lab_votes.sql', '019_listen_compare.sql', '020_drop_listen_compare.sql', '021_theme.sql', '022_audio_sample_votes.sql']);
    // 009 only adds attempts.run (NULL for every earlier attempt).
    const after = snapshot(TABLES);
    expect(after.attempts.every((a) => a.run === null)).toBe(true);
    after.attempts = after.attempts.map(({ run, ...a }) => a);
    expect(after.lesson_completions.every((c) => c.run === null)).toBe(true); // 012
    after.lesson_completions = after.lesson_completions.map(({ run, ...c }) => c);
    expect(after).toEqual(before);
    expect(db.prepare('SELECT user_id, track, start_pack, hidden FROM user_courses ORDER BY user_id, track').all()).toEqual([
      { user_id: 1, track: 'en', start_pack: null, hidden: 0 },
      { user_id: 2, track: 'fr', start_pack: null, hidden: 0 },
      { user_id: 4, track: 'en', start_pack: 'en-a1', hidden: 0 },
      { user_id: 4, track: 'fr', start_pack: null, hidden: 1 },
    ]);
    expect(db.prepare('SELECT username, active_track, audience, can_self_enroll, native_lang FROM users ORDER BY id').all()).toEqual([
      { username: 'kid1', active_track: 'en', audience: 'child', can_self_enroll: 1, native_lang: 'nl' },
      { username: 'kid2', active_track: 'fr', audience: 'child', can_self_enroll: 1, native_lang: 'nl' },
      { username: 'admin', active_track: null, audience: 'adult', can_self_enroll: 1, native_lang: 'nl' },
      { username: 'mover', active_track: 'en', audience: 'child', can_self_enroll: 1, native_lang: 'nl' },
    ]);
    const cols = db.prepare('SELECT name FROM pragma_table_info(?)').pluck().all('users');
    expect(cols).not.toContain('track');
    expect(cols).not.toContain('start_pack');
    expect(db.pragma('foreign_key_check')).toEqual([]);
    const r = checkIntegrity(db, content, { today: '2026-10-03' });
    expect(r.errors).toEqual([]);
    expect(r.users.find((u) => u.username === 'kid2')).toMatchObject({ activeTrack: 'fr', courses: [{ track: 'fr', startPack: null, hidden: false }], stats: { xp: 130, streak: 1 } });
  });
});

describe('enrolment rules', () => {
  it('courses are offered by native language; self-enrol adds and activates, hide keeps progress, re-adding restores', () => {
    const db = openMemoryDb();
    seedUsers(db);
    expect(offeredCourses(content, 'nl').map((c) => c.track)).toEqual(['en', 'fr']);
    expect(offeredCourses(content, 'en').map((c) => c.track)).toEqual(['nl', 'fr-en']); // and fr-en
    const kid1 = () => userRow(db, 'kid1');
    play(db, kid1().id, EN1, new Date('2026-10-01T10:00:00Z'));
    enrol(db, content, kid1(), 'fr');
    expect(activeTrack(db, content, kid1())).toBe('fr');
    expect(visibleCourses(db, content, kid1()).map((e) => e.track)).toEqual(['en', 'fr']);
    hideCourse(db, content, kid1(), 'en');
    expect(visibleCourses(db, content, kid1()).map((e) => e.track)).toEqual(['fr']);
    expect(db.prepare('SELECT COUNT(*) FROM lesson_progress WHERE user_id = ?').pluck().get(kid1().id)).toBe(1);
    enrol(db, content, kid1(), 'en', { activate: false });
    expect(visibleCourses(db, content, kid1()).map((e) => e.track)).toEqual(['en', 'fr']);
    expect(activeTrack(db, content, kid1())).toBe('fr');
    // Hiding the active course moves to the next visible one.
    hideCourse(db, content, kid1(), 'fr');
    expect(activeTrack(db, content, kid1())).toBe('en');
    // Another native language: the Dutch-speaker's courses are not offered, their enrolments invisible but kept.
    db.prepare("UPDATE users SET native_lang = 'en' WHERE username = 'kid1'").run();
    expect(visibleCourses(db, content, kid1())).toEqual([]);
    expect(() => enrol(db, content, kid1(), 'fr')).toThrow(/course_not_offered/);
    db.prepare("UPDATE users SET native_lang = 'nl' WHERE username = 'kid1'").run();
    expect(visibleCourses(db, content, kid1()).map((e) => e.track)).toEqual(['en']);
  });

  it('API: offered courses for an nl and an en learner; self-enrol off forbids add and hide but not switching', async () => {
    const db = openMemoryDb();
    seedUsers(db);
    const config = {
      version: 'test', sessionSecret: 'x'.repeat(48), dataDir: tmp, audioDir: path.join(tmp, 'none'), modelsDir: tmp, contentDir: CONTENT_DIR,
      clientDist: path.join(tmp, 'no-dist'), loginRateLimit: 100,
    };
    const audio = loadAudio({ audioDir: config.audioDir, contentDir: CONTENT_DIR, content, logger: pino({ level: 'silent' }) });
    const app = createApp({ db, content, audio, config, logger: pino({ level: 'silent' }) });
    const kid1 = request.agent(app);
    await kid1.post('/api/auth/login').send({ username: 'kid1', password: 'kid1' });
    const list = (await kid1.get('/api/courses')).body;
    expect(list).toMatchObject({ active: 'en', courses: [{ track: 'en', xp: 0 }], offered: [{ track: 'fr', restore: false }], canSelfEnroll: true });
    const added = await kid1.post('/api/courses').send({ track: 'fr' });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ active: 'fr', courses: [{ track: 'en' }, { track: 'fr' }], offered: [] });
    expect((await kid1.get('/api/auth/me')).body.user.activeTrack).toBe('fr');
    expect((await kid1.get('/api/content/tracks')).body).toMatchObject({ active: 'fr', tracks: [{ id: 'en' }, { id: 'fr' }] });
    expect((await kid1.put('/api/courses/active').send({ track: 'en' })).body.active).toBe('en');
    expect((await kid1.put('/api/courses/active').send({ track: 'de' })).body).toEqual({ error: 'not_enrolled' });
    expect((await kid1.post('/api/courses').send({ track: 'de' })).body).toEqual({ error: 'course_not_offered' });
    // Hide and restore.
    expect((await kid1.delete('/api/courses/fr')).body).toMatchObject({ active: 'en', courses: [{ track: 'en' }], offered: [{ track: 'fr', restore: true }] });
    expect((await kid1.get('/api/content/packs/fr-a1-1')).status).toBe(403);
    expect((await kid1.post('/api/courses').send({ track: 'fr' })).body.courses.map((c) => c.track)).toEqual(['en', 'fr']);

    // An English-speaking adult learner: only the Dutch course (native en) is offered; the English one is not.
    const admin = request.agent(app);
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'admin' });
    await admin.post('/api/auth/password').send({ current: 'admin', next: 'beheer-test-1' });
    const created = await admin.post('/api/admin/users').send({
      username: 'learner', displayName: 'Chris', role: 'child', nativeLang: 'en', audience: 'adult', uiLang: 'en', avatar: 'fox', avatarBg: 'sky', password: 'abcd',
    });
    expect(created.body.user).toMatchObject({ nativeLang: 'en', audience: 'adult', activeTrack: null });
    const learner = request.agent(app);
    await learner.post('/api/auth/login').send({ username: 'learner', password: 'abcd' });
    expect((await learner.get('/api/courses')).body).toMatchObject({ active: null, courses: [], offered: [{ track: 'nl' }, { track: 'fr-en' }], nativeLang: 'en' });
    expect((await learner.post('/api/courses').send({ track: 'en' })).body).toEqual({ error: 'course_not_offered' });
    expect((await learner.post('/api/courses').send({ track: 'fr' })).body).toEqual({ error: 'course_not_offered' });
    expect((await learner.post('/api/courses').send({ track: 'nl' })).body).toMatchObject({ active: 'nl', courses: [{ track: 'nl' }], offered: [{ track: 'fr-en' }] });
    // and the Dutch-speaking child is never offered the Dutch course
    expect((await kid1.get('/api/courses')).body.offered.map((c) => c.track)).not.toContain('nl');

    // Self-enrol off: no adding or hiding; switching between the admin's courses still works.
    const zid = userRow(db, 'kid1').id;
    await admin.patch(`/api/admin/users/${zid}`).send({ canSelfEnroll: false });
    expect((await kid1.delete('/api/courses/fr')).body).toEqual({ error: 'self_enroll_off' });
    expect((await kid1.post('/api/courses').send({ track: 'fr' })).body).toEqual({ error: 'self_enroll_off' });
    expect((await kid1.put('/api/courses/active').send({ track: 'fr' })).body.active).toBe('fr');
    // The admin: hide, restore, start level, active — per course.
    expect((await admin.put(`/api/admin/users/${zid}/courses/en`).send({ hidden: true })).body.courses.map((c) => [c.track, c.hidden]))
      .toEqual([['en', true], ['fr', false]]);
    expect((await admin.put(`/api/admin/users/${zid}/courses/en`).send({ hidden: false, startPack: 'en-a1', active: true })).body)
      .toMatchObject({ active: 'en', courses: [{ track: 'en', hidden: false, startPack: 'en-a1' }, { track: 'fr' }] });
    expect((await admin.get(`/api/admin/users/${zid}/courses`)).body.courses).toHaveLength(2);
  });
});

describe('the admin as a learner', () => {
  it('same offering rule; enrols, plays, practises, resets his own course; integrity sees his rows as a learner\'s', async () => {
    const db = openMemoryDb();
    seedUsers(db);
    const config = {
      version: 'test', sessionSecret: 'x'.repeat(48), dataDir: tmp, audioDir: path.join(tmp, 'none'), modelsDir: tmp, contentDir: CONTENT_DIR,
      clientDist: path.join(tmp, 'no-dist'), loginRateLimit: 100,
    };
    const audio = loadAudio({ audioDir: config.audioDir, contentDir: CONTENT_DIR, content, logger: pino({ level: 'silent' }) });
    const app = createApp({ db, content, audio, config, logger: pino({ level: 'silent' }) });
    const admin = request.agent(app);
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'admin' });
    await admin.post('/api/auth/password').send({ current: 'admin', next: 'beheer-test-1' });
    const me = userRow(db, 'admin');
    // native language nl (the seed): the Dutch course is not offered; English and French are
    expect((await admin.get('/api/courses')).body).toMatchObject({ active: null, courses: [], offered: [{ track: 'en' }, { track: 'fr' }], canSelfEnroll: true });
    expect((await admin.post('/api/courses').send({ track: 'nl' })).body).toEqual({ error: 'course_not_offered' });
    // native language English: Dutch is offered (the live admin)
    expect((await admin.patch(`/api/admin/users/${me.id}`).send({ nativeLang: 'en' })).status).toBe(200);
    expect((await admin.get('/api/courses')).body.offered.map((c) => c.track)).toEqual(['nl', 'fr-en']);
    // an admin may always add a course himself, even with can_self_enroll off
    db.prepare('UPDATE users SET can_self_enroll = 0 WHERE id = ?').run(me.id);
    expect((await admin.post('/api/courses').send({ track: 'nl' })).status).toBe(201);
    expect((await admin.get('/api/auth/me')).body.user.activeTrack).toBe('nl');
    // his Home (?mine=1): only his course, preview levels as roadmap; without it, Levels: every track with previews
    const mine = (await admin.get('/api/content/tracks?mine=1')).body;
    expect(mine.active).toBe('nl');
    expect(mine.tracks.map((x) => x.id)).toEqual(['nl']);
    expect(mine.tracks[0].packs.find((p) => p.id === 'nl-b1').status).toBe(content.packs.get('nl-b1').preview ? 'roadmap' : 'available');
    const all = (await admin.get('/api/content/tracks')).body;
    expect(all.tracks.map((x) => x.id)).toEqual(['en', 'fr', 'nl', 'fr-en']);
    // he plays a lesson like a learner: attempts and the completion are stored, XP counted
    const lessonId = 'nl-pre-a1-u01-l01';
    const entry = content.lessons.get(lessonId);
    for (const ex of entry.lesson.exercises) {
      expect((await admin.post('/api/progress/attempt').send({ lessonId, exerciseId: ex.id, answer: 'x', firstTry: true })).status).toBe(200);
    }
    const done = await admin.post(`/api/progress/lesson/${lessonId}/complete`).send({ firstTryCorrect: 0, total: entry.playableCount });
    expect(done.status).toBe(200);
    expect(done.body.xpEarned).toBeGreaterThan(0);
    // a lesson of a course he does not take is refused
    expect((await admin.post('/api/progress/attempt').send({ lessonId: EN1, exerciseId: content.lessons.get(EN1).lesson.exercises[0].id, answer: 'x' })).status).toBe(403);
    expect((await admin.get('/api/practice/summary')).body.unlocked).toBe(true);
    expect((await admin.post('/api/practice/start').send({ mode: 'due' })).status).toBe(201);
    expect((await admin.get('/api/profile')).body.courses.map((c) => c.track)).toEqual(['nl']);
    // Admin → Users shows his progress like anyone's
    const prog = (await admin.get(`/api/admin/users/${me.id}/progress?track=nl`)).body;
    expect(prog.packs[0].units[0].lessons.find((l) => l.id === lessonId)).toMatchObject({ done: true });
    // integrity: an enrolled admin with progress is consistent (no "admins never record progress" any more)
    const report = checkIntegrity(db, content);
    expect(report.errors).toEqual([]);
    expect(report.warnings.filter((w) => w.startsWith('admin'))).toEqual([]);
    // his own reset (admins may always): the Dutch course's progress goes, XP back to the practice-free sum
    const reset = await admin.post('/api/progress/reset').send({ scope: 'track', track: 'nl', password: 'beheer-test-1', confirm: 'RESET' });
    expect(reset.status).toBe(200);
    expect(reset.body.xpAfter).toBe(0);
    expect(db.prepare('SELECT COUNT(*) FROM lesson_progress WHERE user_id = ?').pluck().get(me.id)).toBe(0);
    expect(checkIntegrity(db, content).errors).toEqual([]);
  });
});

describe('per course', () => {
  function twoCourses() {
    const db = openMemoryDb();
    seedUsers(db);
    const kid1 = userRow(db, 'kid1');
    enrol(db, content, kid1, 'fr', { activate: false });
    play(db, kid1.id, EN1, new Date('2026-10-01T10:00:00Z'));
    play(db, kid1.id, FR1, new Date('2026-10-02T10:00:00Z'));
    return { db, kid1: userRow(db, 'kid1') };
  }

  it('practice uses only the active course\'s exercises and is recorded under that course', () => {
    const { db, kid1 } = twoCourses();
    const asCourse = (track) => ({ ...kid1, active_track: track });
    expect(new Set(practiceCandidates(db, content, asCourse('fr')).map((c) => content.lessons.get(c.lessonId).trackId))).toEqual(new Set(['fr']));
    expect(new Set(practiceCandidates(db, content, asCourse('en')).map((c) => content.lessons.get(c.lessonId).trackId))).toEqual(new Set(['en']));
    const s = startPractice(db, content, asCourse('fr'), 'due', new Date('2026-10-05T10:00:00Z'));
    expect(s.exercises.every((e) => e.packId.startsWith('fr-'))).toBe(true);
    expect(db.prepare('SELECT track FROM practice_sessions WHERE id = ?').pluck().get(s.id)).toBe('fr');
  });

  it('a course reset leaves the other course untouched; the total XP is the sum of both', () => {
    const { db, kid1 } = twoCourses();
    const xpOf = () => db.prepare('SELECT xp FROM user_stats WHERE user_id = ?').pluck().get(kid1.id);
    const total = xpOf();
    const fr = db.prepare("SELECT SUM(xp) FROM lesson_completions WHERE user_id = ? AND lesson_id LIKE 'fr-%'").pluck().get(kid1.id);
    const r = resetProgress(db, content, kid1.id, { track: 'en' });
    expect(r.xpAfter).toBe(fr);
    expect(xpOf()).toBe(total - (total - fr));
    expect(db.prepare('SELECT lesson_id FROM lesson_progress WHERE user_id = ?').pluck().all(kid1.id)).toEqual([FR1]);
    expect(db.prepare("SELECT COUNT(*) FROM item_strength WHERE user_id = ? AND item_id LIKE 'fr%'").pluck().get(kid1.id)).toBeGreaterThan(0);
    expect(db.prepare("SELECT COUNT(*) FROM item_strength WHERE user_id = ? AND item_id LIKE 'en%'").pluck().get(kid1.id)).toBe(0);
    expect(checkIntegrity(db, content, { today: '2026-10-03' }).errors).toEqual([]);
  });
});

describe('audience', () => {
  it('adults get adult wording in the one-time messages, in their language', () => {
    expect(defaultMessage('nl', 'checked')).toBe('Bedankt! We hebben het gecontroleerd: het was goed.');
    expect(defaultMessage('nl', 'checked', 'adult')).toMatch(/^Bedankt voor je melding/);
    expect(defaultMessage('en', 'fixed', 'adult')).toBe('Thanks for your report: it fixed a mistake.');
    expect(defaultMessage('en', 'fixed', 'child')).toBe('Thank you! Your report fixed a mistake.');
  });
});

describe('seed tooling: one extra account (scripts/seed-users.js --account)', () => {
  it('checks the course against the native language and the start level, then creates the learner enrolled there', async () => {
    const { checkSeedAccount } = await import('../src/lib/courses.js');
    const manifest = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'packs/manifest.json'), 'utf8'));
    const learner = {
      username: 'dee', password: 'dee-1', role: 'child', display_name: 'Dee', native_lang: 'en', ui_lang: 'en', audience: 'adult',
      avatar: 'fox', avatar_bg: 'sky', show_on_login: 1, courses: [{ track: 'nl', startPack: 'nl-pre-a1' }],
    };
    expect(checkSeedAccount(manifest, learner)).toBeNull();
    expect(checkSeedAccount(manifest, { ...learner, native_lang: 'nl' })).toMatch(/not offered for native language "nl"/);
    expect(checkSeedAccount(manifest, { ...learner, courses: [{ track: 'nl', startPack: 'en-a1' }] })).toMatch(/not an available level/);
    // The account rules of Admin → Users apply
    expect(checkSeedAccount(manifest, { ...learner, username: 'D!' })).toMatch(/username/);
    expect(checkSeedAccount(manifest, { ...learner, role: 'admin', password: 'short', courses: [] })).toMatch(/at least 8/);
    expect(checkSeedAccount(manifest, { ...learner, role: 'boss' })).toMatch(/role/);
    expect(checkSeedAccount(manifest, { ...learner, avatar: 'unicorn' })).toMatch(/avatar/);
    expect(checkSeedAccount(manifest, { ...learner, ui_lang: 'fr' })).toMatch(/ui_lang/);
    const db = openMemoryDb();
    expect(seedUsers(db, [learner])).toEqual(['dee']);
    expect(seedUsers(db, [learner])).toEqual([]);
    const row = db.prepare("SELECT username, role, audience, native_lang, ui_lang, active_track, must_change_password FROM users WHERE username = 'dee'").get();
    expect(row).toEqual({ username: 'dee', role: 'child', audience: 'adult', native_lang: 'en', ui_lang: 'en', active_track: 'nl', must_change_password: 0 });
    expect(db.prepare('SELECT track, start_pack, hidden FROM user_courses').all()).toEqual([{ track: 'nl', start_pack: 'nl-pre-a1', hidden: 0 }]);
  });
});
