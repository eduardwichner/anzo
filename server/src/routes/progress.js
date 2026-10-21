import { Router } from 'express';
import bcrypt from 'bcrypt';
import { answerFits, grade, dictationFeedback } from '../content/grading.js';
import { lookupKey, readLocales } from '../content/instructions.js';
import { answerAudio, answerNotes, attemptItemIds, knownWordsOf } from '../content/loader.js';
import { PLAYABLE_TYPES } from '../content/validate.js';
import { completeLesson, lessonMap, recordAttempt, resetProgress, retiredLessonId } from '../lib/progress.js';
import { getStats } from '../lib/users.js';
import { afterXpEarned } from '../lib/rewards.js';
import { dailyGoalToday } from '../lib/activity.js';
import { practiceSummary } from '../practice/index.js';
import { TEXT_QUESTION_TYPES } from '../practice/select.js';
import { enrolments, learnsTrack, withActiveTrack } from '../lib/courses.js';
import { requireAuth } from '../middleware/requireAuth.js';

/**
 * The reset scope a request asks for, limited to what may be reset: { track } (a whole course; default the active one) or
 * { packId } (one level). A learner resets only courses they see; the admin any course the user is enrolled in (hidden
 * ones too). Returns null when the scope is invalid.
 */
export function parseResetScope(db, content, body, user, { admin = false } = {}) {
  const { scope, packId, track } = body || {};
  const allowed = (t) => (admin ? enrolments(db, user.id).some((e) => e.track === t) : learnsTrack(db, content, user, t));
  if (scope === 'track') {
    const t = typeof track === 'string' && track ? track : withActiveTrack(db, content, user).active_track;
    return t && allowed(t) && [...content.packs.values()].some((p) => p.trackId === t) ? { track: t } : null;
  }
  if (scope === 'pack') {
    const p = typeof packId === 'string' ? content.packs.get(packId) : null;
    return p && allowed(p.trackId) ? { packId } : null;
  }
  return null;
}

// The confirmation word of each interface language (settings.resetWord in client/src/i18n/<lang>.json).
const RESET_WORDS = Object.fromEntries(Object.entries(readLocales()).map(([lang, cat]) => [lang, lookupKey(cat, 'settings.resetWord')]));

