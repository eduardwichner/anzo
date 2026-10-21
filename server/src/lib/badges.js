// Badges: awarded server-side when the triggering event happens (lesson or practice completed), returned in the
// completion response so the client can show them, and stored in user_badges (idempotent: one row per badge).
// Ids are stable forever. Every badge is evaluated from the user's stored history ("facts"), so the same code awards at
// event time and backfills silently after migration 005. Earned badges are never taken away (not by a reset either).
import { activityRows } from './activity.js';
import { effectiveDailyGoal, longestDayRun } from './gamification.js';

/** Fixed badges. family picks the drawing; n is the number shown on it. */
export const BADGES = [
  { id: 'first-lesson', family: 'lesson', n: 1, test: (f) => f.lessonsDone >= 1 },
  { id: 'first-practice', family: 'practice', n: 1, test: (f) => f.practiceDone >= 1 },
  { id: 'lessons-10', family: 'lesson', n: 10, test: (f) => f.lessonsDone >= 10 },
  { id: 'lessons-50', family: 'lesson', n: 50, test: (f) => f.lessonsDone >= 50 },
  { id: 'lessons-100', family: 'lesson', n: 100, test: (f) => f.lessonsDone >= 100 },
  { id: 'streak-3', family: 'streak', n: 3, test: (f) => f.streakBest >= 3 },
  { id: 'streak-7', family: 'streak', n: 7, test: (f) => f.streakBest >= 7 },
  { id: 'streak-30', family: 'streak', n: 30, test: (f) => f.streakBest >= 30 },
  { id: 'streak-100', family: 'streak', n: 100, test: (f) => f.streakBest >= 100 },
  { id: 'perfect-lesson', family: 'perfect', test: (f) => f.perfect },
  { id: 'unit-complete', family: 'unit', test: (f) => f.unitsComplete >= 1 },
  { id: 'words-50', family: 'words', n: 50, test: (f) => f.wordsLearned >= 50 },
  { id: 'words-250', family: 'words', n: 250, test: (f) => f.wordsLearned >= 250 },
  { id: 'words-500', family: 'words', n: 500, test: (f) => f.wordsLearned >= 500 },
  { id: 'words-1000', family: 'words', n: 1000, test: (f) => f.wordsLearned >= 1000 },
  { id: 'goal-week', family: 'goal', n: 7, test: (f) => f.goalRun >= 7 },
  // A 🚩 report that led to a correction (Admin → Inbox → Fix, applied).
  { id: 'bug-hunter', family: 'bug', test: (f) => f.reportsFixed >= 1 },
];
/** One badge per level (pack), named after it: level-<pack id>. */
export const levelBadgeId = (packId) => `level-${packId}`;
export const WORD_LEARNED_STRENGTH = 3;

const vocabIdsCache = new WeakMap();
/** Every vocabulary id of the loaded content (words learned count vocabulary, not sentences). */
export function vocabIds(content) {
  if (!vocabIdsCache.has(content)) {
    vocabIdsCache.set(content, new Set([...content.packs.values()].flatMap((p) => [...p.vocabById.keys()])));
  }
  return vocabIdsCache.get(content);
}

/** Vocabulary items with strength ≥ 3 (optionally of one track). */
export function wordsLearned(db, content, userId, track = null) {
  const vocab = vocabIds(content);
  return db.prepare('SELECT item_id FROM item_strength WHERE user_id = ? AND strength >= ?').pluck().all(userId, WORD_LEARNED_STRENGTH)
    .filter((id) => vocab.has(id) && (!track || id.startsWith(`${track}.`))).length;
}

/** Units and levels (packs) of which every lesson is done. */
export function completedUnitsAndLevels(db, content, userId) {
  const done = new Set(db.prepare('SELECT lesson_id FROM lesson_progress WHERE user_id = ?').pluck().all(userId));
  const units = [];
  const levels = [];
  for (const p of content.packs.values()) {
    if (p.preview) continue;
    let all = true;
    for (const u of p.pack.units) {
      const complete = u.lessons.every((l) => l.extra || done.has(l.id)); // extra lessons are optional
      if (complete) units.push(u.id);
      all &&= complete;
    }
    if (all && p.pack.units.length) levels.push(p.pack.id);
  }
  return { units, levels };
}

