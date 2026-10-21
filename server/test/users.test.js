// Accounts (create / edit / delete), preferences, progress reset (admin + self-service), migration 003.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openMemoryDb, runMigrations } from '../src/db/index.js';
import { loadContent } from '../src/content/loader.js';
import { AVATAR_BGS, AVATAR_IDS } from '../src/lib/avatars.js';
import * as serverRules from '../src/lib/users.js';
import { deleteUser, seedUsers, USER_TABLES, validateUserInput } from '../src/lib/users.js';
import { completeLesson, recordAttempt, resetProgress } from '../src/lib/progress.js';
import * as clientAvatars from '../../client/src/avatars/ids.js';
import * as clientRules from '../../client/src/lib/userRules.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_CONTENT = path.resolve(here, '../../content');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-users-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

// Content with two English levels (the repo's Pre-A1 plus a renamed copy as "A1"), so a level reset
// and a track reset differ.
const TWO_LEVELS = path.join(tmp, 'content');
{
  fs.cpSync(REPO_CONTENT, TWO_LEVELS, { recursive: true, filter: (src) => !src.includes(`${path.sep}reference`) });
  const pre = fs.readFileSync(path.join(REPO_CONTENT, 'packs/en/pre-a1.json'), 'utf8');
  const a1 = pre.replaceAll('"en-pre-a1', '"en-a1').replaceAll('"en.', '"en.m-').replace('"cefr": "Pre-A1"', '"cefr": "A1"');
  fs.writeFileSync(path.join(TWO_LEVELS, 'packs/en/a1.json'), a1);
  const manifestPath = path.join(TWO_LEVELS, 'packs/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  // Exactly two English levels: the renamed copy as A1, everything above it not available.
  for (const p of manifest.tracks[0].packs) if (!['en-pre-a1', 'en-a1'].includes(p.id) && p.status === 'available') p.status = 'planned';
  manifest.tracks[0].packs.find((p) => p.id === 'en-a1').status = 'available';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
}
const content = loadContent({ contentDir: TWO_LEVELS });
// Generated lessons have 12–14 exercises; a perfect run of en-pre-a1-u01-l01 earns XP_L1.
const T1 = content.lessons.get('en-pre-a1-u01-l01').playableCount;
const FR1 = content.lessons.get('fr-a1-1-u01-l01').playableCount;
const XP_L1 = 10 * T1 + 20;

function makeApp() {
  const db = openMemoryDb();
  seedUsers(db);
  const config = {
    version: 'test', sessionSecret: 'x'.repeat(48), dataDir: tmp, audioDir: path.join(tmp, 'no-audio'), modelsDir: tmp,
    contentDir: TWO_LEVELS, clientDist: path.join(tmp, 'no-dist'), loginRateLimit: 100,
  };
  return { db, app: createApp({ db, content, config, logger: pino({ level: 'silent' }) }) };
}

async function login(app, username, password = username) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ username, password });
  expect(res.status).toBe(200);
  return agent;
}

async function adminAgent(app) {
  const agent = await login(app, 'admin', 'admin');
  expect((await agent.post('/api/auth/password').send({ current: 'admin', next: 'beheer-test-1' })).status).toBe(204);
  return agent;
}

const idOf = (db, username) => db.prepare('SELECT id FROM users WHERE username = ?').pluck().get(username);
const NEW_KID = { username: 'test_kid', displayName: 'Test Kid', role: 'child', course: { track: 'fr' }, uiLang: 'en', avatar: 'owl', avatarBg: 'mint', password: 'kid1' };

describe('client/server parity', () => {
  it('avatar ids and colours are the same on both sides', () => {
    expect(clientAvatars.AVATAR_IDS).toEqual(AVATAR_IDS);
    expect(clientAvatars.AVATAR_BGS).toEqual(AVATAR_BGS);
    expect(AVATAR_IDS).toHaveLength(16);
    expect(AVATAR_BGS).toHaveLength(8);
  });

  it('account rules are the same on both sides', () => {
    expect(String(clientRules.USERNAME_RE)).toBe(String(serverRules.USERNAME_RE));
    expect(clientRules.DISPLAY_NAME_MAX).toBe(serverRules.DISPLAY_NAME_MAX);
    expect(clientRules.UI_LANGS).toEqual(serverRules.UI_LANGS);
    for (const role of ['child', 'admin']) expect(clientRules.minPasswordLength(role)).toBe(serverRules.minPasswordLength(role));
  });
});

