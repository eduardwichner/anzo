// One screen per text: the comprehension questions of one text (reading, dialogue, or listening in the review lesson)
// are stepped through under one text or player. Pure; unit-tested from the server (server/test/textSteps.test.js).

export const TEXT_QUESTION_TYPES = new Set(['reading', 'dialogue', 'listening']);

/**
 * The text block an exercise belongs to: the session's exercises of the same text and kind, in play order, and the
 * exercise's place among them ({ textId, kind: 'text' | 'listening', ids, step (1-based), total }), or null for any other
 * exercise. Every question stays its own exercise (scoring, XP, first try, practice); a wrong one comes back at the end
 * of the session under the same text, with its own number.
 */
export function textStep(exercises, exercise) {
  if (!exercise || !exercise.textId || !TEXT_QUESTION_TYPES.has(exercise.type)) return null;
  const listening = exercise.type === 'listening';
  const block = exercises.filter((e) => e.textId === exercise.textId && TEXT_QUESTION_TYPES.has(e.type) && (e.type === 'listening') === listening);
  const index = block.findIndex((e) => e.id === exercise.id);
  return { textId: exercise.textId, kind: listening ? 'listening' : 'text', ids: block.map((e) => e.id), step: index + 1, total: block.length };
}

/** After the first question the text folds away on a phone (it stays one tap away); never on a wide screen. */
export const autoFold = (step, wide) => !wide && step > 1;
