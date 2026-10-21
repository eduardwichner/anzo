// Admin → Corrections, service side: search the content, show an item with the exercises that use it, preview an edit,
// queue a correction for the content job (spool request), and record the job's result (spool result). The service never
// edits content itself: scripts/jobs/content-job.js (the developer account) applies a request and writes the result back.
// With config.jobRunner === 'stub' (e2e only) a correction is marked applied at once without touching any file.
import fs from 'node:fs';
import path from 'node:path';
import { publicExercise } from '../content/loader.js';
import { nativeText } from '../content/localized.js';
import { lookupKey, readLocales } from '../content/instructions.js';
import { readPackSources } from '../../../scripts/content/sources.js';
import { words } from '../../../scripts/content/generator.js';
import { awardBadges } from '../lib/badges.js';
import { JOB_STALE_MS, readStatus, spoolPaths, writeJsonAtomic } from './spool.js';
import { messageKey } from './reports.js';
import { collectRerecordResults } from './rerecord.js';

export class CorrectionError extends Error {
  constructor(code, status = 400, extra = {}) {
    super(code);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

const LIMITS = { text: 200, reason: 300, acceptAlso: 10 };
const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[’‘]/g, "'").toLowerCase().trim();
// Native-side text in the course's own native language (nativeText falls back to a localized object's only language:
// { nl } for English and French, { en } for Dutch).
const nl = (v) => nativeText(v, 'nl');
const nativeOfTrack = (content, track) => content.manifest?.tracks?.find((t) => t.id === track)?.native ?? 'nl';
export const levelName = (p) => `${p.pack.cefr}${p.entry.title?.nl ? ` ${p.entry.title.nl}` : ''}`;

// ---- index: item -> where it is and which exercises use it ---------------------------------------------------------
/**
 * A variant course's ids (fr-en, prefix fe: fe.bonjour, fe-a1-1-u01, fe-a1-1-u01-s01) → the ids of the target's unit sources it
 * is built from (fr.bonjour, fr-a1-1-u01, fr-a1-1-u01-s01). Any other id is its own source id.
 */
export function sourceIdOf(id, prefix, target) {
  return prefix && prefix !== target ? String(id).replace(new RegExp(`^${prefix}(?=[.-])`), target) : id;
}

const indexCache = new WeakMap();
function corrIndex(content) {
  if (indexCache.has(content)) return indexCache.get(content);
  const items = new Map();
  const usedBy = new Map();
  const tracks = content.manifest?.tracks ?? [];
  for (const p of content.packs.values()) {
    // a variant course (fr-en) is built from its target's sources with fr ids: its items are edited there, in its
    // own meaning layer; its French text is the one the target's course has
    const track = tracks.find((t) => t.id === p.trackId);
    const prefix = track?.idPrefix ?? p.trackId;
    const src = (id) => sourceIdOf(id, prefix, p.target);
    const level = p.pack.id.slice(prefix.length + 1);
    // the other courses built from the same unit sources at this level (a French text edit changes them too)
    const sharedWith = tracks.filter((t) => t.id !== p.trackId && (t.target ?? t.id) === p.target && content.packs.has(`${t.idPrefix ?? t.id}-${level}`))
      .map((t) => ({ track: t.id, nativeLang: t.native ?? 'nl' }));
    for (const unit of p.pack.units) {
      const at = { packId: p.pack.id, track: p.trackId, target: p.target, nativeLang: track?.native ?? 'nl', cefr: p.pack.cefr, level: levelName(p),
        unitId: unit.id, unitTitle: nl(unit.title), sourceUnitId: src(unit.id), sharedWith };
      for (const v of unit.vocabulary) items.set(v.id, { kind: 'vocabulary', data: v, sourceId: src(v.id), ...at });
      for (const s of unit.sentences || []) items.set(s.id, { kind: 'sentence', data: s, sourceId: src(s.id), ...at });
      for (const lesson of unit.lessons) {
        for (const ex of lesson.exercises) {
          const ids = new Set([...(ex.items || []), ex.sentenceId, ex.listen].filter(Boolean));
          for (const id of ids) {
            if (!usedBy.has(id)) usedBy.set(id, []);
            usedBy.get(id).push(ex.id);
          }
        }
      }
    }
  }
  const out = { items, usedBy };
  indexCache.set(content, out);
  return out;
}

export function exercisesUsing(content, id) {
  return corrIndex(content).usedBy.get(id) ?? [];
}

function lessonTitle(content, lessonId) {
  return nl(content.lessons.get(lessonId)?.lesson.title) ?? lessonId;
}

/** Result row of a search / header of an item. */
function summary(content, audio, id) {
  const it = corrIndex(content).items.get(id);
  if (!it) return null;
  const clips = audio?.both ? audio.both(it.target, it.data.target) : { audio: null, audioSlow: null };
  return {
    id,
    kind: it.kind,
    target: it.data.target,
    native: nl(it.data.native),
    track: it.track,
    targetLang: it.target,
    nativeLang: it.nativeLang,
    sharedWith: it.sharedWith,
    packId: it.packId,
    level: it.level,
    unitId: it.unitId,
    unitTitle: it.unitTitle,
    exercises: exercisesUsing(content, id).map((exId) => {
      const e = content.exercises.get(exId);
      return { id: exId, type: e.exercise.type, lessonId: e.lessonId, lessonTitle: lessonTitle(content, e.lessonId) };
    }),
    ...clips,
  };
}

/**
 * Search both tracks by English/French text, Dutch meaning, item id or exercise id.
 * @returns {{ vocabulary: object[], sentences: object[], exercise: object|null }}
 */
export function searchContent(content, audio, q, { limit = 25 } = {}) {
  const raw = String(q ?? '').trim();
  const needle = fold(raw);
  if (!needle) return { vocabulary: [], sentences: [], exercise: null };
  const { items } = corrIndex(content);
  let exercise = null;
  const forced = new Set();
  const ex = content.exercises.get(raw);
  if (ex) {
    exercise = adminExercise(content, audio, raw);
    [...(ex.exercise.items || []), ex.exercise.sentenceId, ex.exercise.listen].filter(Boolean).forEach((id) => forced.add(id));
  }
  const scored = [];
  for (const [id, it] of items) {
    const texts = [fold(it.data.target), fold(nl(it.data.native)), fold(id)];
    let score = forced.has(id) ? 0 : null;
    for (const t of texts) {
      if (t === needle) score = Math.min(score ?? 1, 1);
      else if (t.startsWith(needle) || t.split(/[\s,;/]+/).includes(needle)) score = Math.min(score ?? 2, 2);
      else if (t.includes(needle)) score = Math.min(score ?? 3, 3);
    }
    if (score !== null) scored.push({ id, kind: it.kind, score, len: it.data.target.length });
  }
  scored.sort((a, b) => a.score - b.score || a.len - b.len || a.id.localeCompare(b.id));
  const pick = (kind) => scored.filter((s) => s.kind === kind).slice(0, limit).map((s) => summary(content, audio, s.id));
  return { vocabulary: pick('vocabulary'), sentences: pick('sentence'), exercise };
}

// ---- one exercise for admin screens: as served to the child, plus the answer and what is heard --------------------
function answerText(ex) {
  switch (ex.type) {
    case 'multiple_choice':
    case 'listen_choose':
      return nl(ex.options.find((o) => o.correct)?.text);
    case 'match_pairs':
      return ex.pairs.map((p) => `${p.left} = ${nl(p.right)}`).join(' · ');
    case 'build_sentence':
    case 'fill_blank':
    case 'listen_type':
      return ex.answer;
    default:
      return null;
  }
}

export function adminExerciseView(content, audio, packId, ex) {
  const p = content.packs.get(packId);
  const heard = ex.listen ? (p?.vocabById.get(ex.listen) ?? p?.sentenceById.get(ex.listen))?.target ?? null : null;
  return {
    ...publicExercise(content, packId, ex, { audio: audio ?? undefined, nativeLang: nativeOfTrack(content, p?.trackId) }),
    answer: answerText(ex),
    heard,
    ...(ex.acceptAlso?.length ? { acceptAlso: ex.acceptAlso } : {}),
  };
}

export function adminExercise(content, audio, exerciseId) {
  const found = content.exercises.get(exerciseId);
  if (!found) return null;
  const lesson = content.lessons.get(found.lessonId);
  return {
    ...adminExerciseView(content, audio, found.packId, found.exercise),
    lessonId: found.lessonId,
    lessonTitle: lessonTitle(content, found.lessonId),
    unitId: lesson?.unitId,
    packId: found.packId,
    track: found.trackId,
  };
}

// ---- the editable source of an item (content/src YAML, read-only here) ---------------------------------------------
export function sourceItem(contentDir, packId, unitId, itemId) {
  const { units } = readPackSources(packId, path.join(contentDir, 'src'));
  const unit = units.find((u) => u.id === unitId);
  if (!unit) return null;
  const v = unit.vocabulary.find((x) => x.id === itemId);
  if (v) return { kind: 'vocabulary', file: unit.file, item: v };
  const s = (unit.sentences || []).find((x) => x.id === itemId);
  return s ? { kind: 'sentence', file: unit.file, item: s } : null;
}

/** The fields an admin may edit, as they are in the source now. */
export function editableOf(src) {
  return { target: src.item.target, native: Object.values(src.item.native)[0], acceptAlso: [...(src.item.acceptAlso || [])] };
}

export function itemDetail({ content, audio, contentDir }, id) {
  const head = summary(content, audio, id);
  if (!head) return null;
  const it = corrIndex(content).items.get(id);
  const src = sourceItem(contentDir, it.packId, it.sourceUnitId, it.sourceId);
  return {
    ...head,
    pos: it.data.pos,
    gender: it.data.gender ?? null,
    items: it.kind === 'sentence' ? it.data.items : undefined,
    editable: src ? editableOf(src) : null,
    sourceFile: src?.file ?? null,
    exercises: exercisesUsing(content, id).map((exId) => adminExercise(content, audio, exId)),
  };
}

// ---- validation of an edit -----------------------------------------------------------------------------------------
const cleanText = (s) => String(s).replace(/\s+/g, ' ').trim();

/** Normalised changed fields, or throws CorrectionError('invalid_correction', 400, { fields }). */
export function validateEdit(before, input) {
  const fields = {};
  const after = {};
  for (const key of ['target', 'native']) {
    if (input?.[key] === undefined) continue;
    if (typeof input[key] !== 'string') fields[key] = 'invalid';
    else {
      const v = cleanText(input[key]);
      if (!v) fields[key] = 'required';
      else if (v.length > LIMITS.text) fields[key] = 'too_long';
      else if (/[<>{}\n]/.test(input[key])) fields[key] = 'invalid';
      else if (v !== before[key]) after[key] = v;
    }
  }
  if (input?.acceptAlso !== undefined) {
    if (!Array.isArray(input.acceptAlso) || input.acceptAlso.some((a) => typeof a !== 'string')) fields.acceptAlso = 'invalid';
    else {
      const list = [...new Set(input.acceptAlso.map(cleanText).filter(Boolean))];
      if (list.length > LIMITS.acceptAlso) fields.acceptAlso = 'too_many';
      else if (list.some((a) => a.length > LIMITS.text || /[<>{}]/.test(a))) fields.acceptAlso = 'invalid';
      else if (JSON.stringify(list) !== JSON.stringify(before.acceptAlso)) after.acceptAlso = list;
    }
  }
  if (Object.keys(fields).length) throw new CorrectionError('invalid_correction', 400, { fields });
  if (!Object.keys(after).length) throw new CorrectionError('nothing_changed');
  return after;
}

// ---- preview: the affected exercises before and after (text substituted; the generator has the last word) ----------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function replaceWord(text, from, to) {
  if (typeof text !== 'string' || !from) return { text, hit: false };
  const re = new RegExp(`(^|[^\\p{L}\\p{N}'])(${esc(from)})(?=$|[^\\p{L}\\p{N}'])`, 'giu');
  let hit = false;
  const out = text.replace(re, (m, pre, word) => {
    hit = true;
    const cap = /^\p{Lu}/u.test(word) && !/^\p{Lu}/u.test(to) ? to.charAt(0).toUpperCase() + to.slice(1) : to;
    return pre + cap;
  });
  return { text: out, hit };
}

