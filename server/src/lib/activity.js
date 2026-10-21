// XP and time per calendar day (Europe/Amsterdam), today's XP against the daily goal, and the days the goal was
// reached. SQLite has no time zones: rows are read by instant and grouped by amsterdamDate() here.
import { amsterdamDate, effectiveDailyGoal, previousDate } from './gamification.js';

const DAY_MS = 86_400_000;

/**
 * Completed lessons and practice sessions of a user since `fromDay` (Amsterdam, inclusive), as
 * [{ kind: 'lesson'|'practice', day, xp, at, durationS|null }].
 */
export function activityRows(db, userId, fromDay) {
  // Rows from a day earlier than needed (UTC vs Amsterdam), filtered by the Amsterdam day.
  const since = new Date(Date.parse(`${fromDay}T00:00:00Z`) - DAY_MS).toISOString();
  const lessons = db.prepare(`SELECT xp, completed_at AS at, started_at FROM lesson_completions
                              WHERE user_id = ? AND completed_at >= ? AND lesson_id IS NOT NULL`).all(userId, since);
  const practice = db.prepare(`SELECT xp, finished_at AS at, started_at FROM practice_sessions
                               WHERE user_id = ? AND finished_at IS NOT NULL AND finished_at >= ?`).all(userId, since);
  const dur = (r) => (r.started_at ? Math.round((Date.parse(r.at) - Date.parse(r.started_at)) / 1000) : null);
  return [
    ...lessons.map((r) => ({ kind: 'lesson', xp: r.xp, at: r.at, durationS: dur(r) })),
    ...practice.map((r) => ({ kind: 'practice', xp: r.xp, at: r.at, durationS: dur(r) })),
  ].map((r) => ({ ...r, day: amsterdamDate(new Date(r.at)) })).filter((r) => r.day >= fromDay);
}

/** XP earned on the Amsterdam day of `now` (lessons + practice). */
export function todayXp(db, userId, now = new Date()) {
  const today = amsterdamDate(now);
  return activityRows(db, userId, today).filter((r) => r.day === today).reduce((s, r) => s + r.xp, 0);
}

/** The last `n` Amsterdam days up to today, oldest first. */
export function lastDays(n, now = new Date()) {
  const days = [amsterdamDate(now)];
  while (days.length < n) days.unshift(previousDate(days[0]));
  return days;
}

/** { goal, chosen, xp, reached } for today. */
export function dailyGoalToday(db, user, now = new Date()) {
  const goal = effectiveDailyGoal(user.daily_goal);
  const xp = todayXp(db, user.id, now);
  return { goal, chosen: user.daily_goal != null, xp, reached: xp >= goal };
}

/**
 * After XP was earned: if today's XP reaches the goal and today is not recorded yet, record it.
 * Returns { goal, xp, reached, reachedNow } (reachedNow: true exactly once per day, for the celebration).
 */
export function recordDailyGoal(db, user, now = new Date()) {
  const today = dailyGoalToday(db, user, now);
  let reachedNow = false;
  if (today.reached) {
    reachedNow = db.prepare('INSERT OR IGNORE INTO daily_goal_days (user_id, day, goal, xp, reached_at) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, amsterdamDate(now), today.goal, today.xp, now.toISOString()).changes === 1;
  }
  return { goal: today.goal, xp: today.xp, reached: today.reached, reachedNow };
}

/** The last 7 days: [{ day, xp, reached }] (reached = the goal was reached that day, by the goal of that day). */
export function goalWeek(db, user, now = new Date()) {
  const days = lastDays(7, now);
  const xp = new Map(days.map((d) => [d, 0]));
  for (const r of activityRows(db, user.id, days[0])) if (xp.has(r.day)) xp.set(r.day, xp.get(r.day) + r.xp);
  const reached = new Set(db.prepare('SELECT day FROM daily_goal_days WHERE user_id = ? AND day >= ?').pluck().all(user.id, days[0]));
  return days.map((d) => ({ day: d, xp: xp.get(d), reached: reached.has(d) }));
}
