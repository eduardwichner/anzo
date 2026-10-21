import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { closeGroup, createReport, inboxGroups, markShown, pendingMessages, ReportError } from '../ops/reports.js';

// The children's 🚩 reports, their one-time messages, and Admin → Inbox.
export function reportRoutes(ctx) {
  const { db, logger } = ctx;
  const r = Router();
  const handle = (fn) => (req, res, next) => {
    try {
      fn(req, res);
    } catch (err) {
      if (err instanceof ReportError) return res.status(err.status).json({ error: err.code });
      next(err);
    }
  };

  // body { exerciseId, reason: native|target|audio|other, note? } -> 201 { ok, updated }
  r.post('/reports', requireAuth(db), handle((req, res) => {
    const { report, updated } = createReport(ctx, req.user, req.body);
    logger.info({ username: req.user.username, exerciseId: report.exercise_id, reason: report.reason, updated }, 'content report');
    res.status(updated ? 200 : 201).json({ ok: true, updated });
  }));

  r.get('/messages', requireAuth(db), (req, res) => {
    res.json({ messages: req.user.role === 'child' ? pendingMessages(db, req.user.id) : [] });
  });

  r.post('/messages/:id/shown', requireAuth(db), (req, res) => {
    markShown(db, req.user.id, Number(req.params.id));
    res.status(204).end();
  });

  r.get('/admin/inbox', requireAuth(db), requireAdmin, (req, res) => {
    res.json({ groups: inboxGroups(ctx) });
  });

  // body { action: 'correct' | 'dismiss' | 'fixed', message?: true | string }
  r.post('/admin/inbox/:exerciseId', requireAuth(db), requireAdmin, handle((req, res) => {
    const { action, message } = req.body || {};
    const result = closeGroup(db, req.params.exerciseId, { action, message, content: ctx.content });
    logger.info({ admin: req.user.username, exerciseId: req.params.exerciseId, action: req.body?.action, ...result }, 'reports closed');
    res.json(result);
  }));

  return r;
}
