// Pure XP / streak / item-strength arithmetic. Dates are calendar days in Europe/Amsterdam.

export const TIME_ZONE = 'Europe/Amsterdam';

export const XP_FIRST_TRY = 10;
export const XP_AFTER_RETRY = 5;
export const XP_LESSON_BONUS = 20;

// Practice ("Oefenen"): less per exercise than a lesson, nothing new is learned.
export const XP_PRACTICE_FIRST_TRY = 5;
export const XP_PRACTICE_AFTER_RETRY = 2;
export const XP_PRACTICE_BONUS = 10;

// Daily goal in XP (users.daily_goal): Rustig / Gewoon / Fanatiek. NULL (not chosen yet) counts as the first.
export const DAILY_GOALS = [20, 50, 100];
export const DEFAULT_DAILY_GOAL = 20;

// Lesson / practice durations are clamped to this range (seconds).
export const DURATION_MIN_S = 1;
export const DURATION_MAX_S = 60 * 60;

// next_review_at offset in days, indexed by strength 0..5
export const REVIEW_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30];
export const MAX_STRENGTH = 5;

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar date ('YYYY-MM-DD') of an instant, in Europe/Amsterdam. */
export function amsterdamDate(instant = new Date()) {
  return dayFormatter.format(instant);
}

/** 'YYYY-MM-DD' of the day before the given 'YYYY-MM-DD'. Pure calendar arithmetic. */
export function previousDate(day) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  return t.toISOString().slice(0, 10);
}

/** Streak as it should be shown today: a streak survives only if the last lesson was today or yesterday. */
export function effectiveStreak(stats, today) {
  if (!stats.last_active_date) return 0;
  if (stats.last_active_date === today || stats.last_active_date === previousDate(today)) {
    return stats.streak_current;
  }
  return 0;
}

/** New streak values after completing a lesson on `today`. */
export function streakAfterLesson(stats, today) {
  let current;
  if (stats.last_active_date === today) current = Math.max(stats.streak_current, 1);
  else if (stats.last_active_date === previousDate(today)) current = stats.streak_current + 1;
  else current = 1;
  return {
    streak_current: current,
    streak_best: Math.max(stats.streak_best || 0, current),
    last_active_date: today,
  };
}

export function lessonXp(firstTryCorrect, total) {
  return XP_FIRST_TRY * firstTryCorrect + XP_AFTER_RETRY * (total - firstTryCorrect) + XP_LESSON_BONUS;
}

export function practiceXp(firstTryCorrect, total) {
  return XP_PRACTICE_FIRST_TRY * firstTryCorrect + XP_PRACTICE_AFTER_RETRY * (total - firstTryCorrect) + XP_PRACTICE_BONUS;
}

/**
 * Clamped duration in whole seconds between a start (ISO string from the client) and the end, or null when the start
 * is missing or not a date. 1 s … 60 min: a forgotten open tab does not count as an hour of work.
 */
export function clampedDurationS(startedAt, finishedAt) {
  if (typeof startedAt !== 'string') return null;
  const start = Date.parse(startedAt);
  const end = finishedAt instanceof Date ? finishedAt.getTime() : Date.parse(finishedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const s = Math.round((end - start) / 1000);
  return Math.min(DURATION_MAX_S, Math.max(DURATION_MIN_S, s));
}

/** started_at to store: the end minus the clamped duration (ISO), or null. */
export function clampedStart(startedAt, finishedAt) {
  const d = clampedDurationS(startedAt, finishedAt);
  if (d === null) return null;
  const end = finishedAt instanceof Date ? finishedAt.getTime() : Date.parse(finishedAt);
  return new Date(end - d * 1000).toISOString();
}

export const effectiveDailyGoal = (goal) => (DAILY_GOALS.includes(goal) ? goal : DEFAULT_DAILY_GOAL);

/** 'YYYY-MM-DD' of the day after the given one. */
export function nextDate(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Longest run of consecutive days in a list of 'YYYY-MM-DD' (any order). */
export function longestDayRun(days) {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of sorted) {
    run = prev && nextDate(prev) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function scorePercent(firstTryCorrect, total) {
  return total > 0 ? Math.round((100 * firstTryCorrect) / total) : 0;
}

export function nextStrength(strength, correct) {
  const s = (strength || 0) + (correct ? 1 : -1);
  return Math.min(MAX_STRENGTH, Math.max(0, s));
}

export function nextReviewAt(strength, now = new Date()) {
  return new Date(now.getTime() + REVIEW_INTERVAL_DAYS[strength] * 86_400_000).toISOString();
}
