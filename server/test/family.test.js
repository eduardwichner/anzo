// The family board — this week only (Monday–Sunday, Amsterdam), ties, hidden accounts, the family goal,
// last week's crown, and its routes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openMemoryDb } from '../src/db/index.js';
import { loadContent } from '../src/content/loader.js';
import { loadAudio } from '../src/audio/manifest.js';
import { addDays, FAMILY_GOAL, familyBoard, familyGoal, setFamilyGoal, weekOf } from '../src/lib/board.js';
import { createUser, deleteUser, seedUsers, validateUserInput } from '../src/lib/users.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(here, '../../content');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-family-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const id = (db, username) => db.prepare('SELECT id FROM users WHERE username = ?').pluck().get(username);
const lesson = (db, userId, at, xp, lessonId = 'en-pre-a1-u01-l01') => db.prepare(
  'INSERT INTO lesson_completions (user_id, lesson_id, score, xp, completed_at) VALUES (?, ?, 100, ?, ?)',
).run(userId, lessonId, xp, at);
const practice = (db, userId, at, xp) => db.prepare(
  `INSERT INTO practice_sessions (user_id, track, mode, exercise_ids, exercises, started_at, finished_at, first_try_correct, xp)
   VALUES (?, 'en', 'due', '[]', 6, ?, ?, 6, ?)`,
).run(userId, at, at, xp);
const board = (db, now, viewer = 'kid1') => familyBoard(db, { viewerId: id(db, viewer), now: new Date(now) });
const freshDb = () => {
  const db = openMemoryDb();
  seedUsers(db);
  return db;
};

