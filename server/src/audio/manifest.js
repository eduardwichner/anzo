// Runtime side of audio: read the pre-rendered audio/manifest.json and resolve text -> URL.
// Nothing here synthesizes; a missing manifest or clip simply yields no URL.
import fs from 'node:fs';
import path from 'node:path';
import { clipsForPacks, normalizeText, readAudioOverrides, readPronunciations } from './clips.js';

const EMPTY = { clips: {}, files: {}, voices: {} };

/**
 * @returns {{ url(track, speed, text): string|null, both(track, text): {audio, audioSlow}, loaded: boolean, missing: number, expected: number, present: number, voices: object }}
 */
export function loadAudio({ audioDir, contentDir, content, logger }) {
  let manifest = EMPTY;
  let loaded = false;
  const manifestPath = path.join(audioDir, 'manifest.json');
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    loaded = true;
  } catch (err) {
    logger?.warn({ manifestPath, error: err.code || err.message }, 'no audio manifest; speaker buttons stay hidden (run npm run audio:render)');
  }

  // Only files that are really on disk get a URL.
  const present = new Set(Object.keys(manifest.files || {}).filter((f) => fs.existsSync(path.join(audioDir, f))));

  const url = (track, speed, text) => {
    if (text == null) return null;
    const file = manifest.clips?.[track]?.[speed]?.[normalizeText(text)];
    return file && present.has(file) ? `/audio/${file}` : null;
  };
  // role 'dialogue': speaker B of a dialogue, in the course's second voice (clips under the speeds dialogue-normal/-slow)
  const both = (track, text, role) => (role === 'dialogue'
    ? { audio: url(track, 'dialogue-normal', text), audioSlow: url(track, 'dialogue-slow', text) }
    : { audio: url(track, 'normal', text), audioSlow: url(track, 'slow', text) });

  // Which clips the current content needs, per content/voices.json, and how many the manifest lacks.
  let voices = {};
  try {
    voices = JSON.parse(fs.readFileSync(path.join(contentDir, 'voices.json'), 'utf8'));
  } catch {
    /* no voices.json: nothing is expected */
  }
  const packs = content ? [...content.packs.values()].map((p) => ({ ...p.pack, target: p.target ?? p.pack.track })) : [];
  let expected = [];
  let expectedError = null;
  try {
    expected = Object.keys(voices).length ? clipsForPacks(packs, voices, readAudioOverrides(contentDir), readPronunciations(contentDir)) : [];
  } catch (err) {
    // a malformed content/pronunciations.json or audio-overrides.json: /api/health says so, never a quiet green
    expectedError = err.message;
    logger?.error({ error: err.message }, 'cannot compute expected audio clips');
  }
  const missingClips = expected.filter((c) => !present.has(c.file) || url(c.track, c.speed, c.text) === null);

  return {
    url,
    both,
    voices,
    loaded,
    // every clip the content needs that can be played now, as clipsForPacks describes it (Admin → Listen check samples them)
    clips: expected.filter((c) => present.has(c.file) && url(c.track, c.speed, c.text) === `/audio/${c.file}`).map((c) => ({
      ...c,
      // rendered with a seed (a seeded take: audio/manifest.json → files[file].seed): the Listen check serves those first
      ...(manifest.files?.[c.file]?.seed !== undefined ? { seeded: true } : {}),
    })),
    expected: expected.length,
    expectedError,
    present: present.size,
    missing: missingClips.length,
    missingByTrack: missingClips.reduce((m, c) => ({ ...m, [c.track]: (m[c.track] || 0) + 1 }), {}),
  };
}
