#!/usr/bin/env node
// npm run audio:fix [-- --rounds 4] [-- --max-takes 4] [-- --keep-orphans] [-- --workers N] [-- --bulk]
// (--keep-orphans and --workers go to audio:render: keep the files a rollback needs, render with N synth processes)
// Authoring time: repairs the clips the last npm run audio:check flagged (also those heard Bad in Admin → Listen check,
// flag `listen`), with per-clip synthesis overrides in
// content/audio-overrides.json (committed; part of each clip's file name, so only those clips render again):
//   a word or short phrase (a carrier clip, content/voices.json → carrier): 1st another pause mark (carrier.alternatives[0],
//            e.g. "The word;"), then another carrier word (alternatives[1], "The next word,"), then takes of that
//   a sentence: another take of the same settings (take 2, 3, 4: a new seed, so a new render is a new file)
// A clip still flagged after its last take is listed for a human decision (a take chosen by the check's rules is not a
// take a listener prefers). A clip heard Bad for its *pronunciation* is never given another take — it is listed for a
// lexicon entry — and a round that would render more than BULK clips stops (`--bulk` to go on) until a sample of such a
// change has been heard. Never lower noise (noise 0.333 sounds clearly worse) and never "say it twice" (it leaves "old old").
// A pinned clip (pins: chosen by ear) is never touched. After each round: npm run audio:render (only the changed clips) and
// npm run audio:check (the rest is cached). Stops when nothing is flagged or every flagged clip used its takes; what is left
// is listed for a human decision (an explanation under `accepted`, or a hand-written override). Pack content and ids never
// change.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readVoices } from '../render-audio/collect.js';
import { normalizeText, perSpeedEntry, spokenWords } from '../../server/src/audio/clips.js';
import { ABOUT, overrideNote } from '../render-audio/override-notes.js';

const withNote = (entry) => ({ ...entry, why: overrideNote(entry) });

const args = process.argv.slice(2);
const num = (name, d) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : d);
const ROUNDS = num('--rounds', 4);
const MAX_TAKES = num('--max-takes', 4);
/** More clips than this in one round need --bulk: a change to many clips is released only after a sample has been heard. */
export const BULK = 50;

/** A sentence clip (more than three words, or a dialogue turn). */
export const isSentence = (clip) => String(clip.speed).startsWith('dialogue-') || spokenWords(clip.text).length > 3;

/** A Listen-check Bad for a wrong sound: the lexicon fixes it (docs/developer/audio.md), another take does not. */
export const pronunciationRemark = (clip) => clip.listen?.reason === 'wrong-pronunciation';
const overridesFile = path.join(ROOT, 'content', 'audio-overrides.json');
const reportFile = path.join(process.env.ANZO_AUDIO_DIR || path.join(ROOT, 'audio'), 'check-report.json');

/**
 * The next override for a flagged clip, or null when its strategies and takes are used up. `alternatives`: the track's
 * other carriers (content/voices.json → carrier.alternatives), tried in order before any take. An acronym spelling (`say`)
 * is kept.
 */
export function nextOverride(current, clip, alternatives = [], maxTakes = MAX_TAKES) {
  // say keeps its hiatus phonemes
  const say = current?.say ? { say: current.say, ...(current.hiatus ? { hiatus: current.hiatus } : {}) } : {};
  if (clip.carrier) {
    const at = current?.carrier ? alternatives.indexOf(current.carrier) : -1;
    if (at + 1 < alternatives.length) return withNote({ ...say, carrier: alternatives[at + 1] });
  }
  const take = (current?.take ?? 1) + 1;
  if (take > maxTakes) return null;
  const keep = Object.fromEntries(Object.entries(current ?? {}).filter(([k]) => ['say', 'carrier', 'hiatus', 'end', 'lengthFactor'].includes(k)));
  return withNote({ ...keep, take });
}

const readOverrides = () => (fs.existsSync(overridesFile) ? JSON.parse(fs.readFileSync(overridesFile, 'utf8'))
  : { about: ABOUT, clips: {}, accepted: {} });

