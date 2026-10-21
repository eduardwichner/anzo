// Badges, the daily goal (Europe/Amsterdam days), durations, and the API that carries them.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openMemoryDb } from '../src/db/index.js';
import { loadContent } from '../src/content/loader.js';
import { findUserByUsername, seedUsers } from '../src/lib/users.js';
import { completeLesson } from '../src/lib/progress.js';
import { awardBadges, backfillGamification, badgeList, BADGES, levelBadgeId } from '../src/lib/badges.js';
import { dailyGoalToday, goalWeek, recordDailyGoal, todayXp } from '../src/lib/activity.js';
import { clampedDurationS, clampedStart, longestDayRun, practiceXp } from '../src/lib/gamification.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(here, '../../content');
const content = loadContent({ contentDir: CONTENT_DIR });

function setup() {
  const db = openMemoryDb();
  seedUsers(db);
  return { db, kid1: findUserByUsername(db, 'kid1'), kid2: findUserByUsername(db, 'kid2') };
}
const done = (db, userId, lessonIds) => {
  const ins = db.prepare("INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id, best_score, first_completed_at, last_completed_at) VALUES (?, ?, 80, 'x', 'x')");
  for (const id of lessonIds) ins.run(userId, id);
};
const enLessons = content.packs.get('en-pre-a1').lessonIds;
const allEnLessons = [...content.packs.values()].filter((p) => p.trackId === 'en').flatMap((p) => p.lessonIds);