/** Everything the badge rules look at. */
export function badgeFacts(db, content, userId) {
  const lessonIds = db.prepare('SELECT lesson_id FROM lesson_progress WHERE user_id = ?').pluck().all(userId);
  const { units, levels } = completedUnitsAndLevels(db, content, userId);
  return {
    lessonsDone: lessonIds.filter((id) => content.lessons.has(id)).length,
    practiceDone: db.prepare('SELECT COUNT(*) FROM practice_sessions WHERE user_id = ? AND finished_at IS NOT NULL').pluck().get(userId),
    streakBest: db.prepare('SELECT streak_best FROM user_stats WHERE user_id = ?').pluck().get(userId) ?? 0,
    perfect: Boolean(db.prepare('SELECT 1 FROM lesson_completions WHERE user_id = ? AND score = 100 LIMIT 1').get(userId)),
    unitsComplete: units.length,
    levelsComplete: levels,
    wordsLearned: wordsLearned(db, content, userId),
    goalRun: longestDayRun(db.prepare('SELECT day FROM daily_goal_days WHERE user_id = ?').pluck().all(userId)),
    reportsFixed: db.prepare("SELECT COUNT(*) FROM content_reports WHERE user_id = ? AND resolution = 'fixed'").pluck().get(userId),
  };
}

/** Badge ids the facts qualify for. */
export function qualifyingBadges(facts) {
  return [...BADGES.filter((b) => b.test(facts)).map((b) => b.id), ...facts.levelsComplete.map(levelBadgeId)];
}

/**
 * Award every badge the user qualifies for and has not got yet. Returns the newly earned ids (in definition order).
 * silent: backfill (never announced).
 */
export function awardBadges(db, content, userId, { now = new Date(), silent = false } = {}) {
  const ids = qualifyingBadges(badgeFacts(db, content, userId));
  const insert = db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id, earned_at, silent) VALUES (?, ?, ?, ?)');
  const earned = [];
  db.transaction(() => {
    for (const id of ids) if (insert.run(userId, id, now.toISOString(), silent ? 1 : 0).changes) earned.push(id);
  })();
  return earned;
}

/** A badge as the client shows it: { id, family, n?, packId?, cefr?, title? }. */
export function describeBadge(content, id) {
  const fixed = BADGES.find((b) => b.id === id);
  if (fixed) return { id, family: fixed.family, ...(fixed.n ? { n: fixed.n } : {}) };
  const packId = id.startsWith('level-') ? id.slice('level-'.length) : null;
  const p = packId ? content.packs.get(packId) : null;
  return p ? { id, family: 'level', packId, track: p.trackId, cefr: p.pack.cefr, title: p.entry.title } : { id, family: 'unknown' };
}

/**
 * The badge grid of the profile: every fixed badge (one set for the learner, across courses) plus the level badges of
 * every course the learner sees (one per available level, earned or not) and any level badge earned in another course.
 * [{ ...describeBadge, track? (level badges), earnedAt|null, count? (unit-complete: units complete) }]
 * tracks: the learner's visible courses, in their order.
 */
export function badgeList(db, content, user, tracks = []) {
  const earned = new Map(db.prepare('SELECT badge_id, earned_at FROM user_badges WHERE user_id = ?').all(user.id).map((r) => [r.badge_id, r.earned_at]));
  const levelPacks = [...content.packs.values()].filter((p) => !p.preview && (tracks.includes(p.trackId) || earned.has(levelBadgeId(p.pack.id))))
    .sort((a, b) => (tracks.indexOf(a.trackId) + 1 || 99) - (tracks.indexOf(b.trackId) + 1 || 99));
  const levelIds = levelPacks.map((p) => levelBadgeId(p.pack.id));
  const units = completedUnitsAndLevels(db, content, user.id).units.length;
  return [...BADGES.map((b) => b.id), ...levelIds].map((id) => ({
    ...describeBadge(content, id),
    earnedAt: earned.get(id) ?? null,
    ...(id === 'unit-complete' ? { count: units } : {}),
  }));
}

/**
 * After migration 005: record the days on which past XP reached the daily goal (the default goal: nobody had chosen
 * one) and award every badge the history already qualifies for, silently. Idempotent.
 * Returns { username: [badge ids] } of what was awarded.
 */
export function backfillGamification(db, content, { now = new Date() } = {}) {
  const out = {};
  const users = db.prepare('SELECT * FROM users ORDER BY id').all();
  for (const u of users) {
    const goal = effectiveDailyGoal(u.daily_goal);
    const byDay = new Map();
    for (const r of activityRows(db, u.id, '2000-01-01')) {
      const d = byDay.get(r.day) ?? { xp: 0, at: r.at };
      d.xp += r.xp;
      if (r.at > d.at) d.at = r.at;
      byDay.set(r.day, d);
    }
    const insert = db.prepare('INSERT OR IGNORE INTO daily_goal_days (user_id, day, goal, xp, reached_at) VALUES (?, ?, ?, ?, ?)');
    for (const [day, d] of byDay) if (d.xp >= goal) insert.run(u.id, day, goal, d.xp, d.at);
    out[u.username] = awardBadges(db, content, u.id, { now, silent: true });
  }
  return out;
}
