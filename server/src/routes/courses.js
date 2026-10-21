import { Router } from 'express';
import {
  activeTrack, allCourses, canLearn, comingCourses, CourseError, enrol, enrolments, hideCourse, offeredCourses, setActiveTrack, visibleCourses, xpByTrack,
} from '../lib/courses.js';
import { lessonMap } from '../lib/progress.js';
import { findUserById } from '../lib/users.js';
import { requireAuth } from '../middleware/requireAuth.js';

/**
 * A learner's courses as the course sheet (and Admin → Users) shows them:
 * { active, courses: [{ track, target, mascot, startPack, progress: { lessonsDone, lessonsTotal, percent }, xp, hidden?, offered? }],
 *   offered: [{ track, target, mascot, restore }] (offered for the native language and not shown above; restore = was hidden),
 *   soon: [{ track, target, mascot }] (courses for the native language without an available level: Coming soon),
 *   canSelfEnroll, nativeLang }. admin: also hidden courses and enrolments no longer offered (flagged).
 */
export function coursesView(db, content, user, { admin = false } = {}) {
  const done = lessonMap(db, user.id);
  const xp = xpByTrack(db, content, user.id);
  const byTrack = new Map(allCourses(content).map((c) => [c.track, c]));
  const offered = offeredCourses(content, user.native_lang);
  const progress = (track) => {
    // the core levels only: an optional branch never keeps a course below 100 %
    const ids = (byTrack.get(track)?.corePackIds ?? []).flatMap((id) => content.packs.get(id).requiredLessonIds);
    const n = ids.filter((id) => done[id]).length;
    return { lessonsDone: n, lessonsTotal: ids.length, percent: ids.length ? Math.round((100 * n) / ids.length) : 0 };
  };
  const all = enrolments(db, user.id);
  const visible = visibleCourses(db, content, user);
  const shown = admin ? all.filter((e) => byTrack.has(e.track)) : visible;
  const shownVisible = new Set((admin ? all.filter((e) => !e.hidden) : visible).map((e) => e.track));
  return {
    active: activeTrack(db, content, user),
    courses: shown.map((e) => ({
      track: e.track,
      target: byTrack.get(e.track)?.target ?? e.track,
      mascot: byTrack.get(e.track)?.mascot ?? null,
      startPack: e.startPack,
      progress: progress(e.track),
      xp: xp[e.track] ?? 0,
      ...(admin ? { hidden: e.hidden, offered: offered.some((c) => c.track === e.track), enrolledAt: e.enrolledAt } : {}),
    })),
    offered: offered.filter((c) => !shownVisible.has(c.track) && !(admin && all.some((e) => e.track === c.track)))
      .map((c) => ({ track: c.track, target: c.target, mascot: c.mascot, restore: all.some((e) => e.track === c.track) })),
    soon: comingCourses(content, user.native_lang).map((c) => ({ track: c.track, target: c.target, mascot: c.mascot })),
    canSelfEnroll: Boolean(user.can_self_enroll) || user.role === 'admin',
    nativeLang: user.native_lang,
  };
}

// The learner's own courses: list, add (or restore), switch, hide. Adding and hiding need users.can_self_enroll (an admin may always).
export function courseRoutes(ctx) {
  const { db, logger } = ctx;
  const r = Router();
  r.use('/courses', requireAuth(db));

  const handle = (fn) => (req, res, next) => {
    try {
      if (!canLearn(req.user)) return res.status(403).json({ error: 'not_a_learner' });
      fn(req, res);
    } catch (err) {
      if (err instanceof CourseError) return res.status(err.status).json({ error: err.code });
      next(err);
    }
  };
  const view = (req) => coursesView(db, ctx.content, findUserById(db, req.user.id));

  r.get('/courses', handle((req, res) => res.json(view(req))));

  // body { track } → enrol (or restore a hidden course) and make it the active course.
  r.post('/courses', handle((req, res) => {
    if (!req.user.can_self_enroll && req.user.role !== 'admin') return res.status(403).json({ error: 'self_enroll_off' });
    const track = String(req.body?.track ?? '');
    enrol(db, ctx.content, req.user, track, { activate: true });
    logger.info({ username: req.user.username, track }, 'course added');
    res.status(201).json(view(req));
  }));

  // body { track } → switch (follows the learner to every device).
  r.put('/courses/active', handle((req, res) => {
    setActiveTrack(db, ctx.content, req.user, String(req.body?.track ?? ''));
    res.json(view(req));
  }));

  // Hide ("remove"): progress stays; adding the course again restores it.
  r.delete('/courses/:track', handle((req, res) => {
    if (!req.user.can_self_enroll && req.user.role !== 'admin') return res.status(403).json({ error: 'self_enroll_off' });
    hideCourse(db, ctx.content, req.user, req.params.track);
    logger.info({ username: req.user.username, track: req.params.track }, 'course hidden');
    res.json(view(req));
  }));

  return r;
}
