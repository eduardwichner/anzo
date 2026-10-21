// Practice ("Oefenen"): selection rules (pure), sessions on the database, XP and streak, the API.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openMemoryDb } from '../src/db/index.js';
import { attemptItemIds, loadContent } from '../src/content/loader.js';
import { seedUsers, findUserByUsername } from '../src/lib/users.js';
import { completeLesson, recordAttempt, resetProgress } from '../src/lib/progress.js';
import { markLegacyAttempts } from '../src/lib/legacy.js';
import { checkIntegrity } from '../src/lib/integrity.js';
import { progressReport } from '../src/lib/report.js';
import {
  exerciseBand, mistakeExerciseIds, orderTargets, primaryItem, selectPractice, strengthBand, capMistakes,
} from '../src/practice/select.js';
import {
  completePractice, isFirstInSession, mistakeIds, practiceCandidates, practiceSummary, startPractice,
} from '../src/practice/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(here, '../../content');
const content = loadContent({ contentDir: CONTENT_DIR });

// ---- pure selection ------------------------------------------------------------------------------------
const ex = (id, type, items, extra = {}) => ({ id, lessonId: extra.lessonId ?? 'L1', completedAt: extra.completedAt ?? '2026-10-01T10:00:00Z', exercise: { id, type, items, ...extra.ex } });
const target = (itemId, strength) => ({ itemId, strength, due: true, nextReviewAt: '2026-10-01T00:00:00Z' });

