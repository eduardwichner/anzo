import { Router } from 'express';
import { packPath, publicPack } from '../content/loader.js';
import { lessonMap } from '../lib/progress.js';
import { activeTrack, canLearn, learnsTrack, visibleCourses } from '../lib/courses.js';
import { requireAuth } from '../middleware/requireAuth.js';

/**
 * Manifest merged with the caller's progress. A learner gets the courses they see (enrolled, not hidden, offered for
 * their native language), in enrolment order, and `active` (the course being played); an admin every track (Levels,
 * with preview rows), or with `learnerView` (his own Home: ?mine=1) exactly what a learner gets.
 */
export function tracksForUser(content, db, user, { learnerView = false } = {}) {
  const learner = user.role !== 'admin' || learnerView;
  const done = canLearn(user) ? lessonMap(db, user.id) : {};
  const mine = learner ? visibleCourses(db, content, user) : null;
  const byId = new Map(content.manifest.tracks.map((t) => [t.id, t]));
  const chosen = mine ? mine.map((e) => byId.get(e.track)).filter(Boolean) : content.manifest.tracks;
  const tracks = chosen
    .map((t) => ({
      id: t.id,
      target: t.target ?? t.id,
      name: t.name,
      native: t.native,
      mascot: t.mascot,
      ...(mine ? { startPack: mine.find((e) => e.track === t.id)?.startPack ?? null } : {}),
      packs: t.packs.map((entry) => {
        // a preview pack (Admin → Levels → Preview) is shown to a learner as the roadmap row it was before
        const status = entry.status === 'preview' && learner ? 'roadmap' : entry.status;
        const out = { id: entry.id, cefr: entry.cefr, title: entry.title, status, ...(entry.branch ? { branch: true, after: entry.after } : {}) };
        const loaded = content.packs.get(entry.id);
        if (entry.status === 'available' && loaded) {
          const lessonsDone = loaded.requiredLessonIds.filter((id) => done[id]).length;
          const lessonsTotal = loaded.requiredLessonIds.length;
          out.progress = { lessonsDone, lessonsTotal, percent: lessonsTotal ? Math.round((100 * lessonsDone) / lessonsTotal) : 0 };
        }
        return out;
      }),
    }));
  return { tracks, active: canLearn(user) ? activeTrack(db, content, user) : null };
}

export function contentRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.use('/content', requireAuth(db));

  // contentVersion changes with every content (re)load: the client drops its cached packs when it does, so an exercise
  // hidden or corrected by the admin never lingers in an open app.
  r.get('/content/tracks', (req, res) => {
    const st = ctx.store?.status?.() ?? {};
    res.json({ ...tracksForUser(ctx.content, db, req.user, { learnerView: req.query.mine === '1' }), contentVersion: `${st.generation ?? 1}:${st.loadedAt ?? ''}` });
  });

  /** The pack the user may open (a preview pack does not exist for a learner) and its meaning language, or an answer sent. */
  const packFor = (req, res) => {
    const loaded = ctx.content.packs.get(req.params.id);
    const admin = req.user.role === 'admin';
    if (!loaded || (loaded.preview && !admin)) {
      res.status(404).json({ error: 'pack_not_found' });
      return null;
    }
    if (req.user.role === 'child' && !learnsTrack(db, ctx.content, req.user, loaded.trackId)) {
      res.status(403).json({ error: 'forbidden' });
      return null;
    }
    // the admin sees a pack in its course's meaning language (Dutch for English and French, English for Dutch)
    const nativeLang = admin ? ctx.content.manifest.tracks.find((t) => t.id === loaded.trackId)?.native ?? req.user.native_lang : req.user.native_lang;
    return { loaded, nativeLang };
  };

  r.get('/content/packs/:id', (req, res) => {
    const found = packFor(req, res);
    if (found) res.json(publicPack(ctx.content, req.params.id, { audio: ctx.audio, nativeLang: found.nativeLang }));
  });

  // What the Home path needs of a pack — units and lessons with titles, icons and `extra` — a few KB instead of the whole
  // pack (parsing every full pack of the course would be 3.8 MB of JSON for English).
  r.get('/content/packs/:id/path', (req, res) => {
    const found = packFor(req, res);
    if (found) res.json(packPath(ctx.content, req.params.id, { nativeLang: found.nativeLang }));
  });

  return r;
}
