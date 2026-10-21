// Mascot speech lines: a few numbered variants per mood in the locale files (mascot.<mood>1 … N).
import { t } from '../i18n/index.js';

export const LINE_COUNTS = { idle: 3, sleeping: 3, correct: 4, wrong: 4, celebrate: 3, goal: 2 };

/** A random line of a mood; `pick` (0 ≤ x < 1) makes it deterministic (tests, stable re-renders). */
export function mascotLine(mood, pick = Math.random()) {
  const n = LINE_COUNTS[mood] ?? 1;
  return t(`mascot.${mood}${1 + Math.floor(pick * n)}`);
}

/** Sleeping on Home: nothing done yet today and it is 17:00 or later on this device (streak at risk). */
export const streakAtRisk = (stats, date = new Date()) => !stats.activeToday && date.getHours() >= 17;
