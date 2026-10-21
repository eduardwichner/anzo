#!/usr/bin/env node
// npm run audio:check [-- --track en] [-- --sample N] [-- --workers N (default and max 2, 1 on a 4 GB machine)] [-- --no-cache] [-- --json]
//                     [-- --manifest <file>] [-- --report <file>]   check exactly the clips that manifest lists (e.g. the one
//                     saved before a re-render), writing the report elsewhere; never the spool status
//                     [-- --only <file,…> -- --report <file>]   report only these clips (the content job's "Record again")
// Authoring time only (like audio:render): checks every rendered clip the content needs.
//   metrics   analyze.py (tools/vosk-venv): voiced span from 10 ms energy frames, leading/trailing silence, clipping
//   speech    Vosk small model per language (models/vosk): the transcript is compared with the clip's text
//   flags     lib.js: duration outliers per (language, speed, length class), extra recognized words (babble), high word
//             error rate on phrases, long leading silence, clipping, silence; `listen`: heard Bad in Admin → Listen check
//             (listen.js, the live database) — never explained away, audio:fix renders it again
// Results are cached per clip file (names are content hashes) in audio/check-cache.json, so a re-check after a re-render
// only analyses new clips. Writes audio/check-report.json (every flagged clip with its metrics), status/audio-check.json
// in the spool (Admin → System: "Audio check: N flagged"), and prints counts per language and the worst 30.
// A flag can be explained in content/audio-overrides.json → accepted[track][text] (e.g. a recognizer limit); it then
// counts as explained, not flagged.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { collectClips, readVoices, ROOT } from '../render-audio/collect.js';
import { applyLexicon, overrideFor, readAudioOverrides, readPronunciations } from '../../server/src/audio/clips.js';
import { writeStatus } from '../../server/src/ops/spool.js';
import { workersFor } from '../lib/machine.js';
import { acceptedFor, flagClip, groupStats, severity, staleClips, THRESHOLDS } from './lib.js';
import { readListenBad } from './listen.js';
import { compileLexicon } from '../render-audio/lexicon.js';

const CHECK_VERSION = 1; // bump when analyze.py measures differently: the cache is then ignored
const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const audioDir = path.resolve(process.env.ANZO_AUDIO_DIR || path.join(ROOT, 'audio'));
const cacheFile = path.join(audioDir, 'check-cache.json');
const reportFile = path.resolve(arg('--report') ?? path.join(audioDir, 'check-report.json')); // --report: elsewhere (a --manifest run)
const python = path.join(ROOT, 'tools', 'vosk-venv', 'bin', 'python');
const started = Date.now();
const cpu0 = process.cpuUsage();

if (!fs.existsSync(python)) {
  console.error('tools/vosk-venv is missing: run ./scripts/fetch-models.sh');
  process.exit(2);
}

const contentDir = path.join(ROOT, 'content');
const overrides = readAudioOverrides(contentDir) ?? {};
// what the lexicon sources say now (content/src/<track>/pronunciations.yaml): a clip rendered with an older lexicon — the
// compiled content/pronunciations.json the renderer last used, which names the files — is flagged `pronunciation`
const lexicon = (() => {
  try { return compileLexicon(contentDir).tracks; } catch (err) { console.error(err.message); return readPronunciations(contentDir); }
})();
const voices = readVoices();
/** The clips a manifest lists (`--manifest`): what was rendered then, said as written (or as its override said it). */
function manifestClips(file) {
  const man = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = new Map();
  for (const [track, speeds] of Object.entries(man.clips)) {
    for (const [speed, texts] of Object.entries(speeds)) {
      for (const [text, f] of Object.entries(texts)) {
        if (!out.has(f)) out.set(f, { file: f, track, speed, text, ...(man.files?.[f]?.gapMs !== undefined ? { gapMs: man.files[f].gapMs } : {}) });
      }
    }
  }
  return [...out.values()];
}
const manifestArg = arg('--manifest');
let clips = (manifestArg ? manifestClips(path.resolve(manifestArg)) : collectClips({ voices }))
  .filter((c) => fs.existsSync(path.join(audioDir, c.file)));
