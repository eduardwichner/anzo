// "Record again" in the content job (the service side is server/src/ops/rerecord.js). Three phases, each its
// own spool request (requests/rerecord-NNNNNN.json → results/rerecord-NNNNNN.json):
//   make  the next take of one clip with the current method (the override's take + 1: a new seed; carrier, lexicon and pause
//         shaping apply; a pin is lifted for it), rendered and checked; then content/ and audio/manifest.json are put back as
//         they were, so the app keeps playing the old clip and corrections are not blocked. The new file stays on disk.
//   keep  the take is written to content/audio-overrides.json, rendered (the file is there: nothing is synthesized),
//         committed, and the app reloads; any failure puts everything back.
//   drop  the new file is deleted (never one the live manifest uses).
// Nothing in a request is trusted: the spool is writable by the whole anzo-ops group.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clipPacks, clipsForPacks, OVERRIDE_SPEEDS, normalizeText, perSpeedEntry, readAudioOverrides, readPronunciations } from '../../server/src/audio/clips.js';
import { validateContent } from '../../server/src/content/validate.js';
import { writeOverrides } from '../audio-check/fix.js';
import { fetchHealth, Rejection, run, waitForLoad } from './content-job-lib.js';
import { overrideNote } from '../render-audio/override-notes.js';

const FILE_RE = /^[a-z]{2}\/[0-9a-f]{16}\.mp3$/;
const tail = (text, n = 30) => String(text ?? '').trim().split('\n').slice(-n).join('\n');
/** The override fields a take may carry (the current method: no noise or trim settings). */
const ENTRY_FIELDS = { say: 'string', carrier: 'string', end: 'string', lengthFactor: 'number', take: 'number', why: 'string', hiatus: 'object' };

export function validateRerecord(req, voices) {
  const bad = (what) => new Rejection('The request was malformed and was not carried out.', `invalid request field: ${what}`);
  if (!req || typeof req !== 'object' || req.kind !== 'rerecord') throw bad('kind');
  if (!['make', 'keep', 'drop'].includes(req.phase)) throw bad('phase');
  if (!Number.isInteger(req.id) || req.id < 1) throw bad('id');
  if (typeof req.author !== 'string' || !/^[a-z0-9_-]{2,24}$/.test(req.author)) throw bad('author');
  if (typeof req.track !== 'string' || !/^[a-z]{2}$/.test(req.track) || !voices[req.track]) throw bad('track');
  if (!OVERRIDE_SPEEDS.includes(req.speed)) throw bad('speed');
  if (typeof req.text !== 'string' || !req.text.trim() || req.text.length > 600) throw bad('text');
  if (!FILE_RE.test(String(req.oldFile))) throw bad('oldFile');
  if (req.phase === 'make') return;
  if (!FILE_RE.test(String(req.newFile)) || !req.newFile.startsWith(`${req.track}/`)) throw bad('newFile');
  if (req.phase === 'keep') {
    const e = req.entry;
    if (!e || typeof e !== 'object' || Array.isArray(e)) throw bad('entry');
    for (const [k, v] of Object.entries(e)) if (ENTRY_FIELDS[k] !== typeof v || (typeof v === 'string' && v.length > 600)) throw bad(`entry.${k}`);
    if (!Number.isInteger(e.take) || e.take < 2 || e.take > 99) throw bad('entry.take');
    if (e.end !== undefined && e.end !== 'cut') throw bad('entry.end');
    // a say text's hiatus phonemes go with it: a list of short strings
    if (e.hiatus !== undefined && (!Array.isArray(e.hiatus) || e.hiatus.length > 10 || !e.hiatus.every((h) => typeof h === 'string' && h.length > 0 && h.length <= 80))) throw bad('entry.hiatus');
    if (typeof req.unpin !== 'boolean') throw bad('unpin');
  }
}

/** Overrides with `entry` as this clip's override at this speed (and its pin lifted when `unpin`). A pure function. */
export function withEntry(overrides, { track, speed, text }, entry, unpin) {
  const o = structuredClone(overrides ?? {});
  o.clips ??= {};
  o.accepted ??= {};
  o.pins ??= {};
  const t = normalizeText(text);
  o.clips[track] ??= {};
  const cur = o.clips[track][t];
  const perSpeed = perSpeedEntry(cur) ? { ...cur } : cur ? Object.fromEntries(['normal', 'slow'].map((s) => [s, cur])) : {};
  perSpeed[speed] = entry;
  o.clips[track][t] = perSpeed;
  if (unpin && o.pins[track]?.[t]?.[speed]) {
    delete o.pins[track][t][speed];
    if (!Object.keys(o.pins[track][t]).length) delete o.pins[track][t];
  }
  return o;
}

