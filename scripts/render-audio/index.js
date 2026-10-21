#!/usr/bin/env node
// npm run audio:render [-- --force] [-- --keep-orphans] [-- --workers N (1–4 synth.py processes, 4 ONNX threads in all)]
// Renders every clip the available packs need into audio/ (ANZO_AUDIO_DIR), reusing existing
// files, deleting orphans, and writing audio/manifest.json. Authoring time only; the running app
// never synthesizes. --force re-renders everything (needed only after changing synth.py itself). --keep-orphans leaves
// unused clips on disk (the content job deletes them only once a correction is fully applied, so a rollback has them).
import path from 'node:path';
import { collectClips, readVoices, ROOT } from './collect.js';
import { writeLexicon } from './lexicon.js';
import { runRender } from './render.js';
import { lameEncode, modelPath, piperSynthesizer } from './tools.js';
import { workersFor } from '../lib/machine.js';

const audioDir = path.resolve(process.env.ANZO_AUDIO_DIR || path.join(ROOT, 'audio'));
const force = process.argv.includes('--force');
const keepOrphans = process.argv.includes('--keep-orphans');
const wi = process.argv.indexOf('--workers');
// --workers N: at most 2 (standing rule 13) and what the machine's memory holds (≈ 0.7 GB per synth.py); default 1
const workers = wi > 0 ? Math.max(1, Math.min(workersFor({ max: 2, perWorkerGB: 0.7, reserveGB: 2 }), Number(process.argv[wi + 1]) || 1)) : 1;
const started = Date.now();

// the pronunciation lexicon first (content/src/<track>/pronunciations.yaml → content/pronunciations.json): part of clip names
if (writeLexicon(path.join(ROOT, 'content'))) console.log('content/pronunciations.json compiled from the lexicon YAML');
const voices = readVoices();
const clips = collectClips({ voices });
console.log(`${clips.length} clips needed (${clips.filter((c) => c.speed === 'slow').length} slow) → ${path.relative(process.cwd(), audioDir) || audioDir}`);

const result = await runRender({
  clips,
  voices,
  audioDir,
  synthesizer: piperSynthesizer,
  encode: lameEncode,
  modelPath,
  force,
  keepOrphans,
  workers,
  log: (m) => console.log(m),
});

for (const f of result.failed) console.error(`FAILED ${f.file} "${f.text}": ${f.error}`);
const mb = (result.totalBytes / 1024 / 1024).toFixed(2);
console.log(
  `rendered ${result.rendered} / reused ${result.reused} / deleted ${result.deleted} / failed ${result.failed.length}` +
    ` — ${result.total} clips, ${mb} MB, ${((Date.now() - started) / 1000).toFixed(1)} s`,
);
process.exit(result.failed.length ? 1 : 0);
