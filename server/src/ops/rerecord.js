// "Record again": an admin hears a bad clip (a child's audio report in the Inbox, or Corrections) and asks for a
// new recording of that one clip — no AI, no developer session. The service only queues (spool request
// requests/rerecord-NNNNNN.json, table clip_rerecords, migration 017); the content job (scripts/jobs/rerecord-lib.js, the
// developer account) renders the next take with the current method, checks it, and returns old and new for the admin to hear:
//   making → review → (Keep new) keeping → kept   — the take is written to content/audio-overrides.json, committed, reloaded
//                   → (Keep old) dropping → dropped — the new file is deleted; nothing else changed
//   any step that fails → failed (with the reason in plain English)
// With config.jobRunner === 'stub' (e2e only) the "new" take is the old file and every step completes at once.
import fs from 'node:fs';
import path from 'node:path';
import { spoolPaths, writeJsonAtomic } from './spool.js';
import { listenPool } from '../lib/listen.js';

export class RerecordError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const nowIso = () => new Date().toISOString();
const FILE_RE = /^[a-z]{2}\/[0-9a-f]{16}\.mp3$/;
const OPEN = ['making', 'review', 'keeping', 'dropping'];
export const rerecordRequestFile = (id) => `rerecord-${String(id).padStart(6, '0')}.json`;

/** The clip the live audio plays from `file` (ctx.audio.clips): { file, track, speed, text } or null. */
export function liveClip(audio, file) {
  if (typeof file !== 'string' || !FILE_RE.test(file)) return null;
  return audio?.clips?.find((c) => c.file === file) ?? null;
}

const parse = (s) => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};

