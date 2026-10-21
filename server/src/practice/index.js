// Practice sessions on the database: what can be practised, starting a session, its attempts and its completion.
// Selection rules: ./select.js. A practice session plays like a lesson but is not tied to one: no lesson_progress row;
// it is a practice_sessions row. XP +5 first try, +2 after a retry, +10 for finishing; it keeps the streak alive;
// item_strength changes exactly as in lessons (recordAttempt).
import { practiceXp, clampedStart, scorePercent } from '../lib/gamification.js';
import { addXpAndStreak } from '../lib/progress.js';
import { canLearn } from '../lib/courses.js';
import {
  capMistakes, mistakeExerciseIds, orderTargets, PRACTICE_TYPES, RECENT_WRONG_DAYS, selectPractice, TEXT_QUESTION_TYPES,
} from './select.js';

const trackItemsCache = new WeakMap();
/** Vocabulary + sentence ids per track. */
function trackItems(content, track) {
  if (!trackItemsCache.has(content)) {
    const m = new Map();
    for (const p of content.packs.values()) {
      if (p.preview) continue; // never a learner's
      if (!m.has(p.trackId)) m.set(p.trackId, { all: new Set(), vocab: new Set() });
      for (const id of p.vocabById.keys()) {
        m.get(p.trackId).all.add(id);
        m.get(p.trackId).vocab.add(id);
      }
      for (const id of p.sentenceById.keys()) m.get(p.trackId).all.add(id);
    }
    trackItemsCache.set(content, m);
  }
  return trackItemsCache.get(content).get(track) ?? { all: new Set(), vocab: new Set() };
}

/**
 * An attempt still describes its exercise: the exercise exists and the attempt is not legacy (attempts.legacy, kept in
 * step with the content by markLegacyAttempts at every start and reload).
 */
export function isCurrentAttempt(content, attempt) {
  return attempt.legacy !== 1 && content.exercises.has(attempt.exercise_id);
}

// Practice works on the learner's active course: `user.active_track` (routes pass the effective one, courses.js activeTrack).

/** Playable exercises of the lessons the learner completed in the active course: [{ id, exercise, lessonId, completedAt }]. */
export function practiceCandidates(db, content, user) {
  const rows = db.prepare('SELECT lesson_id, last_completed_at FROM lesson_progress WHERE user_id = ?').all(user.id);
  const out = [];
  for (const r of rows) {
    const entry = content.lessons.get(r.lesson_id);
    // a level moved back to preview is out of reach for learners (its pack is 404): never practise it
    if (!entry || entry.trackId !== user.active_track || content.packs.get(entry.packId)?.preview) continue;
    for (const exercise of entry.lesson.exercises) {
      if (PRACTICE_TYPES.includes(exercise.type)) out.push({ id: exercise.id, exercise, lessonId: r.lesson_id, completedAt: r.last_completed_at });
    }
  }
  return out;
}

/** Attempts of the learner in the active course that still describe their exercise. */
function currentAttempts(db, content, user, sinceIso) {
  return db.prepare('SELECT * FROM attempts WHERE user_id = ? AND created_at >= ? ORDER BY id').all(user.id, sinceIso)
    .filter((a) => content.exercises.get(a.exercise_id)?.trackId === user.active_track && isCurrentAttempt(content, a));
}

function targetsFor(db, content, user, now) {
  const items = trackItems(content, user.active_track).all;
  const strengths = db.prepare('SELECT item_id, strength, next_review_at FROM item_strength WHERE user_id = ?').all(user.id)
    .filter((r) => items.has(r.item_id))
    .map((r) => ({ itemId: r.item_id, strength: r.strength, nextReviewAt: r.next_review_at }));
  const since = new Date(now.getTime() - RECENT_WRONG_DAYS * 86_400_000).toISOString();
  // a wrong comprehension answer says nothing about the text's words: only exercises that test words count
  const recentWrong = new Set(currentAttempts(db, content, user, since)
    .filter((a) => !a.correct && !TEXT_QUESTION_TYPES.includes(content.exercises.get(a.exercise_id)?.exercise.type))
    .flatMap((a) => JSON.parse(a.item_ids)));
  return orderTargets(strengths, recentWrong, now);
}

/** Exercise ids for "My mistakes" (current attempts only), capped like a session. */
export function mistakeIds(db, content, user, now = new Date(), { capped = true } = {}) {
  const since = new Date(now.getTime() - 15 * 86_400_000).toISOString();
  const attempts = currentAttempts(db, content, user, since)
    .map((a) => ({ exerciseId: a.exercise_id, correct: Boolean(a.correct), firstTry: a.first_try === 1, createdAt: a.created_at }));
  // only what a practice session can play (B1 text questions must not count on the sheet when the session has none)
  const playable = (id) => {
    const found = content.exercises.get(id);
    return found && PRACTICE_TYPES.includes(found.exercise.type) && !content.packs.get(found.packId)?.preview;
  };
  const ids = mistakeExerciseIds(attempts, now).filter(playable);
  return capped ? capMistakes(ids, (id) => content.exercises.get(id)?.exercise) : ids;
}

