#!/usr/bin/env node
// npm run content:validate [-- --packs <dir>] [-- --audio]
// Validates content/packs (or another packs directory) and prints a per-pack summary.
// --audio also reports (without failing) clips the packs need that audio/manifest.json lacks.
// Exit code 0 when valid, 1 when not.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { validateContent, summarizePack, formatErrors } from '../server/src/content/validate.js';
import { clipsForPacks, readAudioOverrides, readPronunciations } from '../server/src/audio/clips.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argIdx = process.argv.indexOf('--packs');
const packsDir = argIdx > -1
  ? path.resolve(process.argv[argIdx + 1])
  : path.join(process.env.ANZO_CONTENT_DIR || path.join(root, 'content'), 'packs');

const { errors, manifest, packs } = validateContent({ packsDir });

if (manifest) {
  const rows = manifest.tracks.flatMap((t) => t.packs.map((p) => ({ track: t.id, ...p })));
  console.log(`Manifest: ${path.relative(process.cwd(), path.join(packsDir, 'manifest.json'))}`);
  console.log(`  ${rows.length} packs: ${rows.filter((r) => r.status === 'available').length} available, ` +
    `${rows.filter((r) => r.status === 'planned').length} planned, ${rows.filter((r) => r.status === 'roadmap').length} roadmap`);
}
const withAudio = process.argv.includes('--audio');
let audioCheck = null;
if (withAudio) {
  const contentDir = process.env.ANZO_CONTENT_DIR || path.join(root, 'content');
  const audioDir = process.env.ANZO_AUDIO_DIR || path.join(root, 'audio');
  const voices = JSON.parse(fs.readFileSync(path.join(contentDir, 'voices.json'), 'utf8'));
  let manifest = { files: {} };
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(audioDir, 'manifest.json'), 'utf8'));
  } catch {
    console.log(`  (no ${path.relative(process.cwd(), path.join(audioDir, 'manifest.json'))}; every clip counts as missing)`);
  }
  audioCheck = (pack) => {
    const clips = clipsForPacks([pack], voices, readAudioOverrides(contentDir), readPronunciations(contentDir));
    const missing = clips.filter((c) => !manifest.files?.[c.file] || !fs.existsSync(path.join(audioDir, c.file)));
    return { clips: clips.length, missing };
  };
}

for (const { entry, pack, file, track } of packs) {
  const s = summarizePack(pack);
  const types = pack.units.flatMap((u) => u.lessons.flatMap((l) => l.exercises.map((e) => e.type)))
    .reduce((m, t) => ({ ...m, [t]: (m[t] || 0) + 1 }), {});
  console.log(`  ${entry.id.padEnd(10)} ${file} (schemaVersion ${pack.schemaVersion}): ${s.units} units / ${s.lessons} lessons / ${s.exercises} exercises / ${s.vocab} vocab / ${s.sentences} sentences`);
  console.log(`             exercise types: ${Object.entries(types).map(([t, n]) => `${t} ${n}`).join(', ')}`);
  if (audioCheck) {
    const a = audioCheck({ ...pack, target: track.target ?? track.id });
    console.log(`             audio: ${a.clips} clips needed, ${a.missing.length} missing from the manifest`);
    for (const c of a.missing.slice(0, 10)) console.log(`               missing ${c.speed} "${c.text}"`);
  }
}

if (errors.length) {
  console.error(`\nContent validation FAILED with ${errors.length} error(s):\n${formatErrors(errors)}`);
  process.exit(1);
}
console.log('\nContent OK');
