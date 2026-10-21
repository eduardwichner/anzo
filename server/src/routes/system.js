import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { collectSystem, gitCommit, problemsView } from '../ops/system.js';
import { buildDiagnostics } from '../ops/diagnostics.js';
import { acknowledgeProblems, lastLines } from '../ops/logs.js';
import { openReportCount } from '../ops/reports.js';

// Admin home summary, Admin → System, and "Copy diagnostics". Read-only: files the service may read itself
// (spool status files, logs, the backup folder) — never a privileged command.
export function systemRoutes(ctx) {
  const { db, config } = ctx;
  const r = Router();
  const live = () => ({ db, config, store: ctx.store, proxy: ctx.proxy });

  r.get('/admin/summary', requireAuth(db), requireAdmin, (req, res) => {
    const sys = collectSystem(live(), { withProblems: false });
    res.json({
      openReports: openReportCount(db),
      queuedCorrections: db.prepare("SELECT COUNT(*) FROM content_corrections WHERE status = 'queued'").pluck().get(),
      systemLevel: sys.level,
    });
  });

  r.get('/admin/system', requireAuth(db), requireAdmin, (req, res) => {
    res.json(collectSystem(live()));
  });

  // body { key } (one problem) | { all: true } (every problem shown): hidden until it is logged again. The logs stay as
  // they are; problem_acks remembers (migration 011).
  r.post('/admin/system/problems/ack', requireAuth(db), requireAdmin, (req, res) => {
    const { problems } = problemsView(db, config);
    const all = req.body?.all === true;
    const key = typeof req.body?.key === 'string' ? req.body.key : null;
    if (!all && !key) return res.status(400).json({ error: 'invalid_ack' });
    const chosen = all ? problems : problems.filter((p) => p.key === key);
    if (!chosen.length) return res.status(404).json({ error: 'problem_not_found' });
    acknowledgeProblems(db, chosen, req.user.username);
    ctx.logger.info({ by: req.user.username, acknowledged: chosen.length, all }, 'problems acknowledged');
    res.json(problemsView(db, config));
  });

  r.get('/admin/system/diagnostics', requireAuth(db), requireAdmin, (req, res) => {
    const sys = collectSystem(live());
    const health = sys.tiles.find((t) => t.id === 'health').data;
    const failed = db.prepare("SELECT id, kind, summary, result_reason, detail, finished_at FROM content_corrections WHERE status = 'rejected' ORDER BY id DESC LIMIT 1").get();
    const now = new Date();
    const text = buildDiagnostics({
      generatedAt: now.toISOString(),
      version: config.version,
      commit: gitCommit(config.rootDir)?.hash,
      health: health.ok ? { ok: true, version: config.version, packs: [...ctx.content.packs.keys()] } : { ok: false, version: config.version, problems: health.problems },
      tiles: sys.tiles.map((t) => ({ id: t.id, level: t.level, data: t.data })),
      problems: sys.problems,
      acknowledged: sys.acknowledged,
      failedJob: failed ?? null,
      disk: sys.tiles.find((t) => t.id === 'disk').data,
      backupLines: lastLines(config.logDir, 'backup.log', 10),
      fullBackupLines: lastLines(config.logDir, 'full-backup.log', 10),
      restarts: sys.restarts,
    }, { secrets: [config.sessionSecret] });
    const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
    res.json({ text, bytes: Buffer.byteLength(text), filename: `anzo-diagnostics-${stamp}.txt` });
  });

  return r;
}