// the carrier gap synth.py measured (audio/manifest.json → files[file].gapMs)
const liveFiles = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(audioDir, 'manifest.json'), 'utf8')).files ?? {}; } catch { return {}; }
})();
for (const c of clips) {
  if (c.gapMs === undefined && liveFiles[c.file]?.gapMs !== undefined) c.gapMs = liveFiles[c.file].gapMs;
  if (c.wordDb === undefined && liveFiles[c.file]?.wordDb !== undefined) c.wordDb = liveFiles[c.file].wordDb;
  // what synth.py measured in a sentence clip: its pauses and a hiatus break
  for (const k of ['pauseMarkMs', 'pauseExtraMs', 'hiatusMs']) if (c[k] === undefined && liveFiles[c.file]?.[k] !== undefined) c[k] = liveFiles[c.file][k];
  // what the current lexicon would have the clip say (a pinned clip keeps what it said)
  c.expectedSaid = c.pinned ? (c.said ?? c.text) : applyLexicon(c.text, lexicon?.[c.track]);
  c.spoken = overrideFor(overrides, c.track, c.speed, c.text)?.say ?? c.said ?? c.text;
}
if (arg('--track')) clips = clips.filter((c) => c.track === arg('--track'));
if (arg('--sample')) {
  const n = Number(arg('--sample'));
  const step = Math.max(1, Math.floor(clips.length / n));
  clips = clips.filter((_, i) => i % step === 0).slice(0, n);
}

let cache = { version: CHECK_VERSION, results: {} };
if (!args.includes('--no-cache') && fs.existsSync(cacheFile)) {
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (c.version === CHECK_VERSION) cache = c;
  } catch {
    console.log('audio:check — the cache is unreadable (a cut-off write?): starting over');
  }
}
// written to a temp file and renamed: a cut-off never leaves half a cache
const saveCache = () => {
  fs.writeFileSync(`${cacheFile}.tmp`, JSON.stringify(cache));
  fs.renameSync(`${cacheFile}.tmp`, cacheFile);
};
const stampOf = (file) => {
  const st = fs.statSync(path.join(audioDir, file));
  return `${st.size}:${Math.round(st.mtimeMs)}`;
};
const todo = staleClips(clips, cache.results, stampOf);
console.log(`audio:check — ${clips.length} clips, ${clips.length - todo.length} cached, ${todo.length} to analyse`);

