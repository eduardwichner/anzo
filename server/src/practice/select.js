// Practice selection, pure. Practice reuses existing exercises of lessons the child completed; nothing is generated.
//   targets:  items (vocabulary / sentence ids) due for review (next_review_at <= now), weakest first, plus items
//             answered wrong in the last 7 days
//   matching: an exercise qualifies for a target when its items (with its sentence / listened item) include it;
//             its type should fit the item's strength: 0–1 recognise (multiple choice, listen & choose, match),
//             2–3 assemble (word-bank fill-in, build the sentence), 4–5 produce (typed fill-in, type what you hear);
//             when an item has no exercise of that kind, the nearest kind is used
//   limits:   12 exercises, no exercise twice, at most 2 exercises with the same primary item
//   top-up:   fewer than 6 qualifying → fill up from the most recently completed lessons
//   order:    recognise → assemble → produce, so a session warms up
// "My mistakes": exercises answered wrong (first try) in the last 14 days and not answered right on a first try since.

export const PRACTICE_SIZE = 12;
export const PRACTICE_MIN_QUALIFIED = 6;
export const MAX_PER_PRIMARY = 2;
export const RECENT_WRONG_DAYS = 7;
export const MISTAKE_DAYS = 14;
// Texts: a cloze (and a finite-verb fill-in, a fill_blank) comes back in practice; reading, dialogue, listening and ordering
// exercises do not (they need the whole text and its other questions).
// B2: an open cloze, a word-formation text and a key word transformation come back too (typed: produce); a
// gapped text does not (it needs the whole text).
export const PRACTICE_TYPES = ['multiple_choice', 'listen_choose', 'match_pairs', 'fill_blank', 'build_sentence', 'listen_type', 'cloze',
  'open_cloze', 'word_form', 'transform'];
/**
 * Text exercises that test understanding, not the words of the text: their answers only mark the text's words as seen
 * (`recordAttempt` touchOnly) and never make them "recently wrong".
 */
export const TEXT_QUESTION_TYPES = ['reading', 'dialogue', 'listening', 'order_paragraphs', 'gap_sentence'];

/** 0 recognise, 1 assemble, 2 produce. */
export function exerciseBand(ex) {
  switch (ex.type) {
    case 'multiple_choice':
    case 'listen_choose':
    case 'match_pairs':
      return 0;
    case 'build_sentence':
      return 1;
    case 'fill_blank':
    case 'cloze':
      return ex.options ? 1 : 2;
    case 'listen_type':
    case 'open_cloze':
    case 'word_form':
    case 'transform':
      return 2;
    default:
      return null;
  }
}

/** The band that fits an item strength (0–5). */
export const strengthBand = (strength) => (strength <= 1 ? 0 : strength <= 3 ? 1 : 2);

/** The item an exercise is mainly about: its first item, else what it plays or shows. */
export const primaryItem = (ex) => ex.items?.[0] ?? ex.listen ?? ex.sentenceId ?? null;