describe('validateUserInput', () => {
  const db = openMemoryDb();
  seedUsers(db);
  const errorsOf = (input, existing) => validateUserInput(db, input, existing).errors ?? {};

  it('username: 2-24 of a-z 0-9 _ -, unique case-insensitively; trimmed and lower-cased first', () => {
    for (const ok of ['ab', 'test_kid', 'kid-2', 'a'.repeat(24), '  Lotte ']) expect(errorsOf({ ...NEW_KID, username: ok }).username).toBeUndefined();
    for (const bad of ['a', 'a'.repeat(25), 'jan jansen', 'zoë', 'kid!', '', undefined, 42]) {
      expect(errorsOf({ ...NEW_KID, username: bad }).username).toBe('invalid');
    }
    expect(errorsOf({ ...NEW_KID, username: 'KID1' }).username).toBe('taken');
    expect(validateUserInput(db, { ...NEW_KID, username: ' Lotte ' }).values.username).toBe('lotte');
  });

  it('native language and audience come from their lists, passwords follow the role minimum, avatars come from the set', () => {
    expect(errorsOf({ ...NEW_KID, nativeLang: 'de' }).nativeLang).toBe('invalid');
    expect(errorsOf({ ...NEW_KID, nativeLang: 'en' })).toEqual({});
    expect(errorsOf({ ...NEW_KID, audience: 'teen' }).audience).toBe('invalid');
    expect(errorsOf({ ...NEW_KID, role: 'admin', password: 'kort' })).toEqual({ password: 'too_short' });
    expect(validateUserInput(db, { ...NEW_KID, password: 'abc' }).min).toBe(4);
    expect(errorsOf({ ...NEW_KID, avatar: 'mickey' }).avatar).toBe('invalid');
    expect(errorsOf({ ...NEW_KID, avatarBg: 'red' }).avatarBg).toBe('invalid');
    expect(errorsOf({ ...NEW_KID, uiLang: 'de' }).uiLang).toBe('invalid');
    expect(errorsOf({ ...NEW_KID, displayName: ' ' }).displayName).toBe('invalid');
    expect(errorsOf({ ...NEW_KID, displayName: 'x'.repeat(31) }).displayName).toBe('invalid');
  });

  it('defaults: admins must change the password and are hidden from the grid; children the reverse; no self-reset', () => {
    expect(validateUserInput(db, NEW_KID).values)
      .toMatchObject({ must_change_password: 0, show_on_login: 1, can_self_reset: 0, can_self_enroll: 1, native_lang: 'nl', audience: 'child' });
    expect(validateUserInput(db, { ...NEW_KID, role: 'admin', password: 'lang-genoeg' }).values)
      .toMatchObject({ must_change_password: 1, show_on_login: 0, can_self_reset: 0, audience: 'adult' });
  });

  it('editing never changes the username', () => {
    const kid1 = db.prepare("SELECT * FROM users WHERE username = 'kid1'").get();
    expect(errorsOf({ username: 'zola2' }, kid1)).toEqual({ username: 'immutable' });
    expect(errorsOf({ displayName: 'Zo' }, kid1)).toEqual({});
  });
});

