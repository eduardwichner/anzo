import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { readStatus } from '../ops/spool.js';

// Admin → Listen check → *Before release* (migration 022): new recordings made in an authoring session but not in
// use yet, each heard next to the recording in use — Keep new, Keep old, or Neither — try again (with a note). The sample is
// the spool file status/audio-sample.json ({ name, about, rows: [{ id, track, speed, text, oldFile, newFile, flagsOld?,
// flagsNew? }] }); both files of a row must be in the audio folder. Nothing changes in the app: the next authoring session
// reads the votes and releases (or not).
export const SAMPLE_VOTES = ['new', 'old', 'neither'];
const FILE_RE = /^(en|fr|nl)\/[0-9a-f]{16}\.mp3$/;
const SPEEDS = ['normal', 'slow', 'dialogue-normal', 'dialogue-slow'];
const NOTE_MAX = 300;

export function readSample(config) {
  if (!config.spoolDir) return null;
  const s = readStatus(config.spoolDir, 'audio-sample');
  if (!s || typeof s.name !== 'string' || !Array.isArray(s.rows)) return null;
  const onDisk = (f) => FILE_RE.test(f ?? '') && fs.existsSync(path.join(config.audioDir, f));
  // the spool is an input, not trusted code: a row is shown only when every field has its shape
  const flags = (x) => x === undefined || (Array.isArray(x) && x.every((f) => typeof f === 'string'));
  const ok = (r) => r && typeof r.id === 'string' && typeof r.text === 'string' && SPEEDS.includes(r.speed)
    && typeof r.track === 'string' && onDisk(r.oldFile) && onDisk(r.newFile) && r.oldFile.startsWith(`${r.track}/`)
    && r.newFile.startsWith(`${r.track}/`) && flags(r.flagsOld) && flags(r.flagsNew) && (r.why === undefined || typeof r.why === 'string');
  return { name: s.name, about: typeof s.about === 'string' ? s.about : null, rows: s.rows.filter(ok) };
}

export function sampleRoutes(ctx) {
  const { db, config } = ctx;
  const r = Router();
  r.use('/admin/audio-sample', requireAuth(db), requireAdmin);
  const state = (user) => {
    const sample = readSample(config);
    if (!sample) return { sample: null };
    const votes = db.prepare('SELECT row_id, user_id, vote, note FROM audio_sample_votes WHERE sample = ?').all(sample.name);
    const mine = new Map(votes.filter((v) => v.user_id === user.id).map((v) => [v.row_id, v]));
    const rows = sample.rows.map((row) => ({
      id: row.id, track: row.track, speed: row.speed, text: row.text, why: row.why ?? null,
      oldUrl: `/audio/${row.oldFile}`, newUrl: `/audio/${row.newFile}`, flagsOld: row.flagsOld ?? [], flagsNew: row.flagsNew ?? [],
      vote: mine.get(row.id)?.vote ?? null, note: mine.get(row.id)?.note ?? null,
    }));
    const count = (v) => votes.filter((x) => x.vote === v && rows.some((row) => row.id === x.row_id)).length;
    return { sample: { name: sample.name, about: sample.about, rows, voted: rows.filter((x) => x.vote).length,
      totals: Object.fromEntries(SAMPLE_VOTES.map((v) => [v, count(v)])) } };
  };
  r.get('/admin/audio-sample', (req, res) => res.json(state(req.user)));
  // body { vote: new|old|neither, note? } — one vote per admin and row; voting again replaces it
  r.post('/admin/audio-sample/:rowId', (req, res) => {
    const sample = readSample(config);
    const row = sample?.rows.find((x) => x.id === req.params.rowId);
    if (!row) return res.status(404).json({ error: 'not_found' });
    const { vote, note = null } = req.body ?? {};
    if (!SAMPLE_VOTES.includes(vote)) return res.status(400).json({ error: 'invalid_vote' });
    if (note !== null && typeof note !== 'string') return res.status(400).json({ error: 'invalid_note' });
    db.prepare(`INSERT INTO audio_sample_votes (sample, row_id, user_id, vote, note, voted_at) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (sample, row_id, user_id) DO UPDATE SET vote = excluded.vote, note = excluded.note, voted_at = excluded.voted_at`)
      .run(sample.name, row.id, req.user.id, vote, note?.trim().slice(0, NOTE_MAX) || null, new Date().toISOString());
    return res.json(state(req.user));
  });
  return r;
}
