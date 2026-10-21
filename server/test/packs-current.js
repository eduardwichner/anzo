// The repository packs of one track are up to date with their sources (npm run content:generate -- --check): shared by
// packs-en/fr/nl.test.js, one file per track so the three run on separate workers (Dutch included).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import { buildPack } from '../../scripts/content/build-pack.js';
import { packSourceDir } from '../../scripts/content/sources.js';
import { formatPack } from '../../scripts/format-packs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function packIdsOf(track) {
  const srcRoot = path.join(ROOT, 'content/src', track);
  return fs.readdirSync(srcRoot).filter((d) => fs.existsSync(path.join(srcRoot, d, 'pack.yaml'))).sort().map((d) => `${track}-${d}`);
}

/** content/packs/<track>/<level>.json is what its sources generate (a variant course's pack too: fe-a1-1 → fr-en/a1-1.json). */
export function expectPackCurrent(id) {
  const { track, level } = packSourceDir(id);
  const file = path.join(ROOT, 'content/packs', track, `${level}.json`);
  expect(formatPack(buildPack(id).pack), id).toBe(fs.readFileSync(file, 'utf8'));
}