/** The raw exercise with the item's new texts; mayChange = the generator will likely build it differently. */
export function substitute(ex, kind, id, before, after) {
  const out = JSON.parse(JSON.stringify(ex));
  let mayChange = false;
  const swapNative = (obj) => {
    const key = obj && typeof obj === 'object' ? Object.keys(obj).find((k) => obj[k] === before.native) : null;
    return key && after.native ? { ...obj, [key]: after.native } : obj;
  };
  if (after.native) {
    if (out.question) out.question = swapNative(out.question);
    if (out.hint) out.hint = swapNative(out.hint);
    for (const o of out.options || []) if (typeof o.text === 'object') o.text = swapNative(o.text);
    for (const pr of out.pairs || []) pr.right = swapNative(pr.right);
  }
  if (after.target) {
    const sub = (s) => replaceWord(s, before.target, after.target).text;
    if (typeof out.question === 'string') out.question = sub(out.question);
    for (const o of out.options || []) if (typeof o.text === 'string') o.text = sub(o.text);
    for (const pr of out.pairs || []) pr.left = sub(pr.left);
    if (out.answer) {
      const r = replaceWord(out.answer, before.target, after.target);
      if (kind === 'sentence' && (ex.sentenceId === id || ex.listen === id)) out.answer = after.target;
      else out.answer = r.text;
    }
    if (ex.type === 'build_sentence') out.tokens = words(out.answer);
    if (ex.type === 'fill_blank') {
      const r = replaceWord(out.sentence, before.target, after.target);
      out.sentence = r.text;
      if (kind === 'sentence') {
        const idx = after.target.toLowerCase().indexOf(String(ex.answer).toLowerCase());
        if (idx > 0) out.sentence = `${after.target.slice(0, idx)}___${after.target.slice(idx + ex.answer.length)}`;
        else mayChange = true;
      } else if (ex.answer.toLowerCase() === before.target.toLowerCase()) {
        mayChange = true; // the blanked word changes: the sentence no longer contains it
      }
      if (out.options) out.options = out.options.map(sub);
    }
    if (ex.type === 'build_sentence' && kind === 'vocabulary') mayChange = mayChange || replaceWord(ex.answer, before.target, after.target).hit;
  }
  return { exercise: out, mayChange };
}