/** Run analyze.py workers over the clips; results land in cache.results[file]. */
async function analyse(list) {
  // 2 workers by default (standing rule 13): each loads the three Vosk models (≈ 600 MB); 3 workers beside a test run and
  // other heavy jobs can exhaust a 4 GB machine (exit 137). `--workers N` (1–3) overrides it when nothing else runs.
  // The default follows the machine (≈ 1.1 GB per worker; 2 on 8 GB, 1 on 4 GB); --workers N up to 3
  // an explicit --workers is capped by memory too (3 × 1.1 GB does not fit 4 GB)
  const workers = Math.max(1, Math.min(Number(arg('--workers')) || 2, workersFor({ max: 2, perWorkerGB: 1.1 }))); // ≤ 2: rule 13
  const queue = [...list];
  let done = 0;
  let workerCpuMs = 0;
  const one = () => new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(ROOT, 'scripts', 'audio-check', 'analyze.py')], { stdio: ['pipe', 'pipe', 'inherit'] });
    const pending = new Map();
    const feed = () => {
      while (pending.size < 4 && queue.length) {
        const c = queue.shift();
        pending.set(c.file, c);
        child.stdin.write(`${JSON.stringify({ id: c.file, path: path.join(audioDir, c.file), track: c.track })}\n`);
      }
      if (!pending.size && !queue.length) child.stdin.end();
    };
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      const r = JSON.parse(line);
      pending.delete(r.id);
      cache.results[r.id] = { ...r, stamp: stampOf(r.id) };
      done += 1;
      if (done % 500 === 0) {
        console.log(`  ${done}/${list.length} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
        saveCache();
      }
      feed();
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code !== 0) return reject(new Error(`analyze.py exited ${code ?? signal}`));
      resolve();
    });
    feed();
  });
  await Promise.all(Array.from({ length: Math.min(workers, list.length) }, one));
  return workerCpuMs;
}

if (todo.length) await analyse(todo);

// espeak's phonemes of what each clip says (phonemes.py in tools/piper-venv; cached per language and text)
cache.phonemes ??= {};
{
  const espeakOf = Object.fromEntries(Object.entries(voices).map(([t, v]) => {
    try {
      return [t, JSON.parse(fs.readFileSync(path.join(ROOT, 'models', 'piper', `${v.voice}.onnx.json`), 'utf8')).espeak?.voice ?? t];
    } catch { return [t, t]; }
  }));
  const need = [...new Set(clips.map((c) => `${c.track}|${c.spoken}`))].filter((k) => cache.phonemes[k] === undefined);
  const piperPython = path.join(ROOT, 'tools', 'piper-venv', 'bin', 'python');
  if (need.length && fs.existsSync(piperPython)) {
    console.log(`phonemes for ${need.length} text(s)…`);
    const input = need.map((k) => {
      const i = k.indexOf('|');
      return JSON.stringify({ id: k, espeak: espeakOf[k.slice(0, i)], text: k.slice(i + 1) });
    }).join('\n');
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(piperPython, [path.join(ROOT, 'scripts', 'audio-check', 'phonemes.py')], { input, encoding: 'utf8', maxBuffer: 1 << 28 });
    for (const line of r.stdout.split('\n').filter(Boolean)) {
      const o = JSON.parse(line);
      if (o.ok) cache.phonemes[o.id] = o.phonemes;
    }
  } else if (need.length) console.log('tools/piper-venv is missing: the phoneme rules (onset, coda, second, pronunciation) see less');
}
for (const c of clips) c.phonemes = cache.phonemes[`${c.track}|${c.spoken}`];
// Drop cached results of clips that no longer exist (on disk: the files kept for a rollback stay cached), then save.
const wanted = new Set([...collectClips({ voices }).map((c) => c.file), ...clips.map((c) => c.file)]);
for (const f of Object.keys(cache.results)) if (!wanted.has(f) && !fs.existsSync(path.join(audioDir, f))) delete cache.results[f];
saveCache();

const rows = clips.map((c) => ({ ...c, m: cache.results[c.file] })).filter((r) => r.m);
const failed = rows.filter((r) => !r.m.ok);
const okRows = rows.filter((r) => r.m.ok);
const stats = groupStats(okRows);
for (const r of okRows) r.check = flagClip(r, stats);
// Admin → Listen check: a clip heard Bad whose file is still the one heard (not for a --manifest run: an old manifest)
const listenBad = manifestArg ? new Map() : (await readListenBad(ROOT)) ?? new Map();
for (const r of okRows) {
  const heard = listenBad.get(r.file);
  if (!heard) continue;
  r.check.flags.push('listen');
  r.listen = heard;
}
// a pinned clip (preferred by ear to a new rendering) is explained, never re-rendered by audio:fix; a clip heard Bad
// in the Listen check is never explained away
const accepted = (r) => (r.listen ? null
  : acceptedFor(overrides.accepted, r) ?? (r.pinned ? 'pinned: chosen by ear over a new rendering' : null));
const flaggedAll = okRows.filter((r) => r.check.flags.length);
const explained = flaggedAll.filter((r) => accepted(r));
const uncertainAll = okRows.filter((r) => !r.check.flags.length && r.check.uncertain.length);
const flagged = flaggedAll.filter((r) => !accepted(r));

const byTrack = {};
for (const r of okRows) {
  byTrack[r.track] ??= { clips: 0, flagged: 0, explained: 0, uncertain: 0, flags: {} };
  if (!r.check.flags.length && r.check.uncertain.length) byTrack[r.track].uncertain += 1;
  const b = byTrack[r.track];
  b.clips += 1;
  if (r.check.flags.length) {
    if (accepted(r)) b.explained += 1;
    else b.flagged += 1;
    for (const f of r.check.flags) b.flags[f] = (b.flags[f] ?? 0) + 1;
  }
}

const brief = (r) => ({
  file: r.file, track: r.track, speed: r.speed, text: r.text, flags: r.check.flags, durationMs: r.m.durationMs, voicedMs: r.m.voicedMs,
  expectedMs: r.check.expectedMs, z: r.check.z, leadMs: r.m.leadMs, trailMs: r.m.trailMs, clipped: r.m.clipped,
  heard: r.m.transcript, wer: r.check.wer, segments: r.m.segments, ...(r.override ? { override: r.override } : {}),
  ...(r.phonemes ? { phonemes: r.phonemes } : {}), ...(r.gapMs !== undefined ? { gapMs: r.gapMs, wordDb: r.wordDb } : {}),
  ...(r.carrier ? { carrier: r.carrier } : {}), ...(r.pinned ? { pinned: r.pinned } : {}),
  ...(r.pauseMarkMs !== undefined ? { pauseMarkMs: r.pauseMarkMs } : {}), ...(r.pauseExtraMs !== undefined ? { pauseExtraMs: r.pauseExtraMs } : {}),
  ...(r.hiatusMs !== undefined ? { hiatusMs: r.hiatusMs } : {}),
  onsetMs: r.m.onsetMs, afterVowelMs: r.m.afterVowelMs, quietTailMs: r.m.quietTailMs,
  ...(accepted(r) ? { accepted: accepted(r) } : {}), ...(r.listen ? { listen: r.listen } : {}),
});
// --only a.mp3,b.mp3 (the content job's "Record again"): every clip is checked as usual (group statistics need
// them all; the cache makes it quick), but the report lists only these files, and the spool status is left alone
const only = arg('--only') ? new Set(arg('--only').split(',')) : null;
if (only) for (const list of [flagged, explained, uncertainAll]) list.splice(0, list.length, ...list.filter((r) => only.has(r.file)));
const worst = [...flagged].sort((a, b) => severity(b) - severity(a));
const cpu = process.cpuUsage(cpu0);
const summary = {
  checkedAt: new Date().toISOString(), clips: rows.length, analysed: todo.length, failed: failed.length, flagged: flagged.length,
  explained: explained.length, uncertain: uncertainAll.length, byTrack, wallSeconds: Math.round((Date.now() - started) / 1000), thresholds: THRESHOLDS,
  sample: Boolean(arg('--sample') || arg('--track') || manifestArg || only), ...(only ? { only: [...only] } : {}), ...(manifestArg ? { manifest: manifestArg } : {}),
};
fs.writeFileSync(reportFile, `${JSON.stringify({ ...summary, flaggedClips: worst.map(brief), explainedClips: explained.map(brief),
  uncertainClips: uncertainAll.map((r) => ({ ...brief(r), uncertain: r.check.uncertain })),
  groups: Object.fromEntries([...stats].map(([k, v]) => [k, { n: v.n, msPerLetter: Math.round(v.medPerLetter) }])) }, null, 1)}\n`);
if (!summary.sample) {
  try {
    writeStatus(process.env.ANZO_SPOOL_DIR || '/var/spool/anzo', 'audio-check', { ...summary, worst: worst.slice(0, 10).map(brief),
      // every flagged file with its flags: the System tile combines them with the Listen-check verdicts given since
      flaggedFiles: worst.slice(0, 5000).map((r) => ({ file: r.file, flags: r.flags })) });
  } catch (err) {
    console.error(`could not write the spool status (${err.code ?? err.message}); Admin → System keeps the previous result`);
  }
}

if (args.includes('--json')) console.log(JSON.stringify(summary, null, 1));
for (const [track, b] of Object.entries(byTrack)) {
  console.log(`${track}: ${b.clips} clips, ${b.flagged} flagged, ${b.explained} explained, ${b.uncertain} uncertain (recognizer)  ${JSON.stringify(b.flags)}`);
}
if (failed.length) for (const r of failed.slice(0, 10)) console.log(`FAILED ${r.file} "${r.text}": ${r.m.error}`);
console.log(`\nworst ${Math.min(30, worst.length)} of ${flagged.length} flagged:`);
for (const r of worst.slice(0, 30)) {
  console.log(`  ${r.file} ${r.speed.padEnd(6)} ${JSON.stringify(r.text).slice(0, 40).padEnd(40)} ${r.check.flags.join(',').padEnd(18)} `
    + `voiced ${r.m.voicedMs} ms (typ. ${r.check.expectedMs ?? '?'}, z ${r.check.z ?? '?'}) heard "${r.m.transcript.slice(0, 50)}"`);
}
console.log(`\n${rows.length} clips, ${flagged.length} flagged, ${explained.length} explained — ${summary.wallSeconds} s wall, `
  + `driver CPU ${((cpu.user + cpu.system) / 1e6).toFixed(0)} s; report: ${path.relative(ROOT, reportFile)}`);
process.exit(failed.length ? 1 : 0);
