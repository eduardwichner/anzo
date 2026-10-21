// Render core: diff the clip list against what exists, synthesize + encode only what's missing,
// delete orphans, write audio/manifest.json. The synthesizer and encoder are injected so the
// unit tests can run it with fakes; index.js wires in Piper (synth.py) and lame.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MANIFEST = 'manifest.json';
export const MEASURES = 'render-measures.json';
/** What synth.py measured in a sentence clip, kept in audio/manifest.json → files: the longest hiatus break. */
export const RENDER_MEASURES = ['hiatusMs'];

/** The noise seed of a clip: the first 32 bits of its content-hash name ("en/0123abcd….mp3" → 0x0123abcd). */
export const seedOf = (file) => Number.parseInt(path.basename(file).slice(0, 8), 16);
const CLIP_RE = /^[a-z]{2}\/[0-9a-f]{16}\.mp3$/;

export function readManifest(audioDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(audioDir, MANIFEST), 'utf8'));
  } catch {
    return null;
  }
}

/** Every clip file currently on disk (relative paths like "en/0123abcd....mp3"); audition clips excluded. */
export function filesOnDisk(audioDir) {
  if (!fs.existsSync(audioDir)) return [];
  return fs
    .readdirSync(audioDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^[a-z]{2}$/.test(d.name))
    .flatMap((d) => fs.readdirSync(path.join(audioDir, d.name)).map((f) => `${d.name}/${f}`))
    .filter((f) => CLIP_RE.test(f));
}

/** What needs doing. A clip is reused when its file exists (names are content hashes). */
export function planRender(clips, audioDir, { force = false } = {}) {
  const wanted = new Set(clips.map((c) => c.file));
  const onDisk = new Set(filesOnDisk(audioDir));
  // a pinned clip is never rendered (not even with --force): it is the file chosen by ear; a missing one is a failure
  const render = clips.filter((c) => !c.pinned && (force || !onDisk.has(c.file)));
  const reuse = clips.filter((c) => onDisk.has(c.file) && (c.pinned || !force));
  const lostPins = clips.filter((c) => c.pinned && !onDisk.has(c.file));
  const orphans = [...onDisk].filter((f) => !wanted.has(f)).sort();
  return { render, reuse, orphans, lostPins };
}

export function buildManifest(clips, voices, stats) {
  const clipMap = {};
  for (const c of clips) {
    clipMap[c.track] ??= { normal: {}, slow: {} };
    (clipMap[c.track][c.speed] ??= {})[c.text] = c.file; // + dialogue-normal / dialogue-slow (speaker B of a dialogue)
  }
  const files = {};
  for (const c of clips) files[c.file] = stats[c.file] ?? null;
  const voiceInfo = Object.fromEntries(
    Object.entries(voices).map(([track, v]) => [track, {
      voice: v.voice, speaker: v.speaker ?? null, lengthScale: v.lengthScale, slowLengthScale: v.slowLengthScale,
      ...(v.dialogue ? { dialogue: { voice: v.dialogue.voice, speaker: v.dialogue.speaker ?? null, lengthScale: v.dialogue.lengthScale, slowLengthScale: v.dialogue.slowLengthScale } } : {}),
    }]),
  );
  return { version: 1, voices: voiceInfo, clips: clipMap, files };
}

