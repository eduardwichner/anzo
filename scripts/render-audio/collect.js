#!/usr/bin/env node
// Builds the clip list for every `available` pack: vocabulary and sentence targets (normal + slow)
// and every distinct target-language word the child can see (normal). Run directly to print a summary.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContent, formatErrors } from '../../server/src/content/validate.js';
import { clipPacks, clipsForPacks, readAudioOverrides, readPronunciations } from '../../server/src/audio/clips.js';

export { clipsForPacks };

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function readVoices(contentDir = path.join(ROOT, 'content')) {
  return JSON.parse(fs.readFileSync(path.join(contentDir, 'voices.json'), 'utf8'));
}

/**
 * Validate content and return the clip list for every available pack. `lexicon`: another compiled lexicon's `tracks` (a
 * candidate heard before release); default content/pronunciations.json.
 */
export function collectClips({ contentDir = path.join(ROOT, 'content'), voices = readVoices(contentDir), lexicon = undefined } = {}) {
  const { errors, packs } = validateContent({ packsDir: path.join(contentDir, 'packs') });
  if (errors.length) throw new Error(`content is invalid; fix it first:\n${formatErrors(errors)}`);
  return clipsForPacks(clipPacks(packs), voices, readAudioOverrides(contentDir), lexicon === undefined ? readPronunciations(contentDir) : lexicon);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const clips = collectClips();
  const by = (k) => clips.reduce((m, c) => ({ ...m, [c[k]]: (m[c[k]] || 0) + 1 }), {});
  console.log(`${clips.length} clips`, 'by track:', by('track'), 'by speed:', by('speed'));
  if (process.argv.includes('--list')) for (const c of clips) console.log(`${c.file}  ${c.speed.padEnd(6)} ${c.text}`);
}