/** Every item an attempt at the exercise updates (= attemptItemIds in content/loader.js). */
export function exerciseItems(ex) {
  const ids = [...(ex.items || [])];
  for (const extra of [ex.sentenceId, ex.listen]) if (extra && !ids.includes(extra)) ids.push(extra);
  return ids;
}

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return h >>> 0;
}
/** Deterministic shuffle (tests can repeat a selection; the seed changes per session). */
export function seededShuffle(list, seed) {
  let a = hash(seed);
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Practice targets, in priority order.
 * @param strengths [{ itemId, strength, nextReviewAt }] of the items the child can practise
 * @param recentWrong Set of item ids answered wrong in the last 7 days
 * @returns [{ itemId, strength, due }] — due items and recently wrong items, weakest first, then longest overdue
 */
export function orderTargets(strengths, recentWrong, now) {
  const nowIso = now.toISOString();
  return strengths
    .filter((s) => s.nextReviewAt <= nowIso || recentWrong.has(s.itemId))
    .map((s) => ({ itemId: s.itemId, strength: s.strength, due: s.nextReviewAt <= nowIso, nextReviewAt: s.nextReviewAt }))
    .sort((a, b) => a.strength - b.strength || (a.nextReviewAt < b.nextReviewAt ? -1 : a.nextReviewAt > b.nextReviewAt ? 1 : 0)
      || (a.itemId < b.itemId ? -1 : 1));
}

/**
 * Choose the exercises of a practice session.
 * @param candidates [{ id, exercise, lessonId, completedAt }] playable exercises of completed lessons
 * @param targets    orderTargets(...)
 * @returns {{ exerciseIds: string[], qualified: number, toppedUp: number }}
 */
export function selectPractice({ candidates, targets, seed = '', size = PRACTICE_SIZE, minQualified = PRACTICE_MIN_QUALIFIED, maxPerPrimary = MAX_PER_PRIMARY }) {
  const usable = candidates.filter((c) => PRACTICE_TYPES.includes(c.exercise.type));
  const byItem = new Map();
  for (const c of seededShuffle(usable, `${seed}:candidates`)) {
    for (const it of exerciseItems(c.exercise)) {
      if (!byItem.has(it)) byItem.set(it, []);
      byItem.get(it).push(c);
    }
  }
  const chosen = [];
  const used = new Set();
  const perPrimary = new Map();
  const fits = (c) => !used.has(c.id) && (perPrimary.get(primaryItem(c.exercise)) ?? 0) < maxPerPrimary;
  const take = (c) => {
    chosen.push(c);
    used.add(c.id);
    const p = primaryItem(c.exercise);
    perPrimary.set(p, (perPrimary.get(p) ?? 0) + 1);
  };

  // Up to two passes over the targets: first one exercise per item, then a second one for the weakest.
  for (let pass = 0; pass < 2 && chosen.length < size; pass++) {
    for (const t of targets) {
      if (chosen.length >= size) break;
      const want = strengthBand(t.strength);
      const options = (byItem.get(t.itemId) ?? []).filter(fits);
      if (!options.length) continue;
      // Best: the right kind of exercise, about this very item (primary), else the nearest kind.
      const rank = (c) => Math.abs(exerciseBand(c.exercise) - want) * 2 + (primaryItem(c.exercise) === t.itemId ? 0 : 1);
      const best = options.reduce((a, b) => (rank(b) < rank(a) ? b : a));
      take(best);
    }
  }
  const qualified = chosen.length;

  // Too little due: practise the most recently completed lessons.
  let toppedUp = 0;
  if (qualified < minQualified) {
    const lessons = [...new Set([...usable].sort((a, b) => (a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0)).map((c) => c.lessonId))];
    for (const lessonId of lessons) {
      for (const c of seededShuffle(usable.filter((x) => x.lessonId === lessonId), `${seed}:${lessonId}`)) {
        if (chosen.length >= size) break;
        if (fits(c)) {
          take(c);
          toppedUp++;
        }
      }
      if (chosen.length >= size) break;
    }
  }

  const ordered = chosen.map((c, i) => ({ c, i })).sort((a, b) => exerciseBand(a.c.exercise) - exerciseBand(b.c.exercise) || a.i - b.i);
  return { exerciseIds: ordered.map((x) => x.c.id), qualified, toppedUp };
}

/**
 * "My mistakes": exercises with a wrong first-try answer in the last 14 days and no right first-try answer after it.
 * (A retry inside the same lesson is always right in the end, so only a later first try clears a mistake.)
 * @param attempts [{ exerciseId, correct, firstTry, createdAt }] — current attempts only (not of an older version)
 * @returns exercise ids, most recent mistake first
 */
export function mistakeExerciseIds(attempts, now, { days = MISTAKE_DAYS } = {}) {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const lastWrong = new Map();
  const lastRight = new Map();
  for (const a of attempts) {
    if (!a.firstTry) continue;
    const map = a.correct ? lastRight : lastWrong;
    if (!map.has(a.exerciseId) || map.get(a.exerciseId) < a.createdAt) map.set(a.exerciseId, a.createdAt);
  }
  return [...lastWrong]
    .filter(([id, at]) => at >= since && !(lastRight.get(id) > at))
    .sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0))
    .map(([id]) => id);
}

/** Cap a mistakes list: size, no more than maxPerPrimary per primary item. */
export function capMistakes(ids, exerciseOf, { size = PRACTICE_SIZE, maxPerPrimary = MAX_PER_PRIMARY } = {}) {
  const per = new Map();
  const out = [];
  for (const id of ids) {
    if (out.length >= size) break;
    const ex = exerciseOf(id);
    if (!ex || !PRACTICE_TYPES.includes(ex.type)) continue;
    const p = primaryItem(ex);
    if ((per.get(p) ?? 0) >= maxPerPrimary) continue;
    per.set(p, (per.get(p) ?? 0) + 1);
    out.push(id);
  }
  return out;
}