describe('user management API', () => {
  it('create (with a first course), read, edit (incl. switching courses, which keeps progress) and delete a user', async () => {
    const { app, db } = makeApp();
    const admin = await adminAgent(app);

    const bad = await admin.post('/api/admin/users').send({ ...NEW_KID, username: 'X', password: 'a' });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: 'invalid_user', fields: { username: 'invalid', password: 'too_short' }, min: 4 });
    expect((await admin.post('/api/admin/users').send({ ...NEW_KID, course: { track: 'de' } })).body)
      .toEqual({ error: 'invalid_user', fields: { course: 'course_not_offered' } });
    expect(idOf(db, 'test_kid')).toBeUndefined(); // the account and its course are created together or not at all

    const created = await admin.post('/api/admin/users').send(NEW_KID);
    expect(created.status).toBe(201);
    expect(created.body.user).toMatchObject({
      username: 'test_kid', displayName: 'Test Kid', role: 'child', activeTrack: 'fr', uiLang: 'en', nativeLang: 'nl', audience: 'child', canSelfEnroll: true,
      avatar: 'owl', avatarBg: 'mint', showOnLogin: true, canSelfReset: false, mustChangePassword: false,
    });
    const id = created.body.user.id;
    expect((await admin.post('/api/admin/users').send(NEW_KID)).body.fields).toEqual({ username: 'taken' });
    expect((await request(app).get('/api/users/profiles')).body.profiles.map((p) => p.username)).toEqual(['kid2', 'kid1', 'test_kid']); // by display name: Alex, Sam, Test

    const kid = await login(app, 'test_kid', 'kid1');
    expect((await kid.post('/api/progress/lesson/fr-a1-1-u01-l01/complete').send({ firstTryCorrect: FR1, total: FR1 })).status).toBe(200);

    // Another course: French progress stays and comes back when switching back.
    const edited = await admin.patch(`/api/admin/users/${id}`).send({ displayName: 'Testje', showOnLogin: false, canSelfReset: true });
    expect(edited.status).toBe(200);
    expect(edited.body.user).toMatchObject({ displayName: 'Testje', showOnLogin: false, canSelfReset: true, username: 'test_kid' });
    expect((await admin.put(`/api/admin/users/${id}/courses/en`).send({ active: true })).body).toMatchObject({ active: 'en' });
    expect((await admin.patch(`/api/admin/users/${id}`).send({ username: 'other' })).body.fields).toEqual({ username: 'immutable' });
    expect((await request(app).get('/api/users/profiles')).body.profiles.map((p) => p.username)).toEqual(['kid2', 'kid1']);
    expect((await admin.get(`/api/admin/users/${id}/progress`)).body.packs.map((p) => p.id)).toEqual(['en-pre-a1', 'en-a1']);
    await admin.put(`/api/admin/users/${id}/courses/fr`).send({ active: true });
    const back = (await admin.get(`/api/admin/users/${id}/progress`)).body;
    expect((await admin.get(`/api/admin/users/${id}/progress?track=en`)).body.track).toBe('en');
    expect(back.packs[0].units[0].lessons[0]).toMatchObject({ id: 'fr-a1-1-u01-l01', done: true });
    expect(back.stats.xp).toBe(FR1 * 10 + 20);

    // A password in an edit is an admin-set password: the user must change it.
    expect((await admin.patch(`/api/admin/users/${id}`).send({ password: 'ab' })).body).toMatchObject({ fields: { password: 'too_short' }, min: 4 });
    expect((await admin.patch(`/api/admin/users/${id}`).send({ password: 'nieuw' })).body.user.mustChangePassword).toBe(true);

    expect((await admin.delete(`/api/admin/users/${id}`).send({ confirmUsername: 'wrong' })).body).toEqual({ error: 'confirm_mismatch' });
    expect((await admin.delete(`/api/admin/users/${id}`).send({ confirmUsername: 'test_kid' })).status).toBe(204);
    expect((await admin.get(`/api/admin/users/${id}`)).status).toBe(404);
    expect((await admin.get(`/api/admin/users/${id}/progress`)).status).toBe(404);
    expect((await admin.delete(`/api/admin/users/${id}`).send({ confirmUsername: 'test_kid' })).status).toBe(404);
    // The deleted user's session is gone too.
    expect((await kid.get('/api/auth/me')).status).toBe(401);
    expect(idOf(db, 'test_kid')).toBeUndefined();
  });

  it('refuses to delete or demote the last admin, and refuses self-deletion', async () => {
    const { app, db } = makeApp();
    const admin = await adminAgent(app);
    const self = idOf(db, 'admin');
    expect((await admin.delete(`/api/admin/users/${self}`).send({ confirmUsername: 'admin' })).body).toEqual({ error: 'last_admin' });
    expect((await admin.patch(`/api/admin/users/${self}`).send({ role: 'child' })).body).toEqual({ error: 'last_admin' });

    const second = await admin.post('/api/admin/users').send({ username: 'ouder', displayName: 'Ouder', role: 'admin', avatar: 'bear', avatarBg: 'sand', password: 'lang-genoeg' });
    expect(second.body.user).toMatchObject({ role: 'admin', activeTrack: null, audience: 'adult', mustChangePassword: true, showOnLogin: false });
    expect((await admin.delete(`/api/admin/users/${self}`).send({ confirmUsername: 'admin' })).body).toEqual({ error: 'cannot_delete_self' });
    expect((await admin.patch(`/api/admin/users/${self}`).send({ role: 'child' })).body).toEqual({ error: 'cannot_demote_self' });
    expect((await admin.delete(`/api/admin/users/${second.body.user.id}`).send({ confirmUsername: 'ouder' })).status).toBe(204);
  });

  it('children cannot use any user-management route', async () => {
    const { app } = makeApp();
    const kid1 = await login(app, 'kid1');
    expect((await kid1.post('/api/admin/users').send(NEW_KID)).status).toBe(403);
    expect((await kid1.patch('/api/admin/users/2').send({ displayName: 'x' })).status).toBe(403);
    expect((await kid1.put('/api/admin/users/2/courses/en').send({ active: true })).status).toBe(403);
    expect((await kid1.delete('/api/admin/users/2').send({ confirmUsername: 'kid2' })).status).toBe(403);
  });

  it('deleting a user leaves no orphan rows in any table', async () => {
    const { app, db } = makeApp();
    const admin = await adminAgent(app);
    const id = (await admin.post('/api/admin/users').send(NEW_KID)).body.user.id;
    const kid = await login(app, 'test_kid', 'kid1');
    for (const ex of ['fr-a1-1-u01-l01-e01', 'fr-a1-1-u01-l01-e02']) {
      await kid.post('/api/progress/attempt').send({ lessonId: 'fr-a1-1-u01-l01', exerciseId: ex, answer: 'x' });
    }
    await kid.post('/api/progress/lesson/fr-a1-1-u01-l01/complete').send({ firstTryCorrect: FR1 - 2, total: FR1 });
    // A completed lesson earns a badge and reaches the default daily goal; practice then starts a session.
    expect((await kid.post('/api/practice/start').send({ mode: 'due' })).status).toBe(201);
    // A 🚩 report, closed as correct with a thank-you message (content_reports, child_messages).
    expect((await kid.post('/api/reports').send({ exerciseId: 'fr-a1-1-u01-l01-e01', reason: 'native' })).status).toBe(201);
    expect((await admin.post('/api/admin/inbox/fr-a1-1-u01-l01-e01').send({ action: 'correct', message: true })).body).toEqual({ closed: 1, messages: 1 });
    // a Listen check verdict (listen_checks, same: any account's rows go with it)
    db.prepare("INSERT INTO listen_checks (user_id, file, track, speed, text, kind, verdict, heard_at) VALUES (?, 'en/x.mp3', 'en', 'normal', 'x', 'word', 'ok', 'x')").run(id);
    // a Before-release vote (audio_sample_votes)
    db.prepare("INSERT INTO audio_sample_votes (sample, row_id, user_id, vote, voted_at) VALUES ('s', 'r1', ?, 'new', 'x')").run(id);

    // Every table with a user_id column, found from the schema (so a future table can't be forgotten).
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all()
      .filter((t) => db.prepare(`PRAGMA table_info(${t})`).all().some((c) => c.name === 'user_id'));
    expect(tables.sort()).toEqual(USER_TABLES.map(([t]) => t).sort());
    const rows = (t) => db.prepare(`SELECT COUNT(*) FROM ${t} WHERE user_id = ?`).pluck().get(id);
    const sessions = () => db.prepare("SELECT COUNT(*) FROM sessions WHERE json_extract(sess, '$.userId') = ?").pluck().get(id);
    for (const t of tables) expect(rows(t), t).toBeGreaterThan(0);
    expect(sessions()).toBe(1);

    expect((await admin.delete(`/api/admin/users/${id}`).send({ confirmUsername: 'test_kid' })).status).toBe(204);
    for (const t of tables) {
      expect(rows(t), t).toBe(0);
      expect(db.prepare(`SELECT COUNT(*) FROM ${t} WHERE user_id NOT IN (SELECT id FROM users)`).pluck().get(), `${t} orphans`).toBe(0);
    }
    expect(sessions()).toBe(0);
    expect(db.prepare("SELECT COUNT(*) FROM sessions WHERE json_extract(sess, '$.userId') NOT IN (SELECT id FROM users)").pluck().get()).toBe(0);
  });

  it('deleteUser works without a sessions table (scripts, tests)', () => {
    const db = openMemoryDb();
    seedUsers(db);
    deleteUser(db, idOf(db, 'kid2'));
    expect(idOf(db, 'kid2')).toBeUndefined();
  });
});

