import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { LISTEN_REASONS, listenPool, listenQueue, listenStats, nextClip } from '../lib/listen.js';
import { audioQuality } from '../lib/quality.js';
import { readStatus } from '../ops/spool.js';

// Admin → Listen check: one clip of the live audio at a time, marked OK or Bad; the
// Audio quality table (lib/quality.js), the error rate per stratum with its 95 % upper bound, and the fix queue (lib/listen.js;
// table listen_checks, migration 016). Admins only. One account can do it in many short sittings: nothing is kept but the
// verdicts, so it resumes by itself.
const NOTE_MAX = 300;

export function listenRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  const rows = () => db.prepare('SELECT * FROM listen_checks ORDER BY id').all();
  const clipJson = (c) => (c ? { file: c.file, url: `/audio/${c.file}`, track: c.track, speed: c.speed, text: c.text, kind: c.kind,
    rerendered: c.rerendered, again: Boolean(c.again) } : null);
  const quality = (pool, all) => audioQuality(all, pool, ctx.config.spoolDir ? readStatus(ctx.config.spoolDir, 'audio-check') : null);
  const state = () => {
    const pool = listenPool(ctx.content, ctx.audio);
    const all = rows();
    const queue = listenQueue(all, pool);
    return {
      quality: quality(pool, all),
      strata: listenStats(all, pool),
      queue: { waiting: queue.waiting.length, again: queue.again.length, fixed: queue.fixed.length,
        // the clips heard Bad whose file is still the one heard (Record again on each)
        waitingClips: queue.waiting.slice(0, 50).map((c) => ({ file: c.file, url: `/audio/${c.file}`, track: c.track, speed: c.speed,
          text: c.text, reason: c.reason ?? null, note: c.note ?? null, heardAt: c.heardAt ?? null })) },
      heard: all.length,
      next: clipJson(nextClip(all, pool)),
    };
  };

  r.get('/admin/listen', requireAuth(db), requireAdmin, (req, res) => res.json(state()));
  // the Audio quality numbers alone (Admin → Corrections shows a one-line summary)
  r.get('/admin/listen/quality', requireAuth(db), requireAdmin, (req, res) => res.json(quality(listenPool(ctx.content, ctx.audio), rows())));

  // body { file, verdict: ok|bad, reason?, note? } — the clip must be one of the live audio's playable clips
  r.post('/admin/listen', requireAuth(db), requireAdmin, (req, res) => {
    const { file, verdict, reason = null, note = null } = req.body ?? {};
    const clip = listenPool(ctx.content, ctx.audio).byFile.get(file);
    if (!clip) return res.status(404).json({ error: 'not_found' });
    if (verdict !== 'ok' && verdict !== 'bad') return res.status(400).json({ error: 'invalid_verdict' });
    if (reason !== null && (verdict !== 'bad' || !LISTEN_REASONS.includes(reason))) return res.status(400).json({ error: 'invalid_reason' });
    if (note !== null && (typeof note !== 'string' || verdict !== 'bad')) return res.status(400).json({ error: 'invalid_note' });
    db.prepare(`INSERT INTO listen_checks (user_id, file, track, speed, text, kind, rerendered, verdict, reason, note, heard_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(req.user.id, clip.file, clip.track, clip.speed, clip.text, clip.kind, clip.rerendered ? 1 : 0, verdict, reason,
        note?.trim().slice(0, NOTE_MAX) || null, new Date().toISOString());
    return res.json(state());
  });

  return r;
}