describe('practice selection (pure)', () => {
  const now = new Date('2026-10-02T12:00:00Z');

  it('orders targets: due items and recently wrong items, weakest first, then longest overdue', () => {
    const strengths = [
      { itemId: 'a', strength: 3, nextReviewAt: '2026-09-01T00:00:00Z' },
      { itemId: 'b', strength: 1, nextReviewAt: '2026-10-01T00:00:00Z' },
      { itemId: 'c', strength: 1, nextReviewAt: '2026-09-20T00:00:00Z' },
      { itemId: 'd', strength: 0, nextReviewAt: '2026-10-09T00:00:00Z' }, // not due, but wrong recently
      { itemId: 'e', strength: 2, nextReviewAt: '2026-10-09T00:00:00Z' }, // not due, not wrong: out
    ];
    expect(orderTargets(strengths, new Set(['d']), now).map((t) => t.itemId)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('bands: strength 0–1 recognise, 2–3 assemble, 4–5 produce; exercise types fall in those bands', () => {
    expect([0, 1, 2, 3, 4, 5].map(strengthBand)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(exerciseBand({ type: 'multiple_choice' })).toBe(0);
    expect(exerciseBand({ type: 'listen_choose' })).toBe(0);
    expect(exerciseBand({ type: 'match_pairs' })).toBe(0);
    expect(exerciseBand({ type: 'fill_blank', options: ['a'] })).toBe(1);
    expect(exerciseBand({ type: 'build_sentence' })).toBe(1);
    expect(exerciseBand({ type: 'fill_blank' })).toBe(2);
    expect(exerciseBand({ type: 'listen_type' })).toBe(2);
  });

  it('picks the exercise type that fits each item\'s strength', () => {
    const candidates = ['w0', 'w2', 'w4'].flatMap((w) => [
      ex(`${w}-mc`, 'multiple_choice', [w]),
      ex(`${w}-bank`, 'fill_blank', [w], { ex: { options: ['x', 'y', w] } }),
      ex(`${w}-build`, 'build_sentence', [w]),
      ex(`${w}-typed`, 'fill_blank', [w]),
      ex(`${w}-lt`, 'listen_type', [w]),
    ]);
    const { exerciseIds } = selectPractice({ candidates, targets: [target('w0', 0), target('w2', 2), target('w4', 4)], seed: 's', minQualified: 0 });
    const typeOf = (id) => candidates.find((c) => c.id === id).exercise;
    const first = (w) => typeOf(exerciseIds.find((id) => id.startsWith(w)));
    expect(exerciseBand(first('w0'))).toBe(0);
    expect(exerciseBand(first('w2'))).toBe(1);
    expect(exerciseBand(first('w4'))).toBe(2);
    // Session order: recognise → assemble → produce
    const bands = exerciseIds.map((id) => exerciseBand(typeOf(id)));
    expect([...bands].sort()).toEqual(bands);
  });

  it('falls back to the nearest kind when an item has no exercise of its band', () => {
    const candidates = [ex('mc', 'multiple_choice', ['w']), ex('lt', 'listen_type', ['w'])];
    const { exerciseIds } = selectPractice({ candidates, targets: [target('w', 2)], maxPerPrimary: 1, minQualified: 0 });
    expect(exerciseIds).toHaveLength(1);
  });

  it('12 at most, no exercise twice, at most 2 exercises with the same primary item', () => {
    const candidates = [];
    for (let i = 0; i < 10; i++) {
      for (let k = 0; k < 4; k++) candidates.push(ex(`w${i}-mc${k}`, 'multiple_choice', [`w${i}`]));
    }
    const targets = Array.from({ length: 10 }, (_, i) => target(`w${i}`, 0));
    const { exerciseIds } = selectPractice({ candidates, targets, seed: 'x' });
    expect(exerciseIds).toHaveLength(12);
    expect(new Set(exerciseIds).size).toBe(12);
    const per = {};
    for (const id of exerciseIds) per[id.split('-')[0]] = (per[id.split('-')[0]] ?? 0) + 1;
    expect(Math.max(...Object.values(per))).toBeLessThanOrEqual(2);
  });

  it('an exercise that only mentions the item (not primary) also qualifies; the cap counts primary items', () => {
    const candidates = [ex('m1', 'match_pairs', ['a', 'w']), ex('m2', 'match_pairs', ['a', 'w']), ex('m3', 'match_pairs', ['a', 'w'])];
    const { exerciseIds } = selectPractice({ candidates, targets: [target('w', 0)], minQualified: 0 });
    expect(exerciseIds.length).toBeLessThanOrEqual(2);
    expect(primaryItem(candidates[0].exercise)).toBe('a');
  });

  it('fewer than 6 qualifying: tops up from the most recently completed lessons', () => {
    const candidates = [
      ex('old-1', 'multiple_choice', ['o1'], { lessonId: 'OLD', completedAt: '2026-09-01T00:00:00Z' }),
      ex('old-2', 'multiple_choice', ['o2'], { lessonId: 'OLD', completedAt: '2026-09-01T00:00:00Z' }),
      ...Array.from({ length: 12 }, (_, i) => ex(`new-${i}`, 'multiple_choice', [`n${i}`], { lessonId: 'NEW', completedAt: '2026-10-01T00:00:00Z' })),
    ];
    const r = selectPractice({ candidates, targets: [target('o1', 0)], seed: 't' });
    expect(r.qualified).toBe(1);
    expect(r.toppedUp).toBe(11);
    expect(r.exerciseIds).toHaveLength(12);
    expect(r.exerciseIds.filter((id) => id.startsWith('new-'))).toHaveLength(11);
    // Enough qualifying (≥ 6): no top-up, the session may be shorter than 12.
    const six = selectPractice({ candidates, targets: Array.from({ length: 6 }, (_, i) => target(`n${i}`, 0)), seed: 't' });
    expect(six).toMatchObject({ qualified: 6, toppedUp: 0 });
  });

  it('mistakes: wrong on a first try in the last 14 days and not right on a first try since (a retry does not count)', () => {
    const a = (exerciseId, correct, firstTry, createdAt) => ({ exerciseId, correct, firstTry, createdAt });
    const attempts = [
      a('e1', false, true, '2026-10-01T10:00:00Z'), a('e1', true, false, '2026-10-01T10:01:00Z'), // retried right: still a mistake
      a('e2', false, true, '2026-09-30T10:00:00Z'), a('e2', true, true, '2026-10-01T09:00:00Z'), // later first try right: cleared
      a('e3', false, true, '2026-09-10T10:00:00Z'), // too old
      a('e4', false, false, '2026-10-01T11:00:00Z'), // a wrong retry alone is no new mistake
      a('e5', true, true, '2026-09-29T10:00:00Z'), a('e5', false, true, '2026-10-02T08:00:00Z'), // right before, wrong after
    ];
    expect(mistakeExerciseIds(attempts, now)).toEqual(['e5', 'e1']);
    const exOf = (id) => ({ e1: { type: 'multiple_choice', items: ['x'] }, e5: { type: 'speak', items: ['y'] } })[id];
    expect(capMistakes(['e5', 'e1'], exOf)).toEqual(['e1']);
  });
});

// ---- on the database ----------------------------------------------------------------------------------
const LESSON = 'en-pre-a1-u01-l01';
const lessonEntry = content.lessons.get(LESSON);

function setup() {
  const db = openMemoryDb();
  seedUsers(db);
  const kid1 = findUserByUsername(db, 'kid1');
  return { db, kid1 };
}

/** Play a lesson as stored attempts + completion, with some exercises wrong on the first try. */
function playLesson(db, user, lessonId, { wrong = [], now }) {
  const entry = content.lessons.get(lessonId);
  let t = now.getTime();
  for (const e of entry.lesson.exercises) {
    const at = () => new Date((t += 1000));
    if (wrong.includes(e.id)) {
      recordAttempt(db, { userId: user.id, lessonId, exerciseId: e.id, itemIds: attemptItemIds(e), correct: false, givenAnswer: 'x', firstTry: true, now: at() });
      recordAttempt(db, { userId: user.id, lessonId, exerciseId: e.id, itemIds: attemptItemIds(e), correct: true, givenAnswer: 'y', firstTry: false, now: at() });
    } else {
      recordAttempt(db, { userId: user.id, lessonId, exerciseId: e.id, itemIds: attemptItemIds(e), correct: true, givenAnswer: 'y', firstTry: true, now: at() });
    }
  }
  return completeLesson(db, { userId: user.id, lessonId, firstTryCorrect: entry.playableCount - wrong.length, total: entry.playableCount, now: new Date(t + 1000) });
}

/** Answer every exercise of a session (right, or wrong first for the given ids). */
function playSession(db, user, session, { wrong = [], now }) {
  let t = now.getTime();
  for (const { id } of session.exercises) {
    const f = content.exercises.get(id);
    const answers = wrong.includes(id) ? [false, true] : [true];
    for (const correct of answers) {
      recordAttempt(db, {
        userId: user.id, lessonId: f.lessonId, exerciseId: id, itemIds: attemptItemIds(f.exercise), correct, givenAnswer: 'z',
        firstTry: isFirstInSession(db, session.id, id), practiceSessionId: session.id, now: new Date((t += 1000)),
      });
    }
  }
  return new Date(t + 1000);
}

describe('practice sessions (database)', () => {
  it('locked until a lesson is completed; the summary says so', () => {
    const { db, kid1 } = setup();
    expect(practiceSummary(db, content, kid1)).toEqual({ unlocked: false, due: 0, mistakes: 0 });
    expect(() => startPractice(db, content, kid1, 'due')).toThrow(/practice_locked/);
  });

  it('selection after a lesson: due items weakest first, exercises of the completed lesson only, no duplicates', () => {
    const { db, kid1 } = setup();
    const wrongEx = lessonEntry.lesson.exercises.find((e) => e.type === 'multiple_choice');
    playLesson(db, kid1, LESSON, { wrong: [wrongEx.id], now: new Date('2026-10-01T08:00:00Z') });
    // The next day: the failed exercise is a mistake; the words (seen several times, strength 3–5) are not due yet.
    expect(practiceSummary(db, content, kid1, new Date('2026-10-02T08:00:00Z'))).toMatchObject({ unlocked: true, mistakes: 1 });
    const now = new Date('2026-11-01T08:00:00Z'); // a month later: every word is due
    const summary = practiceSummary(db, content, kid1, now);
    expect(summary.due).toBe(lessonEntry.lesson.exercises.filter((e) => e.type === 'multiple_choice' && typeof e.question === 'string').length);
    const s = startPractice(db, content, kid1, 'due', now);
    expect(s.exercises.length).toBeGreaterThanOrEqual(6);
    expect(s.exercises.length).toBeLessThanOrEqual(12);
    expect(new Set(s.exercises.map((e) => e.id)).size).toBe(s.exercises.length);
    expect(s.exercises.every((e) => e.lessonId === LESSON && e.packId === 'en-pre-a1')).toBe(true);
    const row = db.prepare('SELECT * FROM practice_sessions WHERE id = ?').get(s.id);
    expect(row).toMatchObject({ user_id: kid1.id, track: 'en', mode: 'due', exercises: s.exercises.length, finished_at: null, xp: 0 });
  });

  it('completing a session: XP +5 first try / +2 after retry / +10, streak kept alive, no lesson_progress row, strength as in lessons', () => {
    const { db, kid1 } = setup();
    playLesson(db, kid1, LESSON, { now: new Date('2026-10-01T08:00:00Z') });
    const xpLesson = db.prepare('SELECT xp FROM user_stats WHERE user_id = ?').pluck().get(kid1.id);
    const day2 = new Date('2026-10-02T15:00:00Z');
    const s = startPractice(db, content, kid1, 'due', day2);
    const strengthBefore = db.prepare('SELECT SUM(strength) FROM item_strength WHERE user_id = ?').pluck().get(kid1.id);
    expect(() => completePractice(db, kid1, s.id, { now: day2 })).toThrow(/practice_incomplete/);
    const wrong = [s.exercises[0].id];
    const end = playSession(db, kid1, s, { wrong, now: day2 });
    const n = s.exercises.length;
    const r = completePractice(db, kid1, s.id, { startedAt: day2.toISOString(), now: end });
    expect(r).toMatchObject({ total: n, firstTryCorrect: n - 1, xpEarned: 5 * (n - 1) + 2 + 10 });
    const stats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(kid1.id);
    expect(stats).toMatchObject({ xp: xpLesson + r.xpEarned, streak_current: 2, last_active_date: '2026-10-02' });
    expect(db.prepare('SELECT COUNT(*) FROM lesson_progress WHERE user_id = ?').pluck().get(kid1.id)).toBe(1);
    expect(db.prepare('SELECT SUM(strength) FROM item_strength WHERE user_id = ?').pluck().get(kid1.id)).toBeGreaterThan(strengthBefore);
    const row = db.prepare('SELECT * FROM practice_sessions WHERE id = ?').get(s.id);
    expect(row).toMatchObject({ first_try_correct: n - 1, xp: r.xpEarned });
    expect(Date.parse(row.finished_at) - Date.parse(row.started_at)).toBe(end.getTime() - day2.getTime());
    expect(() => completePractice(db, kid1, s.id, { now: end })).toThrow(/practice_finished/);
    expect(checkIntegrity(db, content, { today: '2026-10-02' }).errors).toEqual([]);
  });

  it('a practice duration is clamped to 60 minutes', () => {
    const { db, kid1 } = setup();
    playLesson(db, kid1, LESSON, { now: new Date('2026-10-01T08:00:00Z') });
    const start = new Date('2026-10-02T08:00:00Z');
    const s = startPractice(db, content, kid1, 'due', start);
    const end = new Date('2026-10-02T11:00:00Z');
    playSession(db, kid1, s, { now: new Date('2026-10-02T10:00:00Z') });
    completePractice(db, kid1, s.id, { now: end });
    const row = db.prepare('SELECT * FROM practice_sessions WHERE id = ?').get(s.id);
    expect((Date.parse(row.finished_at) - Date.parse(row.started_at)) / 1000).toBe(3600);
  });

  it('"My mistakes" holds the exercise failed in the lesson until it is answered right on a first try', () => {
    const { db, kid1 } = setup();
    const failed = lessonEntry.lesson.exercises.find((e) => e.type === 'listen_choose');
    playLesson(db, kid1, LESSON, { wrong: [failed.id], now: new Date('2026-10-01T08:00:00Z') });
    const now = new Date('2026-10-02T08:00:00Z');
    expect(mistakeIds(db, content, kid1, now)).toEqual([failed.id]);
    const s = startPractice(db, content, kid1, 'mistakes', now);
    expect(s.exercises.map((e) => e.id)).toEqual([failed.id]);
    const end = playSession(db, kid1, s, { now });
    completePractice(db, kid1, s.id, { now: end });
    expect(mistakeIds(db, content, kid1, end)).toEqual([]);
    expect(() => startPractice(db, content, kid1, 'mistakes', end)).toThrow(/no_mistakes/);
  });

  it('legacy attempts (an earlier version of the exercise, flagged by markLegacyAttempts) are ignored by My mistakes', () => {
    const { db, kid1 } = setup();
    playLesson(db, kid1, LESSON, { now: new Date('2026-10-01T08:00:00Z') });
    const e = lessonEntry.lesson.exercises[0];
    recordAttempt(db, { userId: kid1.id, lessonId: LESSON, exerciseId: e.id, itemIds: ['en.something-else'], correct: false, givenAnswer: 'x', firstTry: true, now: new Date('2026-10-01T09:00:00Z') });
    // Not flagged yet: the flag, not an item comparison, decides.
    expect(mistakeIds(db, content, kid1, new Date('2026-10-02T08:00:00Z'))).toEqual([e.id]);
    expect(markLegacyAttempts(db, content)).toMatchObject({ marked: 1, cleared: 0, legacy: 1 });
    expect(mistakeIds(db, content, kid1, new Date('2026-10-02T08:00:00Z'))).toEqual([]);
    expect(markLegacyAttempts(db, content)).toMatchObject({ marked: 0, cleared: 0, legacy: 1 }); // idempotent
  });

  it('a pack reset removes the practice sessions that practised it (and their attempts) and recomputes XP', () => {
    const { db, kid1 } = setup();
    playLesson(db, kid1, LESSON, { now: new Date('2026-10-01T08:00:00Z') });
    const s = startPractice(db, content, kid1, 'due', new Date('2026-10-02T08:00:00Z'));
    completePractice(db, kid1, s.id, { now: playSession(db, kid1, s, { now: new Date('2026-10-02T08:00:00Z') }) });
    // Another track's progress (kept after a track change) is untouched by an English reset.
    const r = resetProgress(db, content, kid1.id, { packId: 'en-pre-a1' });
    expect(r.deleted.practiceSessions).toBe(1);
    expect(r.xpAfter).toBe(0);
    expect(db.prepare('SELECT COUNT(*) FROM attempts WHERE user_id = ?').pluck().get(kid1.id)).toBe(0);
    expect(db.prepare('SELECT streak_current FROM user_stats WHERE user_id = ?').pluck().get(kid1.id)).toBe(2);
    expect(checkIntegrity(db, content, { today: '2026-10-02' }).errors).toEqual([]);
  });

  it('a reset of another level keeps the practice sessions of this one', () => {
    const { db, kid1 } = setup();
    playLesson(db, kid1, LESSON, { now: new Date('2026-10-01T08:00:00Z') });
    const s = startPractice(db, content, kid1, 'due', new Date('2026-10-02T08:00:00Z'));
    completePractice(db, kid1, s.id, { now: playSession(db, kid1, s, { now: new Date('2026-10-02T08:00:00Z') }) });
    const before = db.prepare('SELECT xp FROM user_stats WHERE user_id = ?').pluck().get(kid1.id);
    const r = resetProgress(db, content, kid1.id, { packId: 'en-a1' });
    expect(r.deleted.practiceSessions).toBe(0);
    expect(r.xpAfter).toBe(before);
  });
});

describe('integrity with practice rows', () => {
  it('XP = lessons + practice; an unknown exercise in a practice row, a dangling session id and unfinished XP fail', () => {
    const { db, kid1 } = setup();
    playLesson(db, kid1, LESSON, { now: new Date('2026-10-01T08:00:00Z') });
    const s = startPractice(db, content, kid1, 'due', new Date('2026-10-02T08:00:00Z'));
    completePractice(db, kid1, s.id, { now: playSession(db, kid1, s, { now: new Date('2026-10-02T08:00:00Z') }) });
    expect(checkIntegrity(db, content, { today: '2026-10-02' }).errors).toEqual([]);

    db.prepare('UPDATE user_stats SET xp = xp - 1 WHERE user_id = ?').run(kid1.id);
    expect(checkIntegrity(db, content, { today: '2026-10-02' }).errors.join('\n')).toMatch(/SUM\(practice_sessions.xp\)/);
    db.prepare('UPDATE user_stats SET xp = xp + 1 WHERE user_id = ?').run(kid1.id);

    db.prepare(`INSERT INTO practice_sessions (user_id, track, mode, exercise_ids, exercises, started_at, xp)
                VALUES (?, 'en', 'due', '["en-pre-a1-u01-l01-e99"]', 1, '2026-10-02T09:00:00Z', 5)`).run(kid1.id);
    db.prepare("INSERT INTO attempts (user_id, lesson_id, exercise_id, item_ids, correct, practice_session_id) VALUES (?, ?, ?, '[]', 1, 999)")
      .run(kid1.id, LESSON, lessonEntry.lesson.exercises[0].id);
    const errors = checkIntegrity(db, content, { today: '2026-10-02' }).errors.join('\n');
    expect(errors).toMatch(/practice_sessions \d+: exercise "en-pre-a1-u01-l01-e99" does not exist/);
    expect(errors).toMatch(/not finished but has 5 XP/);
    expect(errors).toMatch(/practice session 999 does not exist/);
  });
});

// ---- API ----------------------------------------------------------------------------------------------
describe('practice API', () => {
  const makeApp = () => {
    const db = openMemoryDb();
    seedUsers(db);
    const config = { version: 'test', sessionSecret: 'x'.repeat(48), dataDir: here, audioDir: path.join(here, 'none'), modelsDir: here, contentDir: CONTENT_DIR, clientDist: path.join(here, 'none'), loginRateLimit: 10 };
    return { db, app: createApp({ db, content, audio: undefined, config, logger: pino({ level: 'silent' }) }) };
  };

  it('summary → start → attempts → complete, with XP, badges and the daily goal in the response', async () => {
    const { app, db } = makeApp();
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'kid1', password: 'kid1' });
    expect((await agent.get('/api/practice/summary')).body).toEqual({ unlocked: false, due: 0, mistakes: 0 });
    expect((await agent.post('/api/practice/start').send({ mode: 'due' })).body).toEqual({ error: 'practice_locked' });

    // A lesson through the API, then practice.
    const kid1 = findUserByUsername(db, 'kid1');
    playLesson(db, kid1, LESSON, { now: new Date(Date.now() - 3 * 86_400_000) });
    const me = (await agent.get('/api/progress/me')).body;
    expect(me.practice.unlocked).toBe(true);
    expect(me.today).toMatchObject({ goal: 20, chosen: false });

    const start = await agent.post('/api/practice/start').send({ mode: 'due' });
    expect(start.status).toBe(201);
    const { session } = start.body;
    expect(session.exercises.length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(session.exercises[0])).toEqual(['id', 'lessonId', 'packId']);
    // Not in this session: 404; not finished yet: 400.
    expect((await agent.post(`/api/practice/${session.id}/attempt`).send({ exerciseId: 'en-a2-u01-l01-e01', answer: 'x' })).status).toBe(404);
    expect((await agent.post(`/api/practice/${session.id}/complete`).send({})).body).toEqual({ error: 'practice_incomplete' });

    for (const { id } of session.exercises) {
      const e = content.exercises.get(id).exercise;
      const res = await agent.post(`/api/practice/${session.id}/attempt`).send({ exerciseId: id, answer: rightAnswer(e) });
      expect(res.body.correct, id).toBe(true);
    }
    const done = await agent.post(`/api/practice/${session.id}/complete`).send({ startedAt: new Date(Date.now() - 120_000).toISOString() });
    expect(done.status).toBe(200);
    const n = session.exercises.length;
    expect(done.body).toMatchObject({ xpEarned: 5 * n + 10, score: 100, total: n, firstTryCorrect: n });
    expect(done.body.badges.map((b) => b.id)).toContain('first-practice');
    expect(done.body.dailyGoal).toMatchObject({ goal: 20, reached: true, reachedNow: true });
    expect(done.body.stats.streak).toBe(1);
    // Another child cannot touch this session.
    const kid2 = request.agent(app);
    await kid2.post('/api/auth/login').send({ username: 'kid2', password: 'kid2' });
    expect((await kid2.post(`/api/practice/${session.id}/complete`).send({})).status).toBe(404);
  });
});

/** The answer the grader accepts, from the pack (tests only). */
export function rightAnswer(e) {
  const txt = (v) => (typeof v === 'string' ? v : v.nl);
  switch (e.type) {
    case 'multiple_choice':
    case 'listen_choose':
      return txt(e.options.find((o) => o.correct).text);
    case 'match_pairs':
      return { mistakes: 0 };
    case 'build_sentence':
      return e.tokens;
    default:
      return e.answer;
  }
}

// ---- admin report -------------------------------------------------------------------------------------

describe('admin progress report', () => {
  it('summary, 30 days of lesson/practice XP with minutes (unknown for rows without a start), accuracy, weakest words', () => {
    const { db, kid1 } = setup();
    // Midday: "an hour ago" must fall on the same Amsterdam day (with new Date() this failed between 00:00 and 01:00).
    const now = new Date(`${new Date().toISOString().slice(0, 10)}T10:00:00Z`);
    const wrong = lessonEntry.lesson.exercises.filter((e) => e.type === 'listen_choose').map((e) => e.id);
    playLesson(db, kid1, LESSON, { wrong, now: new Date(now.getTime() - 2 * 86_400_000) });
    db.prepare('UPDATE lesson_completions SET started_at = NULL').run(); // a completion from before durations existed
    const s = startPractice(db, content, kid1, 'due', new Date(now.getTime() - 3600_000));
    completePractice(db, kid1, s.id, { startedAt: new Date(now.getTime() - 3600_000).toISOString(), now: playSession(db, kid1, s, { now: new Date(now.getTime() - 3000_000) }) });

    const r = progressReport(db, content, kid1, 'en', now);
    expect(r.summary).toMatchObject({ practiceSessions: 1, levels: expect.arrayContaining([expect.objectContaining({ id: 'en-pre-a1', done: 1 })]) });
    expect(r.days).toHaveLength(30);
    const lessonDay = r.days.find((d) => d.lessonXp > 0);
    expect(lessonDay).toMatchObject({ active: true, unknown: 1, minutes: 0 });
    const today = r.days.at(-1);
    expect(today.practiceXp).toBeGreaterThan(0);
    expect(today.minutes).toBeGreaterThan(0);
    const lc = r.accuracy.find((a) => a.type === 'listen_choose');
    expect(lc.allTime.total).toBeGreaterThanOrEqual(wrong.length);
    expect(lc.allTime.correct).toBeLessThan(lc.allTime.total);
    expect(r.weakest.length).toBeGreaterThan(0);
    expect(r.weakest.length).toBeLessThanOrEqual(20);
    expect(r.weakest[0]).toEqual(expect.objectContaining({ kind: expect.any(String), target: expect.any(String), native: expect.any(String), strength: expect.any(Number), timesWrong: expect.any(Number) }));
    for (let i = 1; i < r.weakest.length; i++) expect(r.weakest[i].strength).toBeGreaterThanOrEqual(r.weakest[i - 1].strength);
  });
});

describe('text questions in practice and strength', () => {
  const textLesson = [...content.lessons.values()].find((l) => l.packId === 'en-b1' && l.lesson.exercises.some((e) => e.type === 'reading'));
  it('D1: a wrong first try on a reading question is not a "My mistakes" exercise (the session could not play it)', () => {
    const { db, kid1 } = setup();
    const reading = textLesson.lesson.exercises.find((e) => e.type === 'reading');
    playLesson(db, kid1, textLesson.lesson.id, { wrong: [reading.id], now: new Date('2026-10-01T08:00:00Z') });
    const now = new Date('2026-10-02T08:00:00Z');
    expect(practiceSummary(db, content, kid1, now).mistakes).toBe(0);
    expect(mistakeIds(db, content, kid1, now, { capped: false })).toEqual([]);
    expect(() => startPractice(db, content, kid1, 'mistakes', now)).toThrow(/no_mistakes/);
  });

  it('D3: a comprehension answer only marks the text\'s words as seen (touchOnly); a cloze still moves them', () => {
    const { db, kid1 } = setup();
    const reading = textLesson.lesson.exercises.find((e) => e.type === 'reading');
    const [item] = reading.items;
    const strength = () => db.prepare('SELECT strength, last_seen_at FROM item_strength WHERE user_id = ? AND item_id = ?').get(kid1.id, item);
    recordAttempt(db, { userId: kid1.id, lessonId: textLesson.lesson.id, exerciseId: reading.id, itemIds: [item], correct: true, givenAnswer: 'x', touchOnly: true, now: new Date('2026-10-01T08:00:00Z') });
    expect(strength()).toBeUndefined(); // never seen in a word exercise: no row
    recordAttempt(db, { userId: kid1.id, lessonId: 'L', exerciseId: 'E', itemIds: [item], correct: true, givenAnswer: 'x', now: new Date('2026-10-01T08:01:00Z') });
    expect(strength().strength).toBe(1);
    recordAttempt(db, { userId: kid1.id, lessonId: textLesson.lesson.id, exerciseId: reading.id, itemIds: [item], correct: false, givenAnswer: 'x', touchOnly: true, now: new Date('2026-10-01T09:00:00Z') });
    expect(strength()).toEqual({ strength: 1, last_seen_at: '2026-10-01T09:00:00.000Z' });
  });

  it('D6: lessons of a level moved back to preview are not practised', () => {
    const { db, kid1 } = setup();
    playLesson(db, kid1, LESSON, { now: new Date('2026-10-01T08:00:00Z') });
    const packId = content.lessons.get(LESSON).packId;
    const withdrawn = { ...content, packs: new Map([...content.packs].map(([id, p]) => [id, id === packId ? { ...p, preview: true } : p])) };
    expect(practiceCandidates(db, withdrawn, kid1)).toEqual([]);
    expect(practiceCandidates(db, content, kid1).length).toBeGreaterThan(0);
  });
});
