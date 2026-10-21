// What follows every completion (lesson or practice): today's daily goal, then badges (goal-week depends on the
// recorded goal days). The completion response carries both so the client can celebrate.
import { recordDailyGoal } from './activity.js';
import { awardBadges, describeBadge } from './badges.js';

/** Returns { dailyGoal: { goal, xp, reached, reachedNow }, badges: [describeBadge…] (newly earned) }. */
export function afterXpEarned(db, content, user, now = new Date()) {
  const dailyGoal = recordDailyGoal(db, user, now);
  const badges = awardBadges(db, content, user.id, { now }).map((id) => describeBadge(content, id));
  return { dailyGoal, badges };
}