/** content/audio-overrides.json in its committed layout (keys sorted, one space indent); `file` for a scratch copy. */
export function writeOverrides(o, file = overridesFile) {
  const sortObj = (x) => Object.fromEntries(Object.keys(x).sort((a, b) => a.localeCompare(b)).map((k) => [k, x[k]]));
  const out = { about: o.about, clips: sortObj(Object.fromEntries(Object.entries(o.clips).map(([t, v]) => [t, sortObj(v)]))),
    accepted: sortObj(Object.fromEntries(Object.entries(o.accepted ?? {}).map(([t, v]) => [t, sortObj(v)]))),
    pins: o.pins ?? {} };
  fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
}

const RENDER_ARGS = [
  ...(args.includes('--keep-orphans') ? ['--keep-orphans'] : []),
  ...(args.includes('--workers') ? ['--workers', String(num('--workers', 1))] : []),
];

const run = (script) => {
  const extra = script.startsWith('scripts/render-audio/') ? RENDER_ARGS : [];
  const r = spawnSync(process.execPath, [path.join(ROOT, script), ...extra], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  const tail = r.stdout.trim().split('\n').slice(-1)[0];
  console.log(`  ${path.basename(path.dirname(script))}: ${tail}`);
  return r.status;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  let left = [];
  // Overrides written after the last full check (an earlier audio:fix cut off before its check): hear them first, so no
  // take is spent on a clip that was never checked.
  if (fs.existsSync(overridesFile) && fs.existsSync(reportFile) && fs.statSync(overridesFile).mtimeMs > fs.statSync(reportFile).mtimeMs) {
    console.log('audio-overrides.json is newer than the last check: render and check first');
    if (run('scripts/render-audio/index.js') !== 0) process.exit(1);
    run('scripts/audio-check/index.js');
  }
  for (let round = 1; round <= ROUNDS; round++) {
    const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    if (report.sample) throw new Error('the last audio:check was a sample: run npm run audio:check first');
    const flagged = report.flaggedClips;
    if (!flagged.length) {
      console.log(`round ${round}: nothing flagged`);
      left = [];
      break;
    }
    const o = readOverrides();
    const voices = readVoices();
    let changed = 0;
    left = [];
    for (const c of flagged) {
      const text = normalizeText(c.text);
      if (c.pinned) {
        left.push({ ...c, flags: [...c.flags, 'pinned'] });
        continue;
      }
      o.clips[c.track] ??= {};
      const entry = o.clips[c.track][text];
      const perSpeed = perSpeedEntry(entry) ? entry : entry ? { normal: entry, slow: entry } : {};
      if (pronunciationRemark(c)) {
        left.push({ ...c, flags: [...c.flags, 'pronunciation: a lexicon entry, not a take'] });
        continue;
      }
      const next = nextOverride(perSpeed[c.speed], c, voices[c.track]?.carrier?.alternatives ?? [], MAX_TAKES);
      if (!next) {
        left.push(c);
        continue;
      }
      o.clips[c.track][text] = { ...perSpeed, [c.speed]: next };
      changed += 1;
    }
    console.log(`round ${round}: ${flagged.length} flagged, ${changed} override(s) written, ${left.length} out of takes`);
    if (!changed) break;
    if (changed > BULK && !args.includes('--bulk')) {
      console.log(`${changed} clips would be rendered again (more than ${BULK}): nothing written. Have a sample of`
        + ' such a change heard first (docs/developer/audio.md), then run again with --bulk.');
      process.exit(1);
    }
    writeOverrides(o);
    if (run('scripts/render-audio/index.js') !== 0) process.exit(1);
    run('scripts/audio-check/index.js');
  }
  if (left.length) {
    console.log(`\n${left.length} clip(s) still flagged after ${MAX_TAKES} takes — listen and decide (accepted[track][text] = why, or a hand-written override):`);
    for (const c of left) console.log(`  ${c.track} ${c.speed.padEnd(6)} "${c.text}": ${c.flags.join(', ')} — heard "${c.heard}"`);
  }
}
