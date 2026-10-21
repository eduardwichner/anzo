#!/usr/bin/env node
// npm run content:generate -- <pack id> [<pack id> …] [--check] [--src <dir>] [--out <packs dir>]
// Builds content/packs/<track>/<level>.json from the unit sources in content/src/<target>/<level>/
// (pack.yaml + NN-<topic>.yaml). Deterministic: unchanged sources give a byte-identical file. A variant course's pack
// (fe-a1-1 → content/packs/fr-en/a1-1.json) is built from its target's sources with their `en` meanings (build-pack.js); with
// none yet it is not generated.
// --check: write nothing, exit 1 if a pack file differs from what the sources generate.
import fs from 'node:fs';
import path from 'node:path';
import { formatPack } from './format-packs.js';
import { packSourceDir, ROOT, SRC_DIR } from './content/sources.js';
import { buildPack } from './content/build-pack.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? path.resolve(args[args.indexOf(name) + 1]) : fallback);
const srcDir = opt('--src', SRC_DIR);
const outDir = opt('--out', path.join(ROOT, 'content/packs'));
const check = args.includes('--check');
const ids = args.filter((a, i) => !a.startsWith('--') && !['--src', '--out'].includes(args[i - 1]));
if (!ids.length) {
  console.error('usage: npm run content:generate -- <pack id, e.g. en-pre-a1> [--check]');
  process.exit(2);
}

let failed = false;
for (const id of ids) {
  const { track, level } = packSourceDir(id, srcDir);
  const file = path.join(outDir, track, `${level}.json`);
  try {
    const { pack, skipped } = buildPack(id, srcDir);
    if (!pack) {
      console.log(`not generated: ${id} (no unit has its meanings in the course's native language yet; ${skipped.length} unit(s) without)`);
      if (check && fs.existsSync(file)) failed = true;
      continue;
    }
    if (skipped.length) console.log(`${id}: ${skipped.length} unit(s) left out until they have the course's meanings: ${skipped.join(', ')}`);
    const text = formatPack(pack);
    const lessons = pack.units.reduce((n, u) => n + u.lessons.length, 0);
    const exercises = pack.units.reduce((n, u) => n + u.lessons.reduce((m, l) => m + l.exercises.length, 0), 0);
    const summary = `${pack.units.length} units, ${lessons} lessons, ${exercises} exercises`;
    if (check) {
      const same = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text;
      console.log(`${same ? 'up to date' : 'DIFFERS'}: ${path.relative(process.cwd(), file)} (${summary})`);
      if (!same) failed = true;
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      // temp + rename: the service loads these at its next start; a cut-off never leaves half a pack
      fs.writeFileSync(`${file}.tmp`, text);
      fs.renameSync(`${file}.tmp`, file);
      console.log(`generated ${path.relative(process.cwd(), file)}: ${summary}, ${(text.length / 1024).toFixed(0)} KB`);
    }
  } catch (err) {
    console.error(`${id}: ${err.message}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
