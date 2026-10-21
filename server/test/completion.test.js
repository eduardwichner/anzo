// Review fixes around finishing a lesson or a practice session: the same run reported twice counts once, and an
// exercise hidden by an admin while a child is in it never blocks the child.
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
import { seedUsers } from '../src/lib/users.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(here, '../../content');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-compl-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const LESSON = 'en-pre-a1-u01-l01';
/** Content in which the last exercise of LESSON was hidden by an admin correction (what store.js builds after a hide). */
function contentWithHidden() {
  const content = loadContent({ contentDir: CONTENT_DIR });
  const entry = content.lessons.get(LESSON);
  const hidden = entry.lesson.exercises[entry.lesson.exercises.length - 1].id;
  entry.lesson.exercises = entry.lesson.exercises.filter((e) => e.id !== hidden);
  content.exercises.delete(hidden);
  entry.playableCount -= 1;
  entry.retiredCount = 1;
  content.retired = new Map([[hidden, { key: 'x', reason: 'admin correction #1: test' }]]);
  return { content, hidden, playable: entry.playableCount };
}

function makeApp(content) {
  const db = openMemoryDb();
  seedUsers(db);
  const config = {
    version: 'test', sessionSecret: 'x'.repeat(48), dataDir: tmp, audioDir: path.join(tmp, 'none'), modelsDir: tmp, contentDir: CONTENT_DIR,
    clientDist: path.join(tmp, 'no-dist'), loginRateLimit: 10,
  };
  const audio = loadAudio({ audioDir: config.audioDir, contentDir: CONTENT_DIR, content, logger: pino({ level: 'silent' }) });
  return { db, app: createApp({ db, content, audio, config, logger: pino({ level: 'silent' }) }) };
}
async function kid(app, username = 'kid1') {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ username, password: username })).status).toBe(200);
  return agent;
}

describe('finishing a lesson twice (a retry after a lost response)', () => {
  it('the same run (same startedAt) is recorded once; a new run counts again', async () => {
    const content = loadContent({ contentDir: CONTENT_DIR });
    const { app, db } = makeApp(content);
    const kid1 = await kid(app);
    const total = content.lessons.get(LESSON).playableCount;
    const startedAt = new Date(Date.now() - 90_000).toISOString();
    const first = await kid1.post(`/api/progress/lesson/${LESSON}/complete`).send({ firstTryCorrect: total, total, startedAt });
    expect(first.status).toBe(200);
    const again = await kid1.post(`/api/progress/lesson/${LESSON}/complete`).send({ firstTryCorrect: total, total, startedAt });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ duplicate: true, xpEarned: first.body.xpEarned, badges: [] });
    expect(again.body.stats.xp).toBe(first.body.stats.xp);
    expect(db.prepare('SELECT COUNT(*) FROM lesson_completions').pluck().get()).toBe(1);
    const replay = await kid1.post(`/api/progress/lesson/${LESSON}/complete`).send({ firstTryCorrect: total, total, startedAt: new Date().toISOString() });
    expect(replay.body.duplicate).toBeUndefined();
    expect(replay.body.stats.xp).toBe(first.body.stats.xp + replay.body.xpEarned);
  });
});

describe('an exercise hidden while the child is in it', () => {
  it('lesson: its attempt passes without being stored, and the lesson completes with the count it was opened with', async () => {
    const { content, hidden, playable } = contentWithHidden();
    const { app, db } = makeApp(content);
    const kid1 = await kid(app);
    const res = await kid1.post('/api/progress/attempt').send({ lessonId: LESSON, exerciseId: hidden, answer: 'whatever', firstTry: true });
    expect(res.body).toEqual({ correct: true, retired: true });
    expect(db.prepare('SELECT COUNT(*) FROM attempts').pluck().get()).toBe(0);
    expect((await kid1.post(`/api/progress/lesson/${LESSON}/complete`).send({ firstTryCorrect: playable + 1, total: playable + 1 })).status).toBe(200);
    expect((await kid1.post(`/api/progress/lesson/${LESSON}/complete`).send({ firstTryCorrect: playable, total: playable })).status).toBe(200);
    const tooMany = await kid1.post(`/api/progress/lesson/${LESSON}/complete`).send({ firstTryCorrect: 1, total: playable + 2 });
    expect(tooMany.body).toMatchObject({ error: 'invalid_result', expectedTotal: playable });
  });

  it('practice: a session holding it completes once the other exercises are right; it does not count', async () => {
    const { content, hidden, playable } = contentWithHidden();
    const { app, db } = makeApp(content);
    const kid1 = await kid(app);
    await kid1.post(`/api/progress/lesson/${LESSON}/complete`).send({ firstTryCorrect: playable, total: playable });
    const live = content.lessons.get(LESSON).lesson.exercises.find((e) => e.type === 'multiple_choice');
    const right = live.options.find((o) => o.correct).text.nl;
    const uid = db.prepare("SELECT id FROM users WHERE username = 'kid1'").pluck().get();
    const id = db.prepare(`INSERT INTO practice_sessions (user_id, track, mode, exercise_ids, exercises, started_at) VALUES (?, 'en', 'due', ?, 2, ?)`)
      .run(uid, JSON.stringify([live.id, hidden]), new Date(Date.now() - 60_000).toISOString()).lastInsertRowid;
    expect((await kid1.post(`/api/practice/${id}/attempt`).send({ exerciseId: hidden, answer: 'x' })).body).toEqual({ correct: true, retired: true });
    expect((await kid1.post(`/api/practice/${id}/attempt`).send({ exerciseId: live.id, answer: right })).body.correct).toBe(true);
    const done = await kid1.post(`/api/practice/${id}/complete`).send({});
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ total: 1, firstTryCorrect: 1 });
  });
});

describe('a retried completion of a clamped run', () => {
  it('two completions of the same run 5 s apart, the lesson open for two hours, are stored once', async () => {
    const { openMemoryDb } = await import('../src/db/index.js');
    const { seedUsers } = await import('../src/lib/users.js');
    const { completeLesson } = await import('../src/lib/progress.js');
    const db = openMemoryDb();
    seedUsers(db);
    const kid1 = db.prepare("SELECT id FROM users WHERE username = 'kid1'").pluck().get();
    const startedAt = '2026-10-05T08:00:00.000Z';
    const a = completeLesson(db, { userId: kid1, lessonId: 'en-pre-a1-u01-l01', firstTryCorrect: 10, total: 12, startedAt, now: new Date('2026-10-05T10:00:00Z') });
    const b = completeLesson(db, { userId: kid1, lessonId: 'en-pre-a1-u01-l01', firstTryCorrect: 10, total: 12, startedAt, now: new Date('2026-10-05T10:00:05Z') });
    expect(a.duplicate).toBeUndefined();
    expect(b).toMatchObject({ duplicate: true, xpEarned: a.xpEarned });
    expect(db.prepare('SELECT COUNT(*) FROM lesson_completions WHERE user_id = ?').pluck().get(kid1)).toBe(1);
    // another run of the same lesson (Once more) counts
    const c = completeLesson(db, { userId: kid1, lessonId: 'en-pre-a1-u01-l01', firstTryCorrect: 12, total: 12, startedAt: '2026-10-05T10:01:00.000Z', now: new Date('2026-10-05T10:05:00Z') });
    expect(c.duplicate).toBeUndefined();
    expect(db.prepare("SELECT index_list.name FROM pragma_index_list('attempts') AS index_list").pluck().all()).toContain('attempts_practice');
  });
});
