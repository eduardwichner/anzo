import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  adminExercise, CorrectionError, itemDetail, listCorrections, previewEdit, publicCorrection, jobState, queueEdit, queueHide,
  queueUndo, searchContent,
} from '../ops/corrections.js';

// Admin → Corrections: search, item detail with its exercises, preview, queue (edit / hide / undo), history.
export function correctionRoutes(ctx) {
  const { db, config } = ctx;
  const r = Router();
  r.use('/admin/corrections', requireAuth(db), requireAdmin);
  const live = () => ({ content: ctx.content, audio: ctx.audio, contentDir: config.contentDir });

  const handle = (fn) => (req, res, next) => {
    try {
      fn(req, res);
    } catch (err) {
      if (err instanceof CorrectionError) return res.status(err.status).json({ error: err.code, ...err.extra });
      next(err);
    }
  };

  r.get('/admin/corrections/search', handle((req, res) => {
    res.json(searchContent(ctx.content, ctx.audio, req.query.q));
  }));

  r.get('/admin/corrections/item/:id', handle((req, res) => {
    const item = itemDetail(live(), req.params.id);
    if (!item) return res.status(404).json({ error: 'item_not_found' });
    res.json({ item });
  }));

  r.get('/admin/corrections/exercise/:id', handle((req, res) => {
    const exercise = adminExercise(ctx.content, ctx.audio, req.params.id);
    if (!exercise) return res.status(404).json({ error: 'exercise_not_found' });
    res.json({ exercise });
  }));

  // body { id, after: { target?, native?, acceptAlso? } }
  r.post('/admin/corrections/preview', handle((req, res) => {
    res.json(previewEdit(live(), req.body?.id, req.body?.after));
  }));

  // body { id, after, reason?, reportExercise? } -> 201 { correction }
  r.post('/admin/corrections', handle((req, res) => {
    const row = queueEdit(ctx, req.user, req.body || {});
    res.status(201).json({ correction: publicCorrection(row, jobState(config)) });
  }));

  // body { exerciseId, reason, reportExercise? }
  r.post('/admin/corrections/hide', handle((req, res) => {
    const row = queueHide(ctx, req.user, req.body || {});
    res.status(201).json({ correction: publicCorrection(row, jobState(config)) });
  }));

  r.post('/admin/corrections/:id/undo', handle((req, res) => {
    const row = queueUndo(ctx, req.user, Number(req.params.id));
    res.status(201).json({ correction: publicCorrection(row, jobState(config)) });
  }));

  r.get('/admin/corrections', handle((req, res) => {
    res.json(listCorrections(db, config));
  }));

  r.get('/admin/corrections/:id', handle((req, res) => {
    const row = db.prepare('SELECT * FROM content_corrections WHERE id = ?').get(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'correction_not_found' });
    res.json({ correction: publicCorrection(row, jobState(config)) });
  }));

  return r;
}