describe('badges', () => {
  it('has the stable set of ids', () => {
    expect(BADGES.map((b) => b.id)).toEqual([
      'first-lesson', 'first-practice', 'lessons-10', 'lessons-50', 'lessons-100', 'streak-3', 'streak-7', 'streak-30', 'streak-100',
      'perfect-lesson', 'unit-complete', 'words-50', 'words-250', 'words-500', 'words-1000', 'goal-week', 'bug-hunter',
    ]);
  });

  it('lesson counts: first lesson, 10, 50, 100 (distinct lessons)', () => {
    const { db, kid1 } = setup();
    expect(awardBadges(db, content, kid1.id)).toEqual([]);
    done(db, kid1.id, enLessons.slice(0, 1));
    expect(awardBadges(db, content, kid1.id)).toEqual(['first-lesson']);
    done(db, kid1.id, enLessons.slice(0, 10));
    expect(awardBadges(db, content, kid1.id)).toEqual(['lessons-10', 'unit-complete']); // u01 has fewer than 10 lessons
    done(db, kid1.id, enLessons.slice(0, 50));
    expect(awardBadges(db, content, kid1.id)).toContain('lessons-50');
    done(db, kid1.id, allEnLessons.slice(0, 100));
    expect(awardBadges(db, content, kid1.id)).toContain('lessons-100');
  });

  it('streak 3 / 7 / 30 / 100 from the best streak', () => {
    const { db, kid1 } = setup();
    for (const [best, id] of [[3, 'streak-3'], [7, 'streak-7'], [30, 'streak-30'], [100, 'streak-100']]) {
      db.prepare('UPDATE user_stats SET streak_best = ? WHERE user_id = ?').run(best, kid1.id);
      expect(awardBadges(db, content, kid1.id)).toEqual([id]);
    }
  });

  it('perfect lesson: a completion with 100 % first try', () => {
    const { db, kid1 } = setup();
    const l = content.lessons.get('en-pre-a1-u01-l01');
    completeLesson(db, { userId: kid1.id, lessonId: l.lesson.id, firstTryCorrect: l.playableCount - 1, total: l.playableCount });
    expect(awardBadges(db, content, kid1.id)).toEqual(['first-lesson']);
    completeLesson(db, { userId: kid1.id, lessonId: l.lesson.id, firstTryCorrect: l.playableCount, total: l.playableCount });
    expect(awardBadges(db, content, kid1.id)).toEqual(['perfect-lesson']);
  });

  it('first practice: a finished practice session', () => {
    const { db, kid1 } = setup();
    db.prepare("INSERT INTO practice_sessions (user_id, track, mode, exercise_ids, exercises, started_at) VALUES (?, 'en', 'due', '[]', 0, 'x')").run(kid1.id);
    expect(awardBadges(db, content, kid1.id)).toEqual([]);
    db.prepare("UPDATE practice_sessions SET finished_at = 'y'").run();
    expect(awardBadges(db, content, kid1.id)).toEqual(['first-practice']);
  });

  it('unit complete: one generic badge with a counter; level complete: one per pack, named after it', () => {
    const { db, kid1 } = setup();
    const pack = content.packs.get('en-pre-a1').pack;
    done(db, kid1.id, pack.units[0].lessons.map((l) => l.id));
    expect(awardBadges(db, content, kid1.id)).toContain('unit-complete');
    done(db, kid1.id, pack.units[1].lessons.map((l) => l.id));
    expect(awardBadges(db, content, kid1.id)).not.toContain('unit-complete');
    const list = badgeList(db, content, kid1, ['en']);
    expect(list.find((b) => b.id === 'unit-complete')).toMatchObject({ count: 2, earnedAt: expect.any(String) });
    done(db, kid1.id, enLessons);
    expect(awardBadges(db, content, kid1.id)).toContain(levelBadgeId('en-pre-a1'));
    const level = badgeList(db, content, kid1, ['en']).find((b) => b.id === 'level-en-pre-a1');
    expect(level).toMatchObject({ family: 'level', cefr: 'Pre-A1', title: { nl: 'Starters' }, earnedAt: expect.any(String) });
    // The grid lists every level of the child's own track, earned or not.
    expect(badgeList(db, content, kid1, ['en']).filter((b) => b.family === 'level').map((b) => b.id)).toEqual(['level-en-pre-a1', 'level-en-a1', 'level-en-a2', 'level-en-b1', 'level-en-b2']);
    // Level badges belong to a course: listed for the courses shown, plus earned ones of another course.
    expect(badgeList(db, content, kid1, ['fr']).filter((b) => b.family === 'level').map((b) => [b.id, b.track]))
      .toEqual([['level-fr-a1-1', 'fr'], ['level-fr-a1', 'fr'], ['level-fr-a2', 'fr'], ['level-fr-b1', 'fr'], ['level-fr-b2', 'fr'], ['level-en-pre-a1', 'en']]);
  });

  it('words learned 50 / 250 / 500 / 1000: vocabulary with strength ≥ 3 (sentences do not count)', () => {
    const { db, kid1 } = setup();
    const vocab = [...content.packs.values()].filter((p) => p.trackId === 'en').flatMap((p) => [...p.vocabById.keys()]);
    const ins = db.prepare("INSERT INTO item_strength (user_id, item_id, strength, last_seen_at, next_review_at) VALUES (?, ?, ?, 'a', 'b')");
    ins.run(kid1.id, 'en-pre-a1-u01-s01', 5);
    vocab.slice(0, 49).forEach((id) => ins.run(kid1.id, id, 3));
    ins.run(kid1.id, vocab[49], 2);
    expect(awardBadges(db, content, kid1.id)).toEqual([]);
    db.prepare('UPDATE item_strength SET strength = 3 WHERE item_id = ?').run(vocab[49]);
    expect(awardBadges(db, content, kid1.id)).toEqual(['words-50']);
    vocab.slice(50, 1000).forEach((id) => ins.run(kid1.id, id, 4));
    expect(awardBadges(db, content, kid1.id)).toEqual(['words-250', 'words-500', 'words-1000']);
  });

  it('daily goal reached 7 days in a row', () => {
    const { db, kid1 } = setup();
    const ins = db.prepare("INSERT INTO daily_goal_days (user_id, day, goal, xp, reached_at) VALUES (?, ?, 20, 30, 'x')");
    for (const d of ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10']) ins.run(kid1.id, d);
    expect(longestDayRun(db.prepare('SELECT day FROM daily_goal_days').pluck().all())).toBe(6);
    expect(awardBadges(db, content, kid1.id)).toEqual([]);
    ins.run(kid1.id, '2026-09-11');
    expect(awardBadges(db, content, kid1.id)).toEqual(['goal-week']);
  });

  it('is idempotent: awarding again gives nothing new and keeps the first date', () => {
    const { db, kid1 } = setup();
    done(db, kid1.id, enLessons.slice(0, 1));
    expect(awardBadges(db, content, kid1.id, { now: new Date('2026-10-01T10:00:00Z') })).toEqual(['first-lesson']);
    expect(awardBadges(db, content, kid1.id, { now: new Date('2026-10-02T10:00:00Z') })).toEqual([]);
    expect(db.prepare('SELECT earned_at FROM user_badges').pluck().all()).toEqual(['2026-10-01T10:00:00.000Z']);
  });

  it('backfill: awards what the history qualifies for, silently, records past goal days, never duplicates', () => {
    const { db, kid2, kid1 } = setup();
    const l = content.lessons.get('fr-a1-1-u01-l01');
    completeLesson(db, { userId: kid2.id, lessonId: l.lesson.id, firstTryCorrect: 10, total: l.playableCount, now: new Date('2026-09-30T07:54:05Z') });
    expect(backfillGamification(db, content)).toEqual({ kid1: [], kid2: ['first-lesson'], admin: [] });
    expect(backfillGamification(db, content)).toEqual({ kid1: [], kid2: [], admin: [] });
    expect(db.prepare('SELECT badge_id, silent FROM user_badges').all()).toEqual([{ badge_id: 'first-lesson', silent: 1 }]);
    expect(db.prepare('SELECT user_id, day, goal FROM daily_goal_days').all()).toEqual([{ user_id: kid2.id, day: '2026-09-30', goal: 20 }]);
    // After the backfill, an event awards only what is new.
    completeLesson(db, { userId: kid2.id, lessonId: l.lesson.id, firstTryCorrect: l.playableCount, total: l.playableCount });
    expect(awardBadges(db, content, kid2.id)).toEqual(['perfect-lesson']);
    expect(awardBadges(db, content, kid1.id)).toEqual([]);
  });
});

describe('daily goal (Europe/Amsterdam days)', () => {
  const at = (db, userId, iso, xp) => db.prepare("INSERT INTO lesson_completions (user_id, lesson_id, score, xp, completed_at) VALUES (?, 'en-pre-a1-u01-l01', 100, ?, ?)").run(userId, xp, iso);

  it('today\'s XP counts lessons and practice of the Amsterdam day, across midnight', () => {
    const { db, kid1 } = setup();
    at(db, kid1.id, '2026-07-14T21:59:00Z', 1); // 23:59 CEST on the 14th
    at(db, kid1.id, '2026-07-14T22:01:00Z', 10); // 00:01 CEST on the 15th
    at(db, kid1.id, '2026-07-15T21:59:00Z', 20); // 23:59 on the 15th
    at(db, kid1.id, '2026-07-15T22:01:00Z', 100); // the 16th
    db.prepare("INSERT INTO practice_sessions (user_id, track, mode, exercise_ids, exercises, started_at, finished_at, xp) VALUES (?, 'en', 'due', '[]', 0, 'x', '2026-07-15T12:00:00Z', 7)").run(kid1.id);
    expect(todayXp(db, kid1.id, new Date('2026-07-15T10:00:00Z'))).toBe(37);
  });

  it('across the autumn DST change (25 Oct 2026, CEST → CET) and the spring one (29 Mar 2026)', () => {
    const { db, kid1 } = setup();
    at(db, kid1.id, '2026-10-24T21:59:00Z', 1); // 23:59 CEST, the 24th
    at(db, kid1.id, '2026-10-24T22:01:00Z', 10); // 00:01 CEST, the 25th
    at(db, kid1.id, '2026-10-25T22:59:00Z', 20); // 23:59 CET, the 25th (a 25-hour day)
    at(db, kid1.id, '2026-10-25T23:01:00Z', 100); // 00:01 CET, the 26th
    expect(todayXp(db, kid1.id, new Date('2026-10-25T12:00:00Z'))).toBe(30);
    at(db, kid1.id, '2026-03-28T22:59:00Z', 1); // 23:59 CET, the 28th
    at(db, kid1.id, '2026-03-28T23:01:00Z', 10); // 00:01 CET, the 29th
    at(db, kid1.id, '2026-03-29T21:59:00Z', 20); // 23:59 CEST, the 29th (a 23-hour day)
    at(db, kid1.id, '2026-03-29T22:01:00Z', 100); // the 30th
    expect(todayXp(db, kid1.id, new Date('2026-03-29T12:00:00Z'))).toBe(30);
  });

  it('default 20 until chosen; reaching it is recorded once per day (reachedNow only the first time)', () => {
    const { db, kid1 } = setup();
    const now = new Date('2026-10-02T10:00:00Z');
    expect(dailyGoalToday(db, kid1, now)).toEqual({ goal: 20, chosen: false, xp: 0, reached: false });
    at(db, kid1.id, '2026-10-02T09:00:00Z', 15);
    expect(recordDailyGoal(db, kid1, now)).toMatchObject({ reached: false, reachedNow: false });
    at(db, kid1.id, '2026-10-02T09:30:00Z', 15);
    expect(recordDailyGoal(db, kid1, now)).toMatchObject({ goal: 20, xp: 30, reached: true, reachedNow: true });
    expect(recordDailyGoal(db, kid1, now)).toMatchObject({ reached: true, reachedNow: false });
    db.prepare('UPDATE users SET daily_goal = 50 WHERE id = ?').run(kid1.id);
    const fanatic = findUserByUsername(db, 'kid1');
    expect(dailyGoalToday(db, fanatic, now)).toEqual({ goal: 50, chosen: true, xp: 30, reached: false });
    const week = goalWeek(db, fanatic, now);
    expect(week).toHaveLength(7);
    expect(week.at(-1)).toEqual({ day: '2026-10-02', xp: 30, reached: true });
    expect(week[0].day).toBe('2026-09-26');
  });
});

describe('durations and practice XP', () => {
  it('clamps durations to 1 s … 60 min; a missing or invalid start is unknown', () => {
    const end = new Date('2026-10-02T10:00:00Z');
    expect(clampedDurationS('2026-10-02T09:58:00Z', end)).toBe(120);
    expect(clampedDurationS('2026-10-02T10:00:05Z', end)).toBe(1); // clock skew: the start after the end
    expect(clampedDurationS('2026-10-02T07:00:00Z', end)).toBe(3600);
    expect(clampedDurationS(undefined, end)).toBeNull();
    expect(clampedDurationS('yesterday-ish', end)).toBeNull();
    expect(clampedStart('2026-10-02T07:00:00Z', end)).toBe('2026-10-02T09:00:00.000Z');
  });

  it('practice XP: +5 first try, +2 after a retry, +10 bonus', () => {
    expect(practiceXp(12, 12)).toBe(70);
    expect(practiceXp(10, 12)).toBe(64);
    expect(practiceXp(0, 6)).toBe(22);
  });
});

describe('API: completion rewards, preferences, profile', () => {
  const makeApp = () => {
    const db = openMemoryDb();
    seedUsers(db);
    const config = { version: 'test', sessionSecret: 'x'.repeat(48), dataDir: here, audioDir: path.join(here, 'none'), modelsDir: here, contentDir: CONTENT_DIR, clientDist: path.join(here, 'none'), loginRateLimit: 10 };
    return { db, app: createApp({ db, content, audio: undefined, config, logger: pino({ level: 'silent' }) }) };
  };

  it('a perfect lesson returns its badges and the daily goal; the duration is stored clamped; the profile shows them', async () => {
    const { app, db } = makeApp();
    const kid = request.agent(app);
    await kid.post('/api/auth/login').send({ username: 'kid1', password: 'kid1' });
    const l = content.lessons.get('en-pre-a1-u01-l01');
    const res = await kid.post('/api/progress/lesson/en-pre-a1-u01-l01/complete')
      .send({ firstTryCorrect: l.playableCount, total: l.playableCount, startedAt: new Date(Date.now() - 3 * 3600_000).toISOString() });
    expect(res.status).toBe(200);
    expect(res.body.badges.map((b) => b.id)).toEqual(['first-lesson', 'perfect-lesson']);
    expect(res.body.badges[0]).toEqual({ id: 'first-lesson', family: 'lesson', n: 1 });
    expect(res.body.dailyGoal).toMatchObject({ goal: 20, reached: true, reachedNow: true });
    const row = db.prepare('SELECT started_at, completed_at FROM lesson_completions').get();
    expect(Date.parse(row.completed_at) - Date.parse(row.started_at)).toBe(3600_000);
    // Again: nothing new.
    const again = await kid.post('/api/progress/lesson/en-pre-a1-u01-l01/complete').send({ firstTryCorrect: 1, total: l.playableCount });
    expect(again.body.badges).toEqual([]);
    expect(again.body.dailyGoal.reachedNow).toBe(false);
    expect(db.prepare('SELECT started_at FROM lesson_completions ORDER BY id DESC').pluck().get()).toBeNull();

    const profile = (await kid.get('/api/profile')).body;
    expect(profile.badges.filter((b) => b.earnedAt).map((b) => b.id)).toEqual(['first-lesson', 'perfect-lesson']);
    expect(profile.badges.length).toBe(BADGES.length + 5); // one per available English level
    expect(profile.goalWeek).toHaveLength(7);
    expect(profile.dailyGoal).toMatchObject({ goal: 20, chosen: false, reached: true });
    expect(profile.wordsLearned).toBe(0); // no answers were recorded, only the completion
  });

  it('PATCH /api/auth/me stores the daily goal (20/50/100) and the sound-effects switch', async () => {
    const { app, db } = makeApp();
    const kid = request.agent(app);
    await kid.post('/api/auth/login').send({ username: 'kid1', password: 'kid1' });
    expect((await kid.get('/api/auth/me')).body.user).toMatchObject({ dailyGoal: null, soundEffects: true });
    expect((await kid.patch('/api/auth/me').send({ dailyGoal: 30 })).body).toMatchObject({ error: 'invalid_preferences', fields: { dailyGoal: 'invalid' } });
    expect((await kid.patch('/api/auth/me').send({ soundEffects: 'no' })).body.fields).toEqual({ soundEffects: 'invalid' });
    const ok = await kid.patch('/api/auth/me').send({ dailyGoal: 50, soundEffects: false });
    expect(ok.body.user).toMatchObject({ dailyGoal: 50, soundEffects: false });
    expect(db.prepare("SELECT daily_goal, sound_effects FROM users WHERE username = 'kid1'").get()).toEqual({ daily_goal: 50, sound_effects: 0 });
  });
});
