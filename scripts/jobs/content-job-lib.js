// The content job's steps (scripts/jobs/content-job.js runs them for each spooled request, oldest first).
// A request is an admin correction from the service: edit an item's texts, hide an exercise, or undo an applied one.
//   1 apply to the unit YAML (surgical: only the edited values change)   2 generate the affected packs, validate, trace
//   3 id lock (no locked id may disappear; changed items are locked with the reason)   4 render missing audio
//   5 content unit tests   6 git commit   7 reload the service and check /api/health   8 the service's integrity check
//   9 delete orphaned clips   10 optional git push
// Any failure after step 1 rolls back: content/ back to HEAD (and the commit undone), new clips deleted, the audio
// manifest restored, and the service reloaded onto the old content if it had already loaded the new one.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { LEVEL_ORDER, manifestTracks, packSourceDir, vocabId } from '../content/sources.js';
import { compareLock, formatLock, lockEntries, readLock, readPacks, updateLock } from '../../server/src/content/idlock.js';
import { readStatus } from '../../server/src/ops/spool.js';

export class Rejection extends Error {
  constructor(reason, detail = '') {
    super(reason);
    this.reason = reason;
    this.detail = detail;
  }
}

const tail = (text, n = 40) => String(text ?? '').trim().split('\n').slice(-n).join('\n');

/** Run a command; returns { ok, code, out } (stdout + stderr). Never throws. */
export function run(cmd, args, { cwd, env, timeoutMs = 10 * 60_000, input } = {}) {
  const r = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', timeout: timeoutMs, input, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? `\n${r.error.message}` : ''}`;
  return { ok: r.status === 0 && !r.error, code: r.status, out };
}

// ---- 1. the unit YAML ---------------------------------------------------------------------------------------------
/** The unit file of a pack's unit: { file (absolute), text, doc }. */
export function unitFile(root, packId, unitId) {
  const { dir } = packSourceDir(packId, path.join(root, 'content/src'));
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{2}-[a-z0-9-]+\.yaml$/.test(x)).sort()) {
    const file = path.join(dir, f);
    const text = fs.readFileSync(file, 'utf8');
    if (YAML.parse(text)?.id === unitId) return { file, text };
  }
  throw new Rejection(`Unit ${unitId} was not found in the lesson sources.`);
}

const quote = (s) => JSON.stringify(s); // a YAML double-quoted scalar
const flowList = (list) => `[${list.map(quote).join(', ')}]`;

/** Find the flow-map node of a vocabulary item / sentence by its full id. */
function findItemNode(doc, track, unitId, kind, id) {
  const seq = doc.get(kind === 'vocabulary' ? 'vocabulary' : 'sentences', true);
  for (const node of seq?.items ?? []) {
    const raw = node.get('id');
    const full = kind === 'vocabulary'
      ? raw ?? vocabId(track, String(node.get('target')), node.get('pos'))
      : (typeof raw === 'string' && /^s\d{2}$/.test(raw) ? `${unitId}-${raw}` : raw);
    if (full === id) return node;
  }
  return null;
}

/** Text edits (non-overlapping [start, end, replacement]) applied from the end backwards. */
function splice(text, edits) {
  let out = text;
  for (const [start, end, rep] of [...edits].sort((a, b) => b[0] - a[0])) out = out.slice(0, start) + rep + out.slice(end);
  return out;
}

/**
 * The key of the meaning an edit changes: the request's course's native language when given (French for English speakers:
 * en, next to the nl of the course for Dutch speakers), else the item's first meaning (nl in the English and
 * French courses, en in the Dutch one).
 */
const nativeKey = (node, native) => native ?? node.get('native', true)?.items?.[0]?.key?.value ?? 'nl';

function currentValues(node, native) {
  return {
    target: node.get('target'),
    native: node.get('native')?.get(nativeKey(node, native)),
    acceptAlso: node.get('acceptAlso')?.toJSON?.() ?? [],
  };
}

/**
 * Apply an edit request to the unit YAML text. Only the edited values change; a vocabulary item whose id was derived
 * from its target gets that id written out (so changing the target cannot change the id).
 * @returns {string} the new text
 */