export function publicRerecord(row) {
  return {
    id: row.id,
    author: row.author,
    track: row.track,
    speed: row.speed,
    text: row.text,
    oldFile: row.old_file,
    newFile: row.new_file,
    oldUrl: `/audio/${row.old_file}`,
    newUrl: row.new_file ? `/audio/${row.new_file}` : null,
    flagsOld: parse(row.flags_old) ?? [],
    flagsNew: parse(row.flags_new) ?? [],
    status: row.status,
    reason: row.result_reason,
    commit: row.commit_hash,
    reportExercise: row.report_exercise,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

const get = (db, id) => db.prepare('SELECT * FROM clip_rerecords WHERE id = ?').get(id);

/** Hand a phase of a request to the job, or (e2e) complete it at once. */
function dispatch(ctx, row, phase) {
  const { config, db, logger } = ctx;
  if (config.jobRunner === 'stub') {
    const result = phase === 'make'
      ? { id: row.id, phase, status: 'review', newFile: row.old_file, flagsOld: [], flagsNew: [], entry: { take: 2 }, unpin: false,
        reason: 'Made by the test runner (no files changed).' }
      : { id: row.id, phase, status: phase === 'keep' ? 'kept' : 'dropped', commit: phase === 'keep' ? 'stub' : null,
        reason: 'Done by the test runner (no files changed).' };
    recordRerecordResult(ctx, result);
    return get(db, row.id);
  }
  const req = {
    kind: 'rerecord', phase, id: row.id, author: row.author, track: row.track, speed: row.speed, text: row.text, oldFile: row.old_file,
    ...(phase !== 'make' ? { newFile: row.new_file, entry: parse(row.entry_json), unpin: Boolean(row.unpin) } : {}),
  };
  try {
    writeJsonAtomic(path.join(spoolPaths(config.spoolDir).requests, rerecordRequestFile(row.id)), req);
  } catch (err) {
    db.prepare("UPDATE clip_rerecords SET status = 'failed', result_reason = ?, detail = ?, finished_at = ? WHERE id = ?")
      .run('The request could not be handed to the content job (the spool is not writable).', String(err.message), nowIso(), row.id);
    logger?.error({ rerecord: row.id, err: err.message }, 'record again could not be queued');
    throw err;
  }
  logger?.info({ rerecord: row.id, phase, track: row.track, speed: row.speed }, 'record again queued');
  return get(db, row.id);
}

/** body { file, reportExercise? } — the clip must be one the app plays now; one open request per clip. */
export function queueRerecord(ctx, user, { file, reportExercise } = {}) {
  const clip = liveClip(ctx.audio, file);
  if (!clip) throw new RerecordError('clip_not_found', 404);
  const { db } = ctx;
  const open = db.prepare(`SELECT 1 FROM clip_rerecords WHERE track = ? AND speed = ? AND text = ? AND status IN (${OPEN.map(() => '?').join(', ')})`)
    .get(clip.track, clip.speed, clip.text, ...OPEN);
  if (open) throw new RerecordError('already_open', 409);
  const ex = typeof reportExercise === 'string' && ctx.content?.exercises?.has(reportExercise) ? reportExercise : null;
  const info = db.prepare(`INSERT INTO clip_rerecords (author, track, speed, text, old_file, report_exercise, created_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?)`).run(user.username, clip.track, clip.speed, clip.text, clip.file, ex, nowIso());
  return dispatch(ctx, get(db, info.lastInsertRowid), 'make');
}

/**
 * Keep new (`keep`) or keep old (`drop`): only for a request whose new take waits for review. `heardOkBy` (the admin,
 * on Keep old in the Listen check's fix queue) also records an OK verdict for the old file — the admin heard both and chose it,
 * so it leaves the queue; *Neither — try again* is a plain `drop`: the new take goes, the old file stays, and so does its Bad.
 */
export function decideRerecord(ctx, id, decision, { heardOkBy = null } = {}) {
  const row = get(ctx.db, id);
  if (!row) throw new RerecordError('not_found', 404);
  if (row.status !== 'review') throw new RerecordError('not_in_review', 409);
  if (decision !== 'keep' && decision !== 'drop') throw new RerecordError('invalid_decision');
  const clip = heardOkBy && decision === 'drop' ? listenPool(ctx.content, ctx.audio).byFile.get(row.old_file) ?? null : null;
  ctx.db.prepare('UPDATE clip_rerecords SET status = ? WHERE id = ?').run(decision === 'keep' ? 'keeping' : 'dropping', id);
  const result = dispatch(ctx, get(ctx.db, id), decision);
  // the OK verdict only once the job has the request (a failed hand-over would leave a verdict for a choice never made);
  // `heardOk` says whether it was written (the old file is no longer a clip the app plays: not written)
  let heardOk = false;
  if (clip && result.status !== 'failed') {
    ctx.db.prepare(`INSERT INTO listen_checks (user_id, file, track, speed, text, kind, rerendered, verdict, reason, note, heard_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'ok', NULL, NULL, ?)`)
      .run(heardOkBy.id, clip.file, clip.track, clip.speed, clip.text, clip.kind, clip.rerendered ? 1 : 0, nowIso());
    heardOk = true;
  }
  return heardOkBy ? { ...result, heardOk } : result;
}

/** Record a job result ({ id, phase, status: review | kept | dropped | failed, … }); a result seen twice changes nothing. */
export function recordRerecordResult(ctx, result) {
  const { db, logger } = ctx;
  const row = get(db, result.id);
  if (!row) return null;
  const expect = { make: 'making', keep: 'keeping', drop: 'dropping' }[result.phase];
  if (row.status !== expect) return row;
  const at = result.finishedAt ?? nowIso();
  if (result.status === 'review' && result.phase === 'make') {
    db.prepare(`UPDATE clip_rerecords SET status = 'review', new_file = ?, entry_json = ?, unpin = ?, flags_old = ?, flags_new = ?,
                result_reason = ?, detail = ?, finished_at = ? WHERE id = ?`)
      .run(result.newFile, JSON.stringify(result.entry ?? null), result.unpin ? 1 : 0, JSON.stringify(result.flagsOld ?? []),
        JSON.stringify(result.flagsNew ?? []), result.reason ?? null, result.detail ? String(result.detail).slice(0, 20000) : null, at, row.id);
  } else if ((result.status === 'kept' && result.phase === 'keep') || (result.status === 'dropped' && result.phase === 'drop')) {
    db.prepare('UPDATE clip_rerecords SET status = ?, commit_hash = ?, result_reason = ?, finished_at = ? WHERE id = ?')
      .run(result.status, result.commit ?? null, result.reason ?? null, at, row.id);
  } else {
    // a failed Keep new leaves the clip as it was: the request can be decided again (back to review), a failed take is over
    const status = result.phase === 'make' ? 'failed' : 'review';
    db.prepare('UPDATE clip_rerecords SET status = ?, result_reason = ?, detail = ?, finished_at = ? WHERE id = ?')
      .run(status, result.reason ?? 'The content job could not do it.', result.detail ? String(result.detail).slice(0, 20000) : null, at, row.id);
  }
  logger?.info({ rerecord: row.id, phase: result.phase, status: result.status, reason: result.reason }, 'record again: job result');
  return get(db, row.id);
}

/** Read the job's re-record results from the spool (results/rerecord-NNNNNN.json), record them, move them to processed/. */
export function collectRerecordResults(ctx) {
  const { results, processed } = spoolPaths(ctx.config.spoolDir);
  let files = [];
  try {
    files = fs.readdirSync(results).filter((f) => /^rerecord-\d+\.json$/.test(f)).sort();
  } catch {
    return 0;
  }
  for (const f of files) {
    const file = path.join(results, f);
    try {
      recordRerecordResult(ctx, JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (err) {
      ctx.logger?.error({ file: f, error: err.message }, 'cannot read a record-again result');
    }
    try {
      fs.renameSync(file, path.join(processed, `${path.basename(f, '.json')}.result.${Date.now()}.json`));
    } catch (err) {
      ctx.logger?.warn({ file: f, error: err.code }, 'cannot move a record-again result to processed/');
    }
  }
  return files.length;
}

/** The latest requests, newest first; `files`: only those about these clips (old file or the clip's current file). */
export function listRerecords(ctx, { files = null, limit = 50 } = {}) {
  let rows = ctx.db.prepare('SELECT * FROM clip_rerecords ORDER BY id DESC LIMIT 500').all();
  if (files) {
    const clips = files.map((f) => liveClip(ctx.audio, f) ?? { file: f });
    rows = rows.filter((r) => clips.some((c) => r.old_file === c.file || r.new_file === c.file
      || (c.track === r.track && c.speed === r.speed && c.text === r.text)));
  }
  return rows.slice(0, limit).map(publicRerecord);
}
