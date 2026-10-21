import { Router } from 'express';

/**
 * What /api/health checks. Content and audio change only at startup or a reload (cheap to recompute per request); the database
 * is asked on every request (SELECT 1 and a read of users). Problems are short plain sentences: no secrets, no stacks.
 */
export function staticProblems({ content, audio }) {
  const problems = [];
  for (const track of content.manifest.tracks) {
    for (const entry of track.packs) {
      if (entry.status === 'available' && !content.packs.has(entry.id)) problems.push(`pack ${entry.id} is available but not loaded`);
    }
  }
  if (!audio?.loaded) problems.push('audio manifest not loaded (run npm run audio:render)');
  else if (audio.missing) problems.push(`${audio.missing} audio clip(s) missing (run npm run audio:render)`);
  if (audio?.expectedError) problems.push(`the clips the lessons need cannot be worked out: ${audio.expectedError} (content/pronunciations.json or content/audio-overrides.json)`);
  return problems;
}

export function dbProblems(db) {
  try {
    if (db.prepare('SELECT 1').pluck().get() !== 1) return ['database did not answer SELECT 1'];
    db.prepare('SELECT COUNT(*) FROM users').pluck().get();
    return [];
  } catch {
    return ['database not readable'];
  }
}

export function healthRoutes(ctx) {
  const { db, config, logger } = ctx;
  const r = Router();
  let lastBad = null;
  // Liveness: the process and its event loop answer. No database, no content — for the reverse proxy and the watchdog, which must
  // never take the app offline or restart it over a missing clip (that is /api/health's job, for monitoring).
  r.get('/live', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true });
  });
  r.get('/health', (req, res) => {
    // Content and audio can be reloaded (SIGHUP), so their part follows the current ctx.content / ctx.audio.
    const problems = [...dbProblems(db), ...staticProblems({ content: ctx.content, audio: ctx.audio })];
    res.setHeader('Cache-Control', 'no-store');
    if (problems.length) {
      // Log each new set of problems once, not every probe.
      const key = problems.join('|');
      if (key !== lastBad) logger?.warn({ problems }, 'health check failing');
      lastBad = key;
      return res.status(503).json({ ok: false, version: config.version, problems });
    }
    lastBad = null;
    res.json({ ok: true, version: config.version, packs: [...ctx.content.packs.keys()] });
  });
  return r;
}