/** The current override of a clip at one speed (a plain entry counts for every speed), or null. */
export function currentEntry(overrides, { track, speed, text }) {
  const cur = overrides?.clips?.[track]?.[normalizeText(text)];
  if (!cur) return null;
  return perSpeedEntry(cur) ? cur[speed] ?? null : cur;
}

/**
 * The next take of a clip: its say/carrier/end/lengthFactor kept, take + 1 — skipping a take whose file is already on disk
 * (tried before) — and a pin lifted. `fileOf(overrides)` names the clip's file under given overrides.
 */
export function nextTake(overrides, clip, { fileOf, exists, author, id, max = 40 }) {
  const cur = currentEntry(overrides, clip) ?? {};
  // hiatus goes with say (a new take of "We will visit Grandma on Sunday." would otherwise lose its break)
  const keep = Object.fromEntries(Object.entries(cur).filter(([k]) => ['say', 'carrier', 'end', 'lengthFactor', 'hiatus'].includes(k)));
  const unpin = Boolean(overrides?.pins?.[clip.track]?.[normalizeText(clip.text)]?.[clip.speed]);
  for (let take = Math.max(2, (cur.take ?? 1) + 1); take <= max; take += 1) {
    const entry = { ...keep, take };
    entry.why = overrideNote(entry);
    const file = fileOf(withEntry(overrides, clip, entry, unpin));
    if (!exists(file)) return { entry, unpin, file };
  }
  throw new Rejection('Every take of this recording has been tried already.');
}