describe('start level per course (user_courses.start_pack)', () => {
  it('admin sets a learner\'s start level per course; it reaches the learner with that course', async () => {
    const { app } = makeApp();
    const admin = await adminAgent(app);
    const base = { username: 'mover', displayName: 'Mover', role: 'child', uiLang: 'nl', avatar: 'fox', avatarBg: 'sky', password: 'kind' };
    expect((await admin.post('/api/admin/users').send({ ...base, course: { track: 'en', startPack: 'fr-a1-1' } })).body)
      .toEqual({ error: 'invalid_user', fields: { course: 'invalid_start_pack' } });
    expect((await admin.post('/api/admin/users').send({ ...base, course: { track: 'en', startPack: 'en-b9' } })).body.fields).toEqual({ course: 'invalid_start_pack' });
    const created = await admin.post('/api/admin/users').send({ ...base, course: { track: 'en', startPack: 'en-a1' } });
    expect(created.status).toBe(201);
    const id = created.body.user.id;
    const kid = await login(app, 'mover', 'kind');
    const startOf = async (track) => (await kid.get('/api/content/tracks')).body.tracks.find((t) => t.id === track)?.startPack;
    expect(await startOf('en')).toBe('en-a1');
    // French with its own start level; English keeps its own.
    expect((await admin.put(`/api/admin/users/${id}/courses/fr`).send({ startPack: 'fr-a1' })).body.courses.map((c) => [c.track, c.startPack]))
      .toEqual([['en', 'en-a1'], ['fr', 'fr-a1']]);
    expect((await admin.put(`/api/admin/users/${id}/courses/en`).send({ startPack: null })).status).toBe(200);
    expect(await startOf('en')).toBeNull();
    expect(await startOf('fr')).toBe('fr-a1');
    expect((await admin.put(`/api/admin/users/${id}/courses/en`).send({ startPack: 'fr-a2' })).body).toEqual({ error: 'invalid_start_pack' });
  });
});

