// Attempts, lesson completion and item strength. All writes are transactional.
import {
  amsterdamDate, clampedStart, lessonXp, nextReviewAt, nextStrength, scorePercent, streakAfterLesson,
} from './gamification.js';
import { getStats } from './users.js';

/**
 * Store one graded attempt and update item_strength for every item it exercised.
 * firstTry: the first answer to this exercise in its lesson run / practice session (null = unknown);
 * practiceSessionId: set for attempts made in a practice session; run: the lesson run (the client's startedAt of that run).
 * Within one run (a lesson run or a practice session) an item's strength rises at most once (its first correct answer
 * in the run) and falls at most once (its first wrong answer); a later answer only updates last_seen_at (and keeps
 * next_review_at no earlier than it: a strength-0 item is due from its last sighting). Without a run
 * (an old client) every attempt counts on its own.
 */
export function recordAttempt(db, {
  userId, lessonId, exerciseId, itemIds, correct, givenAnswer, firstTry = null, practiceSessionId = null, run = null, now = new Date(),
  touchOnly = false,
}) {
  const nowIso = now.toISOString();
  const getStrength = db.prepare('SELECT strength FROM item_strength WHERE user_id = ? AND item_id = ?').pluck();
  const upsert = db.prepare(`INSERT INTO item_strength (user_id, item_id, strength, last_seen_at, next_review_at)
                             VALUES (@userId, @itemId, @strength, @now, @next)
                             ON CONFLICT(user_id, item_id) DO UPDATE SET
                               strength = excluded.strength, last_seen_at = excluded.last_seen_at,
                               next_review_at = excluded.next_review_at`);
  const touch = db.prepare(`UPDATE item_strength SET last_seen_at = @now, next_review_at = MAX(next_review_at, @now)
                            WHERE user_id = @userId AND item_id = @itemId`);
  const runKey = typeof run === 'string' && run && run.length <= 40 ? run : null;
  db.transaction(() => {
    // Items already moved in this direction earlier in the same run.
    const earlier = practiceSessionId
      ? db.prepare('SELECT item_ids FROM attempts WHERE user_id = ? AND practice_session_id = ? AND correct = ?').pluck()
        .all(userId, practiceSessionId, correct ? 1 : 0)
      : runKey
        ? db.prepare('SELECT item_ids FROM attempts WHERE user_id = ? AND run = ? AND lesson_id = ? AND practice_session_id IS NULL AND correct = ?')
          .pluck().all(userId, runKey, lessonId, correct ? 1 : 0)
        : [];
    const moved = new Set(earlier.flatMap((j) => JSON.parse(j)));
    db.prepare(`INSERT INTO attempts (user_id, lesson_id, exercise_id, item_ids, correct, given_answer, created_at, first_try, practice_session_id, run)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(userId, lessonId, exerciseId, JSON.stringify(itemIds), correct ? 1 : 0, JSON.stringify(givenAnswer ?? null), nowIso,
        firstTry === null ? null : firstTry ? 1 : 0, practiceSessionId, practiceSessionId ? null : runKey);
    for (const itemId of itemIds) {
      const current = getStrength.get(userId, itemId);
      // touchOnly: a comprehension question or an ordering — the text's words were seen, not tested
      if (touchOnly) {
        if (current !== undefined) touch.run({ now: nowIso, userId, itemId });
        continue;
      }
      if (moved.has(itemId) && current !== undefined) {
        touch.run({ now: nowIso, userId, itemId });
        continue;
      }
      const strength = nextStrength(current ?? 0, correct);
      upsert.run({ userId, itemId, strength, now: nowIso, next: nextReviewAt(strength, now) });
    }
  })();
}

/** Add XP and count today for the streak (lesson or practice). Call inside a transaction. */
export function addXpAndStreak(db, userId, xp, now = new Date()) {
  db.prepare('INSERT OR IGNORE INTO user_stats (user_id) VALUES (?)').run(userId);
  const stats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId);
  const streak = streakAfterLesson(stats, amsterdamDate(now));
  db.prepare(`UPDATE user_stats SET xp = xp + ?, streak_current = ?, streak_best = ?, last_active_date = ?
              WHERE user_id = ?`)
    .run(xp, streak.streak_current, streak.streak_best, streak.last_active_date, userId);
}

/**
 * Record a finished lesson: XP, streak, best score. startedAt: when the lesson started (client, ISO); stored clamped.
 * The same run reported twice (a retry after a lost response: same startedAt) is recorded once: the second call returns
 * the first one's result with duplicate: true and awards nothing.
 * Returns { xpEarned, score, stats, duplicate? }.
 */
export function completeLesson(db, { userId, lessonId, firstTryCorrect, total, startedAt = null, now = new Date() }) {
  const today = amsterdamDate(now);
  const nowIso = now.toISOString();
  const xpEarned = lessonXp(firstTryCorrect, total);
  const score = scorePercent(firstTryCorrect, total);
  const start = clampedStart(startedAt, now);

  const run = typeof startedAt === 'string' && startedAt && startedAt.length <= 40 ? startedAt : null;
  return db.transaction(() => {
    // The same run sent twice (a lost response, a retry): the run key the client sent …
    if (run) {
      const same = db.prepare('SELECT xp, score FROM lesson_completions WHERE user_id = ? AND lesson_id = ? AND run = ? ORDER BY id DESC LIMIT 1')
        .get(userId, lessonId, run);
      if (same) return { xpEarned: same.xp, score: same.score, stats: getStats(db, userId, today), duplicate: true };
    }
    if (start) {
      // … or, for rows from before 012 without a run: stored starts are rounded to the second against each call's own
      // "now", so the same run is within 2 s.
      const same = db.prepare(`SELECT xp, score FROM lesson_completions WHERE user_id = ? AND lesson_id = ? AND started_at IS NOT NULL AND run IS NULL
                               AND abs(julianday(started_at) - julianday(?)) * 86400 < 2 ORDER BY id DESC LIMIT 1`).get(userId, lessonId, start);
      if (same) return { xpEarned: same.xp, score: same.score, stats: getStats(db, userId, today), duplicate: true };
    }
    addXpAndStreak(db, userId, xpEarned, now);
    // user_stats.xp is the running total of these rows (+ practice_sessions.xp); a reset recomputes it from them.
    db.prepare('INSERT INTO lesson_completions (user_id, lesson_id, score, xp, completed_at, started_at, run) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(userId, lessonId, score, xpEarned, nowIso, start, run);
    db.prepare(`INSERT INTO lesson_progress (user_id, lesson_id, status, best_score, times_completed, first_completed_at, last_completed_at)
                VALUES (?, ?, 'done', ?, 1, ?, ?)
                ON CONFLICT(user_id, lesson_id) DO UPDATE SET
                  best_score = MAX(best_score, excluded.best_score),
                  times_completed = times_completed + 1,
                  last_completed_at = excluded.last_completed_at`)
      .run(userId, lessonId, score, nowIso, nowIso);
    return { xpEarned, score, stats: getStats(db, userId, today) };
  })();
}

export function lessonMap(db, userId) {
  const rows = db
    .prepare('SELECT lesson_id, best_score, times_completed, last_completed_at FROM lesson_progress WHERE user_id = ?')
    .all(userId);
  return Object.fromEntries(
    rows.map((r) => [r.lesson_id, { best_score: r.best_score, times_completed: r.times_completed, last_completed_at: r.last_completed_at }]),
  );
}

/**
 * Lessons and items a reset covers. scope: { track: 'en' } (every available pack of the track) or { packId }.
 * Returns null for an unknown pack / a track without packs.
 */
export function resetScopeIds(content, scope) {
  // a whole course: its learners' levels (a preview pack holds no learner progress)
  const packs = [...content.packs.values()].filter((p) => (scope?.packId ? p.pack.id === scope.packId : p.trackId === scope?.track && !p.preview));
  if (!packs.length) return null;
  return {
    packIds: packs.map((p) => p.pack.id),
    lessonIds: packs.flatMap((p) => p.lessonIds),
    itemIds: packs.flatMap((p) => [...p.vocabById.keys(), ...p.sentenceById.keys()]),
  };
}

/** user_stats.xp from its sources: lesson completions + practice sessions. */
export const XP_TOTAL_SQL = `(SELECT COALESCE(SUM(xp), 0) FROM lesson_completions WHERE user_id = @id)
  + (SELECT COALESCE(SUM(xp), 0) FROM practice_sessions WHERE user_id = @id)`;

/**
 * Reset a user's progress in one scope (admin and self-service use this same function):
 * delete lesson_progress, attempts and lesson_completions of the lessons in scope, item_strength of its
 * vocabulary and sentences, and every practice session that practised an exercise of the scope (with its attempts),
 * then recompute XP as the sum of what remains (completions + practice). The streak, the daily-goal days and
 * earned badges are not touched: they count days and achievements, not content. The child's reports (content_reports)
 * of exercises in scope and the messages about them go too. Everything outside the scope (other
 * levels, the other track after a track change) stays. Returns counts and XP before/after.
 */
export function resetProgress(db, content, userId, scope) {
  const ids = resetScopeIds(content, scope);
  if (!ids) throw new Error('unknown reset scope');
  const lessons = JSON.stringify(ids.lessonIds);
  const items = JSON.stringify(ids.itemIds);
  const inList = 'IN (SELECT value FROM json_each(?))';
  const lessonSet = new Set(ids.lessonIds);
  // Exercises hidden by an admin correction are no longer in content.exercises; their id still names their lesson.
  const lessonOfExercise = (exId) => content.exercises.get(exId)?.lessonId ?? (content.retired?.has(exId) ? retiredLessonId(exId) : null);
  return db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO user_stats (user_id) VALUES (?)').run(userId);
    const xpBefore = db.prepare('SELECT xp FROM user_stats WHERE user_id = ?').pluck().get(userId);
    // Practice sessions with any exercise of the scope (a session's XP is not split per exercise).
    const sessions = db.prepare('SELECT id, exercise_ids FROM practice_sessions WHERE user_id = ?').all(userId)
      .filter((ps) => JSON.parse(ps.exercise_ids).some((exId) => lessonSet.has(lessonOfExercise(exId))))
      .map((ps) => ps.id);
    const sessionList = JSON.stringify(sessions);
    const deleted = {
      lessonProgress: db.prepare(`DELETE FROM lesson_progress WHERE user_id = ? AND lesson_id ${inList}`).run(userId, lessons).changes,
      attempts: db.prepare(`DELETE FROM attempts WHERE user_id = ? AND (lesson_id ${inList} OR practice_session_id ${inList})`)
        .run(userId, lessons, sessionList).changes,
      completions: db.prepare(`DELETE FROM lesson_completions WHERE user_id = ? AND lesson_id ${inList}`).run(userId, lessons).changes,
      itemStrength: db.prepare(`DELETE FROM item_strength WHERE user_id = ? AND item_id ${inList}`).run(userId, items).changes,
      practiceSessions: db.prepare(`DELETE FROM practice_sessions WHERE user_id = ? AND id ${inList}`).run(userId, sessionList).changes,
      // The child's reports of exercises in scope, and the one-time messages about them.
      reports: db.prepare(`DELETE FROM content_reports WHERE user_id = ? AND lesson_id ${inList}`).run(userId, lessons).changes,
      messages: db.prepare(`DELETE FROM child_messages WHERE user_id = ? AND exercise_id IN (SELECT value FROM json_each(?))`)
        .run(userId, JSON.stringify([
          ...[...content.exercises.values()].filter((e) => lessonSet.has(e.lessonId)).map((e) => e.exercise.id),
          ...[...(content.retired?.keys() ?? [])].filter((exId) => lessonSet.has(retiredLessonId(exId))),
        ])).changes,
    };
    db.prepare(`UPDATE user_stats SET xp = ${XP_TOTAL_SQL} WHERE user_id = @id`).run({ id: userId });
    const xpAfter = db.prepare('SELECT xp FROM user_stats WHERE user_id = ?').pluck().get(userId);
    return { packIds: ids.packIds, deleted, xpBefore, xpAfter };
  })();
}

/** The lesson of an exercise id (`<lesson id>-eNN`): for retired (hidden) exercises, which the content no longer holds. */
export const retiredLessonId = (exerciseId) => String(exerciseId).replace(/-e\d+$/, '');