export async function processRerecord(req, env) {
  const { root, audioDir, spoolDir } = env;
  const contentDir = path.join(root, 'content');
  const overridesFile = path.join(contentDir, 'audio-overrides.json');
  const manifestFile = path.join(audioDir, 'manifest.json');
  const git = (...args) => run('git', args, { cwd: root });
  const node = (script, args = []) => run(process.execPath, [path.join(root, script), ...args], { cwd: root, env: { ANZO_AUDIO_DIR: audioDir }, timeoutMs: 15 * 60_000 });
  const base = { id: Number.isInteger(req?.id) ? req.id : null, phase: req?.phase ?? null };
  const step = (name) => env.progress?.(name);
  const voices = JSON.parse(fs.readFileSync(path.join(contentDir, 'voices.json'), 'utf8'));
  try {
    validateRerecord(req, voices);
  } catch (err) {
    return { ...base, status: 'failed', reason: err.reason ?? err.message, detail: err.detail };
  }
  const clip = { track: req.track, speed: req.speed, text: req.text };

  if (req.phase === 'drop') {
    step('drop');
    const live = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (live.files?.[req.newFile]) return { ...base, status: 'failed', reason: 'The app uses that recording, so it was not deleted.' };
    fs.rmSync(path.join(audioDir, req.newFile), { force: true });
    return { ...base, status: 'dropped', reason: 'The old recording stays; the new one was deleted.' };
  }

  step('preflight');
  const dirty = git('status', '--porcelain', '--', 'content/');
  if (!dirty.ok || dirty.out.trim()) {
    return { ...base, status: 'failed', reason: 'The lesson files have unsaved changes, so nothing was recorded. Use "Copy diagnostics" on the System page.',
      detail: dirty.out };
  }
  const manifestBefore = fs.readFileSync(manifestFile, 'utf8');
  const overrides = readAudioOverrides(contentDir) ?? {};
  const { errors, packs } = validateContent({ packsDir: path.join(contentDir, 'packs') });
  if (errors.length) return { ...base, status: 'failed', reason: 'The lessons do not load, so nothing was recorded.' };
  const lexicon = readPronunciations(contentDir);
  const find = (o) => clipsForPacks(clipPacks(packs), voices, o, lexicon)
    .find((c) => c.track === clip.track && c.speed === clip.speed && c.text === normalizeText(clip.text));
  const now = find(overrides);
  if (!now) return { ...base, status: 'failed', reason: 'The lessons no longer use this recording.' };
  const outputs = [];
  const must = (r, reason, label) => {
    outputs.push(`$ ${label}\n${tail(r.out)}`);
    if (!r.ok) throw new Rejection(reason, `${label} (exit ${r.code})\n${tail(r.out, 60)}`);
    return r;
  };
  const putBack = () => {
    git('restore', '--staged', '--worktree', '--source=HEAD', '--', 'content/');
    fs.writeFileSync(manifestFile, manifestBefore);
  };

  if (req.phase === 'make') {
    try {
      if (now.file !== req.oldFile) throw new Rejection('The recording changed since the request was made. Ask again.');
      const exists = (f) => fs.existsSync(path.join(audioDir, f));
      const { entry, unpin, file } = nextTake(overrides, clip, { fileOf: (o) => find(o).file, exists, author: req.author, id: req.id });
      step('render');
      writeOverrides(withEntry(overrides, clip, entry, unpin), overridesFile);
      must(node('scripts/render-audio/index.js', ['--keep-orphans']), 'The new recording could not be made.', 'audio:render --keep-orphans');
      if (!exists(file)) throw new Rejection('The new recording could not be made.', `${file} was not written`);
      step('check');
      const report = path.join(os.tmpdir(), `anzo-rerecord-${req.id}.json`);
      const c = node('scripts/audio-check/index.js', ['--only', file, '--report', report]);
      outputs.push(`$ audio:check --only ${file}\n${tail(c.out, 8)}`);
      let flagsNew = [];
      try {
        const r = JSON.parse(fs.readFileSync(report, 'utf8'));
        flagsNew = [...r.flaggedClips, ...r.explainedClips].find((x) => x.file === file)?.flags ?? [];
      } catch {
        flagsNew = ['not-checked'];
      }
      fs.rmSync(report, { force: true });
      let flagsOld = [];
      try {
        const last = JSON.parse(fs.readFileSync(path.join(audioDir, 'check-report.json'), 'utf8'));
        flagsOld = [...last.flaggedClips, ...last.explainedClips].find((x) => x.file === req.oldFile)?.flags ?? [];
      } catch { /* no full check yet */ }
      putBack();
      return { ...base, status: 'review', newFile: file, entry, unpin, flagsNew, flagsOld,
        reason: flagsNew.length ? `A new recording was made; the check notes: ${flagsNew.join(', ')}.` : 'A new recording was made; the check found nothing.',
        detail: outputs.join('\n\n').slice(-20000) };
    } catch (err) {
      putBack();
      const rej = err instanceof Rejection ? err : new Rejection('The content job failed unexpectedly.', err.stack ?? String(err));
      return { ...base, status: 'failed', reason: rej.reason, detail: [rej.detail, ...outputs].filter(Boolean).join('\n\n').slice(-20000) };
    }
  }

  // keep
  const head0 = git('rev-parse', 'HEAD').out.trim();
  let committed = false;
  let reloaded = false;
  const reload = async () => {
    const since = new Date().toISOString();
    reloaded = true;
    must(run(env.reloadCmd[0], env.reloadCmd.slice(1), { cwd: root, timeoutMs: 60_000 }), 'The app could not be told to load the new recording.', env.reloadCmd.join(' '));
    const st = await waitForLoad(spoolDir, since, { timeoutMs: env.reloadTimeoutMs ?? 30_000 });
    if (!st) throw new Rejection('The app did not confirm that it loaded the new recording.');
    return st;
  };
  try {
    step('render');
    writeOverrides(withEntry(overrides, clip, req.entry, req.unpin), overridesFile);
    const after = find(readAudioOverrides(contentDir));
    if (after?.file !== req.newFile) throw new Rejection('The new recording no longer matches the lessons. Ask for it again.', `${after?.file} ≠ ${req.newFile}`);
    if (!fs.existsSync(path.join(audioDir, req.newFile))) throw new Rejection('The new recording is gone. Ask for it again.');
    must(node('scripts/render-audio/index.js', ['--keep-orphans']), 'The recording could not be put in place.', 'audio:render --keep-orphans');
    step('commit');
    must(git('add', '--', 'content/audio-overrides.json'), 'The change could not be saved in the version history.', 'git add');
    const message = `audio: record again #${req.id} — ${req.track} ${req.speed} "${req.text.slice(0, 80)}"\n\n`
      + `${req.oldFile} → ${req.newFile} (take ${req.entry.take}${req.unpin ? ', pin lifted' : ''}).\nChosen by ${req.author} in the browser (Keep new).`;
    must(run('git', ['-c', 'user.name=Anzo content job', '-c', 'user.email=content-job@anzo.invalid', 'commit', '-q',
      `--author=${req.author} (Anzo admin) <${req.author}@anzo.invalid>`, '-m', message], { cwd: root }), 'The change could not be saved in the version history.', 'git commit');
    committed = true;
    const commit = git('rev-parse', 'HEAD').out.trim();
    step('reload');
    const st = await reload();
    if (!st.lastReload.ok) throw new Rejection('The app refused to load the new recording.', st.lastReload.error);
    const health = await fetchHealth(env.healthUrl);
    if (health.status !== 200 || !health.body.ok) {
      throw new Rejection(`After the change the app reports a problem: ${(health.body.problems || []).join('; ') || `status ${health.status}`}.`);
    }
    return { ...base, status: 'kept', commit, reason: 'The new recording is in use.', detail: outputs.join('\n\n').slice(-20000) };
  } catch (err) {
    const rej = err instanceof Rejection ? err : new Rejection('The content job failed unexpectedly.', err.stack ?? String(err));
    if (committed) git('reset', '-q', '--soft', head0);
    putBack();
    if (reloaded) await reload().catch(() => {});
    return { ...base, status: 'failed', reason: rej.reason, detail: [rej.detail, ...outputs].filter(Boolean).join('\n\n').slice(-20000) };
  }
}