describe('preferences (PATCH /api/auth/me)', () => {
  it('sets the interface language and avatar of the logged-in user only', async () => {
    const { app } = makeApp();
    const kid1 = await login(app, 'kid1');
    expect((await kid1.get('/api/auth/me')).body.user).toMatchObject({ uiLang: 'nl', avatar: 'cat', avatarBg: 'sky', nativeLang: 'nl' });
    expect((await kid1.patch('/api/auth/me').send({ uiLang: 'en' })).body.user.uiLang).toBe('en');
    expect((await kid1.patch('/api/auth/me').send({ avatar: 'panda', avatarBg: 'rose' })).body.user).toMatchObject({ avatar: 'panda', avatarBg: 'rose', uiLang: 'en' });
    expect((await kid1.patch('/api/auth/me').send({ uiLang: 'fr' })).body).toEqual({ error: 'invalid_preferences', fields: { uiLang: 'invalid' } });
    expect((await kid1.patch('/api/auth/me').send({ role: 'admin' })).body).toEqual({ error: 'invalid_preferences', fields: { body: 'empty' } });
    expect((await kid1.get('/api/auth/me')).body.user.role).toBe('child');
    expect((await request(app).get('/api/users/profiles')).body.profiles.find((p) => p.username === 'kid1')).toMatchObject({ avatar: 'panda', avatarBg: 'rose' });
  });
});