describe('weeks: Monday–Sunday on Amsterdam calendar days', () => {
  it('starts on Monday, also when today is Monday or Sunday, and across a month and a year', () => {
    expect(weekOf('2026-10-13')).toEqual({ start: '2026-10-12', end: '2026-10-18', days: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'] });
    expect(weekOf('2026-10-12').start).toBe('2026-10-12');
    expect(weekOf('2026-10-18').start).toBe('2026-10-12');
    expect(weekOf('2026-11-01')).toMatchObject({ start: '2026-10-26', end: '2026-11-01' });
    expect(weekOf('2027-01-01')).toMatchObject({ start: '2026-12-28', end: '2027-01-03' });
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26'); // the night the clocks go back
    expect(addDays('2027-03-28', -1)).toBe('2027-03-27');
  });

  it('resets at midnight Amsterdam on Sunday night (summer time: UTC+2)', () => {
    const db = freshDb();
    const kid1 = id(db, 'kid1');
    lesson(db, kid1, '2026-10-18T21:30:00Z', 30); // Sunday 23:30 CEST: last week of Monday 19 Oct
    lesson(db, kid1, '2026-10-18T22:30:00Z', 20); // Monday 00:30 CEST: the new week
    const b = board(db, '2026-10-19T10:00:00Z');
    expect(b.week).toMatchObject({ start: '2026-10-19', end: '2026-10-25', today: '2026-10-19' });
    const me = b.members.find((m) => m.me);
    expect(me.xp).toBe(20);
    expect(me.days).toEqual([true, false, false, false, false, false, false]);
  });

  it('the week with the clock change back (25 Oct 2026, 03:00 CEST → 02:00 CET) keeps its 7 days', () => {
    const db = freshDb();
    const kid1 = id(db, 'kid1');
    lesson(db, kid1, '2026-10-24T23:30:00Z', 10); // Sunday 25 Oct 01:30 CEST
    lesson(db, kid1, '2026-10-25T22:30:00Z', 15); // Sunday 25 Oct 23:30 CET: still this week
    lesson(db, kid1, '2026-10-25T23:30:00Z', 40); // Monday 26 Oct 00:30 CET: next week
    const b = board(db, '2026-10-25T12:00:00Z');
    expect(b.week.days).toHaveLength(7);
    expect(b.week.end).toBe('2026-10-25');
    const me = b.members.find((m) => m.me);
    expect(me.xp).toBe(25);
    expect(me.days[6]).toBe(true);
    expect(board(db, '2026-10-26T08:00:00Z').members.find((m) => m.me).xp).toBe(40);
  });

  it('the week with the clock change forward (28 Mar 2027, 02:00 CET → 03:00 CEST)', () => {
    const db = freshDb();
    const kid1 = id(db, 'kid1');
    lesson(db, kid1, '2027-03-28T21:30:00Z', 12); // Sunday 23:30 CEST: this week
    lesson(db, kid1, '2027-03-28T22:30:00Z', 8); // Monday 29 Mar 00:30 CEST: next week
    expect(board(db, '2027-03-28T20:00:00Z').members.find((m) => m.me).xp).toBe(12);
    expect(board(db, '2027-03-29T06:00:00Z').members.find((m) => m.me).xp).toBe(8);
  });

  it('counts lessons and practice; a finished session marks the day practised; older weeks never count (no all-time ranking)', () => {
    const db = freshDb();
    const kid2 = id(db, 'kid2');
    lesson(db, kid2, '2026-10-01T10:00:00Z', 500); // two weeks ago
    lesson(db, kid2, '2026-10-13T08:00:00Z', 25);
    practice(db, kid2, '2026-10-14T16:00:00Z', 40);
    const me = board(db, '2026-10-15T09:00:00Z', 'kid2').members.find((m) => m.me);
    expect(me).toMatchObject({ xp: 65, daysPractised: 2 });
    expect(me.days).toEqual([false, true, true, false, false, false, false]);
  });
});

describe('ranking, ties, hidden accounts', () => {
  it('sorts by this week\'s XP; equal XP shares a rank and is listed alphabetically by name', () => {
    const db = freshDb();
    const [kid1, kid2, admin] = ['kid1', 'kid2', 'admin'].map((u) => id(db, u));
    lesson(db, kid1, '2026-10-12T08:00:00Z', 15);
    lesson(db, kid1, '2026-10-13T08:00:00Z', 15); // 30 XP on two days: more days practised no longer comes first
    lesson(db, kid2, '2026-10-13T09:00:00Z', 30);
    lesson(db, admin, '2026-10-13T10:00:00Z', 10);
    const b = board(db, '2026-10-14T09:00:00Z');
    expect(b.members.map((m) => [m.displayName, m.xp, m.rank])).toEqual([['Alex', 30, 1], ['Sam', 30, 1], ['Beheer', 10, 3]]);
    expect(b.members.find((m) => m.displayName === 'Sam').me).toBe(true);
  });

  it('leaves out an account that switched itself off or that the admin hid; the viewer is told which', () => {
    const db = freshDb();
    const [kid1, kid2] = ['kid1', 'kid2'].map((u) => id(db, u));
    lesson(db, kid1, '2026-10-13T08:00:00Z', 30);
    lesson(db, kid2, '2026-10-13T08:00:00Z', 50);
    db.prepare('UPDATE users SET show_on_board = 0 WHERE id = ?').run(kid2);
    let b = board(db, '2026-10-14T09:00:00Z', 'kid2');
    expect(b.members.map((m) => m.displayName)).toEqual(['Sam', 'Beheer']);
    expect(b.viewer).toEqual({ shown: false, switchedOff: true, hiddenByAdmin: false });
    expect(b.goal.xp).toBe(30); // the family goal counts the board's members only
    db.prepare('UPDATE users SET show_on_board = 1, board_hidden = 1 WHERE id = ?').run(kid2);
    b = board(db, '2026-10-14T09:00:00Z', 'kid2');
    expect(b.members.some((m) => m.displayName === 'Alex')).toBe(false);
    expect(b.viewer).toEqual({ shown: false, switchedOff: false, hiddenByAdmin: true });
  });
});

describe('the family goal', () => {
  it('defaults to 500; the admin sets 50–10,000; the bar is the members\' XP this week', () => {
    const db = freshDb();
    expect(familyGoal(db)).toBe(FAMILY_GOAL.default);
    expect(setFamilyGoal(db, 49, 'admin')).toEqual({ error: 'invalid_goal' });
    expect(setFamilyGoal(db, 10001, 'admin')).toEqual({ error: 'invalid_goal' });
    expect(setFamilyGoal(db, '300', 'admin')).toEqual({ error: 'invalid_goal' });
    expect(setFamilyGoal(db, 60, 'admin')).toEqual({ goal: 60 });
    lesson(db, id(db, 'kid1'), '2026-10-13T08:00:00Z', 35);
    lesson(db, id(db, 'kid2'), '2026-10-13T08:00:00Z', 25);
    expect(board(db, '2026-10-14T09:00:00Z').goal).toEqual({ target: 60, xp: 60, reached: true });
    expect(db.prepare("SELECT updated_by FROM app_settings WHERE key = 'familyGoal'").pluck().get()).toBe('admin');
  });
});

describe('the crown: last week\'s top learner, for the following week', () => {
  it('goes to last week\'s highest XP, to each of a tie, never for 0 XP, and only to someone on the board', () => {
    const db = freshDb();
    const [kid1, kid2, admin] = ['kid1', 'kid2', 'admin'].map((u) => id(db, u));
    const now = '2026-10-14T09:00:00Z';
    expect(board(db, now).members.some((m) => m.crown)).toBe(false); // nobody played last week
    lesson(db, kid1, '2026-10-06T08:00:00Z', 40); // last week (5–11 Oct)
    lesson(db, kid2, '2026-10-08T08:00:00Z', 25);
    lesson(db, kid2, '2026-10-13T08:00:00Z', 90); // this week: Alex leads, Sam keeps last week's crown
    let b = board(db, now);
    expect(b.members.filter((m) => m.crown).map((m) => m.displayName)).toEqual(['Sam']);
    expect(b.members[0]).toMatchObject({ displayName: 'Alex', crown: false });
    lesson(db, kid2, '2026-10-10T08:00:00Z', 15); // a tie last week: 40 and 40
    b = board(db, now);
    expect(b.members.filter((m) => m.crown).map((m) => m.displayName).sort()).toEqual(['Alex', 'Sam']);
    db.prepare('UPDATE users SET board_hidden = 1 WHERE id IN (?, ?)').run(kid1, kid2);
    lesson(db, admin, '2026-10-07T08:00:00Z', 5);
    expect(board(db, now, 'admin').members.filter((m) => m.crown).map((m) => m.displayName)).toEqual(['Beheer']);
    // the next week, the crown moves on
    expect(board(db, '2026-10-20T09:00:00Z', 'admin').members.some((m) => m.crown)).toBe(false);
  });
});

describe('accounts', () => {
  it('a new account may be created hidden; the admin flag and the own switch are separate', () => {
    const db = freshDb();
    const v = validateUserInput(db, { username: 'gast', displayName: 'Gast', role: 'child', uiLang: 'nl', avatar: 'fox', avatarBg: 'sky', password: 'gast', boardHidden: true });
    expect(v.errors).toBeUndefined();
    const u = createUser(db, v.values);
    expect(u).toMatchObject({ board_hidden: 1, show_on_board: 1 });
    expect(validateUserInput(db, { boardHidden: 'yes' }, u).errors?.boardHidden).toBe('invalid');
    db.prepare("INSERT INTO listen_checks (user_id, file, track, speed, text, kind, verdict, heard_at) VALUES (?, 'en/x.mp3', 'en', 'normal', 'x', 'word', 'ok', 'x')").run(u.id);
    deleteUser(db, u.id);
    expect(db.prepare('SELECT COUNT(*) FROM listen_checks').pluck().get()).toBe(0);
  });
});

describe('routes', () => {
  const content = loadContent({ contentDir: CONTENT_DIR });
  const makeApp = () => {
    const db = freshDb();
    const config = { version: 'test', sessionSecret: 'x'.repeat(48), dataDir: tmp, audioDir: path.join(tmp, 'no-audio'), contentDir: CONTENT_DIR,
      clientDist: path.join(tmp, 'no-dist'), loginRateLimit: 50 };
    const audio = loadAudio({ audioDir: config.audioDir, contentDir: CONTENT_DIR, content });
    return { db, app: createApp({ db, content, audio, config, logger: pino({ level: 'silent' }) }) };
  };
  const login = async (app, username, password = username) => {
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ username, password })).status).toBe(200);
    return agent;
  };

  it('GET /api/family needs a login; a child sees the board and switches itself off and on', async () => {
    const { app } = makeApp();
    expect((await request(app).get('/api/family')).status).toBe(401);
    const kid1 = await login(app, 'kid1');
    const b = (await kid1.get('/api/family')).body;
    expect(b.members.map((m) => m.displayName).sort()).toEqual(['Alex', 'Beheer', 'Sam']);
    expect(b.members[0]).not.toHaveProperty('username');
    expect(b.goal).toEqual({ target: 500, xp: 0, reached: false });
    expect((await kid1.patch('/api/auth/me').send({ showOnBoard: 'no' })).status).toBe(400);
    expect((await kid1.patch('/api/auth/me').send({ showOnBoard: false })).body.user.showOnBoard).toBe(false);
    expect((await kid1.get('/api/family')).body.viewer).toEqual({ shown: false, switchedOff: true, hiddenByAdmin: false });
    expect((await kid1.patch('/api/auth/me').send({ showOnBoard: true })).body.user.showOnBoard).toBe(true);
    expect((await kid1.put('/api/admin/family').send({ goal: 300 })).status).toBe(403);
  });

  it('the admin sets the goal (400 out of range) and hides an account in Admin → Users', async () => {
    const { app, db } = makeApp();
    const admin = await login(app, 'admin', 'admin');
    expect((await admin.post('/api/auth/password').send({ current: 'admin', next: 'beheer-test-1' })).status).toBe(204);
    expect((await admin.put('/api/admin/family').send({ goal: 20 })).body).toEqual({ error: 'invalid_goal' });
    const res = await admin.put('/api/admin/family').send({ goal: 750 });
    expect(res.status).toBe(200);
    expect(res.body.goal.target).toBe(750);
    const kid1 = id(db, 'kid1');
    expect((await admin.patch(`/api/admin/users/${kid1}`).send({ boardHidden: true })).body.user.boardHidden).toBe(true);
    expect((await admin.get('/api/family')).body.members.map((m) => m.displayName).sort()).toEqual(['Alex', 'Beheer']);
  });
});
