import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { lessonMap, resetProgress } from '../lib/progress.js';
import {
  BCRYPT_COST, countAdmins, createUser, deleteSessions, deleteUser, findUserById, getStats, listUsersWithStats, minPasswordLength, publicUser,
  setPasswordHash, updateUser, validateUserInput,
} from '../lib/users.js';
import { nativeText } from '../content/localized.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { parseResetScope } from './progress.js';
import { progressReport } from '../lib/report.js';
import { AUDIENCES, NATIVE_LANGS } from '../lib/langs.js';
import { CourseError, enrol, enrolments, hideCourse, setActiveTrack, setStartPack, withActiveTrack } from '../lib/courses.js';
import { coursesView } from './courses.js';
import { answerFits, grade, dictationFeedback } from '../content/grading.js';
import { PLAYABLE_TYPES } from '../content/validate.js';
import { answerAudio, answerNotes, knownWordsOf } from '../content/loader.js';

export function adminRoutes(ctx) {
  const { db, config, logger } = ctx;
  const r = Router();
  r.use('/admin', requireAuth(db), requireAdmin);

  const target = (req, res) => {
    const user = findUserById(db, Number(req.params.id));
    if (!user) res.status(404).json({ error: 'user_not_found' });
    return user;
  };
  const withStats = (u) => ({ ...publicUser(withActiveTrack(db, ctx.content, u)), stats: getStats(db, u.id) });
  // The course an admin view is about: ?track= when the user is enrolled in it (hidden too), else the active course.
  const trackParam = (req, user) => {
    const asked = typeof req.query.track === 'string' ? req.query.track : null;
    if (asked && enrolments(db, user.id).some((e) => e.track === asked)) return asked;
    return withActiveTrack(db, ctx.content, user).active_track ?? enrolments(db, user.id)[0]?.track ?? null;
  };

  r.get('/admin/users', (req, res) => {
    // nativeLangs / audiences: the one list (server/src/lib/langs.js) for the forms.
    res.json({ users: listUsersWithStats(db), nativeLangs: NATIVE_LANGS, audiences: AUDIENCES });
  });

  // course (optional, learners and admins alike): { track, startPack? } — the first course, enrolled in the same transaction.
  r.post('/admin/users', (req, res) => {
    const { values, errors, min } = validateUserInput(db, req.body, null);
    if (errors) return res.status(400).json({ error: 'invalid_user', fields: errors, ...(min ? { min } : {}) });
    const course = req.body?.course;
    let user;
    try {
      user = db.transaction(() => {
        const created = createUser(db, values);
        if (course) enrol(db, ctx.content, created, String(course.track ?? ''), { startPack: course.startPack || null });
        return findUserById(db, created.id);
      })();
    } catch (err) {
      if (err instanceof CourseError) return res.status(400).json({ error: 'invalid_user', fields: { course: err.code } });
      throw err;
    }
    logger.info({ admin: req.user.username, username: user.username, role: user.role, course: course?.track ?? null }, 'user created');
    res.status(201).json({ user: withStats(user) });
  });

  r.get('/admin/users/:id', (req, res) => {
    const user = target(req, res);
    if (!user) return;
    res.json({ user: withStats(user) });
  });

  // Edit everything except the username (courses: below). A native-language change keeps every course's progress.
  r.patch('/admin/users/:id', (req, res) => {
    const user = target(req, res);
    if (!user) return;
    const { values, errors, min } = validateUserInput(db, req.body, user);
    if (errors) return res.status(400).json({ error: 'invalid_user', fields: errors, ...(min ? { min } : {}) });
    if (user.role === 'admin' && values.role !== 'admin') {
      if (countAdmins(db) <= 1) return res.status(409).json({ error: 'last_admin' });
      if (user.id === req.user.id) return res.status(409).json({ error: 'cannot_demote_self' });
    }
    const updated = updateUser(db, user, values);
    // A new password logs that account out everywhere (the admin's own current session stays).
    const loggedOut = values.password !== undefined ? deleteSessions(db, user.id, req.sessionID) : 0;
    logger.info({ admin: req.user.username, username: user.username, changed: Object.keys(values).filter((k) => k !== 'password'),
      ...(values.password !== undefined ? { passwordSet: true, loggedOut } : {}) }, 'user updated');
    res.json({ user: withStats(updated) });
  });

  // The admin types the username to confirm. Never the last admin, never yourself.
  r.delete('/admin/users/:id', (req, res) => {
    const user = target(req, res);
    if (!user) return;
    if (user.role === 'admin' && countAdmins(db) <= 1) return res.status(409).json({ error: 'last_admin' });
    if (user.id === req.user.id) return res.status(409).json({ error: 'cannot_delete_self' });
    if (req.body?.confirmUsername !== user.username) return res.status(400).json({ error: 'confirm_mismatch' });
    deleteUser(db, user.id);
    logger.info({ admin: req.user.username, username: user.username }, 'user deleted');
    res.status(204).end();
  });

  r.post('/admin/users/:id/password', async (req, res, next) => {
    try {
      const user = target(req, res);
      if (!user) return;
      const { next: nextPassword } = req.body || {};
      const min = minPasswordLength(user.role);
      if (typeof nextPassword !== 'string' || nextPassword.length < min) {
        return res.status(400).json({ error: 'password_too_short', min });
      }
      setPasswordHash(db, user.id, await bcrypt.hash(nextPassword, BCRYPT_COST), { mustChange: true });
      const loggedOut = deleteSessions(db, user.id, req.sessionID);
      logger.info({ admin: req.user.username, username: user.username, loggedOut }, 'password reset by admin');
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // The courses of one user, as Admin → Users shows them (hidden ones too) + the courses that could be added.
  r.get('/admin/users/:id/courses', (req, res) => {
    const user = target(req, res);
    if (!user) return;
    res.json(coursesView(db, ctx.content, user, { admin: true }));
  });

  // Enrol (or update) one course: body { startPack?: id|null, hidden?: boolean, active?: true }.
  r.put('/admin/users/:id/courses/:track', (req, res) => {
    const user = target(req, res);
    if (!user) return;
    const { track } = req.params;
    const { startPack, hidden, active } = req.body || {};
    try {
      db.transaction(() => {
        const enrolled = enrolments(db, user.id).find((e) => e.track === track);
        if (!enrolled || (enrolled.hidden && hidden === false)) {
          enrol(db, ctx.content, user, track, { startPack: startPack === undefined ? undefined : startPack || null, activate: active === true });
        } else if (startPack !== undefined) setStartPack(db, ctx.content, user.id, track, startPack || null);
        if (hidden === true) hideCourse(db, ctx.content, findUserById(db, user.id), track);
        if (active === true && hidden !== true) setActiveTrack(db, ctx.content, findUserById(db, user.id), track);
      })();
    } catch (err) {
      if (err instanceof CourseError) return res.status(err.status).json({ error: err.code });
      throw err;
    }
    logger.info({ admin: req.user.username, username: user.username, track, startPack, hidden, active }, 'course updated');
    res.json(coursesView(db, ctx.content, findUserById(db, user.id), { admin: true }));
  });

  // Lessons of one course (?track=, default the active course), with done / best score / times played.
  r.get('/admin/users/:id/progress', (req, res) => {
    const user = target(req, res);
    if (!user) return;
    const done = lessonMap(db, user.id);
    const nat = (v) => nativeText(v, user.native_lang);
    const track = trackParam(req, user);
    const packs = [...ctx.content.packs.values()]
      .filter((p) => p.trackId === track && !p.preview) // a learner's levels (a preview pack is played in Admin → Levels)
      .map((p) => ({
        id: p.pack.id,
        cefr: p.pack.cefr,
        title: p.entry.title,
        units: p.pack.units.map((u) => ({
          id: u.id,
          title: nat(u.title),
          lessons: u.lessons.map((l) => ({
            id: l.id,
            title: nat(l.title),
            done: Boolean(done[l.id]),
            ...(l.extra ? { extra: true } : {}), // optional (Extra oefening)
            bestScore: done[l.id]?.best_score ?? null,
            timesCompleted: done[l.id]?.times_completed ?? 0,
          })),
        })),
      }));
    res.json({ user: withStats(user), stats: getStats(db, user.id), track, packs });
  });

  // Read-only learning report: summary, 30 days of activity, accuracy by exercise type, weakest words.
  r.get('/admin/users/:id/report', (req, res) => {
    const user = target(req, res);
    if (!user) return;
    res.json({ user: withStats(user), ...progressReport(db, ctx.content, user, trackParam(req, user)) });
  });

  // body: { scope: 'track', track? } (default: the user's current track) or { scope: 'pack', packId }.
  r.post('/admin/users/:id/progress/reset', (req, res) => {
    const user = target(req, res);
    if (!user) return;
    const scope = parseResetScope(db, ctx.content, req.body, user, { admin: true });
    if (!scope) return res.status(400).json({ error: 'invalid_scope' });
    const result = resetProgress(db, ctx.content, user.id, scope);
    logger.info({ by: req.user.username, user: user.username, scope, xpBefore: result.xpBefore, xpAfter: result.xpAfter, deleted: result.deleted }, 'progress reset');
    res.json({ ...result, stats: getStats(db, user.id) });
  });

  // Admin → Levels → Preview: the admin plays any lesson of any loaded pack (preview packs too) — graded exactly like a
  // learner's answer, and nothing is stored (no attempt, progress, XP, strength or completion).
  r.post('/admin/preview/attempt', (req, res) => {
    const { exerciseId, answer } = req.body || {};
    const found = typeof exerciseId === 'string' ? ctx.content.exercises.get(exerciseId) : null;
    if (!found) return res.status(404).json({ error: 'exercise_not_found' });
    if (!PLAYABLE_TYPES.includes(found.exercise.type)) return res.status(400).json({ error: 'exercise_not_playable' });
    const native = ctx.content.manifest.tracks.find((tr) => tr.id === found.trackId)?.native;
    if (!answerFits(answer)) return res.status(400).json({ error: 'invalid_answer' });
    const result = grade(found.exercise, answer, { track: found.target, nativeLang: native, knownWords: knownWordsOf(ctx.content, found.target) });
    res.json({ ...result, ...dictationFeedback(found.exercise, answer, result, { track: found.target, knownWords: knownWordsOf(ctx.content, found.target) }), ...answerAudio(ctx.content, found.packId, found.exercise, ctx.audio), ...answerNotes(ctx.content, found.packId, found.exercise), preview: true });
  });

  // Admin → Voices: read-only info. One voice per language (content/voices.json), its licence as stated in
  // its MODEL_CARD (models/manifest.json) and a sample sentence rendered like any lesson clip.
  r.get('/admin/voices', (req, res) => {
    let models = { voices: [] };
    try {
      models = JSON.parse(fs.readFileSync(path.join(config.modelsDir, 'manifest.json'), 'utf8'));
    } catch {
      /* no models manifest: licence unknown */
    }
    const modelByName = new Map(models.voices.map((v) => [v.name, v]));
    const tracks = Object.entries(ctx.audio?.voices ?? {}).map(([track, cfg]) => {
      const m = modelByName.get(cfg.voice);
      return {
        track,
        voice: cfg.voice,
        licence: m?.licence ?? null,
        licenceAssessment: m?.licenceAssessment ?? 'unclear',
        dataset: m?.dataset ?? null,
        lengthScale: cfg.lengthScale,
        slowLengthScale: cfg.slowLengthScale,
        sample: cfg.sample ? { text: cfg.sample, url: ctx.audio.url(track, 'normal', cfg.sample) } : null,
        // the second voice: speaker B of a dialogue
        dialogue: cfg.dialogue ? {
          voice: cfg.dialogue.voice,
          speakerName: cfg.dialogue.speakerName ?? null,
          licence: modelByName.get(cfg.dialogue.voice)?.licence ?? null,
          licenceAssessment: modelByName.get(cfg.dialogue.voice)?.licenceAssessment ?? 'unclear',
          sample: cfg.dialogue.sample ? { text: cfg.dialogue.sample, url: ctx.audio.url(track, 'dialogue-normal', cfg.dialogue.sample) } : null,
        } : null,
      };
    });
    res.json({ tracks });
  });

  return r;
}