describe('progress reset', () => {
  let db;
  let kid1;
  let kid2;
  const EN1 = 'en-pre-a1-u01-l01';
  const EN2 = 'en-pre-a1-u01-l02';
  const A1 = 'en-a1-u01-l01';
  const FR = 'fr-a1-1-u01-l01';
  const now = new Date('2026-09-28T10:00:00Z');

  const count = (table, where, ...args) => db.prepare(`SELECT COUNT(*) FROM ${table} WHERE ${where}`).pluck().get(...args);
  const stats = (id) => db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(id);

  beforeEach(() => {
    db = openMemoryDb();
    seedUsers(db);
    kid1 = idOf(db, 'kid1');
    kid2 = idOf(db, 'kid2');
    // Sam: two lessons of Pre-A1, one of A1, and French from before a track change. Alex: one French lesson.
    const play = (userId, lessonId, itemIds, ftc) => {
      recordAttempt(db, { userId, lessonId, exerciseId: `${lessonId}-e01`, itemIds, correct: true, givenAnswer: 'x', now });
      completeLesson(db, { userId, lessonId, firstTryCorrect: ftc, total: 12, now });
    };
    play(kid1, EN1, ['en.cat', 'en-pre-a1-u01-s01'], 12); // 140 XP
    play(kid1, EN2, ['en.dog'], 10); // 100 + 10 + 20 = 130
    play(kid1, A1, ['en.m-cat'], 12); // 140
    play(kid1, FR, ['fr.chat'], 12); // 140
    play(kid2, FR, ['fr.chat'], 11); // 135
  });

  it('one level: that level\'s lessons, attempts and item strength go; XP is recomputed; the streak and everything else stay', () => {
    const before = stats(kid1);
    expect(before).toMatchObject({ xp: 550, streak_current: 1, streak_best: 1 });
    const result = resetProgress(db, content, kid1, { packId: 'en-pre-a1' });
    expect(result).toMatchObject({ packIds: ['en-pre-a1'], xpBefore: 550, xpAfter: 280, deleted: { lessonProgress: 2, attempts: 2, completions: 2, itemStrength: 3 } });
    expect(stats(kid1)).toEqual({ ...before, xp: 280 });
    expect(count('lesson_progress', 'user_id = ? AND lesson_id LIKE ?', kid1, 'en-pre-a1-%')).toBe(0);
    expect(count('item_strength', "user_id = ? AND item_id IN ('en.cat', 'en.dog', 'en-pre-a1-u01-s01')", kid1)).toBe(0);
    // Other level, other track, other user: untouched.
    expect(count('lesson_progress', 'user_id = ? AND lesson_id IN (?, ?)', kid1, A1, FR)).toBe(2);
    expect(count('item_strength', "user_id = ? AND item_id IN ('en.m-cat', 'fr.chat')", kid1)).toBe(2);
    expect(count('attempts', 'user_id = ?', kid1)).toBe(2);
    expect(stats(kid2).xp).toBe(135);
    expect(count('attempts', 'user_id = ?', kid2)).toBe(1);
  });

  it('badges and goal days are never touched; the reports and one-time messages of the scope go, others stay', () => {
    const t = now.toISOString();
    db.prepare("INSERT INTO user_badges (user_id, badge_id, earned_at) VALUES (?, 'first-lesson', ?), (?, 'level-en-pre-a1', ?)").run(kid1, t, kid1, t);
    db.prepare("INSERT INTO daily_goal_days (user_id, day, goal, xp, reached_at) VALUES (?, '2026-10-01', 20, 140, ?)").run(kid1, t);
    const exOf = (lessonId) => content.lessons.get(lessonId).lesson.exercises[0].id;
    const report = (lessonId) => db.prepare(`INSERT INTO content_reports (user_id, exercise_id, lesson_id, pack_id, unit_id, track, reason, snapshot,
      ui_lang, created_at, updated_at) VALUES (?, ?, ?, 'p', 'u', 'en', 'other', '{}', 'nl', ?, ?)`).run(kid1, exOf(lessonId), lessonId, t, t).lastInsertRowid;
    const inScope = report(EN1);
    const outScope = report(A1);
    db.prepare("INSERT INTO child_messages (user_id, kind, text, report_id, exercise_id, created_at) VALUES (?, 'checked', 'x', ?, ?, ?), (?, 'checked', 'y', ?, ?, ?)")
      .run(kid1, inScope, exOf(EN1), t, kid1, outScope, exOf(A1), t);
    const result = resetProgress(db, content, kid1, { packId: 'en-pre-a1' });
    expect(result.deleted).toMatchObject({ reports: 1, messages: 1 });
    expect(db.prepare('SELECT badge_id FROM user_badges WHERE user_id = ? ORDER BY badge_id').pluck().all(kid1)).toEqual(['first-lesson', 'level-en-pre-a1']);
    expect(count('daily_goal_days', 'user_id = ?', kid1)).toBe(1);
    expect(db.prepare('SELECT id FROM content_reports WHERE user_id = ?').pluck().all(kid1)).toEqual([outScope]);
    expect(db.prepare('SELECT text FROM child_messages WHERE user_id = ?').pluck().all(kid1)).toEqual(['y']);
  });

  it('whole track: every level of that track goes; the other track (kept from before a track change) stays', () => {
    const before = stats(kid1);
    const result = resetProgress(db, content, kid1, { track: 'en' });
    expect(result).toMatchObject({ packIds: ['en-pre-a1', 'en-a1'], xpAfter: 140, deleted: { lessonProgress: 3, attempts: 3, completions: 3 } });
    expect(stats(kid1)).toEqual({ ...before, xp: 140 });
    expect(db.prepare('SELECT lesson_id FROM lesson_progress WHERE user_id = ?').pluck().all(kid1)).toEqual([FR]);
    expect(db.prepare('SELECT item_id FROM item_strength WHERE user_id = ?').pluck().all(kid1)).toEqual(['fr.chat']);
    expect(stats(kid2).xp).toBe(135);
  });

  it('XP earned before per-completion rows existed (legacy total) survives a scoped reset', () => {
    db.prepare('INSERT INTO lesson_completions (user_id, lesson_id, score, xp, completed_at) VALUES (?, NULL, NULL, 75, ?)').run(kid1, now.toISOString());
    db.prepare('UPDATE user_stats SET xp = xp + 75 WHERE user_id = ?').run(kid1);
    expect(resetProgress(db, content, kid1, { track: 'en' }).xpAfter).toBe(140 + 75);
  });

  it('an unknown scope is an error', () => {
    expect(() => resetProgress(db, content, kid1, { packId: 'en-z9' })).toThrow(/unknown reset scope/);
    expect(() => resetProgress(db, content, kid1, {})).toThrow(/unknown reset scope/);
  });
});

