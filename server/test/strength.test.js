// An item's strength rises at most once per lesson run or practice session (its first correct answer there)
// and falls at most once (its first wrong answer there). Existing item_strength rows are never rewritten.
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
import { recordAttempt } from '../src/lib/progress.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(here, '../../content');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-strength-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const LESSON = 'en-pre-a1-u01-l01';
const now = new Date('2026-10-05T10:00:00Z');

function setup() {
  const db = openMemoryDb();
  seedUsers(db);
  const kid1 = db.prepare("SELECT id FROM users WHERE username = 'kid1'").pluck().get();
  const strength = (item) => db.prepare('SELECT strength FROM item_strength WHERE user_id = ? AND item_id = ?').pluck().get(kid1, item);
  const att = (exerciseId, itemIds, correct, extra = {}) =>
    recordAttempt(db, { userId: kid1, lessonId: LESSON, exerciseId, itemIds, correct, givenAnswer: 'x', now, ...extra });
  return { db, kid1, strength, att };
}

describe('item strength moves once per run (D4)', () => {
  it('a word in four exercises of one lesson run rises once', () => {
    const { strength, att } = setup();
    const run = '2026-10-05T09:58:00.000Z';
    for (let i = 1; i <= 4; i += 1) att(`${LESSON}-e0${i}`, ['en.cat', `en.w${i}`], true, { run });
    expect(strength('en.cat')).toBe(1);
    expect(strength('en.w3')).toBe(1);
  });

  it('a new run rises again; a wrong answer falls once per run; right after wrong in the same run stays', () => {
    const { strength, att } = setup();
    att(`${LESSON}-e01`, ['en.cat'], true, { run: 'r1' });
    att(`${LESSON}-e01`, ['en.cat'], true, { run: 'r2' });
    expect(strength('en.cat')).toBe(2);
    att(`${LESSON}-e02`, ['en.cat'], false, { run: 'r3' });
    att(`${LESSON}-e03`, ['en.cat'], false, { run: 'r3' });
    expect(strength('en.cat')).toBe(1);
    att(`${LESSON}-e02`, ['en.cat'], true, { run: 'r3' }); // first correct of run r3: rises once
    att(`${LESSON}-e03`, ['en.cat'], true, { run: 'r3' });
    expect(strength('en.cat')).toBe(2);
  });

  it('a repeat in the same run updates last_seen_at only (next review unchanged)', () => {
    const { db, kid1, att } = setup();
    att(`${LESSON}-e01`, ['en.cat'], true, { run: 'r1' });
    const before = db.prepare("SELECT * FROM item_strength WHERE user_id = ? AND item_id = 'en.cat'").get(kid1);
    recordAttempt(db, { userId: kid1, lessonId: LESSON, exerciseId: `${LESSON}-e02`, itemIds: ['en.cat'], correct: true, givenAnswer: 'x', run: 'r1',
      now: new Date(now.getTime() + 60_000) });
    const after = db.prepare("SELECT * FROM item_strength WHERE user_id = ? AND item_id = 'en.cat'").get(kid1);
    expect(after.strength).toBe(before.strength);
    expect(after.next_review_at).toBe(before.next_review_at);
    expect(after.last_seen_at > before.last_seen_at).toBe(true);
  });

  it('a wrong-then-repeat at strength 0 keeps next_review_at no earlier than last_seen_at', () => {
    const { db, kid1, att } = setup();
    att(`${LESSON}-e01`, ['en.cat'], false, { run: 'r1' });
    recordAttempt(db, { userId: kid1, lessonId: LESSON, exerciseId: `${LESSON}-e02`, itemIds: ['en.cat'], correct: false, givenAnswer: 'x', run: 'r1',
      now: new Date(now.getTime() + 90_000) });
    const row = db.prepare("SELECT * FROM item_strength WHERE user_id = ? AND item_id = 'en.cat'").get(kid1);
    expect(row.strength).toBe(0);
    expect(row.next_review_at >= row.last_seen_at).toBe(true);
  });

  it('a practice session is one run', () => {
    const { db, kid1, strength, att } = setup();
    const ps = db.prepare("INSERT INTO practice_sessions (user_id, track, mode, exercise_ids, exercises, started_at) VALUES (?, 'en', 'due', '[]', 2, ?)")
      .run(kid1, now.toISOString()).lastInsertRowid;
    att(`${LESSON}-e01`, ['en.cat'], true, { practiceSessionId: ps });
    att(`${LESSON}-e02`, ['en.cat'], true, { practiceSessionId: ps });
    expect(strength('en.cat')).toBe(1);
  });

  it('without a run (an old client) every attempt counts, as before', () => {
    const { strength, att } = setup();
    att(`${LESSON}-e01`, ['en.cat'], true);
    att(`${LESSON}-e02`, ['en.cat'], true);
    expect(strength('en.cat')).toBe(2);
  });

  it('the attempt route takes the run from startedAt', async () => {
    const content = loadContent({ contentDir: CONTENT_DIR });
    const db = openMemoryDb();
    seedUsers(db);
    const config = {
      version: 'test', sessionSecret: 'x'.repeat(48), dataDir: tmp, audioDir: path.join(tmp, 'none'), modelsDir: tmp, contentDir: CONTENT_DIR,
      clientDist: path.join(tmp, 'no-dist'), loginRateLimit: 10,
    };
    const audio = loadAudio({ audioDir: config.audioDir, contentDir: CONTENT_DIR, content, logger: pino({ level: 'silent' }) });
    const app = createApp({ db, content, audio, config, logger: pino({ level: 'silent' }) });
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ username: 'kid1', password: 'kid1' })).status).toBe(200);
    // Two match_pairs answers (always gradable) in the same run: their items rise once.
    const ex = content.lessons.get(LESSON).lesson.exercises.find((e) => e.type === 'match_pairs');
    const startedAt = new Date().toISOString();
    for (let i = 0; i < 2; i += 1) {
      const r = await agent.post('/api/progress/attempt').send({ lessonId: LESSON, exerciseId: ex.id, answer: { mistakes: 0 }, firstTry: i === 0, startedAt });
      expect(r.body.correct).toBe(true);
    }
    const s = db.prepare("SELECT MAX(strength) FROM item_strength").pluck().get();
    expect(s).toBe(1);
    expect(db.prepare('SELECT DISTINCT run FROM attempts').pluck().all()).toEqual([startedAt]);
  });
});