async function pool(items, size, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

/**
 * @param clips       from collect.js
 * @param voices      content/voices.json
 * @param synthesizer { synthesize(jobs) -> Promise<results[]> }  jobs: { voice, text, out, lengthScale, speaker, file }
 * @param encode      (wavPath, mp3Path) -> Promise
 * @param modelPath   voice name -> path to .onnx
 */
export async function runRender({ clips, voices, audioDir, synthesizer, encode, modelPath, force = false, keepOrphans = false, workers = 1, log = () => {} }) {
  fs.mkdirSync(audioDir, { recursive: true });
  const plan = planRender(clips, audioDir, { force });
  const previous = readManifest(audioDir);
  // what synth.py measured in every file still on disk (audio/render-measures.json): a file kept by --keep-orphans and used
  // again later (audio:fix going back to an earlier take) keeps its seed and measures
  const measuresFile = path.join(audioDir, MEASURES);
  let measures = {};
  try {
    measures = JSON.parse(fs.readFileSync(measuresFile, 'utf8'));
  } catch { /* none yet */ }
  const stats = { ...measures, ...(previous?.files ?? {}) };
  const failed = plan.lostPins.map((c) => ({ file: c.file, text: c.text, error: 'pinned clip is missing (restore it from a backup, or remove its pin)' }));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-render-'));
  try {
    if (plan.render.length) {
      log(`synthesizing ${plan.render.length} clip(s)…`);
      const jobs = plan.render.map((c, i) => ({
        voice: modelPath(c.voice),
        text: c.said ?? c.text, // the pronunciation lexicon's phoneme blocks (content/pronunciations.json)
        lengthScale: c.lengthScale * (c.override?.lengthFactor ?? 1),
        speaker: c.speaker,
        // a short clip is said after a carrier sentence ("The word, eight.") and cut out in the pause (synth.py)
        ...(c.carrier ? { carrier: c.carrier } : {}),
        // content/audio-overrides.json: what to say instead (an acronym spelled out: "O-C-M-W"), noise, trimming after the word.
        ...(c.override?.say ? { text: c.override.say } : {}),
        ...(c.override?.noiseScale !== undefined ? { noiseScale: c.override.noiseScale } : {}),
        ...(c.override?.noiseW !== undefined ? { noiseW: c.override.noiseW } : {}),
        ...(c.override?.trim ? { trim: c.override.trim } : {}),
        ...(c.override?.end ? { end: c.override.end } : {}),
        seed: seedOf(c.file), // Piper's noise, seeded per clip: the same clip renders to the same file (synth.py)
        slow: c.speed.endsWith('slow'), // a longer hiatus break
        ...(c.hiatus ? { hiatus: c.hiatus } : {}), // lexicon words said before a short break (sofa is: no intrusive r)
        out: path.join(tmp, `${i}.wav`),
        file: c.file,
      }));
      const results = await synthesizer.synthesize(jobs, { workers });
      const byOut = new Map(results.map((r) => [r.out, r]));
      await pool(jobs, Math.min(4, os.cpus().length), async (job) => { // ≤ 4 lame encoders (standing rule 13)
        const r = byOut.get(job.out);
        if (!r?.ok) {
          failed.push({ file: job.file, text: job.text, error: r?.error ?? 'no result' });
          return;
        }
        const dest = path.join(audioDir, job.file);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const part = path.join(tmp, `${path.basename(job.out)}.mp3`);
        await encode(job.out, part);
        // copy (tmp may be on another filesystem) to a .part beside it, then rename: a cut-off copy is never taken for a
        // rendered clip, and a scratch clone's hard links are replaced, not written through
        fs.copyFileSync(part, `${dest}.part`);
        fs.renameSync(`${dest}.part`, dest);
        stats[job.file] = { durationMs: r.durationMs, bytes: fs.statSync(dest).size, ...(r.seed !== undefined ? { seed: r.seed } : {}),
          ...(r.gapMs !== undefined ? { gapMs: r.gapMs, wordDb: r.wordDb } : {}),
          ...Object.fromEntries(RENDER_MEASURES.filter((k) => r[k] !== undefined).map((k) => [k, r[k]])) };
      });
    }
    for (const f of keepOrphans ? [] : plan.orphans) {
      fs.rmSync(path.join(audioDir, f), { force: true });
      delete stats[f];
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  for (const c of plan.reuse) {
    if (!stats[c.file]) stats[c.file] = { durationMs: null, bytes: fs.statSync(path.join(audioDir, c.file)).size };
  }
  // keep the measures of every file on disk (rendered or kept), for the next render
  const onDisk = new Set(filesOnDisk(audioDir));
  const kept = Object.fromEntries(Object.entries(stats).filter(([f, v]) => onDisk.has(f) && v && (v.seed !== undefined || v.gapMs !== undefined)));
  fs.writeFileSync(`${measuresFile}.tmp`, JSON.stringify(kept));
  fs.renameSync(`${measuresFile}.tmp`, measuresFile);
  const ok = clips.filter((c) => !failed.some((f) => f.file === c.file));
  const manifest = buildManifest(ok, voices, stats);
  const text = `${JSON.stringify(manifest, null, 1)}\n`;
  const manifestFile = path.join(audioDir, MANIFEST);
  if (!fs.existsSync(manifestFile) || fs.readFileSync(manifestFile, 'utf8') !== text) fs.writeFileSync(manifestFile, text);

  const totalBytes = ok.reduce((sum, c) => sum + (stats[c.file]?.bytes ?? 0), 0);
  return {
    rendered: plan.render.length - (failed.length - plan.lostPins.length),
    reused: plan.reuse.length,
    deleted: keepOrphans ? 0 : plan.orphans.length,
    failed,
    total: ok.length,
    totalBytes,
  };
}