describe('progress reset API', () => {
  it('admin: level or track scope, 400 for a bad scope; logged', async () => {
    const { app, db } = makeApp();
    const admin = await adminAgent(app);
    const kid1 = await login(app, 'kid1');
    await kid1.post('/api/progress/lesson/en-pre-a1-u01-l01/complete').send({ firstTryCorrect: T1, total: T1 });
    await kid1.post('/api/progress/lesson/en-a1-u01-l01/complete').send({ firstTryCorrect: T1, total: T1 });
    const id = idOf(db, 'kid1');
    const url = `/api/admin/users/${id}/progress/reset`;
    expect((await admin.post(url).send({ scope: 'pack', packId: 'nope' })).body).toEqual({ error: 'invalid_scope' });
    const level = await admin.post(url).send({ scope: 'pack', packId: 'en-a1' });
    expect(level.body).toMatchObject({ packIds: ['en-a1'], xpBefore: 2 * XP_L1, xpAfter: XP_L1, stats: { xp: XP_L1, streak: 1 } });
    const track = await admin.post(url).send({ scope: 'track' });
    expect(track.body).toMatchObject({ packIds: ['en-pre-a1', 'en-a1'], xpAfter: 0, stats: { xp: 0, streak: 1 } });
  });

  it('self-service: only with permission, for the learner\'s own courses, with the password and the confirmation word of the UI language', async () => {
    const { app, db } = makeApp();
    const admin = await adminAgent(app);
    const kid1 = await login(app, 'kid1');
    await kid1.post('/api/progress/lesson/en-pre-a1-u01-l01/complete').send({ firstTryCorrect: T1, total: T1 });
    const body = { scope: 'pack', packId: 'en-pre-a1', password: 'kid1', confirm: 'WISSEN' };

    expect((await kid1.post('/api/progress/reset').send(body)).body).toEqual({ error: 'reset_not_allowed' });
    await admin.patch(`/api/admin/users/${idOf(db, 'kid1')}`).send({ canSelfReset: true });
    expect((await kid1.post('/api/progress/reset').send({ ...body, packId: 'fr-a1-1' })).body).toEqual({ error: 'invalid_scope' });
    expect((await kid1.post('/api/progress/reset').send({ ...body, password: 'nee' })).body).toEqual({ error: 'wrong_password' });
    expect((await kid1.post('/api/progress/reset').send({ ...body, confirm: 'RESET' })).body).toEqual({ error: 'confirm_mismatch', word: 'WISSEN' });
    const ok = await kid1.post('/api/progress/reset').send({ ...body, confirm: ' wissen ' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ xpBefore: XP_L1, xpAfter: 0, stats: { xp: 0, streak: 1 } });

    // In English the word is RESET.
    await kid1.patch('/api/auth/me').send({ uiLang: 'en' });
    expect((await kid1.post('/api/progress/reset').send({ ...body, confirm: 'RESET' })).status).toBe(200);

    // Admins have no courses, so nothing to reset; a course the learner is not in is not theirs to reset.
    expect((await admin.post('/api/progress/reset').send({ scope: 'track', password: 'beheer-test-1', confirm: 'RESET' })).body).toEqual({ error: 'invalid_scope' });
    expect((await kid1.post('/api/progress/reset').send({ scope: 'track', track: 'fr', password: 'kid1', confirm: 'RESET' })).body).toEqual({ error: 'invalid_scope' });
  });
});