export function previewEdit({ content, audio, contentDir }, id, input) {
  const it = corrIndex(content).items.get(id);
  if (!it) throw new CorrectionError('item_not_found', 404);
  const src = sourceItem(contentDir, it.packId, it.sourceUnitId, it.sourceId);
  if (!src) throw new CorrectionError('item_not_found', 404);
  const before = editableOf(src);
  const after = validateEdit(before, input);
  const exercises = exercisesUsing(content, id).map((exId) => {
    const found = content.exercises.get(exId);
    const { exercise, mayChange } = substitute(found.exercise, it.kind, id, before, after);
    return {
      id: exId,
      type: found.exercise.type,
      lessonTitle: lessonTitle(content, found.lessonId),
      before: adminExerciseView(content, audio, found.packId, found.exercise),
      after: adminExerciseView(content, null, found.packId, exercise),
      mayChange,
    };
  });
  return {
    before,
    after,
    usedIn: exercises.length,
    audioChange: Boolean(after.target),
    track: it.track,
    sharedWith: after.target ? it.sharedWith : [],
    exercises,
  };
}

// ---- queueing --------------------------------------------------------------------------------------------------------
const nowIso = () => new Date().toISOString();
const short = (s, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function summaryLine(kind, id, before, after, targetName, nativeName = 'Dutch') {
  if (kind === 'hide') return `hide exercise ${id}`;
  const parts = [];
  if (after.target !== undefined) parts.push(`${targetName} "${short(before.target)}" → "${short(after.target)}"`);
  if (after.native !== undefined) parts.push(`${nativeName} "${short(before.native)}" → "${short(after.native)}"`);
  if (after.acceptAlso !== undefined) parts.push(`also accept: ${after.acceptAlso.length ? after.acceptAlso.map((a) => `"${short(a, 30)}"`).join(', ') : 'none'}`);
  return `${id}: ${parts.join('; ')}`;
}
const TRACK_NAME = { en: 'English', fr: 'French', nl: 'Dutch' };

function requestOf(row) {
  return {
    id: row.id,
    kind: row.kind,
    author: row.author,
    createdAt: row.created_at,
    track: row.track,
    packId: row.pack_id,
    unitId: row.unit_id,
    target: { kind: row.target_kind, id: row.target_id },
    before: JSON.parse(row.before_json),
    after: JSON.parse(row.after_json),
    reason: row.reason,
    summary: row.summary,
    ...(row.undo_of ? { undo: { of: row.undo_of, commit: JSON.parse(row.before_json).commit } } : {}),
  };
}

function insertCorrection(db, values) {
  const info = db.prepare(`INSERT INTO content_corrections
      (kind, author, track, pack_id, unit_id, target_kind, target_id, before_json, after_json, reason, summary, undo_of, report_exercise, created_at)
      VALUES (@kind, @author, @track, @packId, @unitId, @targetKind, @targetId, @before, @after, @reason, @summary, @undoOf, @reportExercise, @createdAt)`)
    .run({ undoOf: null, reportExercise: null, ...values, createdAt: nowIso() });
  return db.prepare('SELECT * FROM content_corrections WHERE id = ?').get(info.lastInsertRowid);
}

function cleanReason(reason) {
  const r = cleanText(reason ?? '');
  if (r.length > LIMITS.reason) throw new CorrectionError('invalid_correction', 400, { fields: { reason: 'too_long' } });
  return r;
}

function checkReportExercise(content, reportExercise) {
  if (reportExercise == null) return null;
  if (typeof reportExercise !== 'string' || (!content.exercises.has(reportExercise) && !content.retired?.has(reportExercise))) {
    throw new CorrectionError('invalid_correction', 400, { fields: { reportExercise: 'invalid' } });
  }
  return reportExercise;
}

/** Hand a new correction to the job (or, in e2e, apply it at once). */
function dispatch(ctx, row) {
  const { db, config, logger } = ctx;
  if (config.jobRunner === 'stub') {
    recordResult(ctx, { id: row.id, status: 'applied', commit: 'stub', reason: 'Applied by the test runner (no files changed).', finishedAt: nowIso() });
  } else {
    try {
      writeJsonAtomic(path.join(spoolPaths(config.spoolDir).requests, `${String(row.id).padStart(6, '0')}.json`), requestOf(row));
    } catch (err) {
      // Never leave a row "queued" that no job will ever see.
      db.prepare("UPDATE content_corrections SET status = 'rejected', result_reason = ?, detail = ?, finished_at = ? WHERE id = ?")
        .run('The correction could not be handed to the content job (the spool is not writable).', String(err.message), nowIso(), row.id);
      logger?.error({ correction: row.id, err: err.message }, 'content correction could not be queued');
      throw err;
    }
  }
  logger?.info({ correction: row.id, kind: row.kind, target: row.target_id, author: row.author }, 'content correction queued');
  return db.prepare('SELECT * FROM content_corrections WHERE id = ?').get(row.id);
}

export function queueEdit(ctx, user, { id, after: input, reason, reportExercise }) {
  const { content, config } = ctx;
  const it = corrIndex(content).items.get(id);
  if (!it) throw new CorrectionError('item_not_found', 404);
  const src = sourceItem(config.contentDir, it.packId, it.sourceUnitId, it.sourceId);
  if (!src) throw new CorrectionError('item_not_found', 404);
  const before = editableOf(src);
  const after = validateEdit(before, input);
  const beforeChanged = Object.fromEntries(Object.keys(after).map((k) => [k, before[k]]));
  const row = insertCorrection(ctx.db, {
    kind: 'edit', author: user.username, track: it.track, packId: it.packId, unitId: it.unitId, targetKind: it.kind, targetId: id,
    before: JSON.stringify(beforeChanged), after: JSON.stringify(after), reason: cleanReason(reason),
    summary: summaryLine('edit', id, before, after, TRACK_NAME[it.target] ?? it.target, TRACK_NAME[it.nativeLang] ?? it.nativeLang),
    reportExercise: checkReportExercise(content, reportExercise),
  });
  return dispatch(ctx, row);
}

export function queueHide(ctx, user, { exerciseId, reason, reportExercise }) {
  const { content } = ctx;
  const found = content.exercises.get(exerciseId);
  if (!found) throw new CorrectionError('exercise_not_found', 404);
  const why = cleanReason(reason);
  if (!why) throw new CorrectionError('invalid_correction', 400, { fields: { reason: 'required' } });
  const lesson = content.lessons.get(found.lessonId);
  const row = insertCorrection(ctx.db, {
    kind: 'hide', author: user.username, track: found.trackId, packId: found.packId, unitId: lesson.unitId, targetKind: 'exercise',
    targetId: exerciseId, before: JSON.stringify({ hidden: false, type: found.exercise.type }), after: JSON.stringify({ hidden: true }),
    reason: why, summary: `hide exercise ${exerciseId} (${found.exercise.type.replace('_', ' ')}, ${lessonTitle(content, found.lessonId)})`,
    reportExercise: checkReportExercise(content, reportExercise ?? exerciseId),
  });
  return dispatch(ctx, row);
}

export function queueUndo(ctx, user, correctionId) {
  const { db } = ctx;
  const orig = db.prepare('SELECT * FROM content_corrections WHERE id = ?').get(correctionId);
  if (!orig) throw new CorrectionError('correction_not_found', 404);
  if (orig.kind === 'undo' || orig.status !== 'applied' || !orig.commit_hash || orig.undone_by) throw new CorrectionError('cannot_undo', 409);
  const pending = db.prepare("SELECT 1 FROM content_corrections WHERE undo_of = ? AND status = 'queued'").get(orig.id);
  if (pending) throw new CorrectionError('cannot_undo', 409);
  const row = insertCorrection(db, {
    kind: 'undo', author: user.username, track: orig.track, packId: orig.pack_id, unitId: orig.unit_id, targetKind: orig.target_kind,
    targetId: orig.target_id, before: JSON.stringify({ commit: orig.commit_hash }), after: orig.before_json,
    reason: `undo of correction #${orig.id}`, summary: `undo #${orig.id} (${orig.summary})`, undoOf: orig.id,
  });
  return dispatch(ctx, row);
}

// ---- results ---------------------------------------------------------------------------------------------------------
const LOCALES = readLocales();
const say = (lang, key) => lookupKey(LOCALES[lang] ?? LOCALES.nl, key) ?? lookupKey(LOCALES.nl, key);

/**
 * Record the job's result. Applied with a reported exercise: its open reports close as fixed, each child gets the
 * "your report fixed a mistake" message and (the first time) the bug-hunter badge.
 */
export function recordResult(ctx, result) {
  const { db, logger } = ctx;
  const row = db.prepare('SELECT * FROM content_corrections WHERE id = ?').get(result.id);
  if (!row) return null;
  if (row.status === 'applied' || row.status === 'rejected') return row; // already recorded (a result file seen twice)
  const status = result.status === 'applied' ? 'applied' : 'rejected';
  const finishedAt = result.finishedAt ?? nowIso();
  const notified = [];
  db.transaction(() => {
    db.prepare(`UPDATE content_corrections SET status = ?, result_reason = ?, detail = ?, commit_hash = ?, finished_at = ? WHERE id = ?`)
      .run(status, result.reason ?? null, result.detail ? String(result.detail).slice(0, 20000) : null, result.commit ?? null, finishedAt, row.id);
    if (status !== 'applied') return;
    if (row.undo_of) db.prepare('UPDATE content_corrections SET undone_by = ? WHERE id = ?').run(row.id, row.undo_of);
    if (!row.report_exercise) return;
    const open = db.prepare("SELECT * FROM content_reports WHERE exercise_id = ? AND status = 'open'").all(row.report_exercise);
    db.prepare(`UPDATE content_reports SET status = 'closed', resolution = 'fixed', correction_id = ?, closed_at = ?, updated_at = ?
                WHERE exercise_id = ? AND status = 'open'`).run(row.id, finishedAt, finishedAt, row.report_exercise);
    for (const userId of [...new Set(open.map((r) => r.user_id))]) {
      const child = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (!child) continue;
      const report = open.find((r) => r.user_id === userId);
      db.prepare(`INSERT INTO child_messages (user_id, kind, text, report_id, exercise_id, created_at) VALUES (?, 'fixed', ?, ?, ?, ?)`)
        .run(userId, say(child.ui_lang, messageKey('fixed', child.audience)), report.id, row.report_exercise, finishedAt);
      const badges = awardBadges(db, ctx.content, userId, { now: new Date(finishedAt) });
      notified.push({ username: child.username, badges });
    }
  })();
  logger?.info({ correction: row.id, status, commit: result.commit, reason: result.reason, notified }, `content correction ${status}`);
  return db.prepare('SELECT * FROM content_corrections WHERE id = ?').get(row.id);
}

/** Read every result file in the spool, record it, move it to processed/. Returns the number recorded. */
export function collectResults(ctx) {
  const { results, processed } = spoolPaths(ctx.config.spoolDir);
  let files = [];
  try {
    files = fs.readdirSync(results).filter((f) => /^\d+\.json$/.test(f)).sort();
  } catch {
    return 0;
  }
  let n = 0;
  for (const f of files) {
    const file = path.join(results, f);
    try {
      const result = JSON.parse(fs.readFileSync(file, 'utf8'));
      recordResult(ctx, result);
      n += 1;
    } catch (err) {
      ctx.logger?.error({ file: f, error: err.message }, 'cannot read a content job result');
    }
    try {
      fs.renameSync(file, path.join(processed, `${path.basename(f, '.json')}.result.json`));
    } catch (err) {
      ctx.logger?.warn({ file: f, error: err.code }, 'cannot move a content job result to processed/');
    }
  }
  return n;
}

/** Poll the spool for results (the job also asks for a reload, which does not need this). */
export function startResultPoller(ctx, { intervalMs = 2000 } = {}) {
  const timer = setInterval(() => {
    try {
      collectResults(ctx);
      collectRerecordResults(ctx); // "Record again"
    } catch (err) {
      ctx.logger?.error({ err }, 'result poller');
    }
  }, intervalMs);
  timer.unref();
  return timer;
}

// ---- history ---------------------------------------------------------------------------------------------------------
export function publicCorrection(row, job) {
  const running = row.status === 'queued' && job?.state === 'running' && job.id === row.id
    && !(Date.now() - Date.parse(job.startedAt) > JOB_STALE_MS);
  return {
    id: row.id,
    kind: row.kind,
    author: row.author,
    track: row.track,
    packId: row.pack_id,
    unitId: row.unit_id,
    targetKind: row.target_kind,
    targetId: row.target_id,
    before: JSON.parse(row.before_json),
    after: JSON.parse(row.after_json),
    reason: row.reason,
    summary: row.summary,
    status: running ? 'running' : row.status,
    step: running ? job.step ?? null : null,
    resultReason: row.result_reason,
    detail: row.detail,
    commit: row.commit_hash,
    undoOf: row.undo_of,
    undoneBy: row.undone_by,
    reportExercise: row.report_exercise,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    canUndo: row.kind !== 'undo' && row.status === 'applied' && Boolean(row.commit_hash) && !row.undone_by,
  };
}

export function jobState(config) {
  return readStatus(config.spoolDir, 'content-job');
}

export function listCorrections(db, config, { limit = 100 } = {}) {
  const job = jobState(config);
  const rows = db.prepare('SELECT * FROM content_corrections ORDER BY id DESC LIMIT ?').all(limit);
  return {
    corrections: rows.map((r) => publicCorrection(r, job)),
    queue: { queued: db.prepare("SELECT COUNT(*) FROM content_corrections WHERE status = 'queued'").pluck().get(), job },
  };
}
