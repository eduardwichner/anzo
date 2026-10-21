import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { decideRerecord, listRerecords, publicRerecord, queueRerecord, RerecordError } from '../ops/rerecord.js';

// "Record again" (ops/rerecord.js): a new take of one clip, made by the content job, heard and chosen by the admin.
export function rerecordRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.use('/admin/rerecord', requireAuth(db), requireAdmin);
  const handle = (fn) => (req, res, next) => {
    try {
      fn(req, res);
    } catch (err) {
      if (err instanceof RerecordError) return res.status(err.status).json({ error: err.code });
      next(err);
    }
  };

  // ?files=a.mp3,b.mp3 — the requests about those clips (the Inbox card, the item page); without: the latest 50
  r.get('/admin/rerecord', handle((req, res) => {
    const files = typeof req.query.files === 'string' && req.query.files ? req.query.files.split(',').slice(0, 10) : null;
    res.json({ rerecords: listRerecords(ctx, { files }) });
  }));

  // body { file: "en/0123….mp3", reportExercise? } -> 201 { rerecord }
  r.post('/admin/rerecord', handle((req, res) => {
    res.status(201).json({ rerecord: publicRerecord(queueRerecord(ctx, req.user, req.body || {})) });
  }));

  r.post('/admin/rerecord/:id/keep', handle((req, res) => {
    res.json({ rerecord: publicRerecord(decideRerecord(ctx, Number(req.params.id), 'keep')) });
  }));
  // body { heardOk?: true } — Keep old in the Listen check's fix queue: the old file is also marked heard OK
  r.post('/admin/rerecord/:id/drop', handle((req, res) => {
    const heardOkBy = req.body?.heardOk === true ? req.user : null;
    const row = decideRerecord(ctx, Number(req.params.id), 'drop', { heardOkBy });
    res.json({ rerecord: publicRerecord(row), ...(heardOkBy ? { heardOk: row.heardOk } : {}) });
  }));
  return r;
}
