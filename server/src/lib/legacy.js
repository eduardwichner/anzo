// attempts.legacy (migration 006): 1 = the attempt answered an earlier version of its exercise. An exercise id keeps its
// meaning (the id lock), but an admin correction may deliberately change an exercise's items (locked with a reason),
// and French exercise ids were renumbered once. Such attempts still count for the lesson, XP and word strengths
// (keyed on lesson and item ids); exercise-level views (My mistakes, accuracy) skip them. The flag is recomputed from
// the content at every start and every content reload, in both directions (an undo makes an attempt current again).
import { attemptItemIds } from '../content/loader.js';

/** The attempt's stored items differ from the exercise's items now (same set = same exercise). */
export function itemsDiffer(exercise, storedJson) {
  let stored;
  try {
    stored = JSON.parse(storedJson);
  } catch {
    return true;
  }
  const now = attemptItemIds(exercise);
  return !Array.isArray(stored) || stored.length !== now.length || !now.every((id) => stored.includes(id));
}

/** Whether an attempt should be legacy under `content`: its exercise has other items now, or was retired (hidden). */
export function isLegacy(content, attempt) {
  const found = content.exercises.get(attempt.exercise_id);
  if (found) return itemsDiffer(found.exercise, attempt.item_ids);
  return Boolean(content.retired?.has(attempt.exercise_id));
}

/** Recompute attempts.legacy for every attempt. Returns { total, legacy, marked, cleared }. */
export function markLegacyAttempts(db, content) {
  const rows = db.prepare('SELECT id, exercise_id, item_ids, legacy FROM attempts').all();
  const set = db.prepare('UPDATE attempts SET legacy = ? WHERE id = ?');
  let marked = 0;
  let cleared = 0;
  let legacy = 0;
  db.transaction(() => {
    for (const a of rows) {
      const now = isLegacy(content, a) ? 1 : 0;
      legacy += now;
      if (now === a.legacy) continue;
      set.run(now, a.id);
      if (now) marked += 1;
      else cleared += 1;
    }
  })();
  return { total: rows.length, legacy, marked, cleared };
}
