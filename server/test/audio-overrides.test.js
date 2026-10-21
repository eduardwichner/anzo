// content/audio-overrides.json: every note is written from its entry's own fields, and the sentences rendered again for a
// lexicon change keep take 7.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OVERRIDE_SPEEDS, perSpeedEntry, readAudioOverrides } from '../src/audio/clips.js';
import { PIN_NOTE, acceptedNote, overrideNote } from '../../scripts/render-audio/override-notes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('the overrides', () => {
  const o = readAudioOverrides(path.join(ROOT, 'content'));
  const entries = Object.values(o.clips).flatMap((texts) => Object.values(texts)).flatMap((e) => (perSpeedEntry(e) ? OVERRIDE_SPEEDS.map((s) => e[s]) : [e, e])).filter(Boolean); // per clip and speed (one entry for both speeds counts twice)

  it('the sentences rendered again for a lexicon change are on take 7', () => {
    expect(entries.filter((e) => e.take === 7).length).toBeGreaterThanOrEqual(72);
  });

  it('every note is the one its fields give', () => {
    for (const e of entries) expect(e.why).toBe(overrideNote(e));
    for (const sp of Object.values(o.pins).flatMap((t) => Object.values(t))) for (const e of Object.values(sp)) expect(e.why).toBe(PIN_NOTE);
    for (const e of Object.values(o.accepted).flatMap((t) => Object.values(t))) {
      expect(typeof e === 'string' ? e : e.why).toBe(typeof e === 'string' ? acceptedNote() : acceptedNote(e.speeds));
    }
    expect(overrideNote({ carrier: 'The word;', take: 2 })).toBe('Per-clip override: after the carrier "The word;", take 2.');
  });
});