export function applyEditToText(text, { track, unitId, kind, id, before, after, native }) {
  const doc = YAML.parseDocument(text);
  const node = findItemNode(doc, track, unitId, kind, id);
  if (!node) throw new Rejection(`${id} was not found in its unit file any more.`);
  if (!node.flow) throw new Rejection(`${id} is written in a layout the correction tool does not edit (block style).`);
  const now = currentValues(node, native);
  if (native && after.native !== undefined && now.native === undefined) throw new Rejection(`${id} has no ${native} meaning to correct.`);
  for (const [k, v] of Object.entries(before)) {
    if (JSON.stringify(now[k]) !== JSON.stringify(v)) {
      throw new Rejection('This text was changed since the correction was made. Open the item again and repeat the correction.',
        `${k}: expected ${JSON.stringify(v)}, found ${JSON.stringify(now[k])}`);
    }
  }
  const edits = [];
  const scalarRange = (scalar) => [scalar.range[0], scalar.range[1]];
  if (after.target !== undefined) {
    edits.push([...scalarRange(node.get('target', true)), quote(after.target)]);
    if (kind === 'vocabulary' && node.get('id') == null) {
      const first = node.items[0].key.range[0];
      edits.push([first, first, `id: ${id}, `]);
    }
  }
  if (after.native !== undefined) edits.push([...scalarRange(node.get('native', true).get(nativeKey(node, native), true)), quote(after.native)]);
  if (after.acceptAlso !== undefined) {
    const pair = node.items.find((p) => p.key?.value === 'acceptAlso');
    if (pair && after.acceptAlso.length) edits.push([pair.value.range[0], pair.value.range[1], flowList(after.acceptAlso)]);
    else if (pair) {
      // remove ", acceptAlso: [...]" (the pair is never first: id/target come before it)
      const start = text.lastIndexOf(',', pair.key.range[0]);
      edits.push([start, pair.value.range[1], '']);
    } else if (after.acceptAlso.length) {
      const last = node.items[node.items.length - 1];
      const end = last.value.range[1];
      edits.push([end, end, `, acceptAlso: ${flowList(after.acceptAlso)}`]);
    }
  }
  const out = splice(text, edits);
  // Verify: the new file parses and the item now has exactly the requested values.
  const check = findItemNode(YAML.parseDocument(out), track, unitId, kind, id);
  const got = check && currentValues(check, native);
  const want = { ...now, ...after };
  if (!got || JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Rejection('The correction could not be written into the lesson source.', `wanted ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
  return out;
}

/** Add an exercise to the unit's `hidden:` list. */
export function applyHideToText(text, { exerciseId, reason }) {
  const doc = YAML.parseDocument(text);
  const hidden = doc.get('hidden', true);
  if (hidden?.items?.some((h) => h.get('exercise') === exerciseId)) throw new Rejection(`Exercise ${exerciseId} is already hidden.`);
  const line = `  - { exercise: ${quote(exerciseId)}, reason: ${quote(reason)} }`;
  let out;
  if (hidden) {
    const end = hidden.range[1];
    const lineEnd = text.indexOf('\n', end - 1);
    const at = lineEnd === -1 ? text.length : lineEnd;
    out = `${text.slice(0, at)}\n${line}${text.slice(at)}`;
  } else {
    out = `${text.replace(/\n*$/, '\n')}hidden:\n${line}\n`;
  }
  const after = YAML.parse(out).hidden ?? [];
  if (!after.some((h) => h.exercise === exerciseId)) throw new Rejection('The exercise could not be marked hidden in the lesson source.');
  return out;
}

// ---- 2. generate, validate, trace -----------------------------------------------------------------------------------
/**
 * The pack and the levels above it in its track (a typed fill-in looks at lower levels' words), and the same levels of every
 * variant course built from these sources (fr-a1-1 → fe-a1-1, French for English speakers) that has a pack file.
 */
export function affectedPacks(packId, tracks = manifestTracks()) {
  // by the sources' language: a correction of a variant pack (fe-a1-1) edits the French sources (fr-a1-1), as one of fr-a1-1 does
  const { target, level } = packSourceDir(packId, undefined, tracks);
  const order = LEVEL_ORDER[target] ?? [level];
  const levels = order.slice(Math.max(0, order.indexOf(level)));
  const variants = tracks.filter((t) => t.id !== target && t.target === target && t.idPrefix);
  const built = (id) => variants.some((t) => t.packs.some((e) => e.id === id && e.file && ['available', 'preview'].includes(e.status)));
  return [...levels.map((l) => `${target}-${l}`), ...variants.flatMap((t) => levels.map((l) => `${t.idPrefix}-${l}`)).filter(built)];
}

/**
 * The unit-source side of a request: a variant course's request (fe-a1-1, unit fe-a1-1-u01, item fe.bonjour) names the ids of
 * its pack; the YAML holds the target's (fr-a1-1-u01, fr.bonjour) and both meaning layers. { unitId, id, target, native }:
 * `native` only for a variant (its meaning key; the target's course keeps its first meaning).
 */
export function sourceSide(req) {
  const { target, variant } = packSourceDir(req.packId);
  const map = (x) => (variant ? String(x).replace(new RegExp(`^${variant.prefix}(?=[.-])`), target) : x);
  return { unitId: map(req.unitId), id: map(req.target.id), target, native: variant?.native };
}

/** Words the trace rejected: [{ word, packId? }] from its error lines. */
export function traceProblems(output) {
  const out = [];
  for (const line of String(output).split('\n')) {
    let m = line.match(/: sentence \S+ "[^"]*": "([^"]+)" — /);
    if (m) out.push({ word: m[1], file: line.split(':')[0] });
    else if ((m = line.match(/: vocabulary \S+ "([^"]+)": /))) out.push({ word: m[1], file: line.split(':')[0] });
  }
  return out;
}

export const LEVEL_NAMES = {
  'en-pre-a1': 'Pre-A1 Starters', 'en-a1': 'A1 Movers', 'en-a2': 'A2 Flyers', 'fr-a1-1': 'A1.1', 'fr-a1': 'A1', 'fr-a2': 'A2',
  'nl-pre-a1': 'Dutch Start', 'nl-a1': 'Dutch A1', 'nl-a2': 'Dutch A2',
};
export const levelOfFile = (file) => {
  const m = String(file).match(/content\/src\/([a-z]{2})\/([a-z0-9-]+)\//);
  return m ? LEVEL_NAMES[`${m[1]}-${m[2]}`] ?? `${m[1]}-${m[2]}` : 'its level';
};

// ---- 3. the id lock ---------------------------------------------------------------------------------------------------
/**
 * Compare the regenerated packs with the lock. Throws a Rejection when a locked id would disappear (apart from the
 * exercise being hidden). Writes the lock with the reason when exercises changed items or were hidden / added.
 * @returns {{ changed: string[], retired: string[], added: number, written: boolean }}
 */
export function checkAndUpdateLock(root, { reason, retire = [], date = new Date().toISOString().slice(0, 10) }) {
  const lockFile = path.join(root, 'content/ids.lock.json');
  const lock = readLock(lockFile);
  const current = lockEntries(readPacks(path.join(root, 'content/packs')));
  const diff = compareLock(lock, current);
  const removed = diff.removed.filter((id) => !retire.includes(id));
  if (removed.length) {
    throw new Rejection(
      `This change would remove ${removed.length === 1 ? `${removed[0]}` : `${removed.length} ids (${removed.slice(0, 3).join(', ')}…)`} from the lessons, `
      + 'and the children\'s progress is stored under those ids. Change the text in a way that keeps the lesson as it is.',
      `locked ids that would disappear: ${removed.join(', ')}`,
    );
  }
  // An edit or a hide must keep every other exercise as it is: a locked id with another type, or a new id, means the
  // generator built the lesson differently (e.g. a changed meaning let a match succeed and shifted the ids after it).
  // A text exercise that now stands for another question, other gaps or another ordering unit is the same case.
  const retyped = diff.changed.filter((c) => c.what === 'type' || c.what === 'text reference');
  if (retyped.length || diff.unlocked.length) {
    const ids = [...retyped.map((c) => c.id), ...diff.unlocked];
    throw new Rejection(
      'This change would rebuild a lesson with different exercises, and the children\'s answers are stored per exercise. '
      + 'Change the text in a way that keeps the lesson as it is.',
      `${retyped.map((c) => `${c.id}: ${c.what} ${c.was} → ${c.now}`).join(', ')}${diff.unlocked.length ? ` new ids: ${diff.unlocked.join(', ')}` : ''}`.trim() || ids.join(', '),
    );
  }
  const missingRetire = retire.filter((id) => !diff.removed.includes(id));
  if (missingRetire.length) throw new Rejection(`Exercise ${missingRetire[0]} is still in the lessons after hiding it.`);
  // A retired (hidden) exercise that is back in the content (an undo of the hide) leaves `retired`.
  const nowEx = Object.assign({}, ...Object.values(current).map((e) => e.exercises));
  const restored = Object.keys(lock?.retired || {}).filter((id) => id in nowEx);
  const written = Boolean(diff.changed.length || diff.unlocked.length || retire.length || restored.length);
  if (written) fs.writeFileSync(lockFile, formatLock(updateLock(lock, current, { reason, date, retire })));
  return { changed: diff.changed.map((c) => c.id), retired: retire, restored, added: diff.unlocked.length, written };
}

// ---- audio snapshot (rollback) -------------------------------------------------------------------------------------
export function audioSnapshot(audioDir) {
  const files = new Set();
  for (const track of fs.existsSync(audioDir) ? fs.readdirSync(audioDir) : []) {
    const d = path.join(audioDir, track);
    if (fs.statSync(d).isDirectory()) for (const f of fs.readdirSync(d)) files.add(`${track}/${f}`);
  }
  const manifestFile = path.join(audioDir, 'manifest.json');
  return { files, manifest: fs.existsSync(manifestFile) ? fs.readFileSync(manifestFile, 'utf8') : null };
}

/**
 * The clip files a correction stopped using: named by the audio manifest before it and not after. Only these are
 * deleted at the end — never every file the manifest does not name: a *Record again* take waiting for review and the files of a
 * *Before release* sample live in audio/ outside the manifest on purpose.
 */
export function releasedClipFiles(manifestBefore, manifestAfter) {
  const named = (text) => {
    const out = new Set();
    let m;
    try {
      m = JSON.parse(text ?? 'null');
    } catch {
      return out;
    }
    for (const speeds of Object.values(m?.clips ?? {})) for (const byText of Object.values(speeds)) for (const f of Object.values(byText)) out.add(f);
    return out;
  };
  const after = named(manifestAfter);
  return [...named(manifestBefore)].filter((f) => !after.has(f));
}

export function restoreAudio(audioDir, snap) {
  const now = audioSnapshot(audioDir);
  const created = [...now.files].filter((f) => !snap.files.has(f));
  for (const f of created) fs.rmSync(path.join(audioDir, f), { force: true });
  const manifestFile = path.join(audioDir, 'manifest.json');
  if (snap.manifest !== null && now.manifest !== snap.manifest) fs.writeFileSync(manifestFile, snap.manifest);
  return { removed: created.length };
}

// ---- 7/8. reload and the service's checks ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait until the service has loaded content after `sinceIso` (status/content.json); returns that status or null. */
export async function waitForLoad(spoolDir, sinceIso, { timeoutMs = 30_000 } = {}) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const st = readStatus(spoolDir, 'content');
    if (st?.lastReload?.at && st.lastReload.at >= sinceIso && st.writtenAt >= sinceIso) return st;
    await sleep(300);
  }
  return null;
}

export async function fetchHealth(url, { timeoutMs = 10_000 } = {}) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } catch (err) {
    return { status: 0, body: { ok: false, problems: [err.message] } };
  }
}

// ---- an interrupted run ---------------------------------------------------------------------------------------------
/**
 * A run killed before it finished (its systemd timeout, OOM, a reboot) leaves status/content-job.json "running" and no
 * result. Undo what it may have left — a half-done revert, its own commit, uncommitted lesson files — reload the app,
 * and return a rejected result for that request. (New clips it rendered stay as orphans; the next render removes them.)
 */
export async function recoverInterrupted(id, env) {
  const { root } = env;
  const git = (...args) => run('git', args, { cwd: root });
  const done = [];
  if (fs.existsSync(path.join(root, '.git/REVERT_HEAD'))) done.push(`revert --abort: ${git('revert', '--abort').ok}`);
  const subject = git('log', '-1', '--format=%s').out.trim();
  if (subject.startsWith(`content: admin correction #${id} `)) done.push(`reset --soft HEAD~1 (${subject}): ${git('reset', '-q', '--soft', 'HEAD~1').ok}`);
  done.push(`restore content/: ${git('restore', '--staged', '--worktree', '--source=HEAD', '--', 'content/').ok}`);
  done.push(`clean content/: ${git('clean', '-fdq', '--', 'content/').ok}`);
  const r = run(env.reloadCmd[0], env.reloadCmd.slice(1), { cwd: root, timeoutMs: 60_000 });
  done.push(`reload: ${r.ok}`);
  const clean = git('status', '--porcelain', '--', 'content/').out.trim();
  done.push(clean ? `content/ NOT clean:\n${clean}` : 'content/ clean');
  return {
    id,
    status: 'rejected',
    reason: 'The content job was interrupted before it finished (for example by a restart of the server), so nothing was changed. '
      + 'Make the correction again.',
    steps: ['recover'],
    failedStep: 'interrupted',
    detail: `recovery after an interrupted run:\n${done.join('\n')}`,
    rollbackClean: !clean,
  };
}

// ---- 0. the request itself ------------------------------------------------------------------------------------------
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,80}$/;
/**
 * The spool is writable by the whole anzo-ops group (the service too), so the job trusts nothing in a request: every
 * field that reaches a path, a git argument or a YAML edit is checked here. Throws a Rejection.
 */
export function validateRequest(req, root) {
  const bad = (what) => new Rejection('The correction request was malformed and was not applied.', `invalid request field: ${what}`);
  if (!req || typeof req !== 'object') throw bad('request');
  if (!Number.isInteger(req.id) || req.id < 1) throw bad('id');
  if (!['edit', 'hide', 'undo'].includes(req.kind)) throw bad('kind');
  if (typeof req.author !== 'string' || !/^[a-z0-9_-]{2,24}$/.test(req.author)) throw bad('author');
  if (typeof req.packId !== 'string' || !/^[a-z]{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(req.packId)) throw bad('packId');
  const { track, dir } = packSourceDir(req.packId, path.join(root, 'content/src'));
  if (req.track !== track || !fs.existsSync(dir)) throw bad('packId/track');
  if (typeof req.unitId !== 'string' || !SAFE_ID.test(req.unitId)) throw bad('unitId');
  if (!['vocabulary', 'sentence', 'exercise'].includes(req.target?.kind) || typeof req.target.id !== 'string' || !SAFE_ID.test(req.target.id)) {
    throw bad('target');
  }
  for (const k of ['reason', 'summary']) if (req[k] != null && (typeof req[k] !== 'string' || req[k].length > 1000)) throw bad(k);
  if (req.kind === 'undo' && (!Number.isInteger(req.undo?.of) || !/^[0-9a-f]{40}$/.test(String(req.undo?.commit)))) throw bad('undo');
}

// ---- the whole request ----------------------------------------------------------------------------------------------
/**
 * @param req  the spooled request (server/src/ops/corrections.js requestOf)
 * @param env  { root, spoolDir, audioDir, reloadCmd: [cmd, ...args], healthUrl, testFiles: string[]|null, autoPush,
 *               progress(step), log(obj) }
 * @returns result { id, status: 'applied'|'rejected', reason, detail, commit?, steps, rendered?, deletedClips?, pushed? }
 */
export async function processRequest(req, env) {
  const { root, spoolDir, audioDir } = env;
  const steps = [];
  const outputs = [];
  const step = (name) => {
    steps.push(name);
    env.progress?.(name);
  };
  const git = (...args) => run('git', args, { cwd: root });
  const node = (script, args = [], opts = {}) => run(process.execPath, [path.join(root, script), ...args], { cwd: root, ...opts });
  const must = (r, reason, label) => {
    outputs.push(`$ ${label}\n${tail(r.out)}`);
    if (!r.ok) throw new Rejection(reason, `${label} (exit ${r.code})\n${tail(r.out, 60)}`);
    return r;
  };

  step('preflight');
  try {
    validateRequest(req, root);
  } catch (err) {
    return { id: Number.isInteger(req?.id) ? req.id : null, status: 'rejected', steps, reason: err.reason ?? err.message, detail: err.detail };
  }
  const dirty = git('status', '--porcelain', '--', 'content/');
  if (!dirty.ok) throw new Rejection('The content job cannot read the version history (git).', tail(dirty.out));
  if (dirty.out.trim()) {
    return {
      id: req.id, status: 'rejected', steps,
      reason: 'The lesson files have changes that were never saved to the version history, so corrections are paused. '
        + 'Use "Copy diagnostics" on the System page and have a developer look.',
      detail: `git status --porcelain -- content/:\n${dirty.out}`,
    };
  }
  const head0 = git('rev-parse', 'HEAD').out.trim();
  const snap = audioSnapshot(audioDir);
  let committed = false;
  let reloadAsked = false;
  const reloadAndWait = async () => {
    const since = new Date().toISOString();
    reloadAsked = true;
    must(run(env.reloadCmd[0], env.reloadCmd.slice(1), { cwd: root, timeoutMs: 60_000 }),
      'The app could not be told to load the corrected lessons.', env.reloadCmd.join(' '));
    const st = await waitForLoad(spoolDir, since, { timeoutMs: env.reloadTimeoutMs ?? 30_000 });
    if (!st) throw new Rejection('The app did not confirm that it loaded the corrected lessons (no answer within 30 seconds).');
    return st;
  };

  try {
    const isUndo = req.kind === 'undo';
    const targetText = isUndo ? 'target' in (req.after || {}) || 'acceptAlso' in (req.after || {}) : req.after?.target !== undefined || req.after?.acceptAlso !== undefined;

    step('apply');
    const src = sourceSide(req);
    if (req.kind === 'edit') {
      const { file, text } = unitFile(root, req.packId, src.unitId);
      fs.writeFileSync(file, applyEditToText(text, { track: src.target, unitId: src.unitId, kind: req.target.kind, id: src.id, before: req.before, after: req.after,
        native: src.native }));
    } else if (req.kind === 'hide') {
      // a hide names the course's own exercise id (fe-… in a variant course): the generator applies it to that course only
      const { file, text } = unitFile(root, req.packId, src.unitId);
      fs.writeFileSync(file, applyHideToText(text, { exerciseId: req.target.id, reason: `admin correction #${req.id}: ${req.reason}` }));
    } else if (isUndo) {
      // Only the correction's lesson-source changes are reversed; the packs and the id lock are rebuilt from the sources
      // below (lock reason "undo of correction #N"), so an older correction can be undone after later ones in any pack.
      const changed = git('diff', '--name-only', `${req.undo.commit}^`, req.undo.commit).out.split('\n').filter(Boolean);
      const outside = changed.filter((f) => !f.startsWith('content/'));
      if (outside.length) throw new Rejection('That correction changed files outside the lessons, so it cannot be undone here.', outside.join('\n'));
      const patch = spawnSync('git', ['diff', '--binary', `${req.undo.commit}^`, req.undo.commit, '--', 'content/src'], { cwd: root, encoding: 'utf8' });
      if (patch.status !== 0 || !patch.stdout.trim()) throw new Rejection('That correction changed no lesson source, so there is nothing to undo.', patch.stderr ?? '');
      const r = run('git', ['apply', '-R', '--index'], { cwd: root, input: patch.stdout });
      if (!r.ok) throw new Rejection('A later correction changed the same lesson text. Undo that later correction first.', tail(r.out));
    } else {
      throw new Rejection(`Unknown kind of correction "${req.kind}".`);
    }

    step('generate');
    const packs = affectedPacks(req.packId);
    must(node('scripts/generate-pack.js', packs), 'The lessons could not be rebuilt with this change.', `generate ${packs.join(' ')}`);
    must(node('scripts/validate-content.js'), 'The rebuilt lessons did not pass the content check.', 'content:validate');
    if (targetText) {
      step('trace');
      const t = node('scripts/content/trace.js', [req.track]);
      outputs.push(`$ content:trace ${req.track}\n${tail(t.out)}`);
      if (!t.ok) {
        const words = traceProblems(t.out);
        const w = words[0];
        throw new Rejection(
          w ? `"${w.word}" isn't on the ${levelOfFile(w.file)} word list.${words.length > 1 ? ` (${words.length} words are not.)` : ''}`
            : 'The word-list check failed.',
          `content:trace ${req.track}\n${tail(t.out, 60)}`,
        );
      }
    }

    step('lock');
    const lock = checkAndUpdateLock(root, {
      reason: isUndo ? `undo of correction #${req.undo.of}` : `admin correction #${req.id}: ${req.summary}`,
      retire: req.kind === 'hide' ? [req.target.id] : [],
    });
    outputs.push(`id lock: ${JSON.stringify(lock)}`);

    step('audio');
    const r = must(node('scripts/render-audio/index.js', ['--keep-orphans'], { env: { ANZO_AUDIO_DIR: audioDir } }),
      'The new recording could not be made.', 'audio:render --keep-orphans');
    const rendered = Number(r.out.match(/rendered (\d+)/)?.[1] ?? 0);

    if (env.testFiles?.length) {
      step('tests');
      // (the pack up-to-date tests are not among them: the job has just regenerated those packs itself —)
      const tr = run('npx', ['vitest', 'run', ...env.testFiles], { cwd: path.join(root, 'server'), timeoutMs: 4 * 60_000, env: { CI: '1' } });
      must(tr, /ETIMEDOUT/.test(tr.out) ? 'The automatic content checks took longer than 4 minutes and were stopped.'
        : 'The automatic content checks failed with this change.', `vitest ${env.testFiles.join(' ')}`);
    }

    step('commit');
    must(git('add', '-A', '--', 'content/'), 'The change could not be saved in the version history.', 'git add content/');
    if (git('diff', '--cached', '--quiet').ok) throw new Rejection('Nothing in the lessons changed.');
    const message = isUndo
      ? `content: admin correction #${req.id} — undo #${req.undo.of}\n\nReverses the lesson-source changes of ${req.undo.commit}; packs and id lock rebuilt.`
        + `\nRequested by ${req.author} in Admin → Corrections.`
      : `content: admin correction #${req.id} — ${req.summary}\n\n${req.reason ? `Reason: ${req.reason}\n` : ''}Requested by ${req.author} in Admin → Corrections.`
        + `${lock.written ? `\nId lock updated (${[...lock.changed.map((c) => `${c} items changed`), ...lock.retired.map((x) => `${x} retired`)].join(', ') || `${lock.added} added`}).` : ''}`;
    must(run('git', ['-c', 'user.name=Anzo content job', '-c', 'user.email=content-job@anzo.invalid', 'commit', '-q',
      `--author=${req.author} (Anzo admin) <${req.author}@anzo.invalid>`, '-m', message], { cwd: root }),
    'The change could not be saved in the version history.', 'git commit');
    committed = true;
    const commit = git('rev-parse', 'HEAD').out.trim();

    step('reload');
    // Integrity errors that existed before this correction are not its fault: only new ones reject it.
    const errorsBefore = new Set(readStatus(spoolDir, 'content')?.integrity?.errors ?? []);
    const st = await reloadAndWait();
    if (!st.lastReload.ok) throw new Rejection('The app refused the corrected lessons and kept the previous ones.', st.lastReload.error);
    const health = await fetchHealth(env.healthUrl);
    outputs.push(`health ${health.status} ${JSON.stringify(health.body)}`);
    if (health.status !== 200 || !health.body.ok) {
      throw new Rejection(`After the change the app reports a problem: ${(health.body.problems || []).join('; ') || `status ${health.status}`}.`,
        JSON.stringify(health.body));
    }

    step('integrity');
    const newErrors = st.integrity ? (st.integrity.errors || []).filter((e) => !errorsBefore.has(e)) : ['no integrity result'];
    if (newErrors.length) {
      throw new Rejection('The children\'s progress would no longer match the lessons, so the change was undone.', newErrors.join('\n'));
    }
    if (!st.integrity.ok) outputs.push(`integrity: ${st.integrity.errors.length} error(s) that existed before this correction`);

    step('orphans');
    // only the clips this correction stopped using (a plain audio:render would delete pending Record again takes)
    let deletedClips = 0;
    try {
      const after = fs.readFileSync(path.join(audioDir, 'manifest.json'), 'utf8');
      for (const f of releasedClipFiles(snap.manifest, after)) {
        if (fs.existsSync(path.join(audioDir, f))) {
          fs.rmSync(path.join(audioDir, f), { force: true });
          deletedClips += 1;
        }
      }
      outputs.push(`orphans: ${deletedClips} clip file(s) this correction no longer uses deleted`);
    } catch (err) {
      env.log?.({ level: 'warn', msg: 'orphan cleanup failed (the correction is applied)', id: req.id, err: err.message });
    }

    let pushed;
    if (env.autoPush) {
      step('push');
      const p = git('push', '--quiet');
      pushed = p.ok ? 'ok' : `failed: ${tail(p.out, 3)}`;
      if (!p.ok) env.log?.({ level: 'warn', msg: 'git push after a correction failed (the correction is applied)', id: req.id, out: tail(p.out, 10) });
    }

    return {
      id: req.id,
      status: 'applied',
      reason: isUndo ? `Undone: correction #${req.undo.of} is reversed.` : `Applied.${rendered ? ` ${rendered} new recording(s) made.` : ''}`,
      commit,
      steps,
      rendered,
      deletedClips,
      lock,
      ...(pushed ? { pushed } : {}),
      detail: outputs.join('\n\n').slice(-20000),
    };
  } catch (err) {
    const rej = err instanceof Rejection ? err : new Rejection('The content job failed unexpectedly.', err.stack ?? String(err));
    const rollback = [];
    if (fs.existsSync(path.join(root, '.git/REVERT_HEAD'))) rollback.push(`revert --abort: ${git('revert', '--abort').ok}`);
    if (committed) rollback.push(`reset --soft ${head0}: ${git('reset', '-q', '--soft', head0).ok}`);
    rollback.push(`restore content/: ${git('restore', '--staged', '--worktree', '--source=HEAD', '--', 'content/').ok}`);
    rollback.push(`clean content/: ${git('clean', '-fdq', '--', 'content/').ok}`);
    rollback.push(`audio: ${JSON.stringify(restoreAudio(audioDir, snap))}`);
    if (reloadAsked) {
      try {
        const st = await reloadAndWait();
        rollback.push(`reloaded the previous content: ${st.lastReload.ok}`);
      } catch (e) {
        rollback.push(`reload of the previous content failed: ${e.message}`);
      }
    }
    const clean = git('status', '--porcelain', '--', 'content/').out.trim();
    rollback.push(clean ? `content/ NOT clean:\n${clean}` : 'content/ clean');
    return {
      id: req.id,
      status: 'rejected',
      reason: rej.reason,
      steps,
      failedStep: steps[steps.length - 1],
      detail: [`step: ${steps[steps.length - 1]}`, rej.detail, `rollback:\n${rollback.join('\n')}`, ...outputs].filter(Boolean).join('\n\n').slice(-20000),
      rollbackClean: !clean,
    };
  }
}