export function progressRoutes(ctx) {
  const { db, logger, accounts } = ctx;
  const r = Router();
  r.use('/progress', requireAuth(db));

  // Lessons belong to a course; only a learner who sees that course (a child, or the admin in his own courses) records progress in it.
  const lessonFor = (req, res, lessonId) => {
    const entry = ctx.content.lessons.get(lessonId);
    // a preview pack's lessons do not exist for learners (the admin plays them through /api/admin/preview, storing nothing)
    if (!entry || ctx.content.packs.get(entry.packId)?.preview) {
      res.status(404).json({ error: 'lesson_not_found' });
      return null;
    }
    if (!learnsTrack(db, ctx.content, req.user, entry.trackId)) {
      res.status(403).json({ error: 'forbidden' });
      return null;
    }
    return entry;
  };

  r.get('/progress/me', (req, res) => {
    // today: XP against the daily goal (Home's ring); practice: due words and mistakes (Home's Oefenen button).
    res.json({
      stats: getStats(db, req.user.id),
      lessons: lessonMap(db, req.user.id),
      today: dailyGoalToday(db, req.user),
      practice: practiceSummary(db, ctx.content, withActiveTrack(db, ctx.content, req.user)),
    });
  });

  r.post('/progress/attempt', (req, res) => {
    // firstTry (optional): the client says whether this is the first answer to the exercise in this run of the lesson;
    // startedAt (optional): when this run started, the run's key (item strength moves at most once per item and run).
    const { lessonId, exerciseId, answer, firstTry, startedAt } = req.body || {};
    const lesson = lessonFor(req, res, lessonId);
    if (!lesson) return;
    // Hidden by an admin correction while the lesson was open: let it pass (not recorded, not graded).
    if (ctx.content.retired?.has(exerciseId) && retiredLessonId(exerciseId) === lessonId) return res.json({ correct: true, retired: true });
    const found = ctx.content.exercises.get(exerciseId);
    if (!found || found.lessonId !== lessonId) return res.status(404).json({ error: 'exercise_not_found' });
    if (!PLAYABLE_TYPES.includes(found.exercise.type)) return res.status(400).json({ error: 'exercise_not_playable' });

    if (!answerFits(answer)) return res.status(400).json({ error: 'invalid_answer' });
    const result = grade(found.exercise, answer, { track: found.target, nativeLang: req.user.native_lang, knownWords: knownWordsOf(ctx.content, found.target) });
    recordAttempt(db, {
      userId: req.user.id,
      lessonId,
      exerciseId,
      itemIds: attemptItemIds(found.exercise),
      correct: result.correct,
      givenAnswer: answer,
      firstTry: typeof firstTry === 'boolean' ? firstTry : null,
      run: typeof startedAt === 'string' ? startedAt : null,
      touchOnly: TEXT_QUESTION_TYPES.includes(found.exercise.type),
    });
    res.json({ ...result, ...dictationFeedback(found.exercise, answer, result, { track: found.target, knownWords: knownWordsOf(ctx.content, found.target) }), ...answerAudio(ctx.content, found.packId, found.exercise, ctx.audio), ...answerNotes(ctx.content, found.packId, found.exercise) });
  });

  r.post('/progress/lesson/:lessonId/complete', (req, res) => {
    const lesson = lessonFor(req, res, req.params.lessonId);
    if (!lesson) return;
    const { firstTryCorrect, total, startedAt } = req.body || {};
    // A child who opened the lesson before an exercise of it was hidden (an admin correction) sends the old count.
    // the count now, a count with exercises hidden since the lesson opened, or a count of an earlier load (store.js knownCounts)
    const totalOk = total === lesson.playableCount || (total > lesson.playableCount && total <= lesson.playableCount + (lesson.retiredCount ?? 0))
      || (lesson.knownCounts ?? []).includes(total);
    if (!Number.isInteger(total) || !totalOk ||
        !Number.isInteger(firstTryCorrect) || firstTryCorrect < 0 || firstTryCorrect > total) {
      return res.status(400).json({ error: 'invalid_result', expectedTotal: lesson.playableCount });
    }
    const now = new Date();
    // One transaction: the completion and what follows it (goal day, badges) are stored together or not at all.
    const { result, rewards } = db.transaction(() => {
      const r = completeLesson(db, { userId: req.user.id, lessonId: req.params.lessonId, firstTryCorrect, total, startedAt, now });
      return { result: r, rewards: afterXpEarned(db, ctx.content, req.user, now) };
    })();
    logger.info({ username: req.user.username, lessonId: req.params.lessonId, score: result.score, xp: result.xpEarned,
      badges: rewards.badges.map((b) => b.id) }, 'lesson complete');
    res.json({ ...result, ...rewards, stats: getStats(db, req.user.id) });
  });

  // Self-service reset: only with the admin-granted permission (admins always), the password and the typed word.
  r.post('/progress/reset', async (req, res, next) => {
    try {
      const user = req.user;
      if (user.role !== 'admin' && !user.can_self_reset) return res.status(403).json({ error: 'reset_not_allowed' });
      const scope = parseResetScope(db, ctx.content, req.body, user);
      if (!scope) return res.status(400).json({ error: 'invalid_scope' });
      if (accounts?.blocked(user.id)) return res.status(429).json({ error: 'too_many_attempts' });
      if (!(await bcrypt.compare(String(req.body?.password ?? ''), user.password_hash))) {
        accounts?.fail(user.id);
        return res.status(400).json({ error: 'wrong_password' });
      }
      const word = RESET_WORDS[user.ui_lang] ?? RESET_WORDS.nl;
      if (String(req.body?.confirm ?? '').trim().toUpperCase() !== word.toUpperCase()) {
        return res.status(400).json({ error: 'confirm_mismatch', word });
      }
      const result = resetProgress(db, ctx.content, user.id, scope);
      logger.info({ by: user.username, user: user.username, scope, xpBefore: result.xpBefore, xpAfter: result.xpAfter, deleted: result.deleted }, 'progress reset');
      res.json({ ...result, stats: getStats(db, user.id) });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