describe('migration 003 on a database of the shape before it', () => {
  it('adds the columns, maps the old avatars, sets the admin to English and keeps XP as a legacy completion', () => {
    const MIGRATIONS = path.resolve(here, '../src/db/migrations');
    const old = path.join(tmp, 'migrations-001-002');
    fs.mkdirSync(old, { recursive: true });
    for (const f of fs.readdirSync(MIGRATIONS).filter((f) => /^00[12]_/.test(f))) fs.copyFileSync(path.join(MIGRATIONS, f), path.join(old, f));

    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db, old);
    const insert = db.prepare('INSERT INTO users (username, password_hash, role, display_name, track, avatar) VALUES (?, ?, ?, ?, ?, ?)');
    insert.run('kid1', 'h', 'child', 'Sam', 'en', 'kid1');
    insert.run('kid2', 'h', 'child', 'Alex', 'fr', 'kid2');
    insert.run('admin', 'h', 'admin', 'Beheer', null, null);
    db.prepare('INSERT INTO user_stats (user_id, xp, streak_current, streak_best) VALUES (1, 50, 2, 3), (2, 0, 0, 0), (3, 0, 0, 0)').run();

    expect(runMigrations(db)).toEqual(['003_users_settings.sql', '004_start_pack.sql', '005_practice_gamification.sql', '006_corrections_reports.sql',
      '007_courses.sql', '008_drop_user_track.sql', '009_attempt_run.sql', '010_autoplay.sql', '011_problem_acks.sql', '012_completion_run.sql', '013_family_board.sql', '014_audio_lab.sql', '015_lab_both_bad.sql', '016_listen_checks.sql', '017_clip_rerecords.sql', '018_drop_lab_votes.sql', '019_listen_compare.sql', '020_drop_listen_compare.sql', '021_theme.sql', '022_audio_sample_votes.sql']);
    expect(runMigrations(db)).toEqual([]); // recorded: never applied twice
    expect(db.prepare('SELECT username, ui_lang, native_lang, avatar, avatar_bg, show_on_login, can_self_reset FROM users ORDER BY id').all()).toEqual([
      { username: 'kid1', ui_lang: 'nl', native_lang: 'nl', avatar: 'cat', avatar_bg: 'sky', show_on_login: 1, can_self_reset: 0 },
      { username: 'kid2', ui_lang: 'nl', native_lang: 'nl', avatar: 'rabbit', avatar_bg: 'peach', show_on_login: 1, can_self_reset: 0 },
      { username: 'admin', ui_lang: 'en', native_lang: 'nl', avatar: 'owl', avatar_bg: 'lilac', show_on_login: 0, can_self_reset: 0 },
    ]);
    expect(db.prepare('SELECT user_id, lesson_id, xp FROM lesson_completions').all()).toEqual([{ user_id: 1, lesson_id: null, xp: 50 }]);
    expect(db.prepare('SELECT xp, streak_current FROM user_stats WHERE user_id = 1').get()).toEqual({ xp: 50, streak_current: 2 });
    expect(() => db.prepare("UPDATE users SET ui_lang = 'fr' WHERE id = 1").run()).toThrow(/CHECK/);
    // native_lang has no CHECK since 008: the list lives in server/src/lib/langs.js (API validation, integrity check).
    expect(db.prepare('SELECT track FROM user_courses ORDER BY user_id').pluck().all()).toEqual(['en', 'fr']);
  });
});
