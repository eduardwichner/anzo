import { Router } from 'express';
import { answerFits, grade, dictationFeedback } from '../content/grading.js';
import { answerAudio, answerNotes, attemptItemIds, knownWordsOf } from '../content/loader.js';
import { recordAttempt } from '../lib/progress.js';
import { afterXpEarned } from '../lib/rewards.js';
import { getStats } from '../lib/users.js';
import {
  completePractice, isFirstInSession, openSession, PracticeError, practiceSummary, startPractice,
} from '../practice/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { withActiveTrack } from '../lib/courses.js';

// "Oefenen": spaced practice on exercises of completed lessons (server/src/practice/).
export function practiceRoutes(ctx) {
  const { db, logger } = ctx;
  const r = Router();
  r.use('/practice', requireAuth(db));

  const handle = (fn) => (req, res, next) => {
    try {
      fn(req, res);
    } catch (err) {
      if (err instanceof PracticeError) return res.status(err.status).json({ error: err.code });
      next(err);
    }
  };

  r.get('/practice/summary', handle((req, res) => {
    res.json(practiceSummary(db, ctx.content, withActiveTrack(db, ctx.content, req.user)));
  }));

  // body { mode: 'due' | 'mistakes' } -> { session: { id, mode, exercises: [{ id, lessonId, packId }] } }
  r.post('/practice/start', handle((req, res) => {
    // Practice works on the active course.
    const session = startPractice(db, ctx.content, withActiveTrack(db, ctx.content, req.user), req.body?.mode ?? 'due');
    logger.info({ username: req.user.username, practice: session.id, mode: session.mode, exercises: session.exercises.length,
      qualified: session.qualified, toppedUp: session.toppedUp }, 'practice started');
    res.status(201).json({ session });
  }));

  r.post('/practice/:id/attempt', handle((req, res) => {
    const session = openSession(db, req.user, req.params.id);
    const { exerciseId, answer } = req.body || {};
    if (!session.exerciseIds.includes(exerciseId)) return res.status(404).json({ error: 'exercise_not_found' });
    // Hidden by an admin correction after the session started: it passes (not recorded) and does not count.
    if (ctx.content.retired?.has(exerciseId)) return res.json({ correct: true, retired: true });
    const found = ctx.content.exercises.get(exerciseId);
    if (!found) return res.status(404).json({ error: 'exercise_not_found' });
    if (!answerFits(answer)) return res.status(400).json({ error: 'invalid_answer' });
    const result = grade(found.exercise, answer, { track: found.target, nativeLang: req.user.native_lang, knownWords: knownWordsOf(ctx.content, found.target) });
    recordAttempt(db, {
      userId: req.user.id,
      lessonId: found.lessonId,
      exerciseId,
      itemIds: attemptItemIds(found.exercise),
      correct: result.correct,
      givenAnswer: answer,
      firstTry: isFirstInSession(db, session.id, exerciseId),
      practiceSessionId: session.id,
    });
    res.json({ ...result, ...dictationFeedback(found.exercise, answer, result, { track: found.target, knownWords: knownWordsOf(ctx.content, found.target) }), ...answerAudio(ctx.content, found.packId, found.exercise, ctx.audio), ...answerNotes(ctx.content, found.packId, found.exercise) });
  }));

  // body { startedAt? } -> { xpEarned, score, stats, dailyGoal, badges }
  r.post('/practice/:id/complete', handle((req, res) => {
    const now = new Date();
    const { result, rewards } = db.transaction(() => {
      const r = completePractice(db, req.user, req.params.id, { startedAt: req.body?.startedAt, now, retired: ctx.content.retired });
      return { result: r, rewards: afterXpEarned(db, ctx.content, req.user, now) };
    })();
    logger.info({ username: req.user.username, practice: Number(req.params.id), score: result.score, xp: result.xpEarned,
      badges: rewards.badges.map((b) => b.id) }, 'practice complete');
    res.json({ ...result, ...rewards, stats: getStats(db, req.user.id) });
  }));

  return r;
}