/**
 * For Home and the practice sheet: { unlocked, due, mistakes }.
 * due = vocabulary items of the active course due for review (the number on the button); mistakes = exercises in "My mistakes".
 */
export function practiceSummary(db, content, user, now = new Date()) {
  if (!canLearn(user) || !user.active_track) return { unlocked: false, due: 0, mistakes: 0 };
  const unlocked = practiceCandidates(db, content, user).length > 0;
  const vocab = trackItems(content, user.active_track).vocab;
  const due = db.prepare('SELECT item_id FROM item_strength WHERE user_id = ? AND next_review_at <= ?').pluck()
    .all(user.id, now.toISOString()).filter((id) => vocab.has(id)).length;
  return { unlocked, due, mistakes: unlocked ? mistakeIds(db, content, user, now, { capped: false }).length : 0 };
}

export class PracticeError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

/**
 * Start a session. mode 'due' (spaced review, topped up from recent lessons) or 'mistakes'.
 * Returns the stored row as { id, mode, exercises: [{ id, lessonId, packId }], qualified, toppedUp }.
 * Throws PracticeError practice_locked (no lesson completed yet) / no_mistakes.
 */
export function startPractice(db, content, user, mode, now = new Date()) {
  if (!canLearn(user) || !user.active_track) throw new PracticeError('forbidden', 403);
  if (!['due', 'mistakes'].includes(mode)) throw new PracticeError('invalid_mode');
  const candidates = practiceCandidates(db, content, user);
  if (!candidates.length) throw new PracticeError('practice_locked', 409);
  let picked;
  if (mode === 'mistakes') {
    const ids = mistakeIds(db, content, user, now);
    if (!ids.length) throw new PracticeError('no_mistakes', 409);
    picked = { exerciseIds: ids, qualified: ids.length, toppedUp: 0 };
  } else {
    const n = db.prepare('SELECT COUNT(*) FROM practice_sessions WHERE user_id = ?').pluck().get(user.id);
    picked = selectPractice({ candidates, targets: targetsFor(db, content, user, now), seed: `${user.id}:${n}` });
  }
  const info = db.prepare(`INSERT INTO practice_sessions (user_id, track, mode, exercise_ids, exercises, started_at)
                           VALUES (?, ?, ?, ?, ?, ?)`)
    .run(user.id, user.active_track, mode, JSON.stringify(picked.exerciseIds), picked.exerciseIds.length, now.toISOString());
  return {
    id: Number(info.lastInsertRowid),
    mode,
    exercises: picked.exerciseIds.map((id) => {
      const f = content.exercises.get(id);
      return { id, lessonId: f.lessonId, packId: f.packId };
    }),
    qualified: picked.qualified,
    toppedUp: picked.toppedUp,
  };
}

/** The user's unfinished session, or a PracticeError. */
export function openSession(db, user, id) {
  const row = db.prepare('SELECT * FROM practice_sessions WHERE id = ? AND user_id = ?').get(Number(id), user.id);
  if (!row) throw new PracticeError('practice_not_found', 404);
  if (row.finished_at) throw new PracticeError('practice_finished', 409);
  return { ...row, exerciseIds: JSON.parse(row.exercise_ids) };
}

/** Is this the first answer to the exercise in this session? */
export function isFirstInSession(db, sessionId, exerciseId) {
  return !db.prepare('SELECT 1 FROM attempts WHERE practice_session_id = ? AND exercise_id = ? LIMIT 1').get(sessionId, exerciseId);
}

/**
 * Complete a session: every exercise must have been answered right at least once in it. First-try results come from
 * the stored attempts. Returns { xpEarned, score, firstTryCorrect, total }.
 */
export function completePractice(db, user, id, { startedAt = null, now = new Date(), retired = new Map() } = {}) {
  const session = openSession(db, user, id);
  // Exercises hidden by an admin correction after the session started neither block it nor count.
  const live = session.exerciseIds.filter((exId) => !retired.has(exId));
  const attempts = db.prepare('SELECT exercise_id, correct, id FROM attempts WHERE practice_session_id = ? ORDER BY id').all(session.id);
  const first = new Map();
  const right = new Set();
  for (const a of attempts) {
    if (!first.has(a.exercise_id)) first.set(a.exercise_id, Boolean(a.correct));
    if (a.correct) right.add(a.exercise_id);
  }
  if (!live.every((exId) => right.has(exId))) throw new PracticeError('practice_incomplete');
  const total = live.length;
  const firstTryCorrect = live.filter((exId) => first.get(exId)).length;
  const xpEarned = practiceXp(firstTryCorrect, total);
  // The client's start time when it is plausible, else the server's; either way clamped to 1 s … 60 min.
  const start = startedAt && Date.parse(startedAt) >= Date.parse(session.started_at) ? startedAt : session.started_at;
  db.transaction(() => {
    addXpAndStreak(db, user.id, xpEarned, now);
    db.prepare('UPDATE practice_sessions SET finished_at = ?, started_at = ?, first_try_correct = ?, xp = ? WHERE id = ?')
      .run(now.toISOString(), clampedStart(start, now), firstTryCorrect, xpEarned, session.id);
  })();
  return { xpEarned, score: scorePercent(firstTryCorrect, total), firstTryCorrect, total };
}
