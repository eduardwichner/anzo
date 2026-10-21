// npm run audio:check rules (scripts/audio-check/lib.js), per-clip synthesis overrides in the clip
// hash (server/src/audio/clips.js), and npm run audio:fix's next step (scripts/audio-check/fix.js).
import { describe, expect, it } from 'vitest';
import {
  acceptedFor, compareWords, extraSpans, flagClip, groupKey, groupStats, intrusiveR, isSingle, letters, phonemeInfo, staleClips,
  THRESHOLDS, wordErrors,
} from '../../scripts/audio-check/lib.js';
import { nextOverride } from '../../scripts/audio-check/fix.js';
import { clipFile, clipsForPacks, overrideFor } from '../src/audio/clips.js';

const voice = { voice: 'en_GB-cori-medium', speaker: null, lengthScale: 1.1 };

describe('audio check: words and errors', () => {
  it('compares words without case, accents, punctuation, apostrophes or hyphens', () => {
    expect(compareWords("L'école, c'est génial !")).toEqual(['l', 'ecole', 'c', 'est', 'genial']);
    expect(compareWords('T-shirt.')).toEqual(['t', 'shirt']);
    expect(letters('good.')).toBe(4);
  });
  it('word errors: substitutions, deletions, insertions', () => {
    expect(wordErrors(['the', 'cat'], ['the', 'cat'])).toEqual({ wer: 0, sub: 0, del: 0, ins: 0 });
    expect(wordErrors(['good'], ['go', 'and', 'have'])).toMatchObject({ sub: 1, ins: 2, wer: 3 });
    expect(wordErrors(['de', 'kat', 'slaapt'], ['de', 'kat'])).toMatchObject({ del: 1 });
  });
});

describe('audio check: flags', () => {
  // 40 ordinary short English words at about 160 ms of voiced sound per letter, and two bad ones
  const ok = Array.from({ length: 40 }, (_, i) => ({
    track: 'en', speed: 'normal', text: ['cat', 'dog', 'red', 'bed'][i % 4],
    m: { voicedMs: 470 + (i % 7) * 15, leadMs: 90, clipped: 0, transcript: ['cat', 'dog', 'red', 'bed'][i % 4] },
  }));
  const stats = groupStats(ok);
  it('groups clips by language, speed and length class', () => {
    expect(groupKey({ track: 'en', speed: 'slow', text: 'good' })).toBe('en|slow|s');
    expect(groupKey({ track: 'fr', speed: 'normal', text: 'le chat' })).toBe('fr|normal|s');
    expect(stats.get('en|normal|xs').n).toBe(40);
  });
  it('a clean clip has no flag', () => {
    expect(flagClip(ok[0], stats).flags).toEqual([]);
  });
  it('"good" babbling on: long and extra words', () => {
    const good = { track: 'en', speed: 'normal', text: 'bad', m: { voicedMs: 3430, leadMs: 80, clipped: 0, transcript: 'go and have heard of that her her' } };
    const f = flagClip(good, stats);
    expect(f.flags).toEqual(['long', 'extra-words']);
    expect(f.z).toBeGreaterThan(5);
  });
  it('a single word with voice well after its expected end (a babble tail), and a long silence after the voice', () => {
    // red: the word, then a second burst heard as "where and eleven" — under the long and extra-word thresholds
    const red = { track: 'en', speed: 'normal', text: 'red', m: { voicedMs: 760, voicedStartMs: 90, leadMs: 90, trailMs: 250, clipped: 0,
      transcript: 'where and eleven', segments: [[90, 460], [620, 630], [720, 800], [1360, 1750]] } };
    // The second burst is also a second voiced span, and more words were heard in it
    expect(flagClip(red, stats).flags).toEqual(['tail', 'second', 'extra-words']);
    expect(flagClip({ ...ok[0], m: { ...ok[0].m, trailMs: 2900 } }, stats).flags).toEqual(['trail']);
    // the word, faint blips, silence: a 4 s file for a 0.5 s word
    const drawn = { ...red, m: { ...red.m, durationMs: 3979, trailMs: 459, transcript: 'matt', segments: [[90, 520], [940, 960], [3160, 3170]] } };
    expect(flagClip(drawn, stats).flags).toEqual(['trail']);
  });
  it('long leading silence, clipping, silence', () => {
    expect(flagClip({ ...ok[0], m: { ...ok[0].m, leadMs: 900 } }, stats).flags).toEqual(['lead']);
    expect(flagClip({ ...ok[0], m: { ...ok[0].m, clipped: 3 } }, stats).flags).toEqual(['clipping']);
    expect(flagClip({ ...ok[0], m: { ...ok[0].m, voicedMs: 0, transcript: '' } }, stats).flags).toContain('silent');
  });
  it('a phrase mostly not recognised is flagged; one wrong word in a short phrase is not', () => {
    const phrase = (heard) => ({ track: 'nl', speed: 'normal', text: 'Ik eet een ei.', m: { voicedMs: 900, leadMs: 90, clipped: 0, transcript: heard } });
    expect(flagClip(phrase('ik eet een ei'), new Map()).flags).toEqual([]);
    expect(flagClip(phrase('ik eet een hij'), new Map()).flags).toEqual([]);
    expect(flagClip(phrase('de bijvoorbeeld'), new Map()).flags).toEqual(['wer']);
  });
});

describe('per-clip overrides', () => {
  const overrides = {
    clips: {
      en: {
        good: { say: 'good.', noiseScale: 0.3, noiseW: 0.3, why: 'babble' },
        red: { slow: { say: 'red.', take: 2 } },
      },
    },
  };
  it('a clip without an override keeps the file name it always had', () => {
    expect(clipFile('en', voice, 'cat')).toBe(clipFile('en', voice, 'cat', null));
    expect(clipFile('en', voice, 'cat', { why: 'a note only' })).toBe(clipFile('en', voice, 'cat'));
  });
  it('the synthesis settings are part of the hash; the note is not', () => {
    const a = clipFile('en', voice, 'good', overrides.clips.en.good);
    expect(a).not.toBe(clipFile('en', voice, 'good'));
    expect(clipFile('en', voice, 'good', { ...overrides.clips.en.good, why: 'other words' })).toBe(a);
    expect(clipFile('en', voice, 'good', { ...overrides.clips.en.good, take: 2 })).not.toBe(a);
  });
  it('an entry applies to both speeds, or per speed', () => {
    expect(overrideFor(overrides, 'en', 'slow', 'good')).toMatchObject({ say: 'good.' });
    expect(overrideFor(overrides, 'en', 'normal', 'red')).toBeNull();
    expect(overrideFor(overrides, 'en', 'slow', 'red')).toMatchObject({ take: 2 });
    expect(overrideFor(overrides, 'fr', 'slow', 'good')).toBeNull();
  });
  it('clipsForPacks renders an overridden clip under a new name, with its settings', () => {
    const pack = { track: 'en', units: [{ vocabulary: [{ id: 'en.good', target: 'good' }, { id: 'en.cat', target: 'cat' }], sentences: [], lessons: [] }] };
    const voices = { en: { voice: 'en_GB-cori-medium', speaker: null, lengthScale: 1.1, slowLengthScale: 1.6 } };
    const plain = clipsForPacks([pack], voices);
    const fixed = clipsForPacks([pack], voices, overrides);
    const by = (list, text, speed) => list.find((c) => c.text === text && c.speed === speed);
    expect(by(fixed, 'cat', 'normal').file).toBe(by(plain, 'cat', 'normal').file);
    expect(by(fixed, 'good', 'normal').file).not.toBe(by(plain, 'good', 'normal').file);
    expect(by(fixed, 'good', 'slow').override).toEqual({ say: 'good.', noiseScale: 0.3, noiseW: 0.3 });
    expect(by(plain, 'good', 'slow').override).toBeUndefined();
  });
});

describe('audio:fix: carrier strategies, never low noise, never "say it twice"', () => {
  const clip = { text: 'good', flags: ['second'], heard: 'go and', voicedMs: 900, expectedMs: 600, carrier: 'The word,' };
  const alternatives = ['The word;', 'The next word,'];
  it('a carrier clip: another pause mark, then another carrier word, then takes of that, then gives up', () => {
    const first = nextOverride(undefined, clip, alternatives, 3);
    expect(first).toMatchObject({ carrier: 'The word;' });
    const second = nextOverride(first, clip, alternatives, 3);
    expect(second).toMatchObject({ carrier: 'The next word,' });
    expect(second.take).toBeUndefined();
    const third = nextOverride(second, clip, alternatives, 3);
    expect(third).toMatchObject({ carrier: 'The next word,', take: 2 });
    expect(nextOverride({ ...third, take: 3 }, clip, alternatives, 3)).toBeNull();
    for (const o of [first, second, third]) {
      expect(o).not.toHaveProperty('noiseScale');
      expect(o).not.toHaveProperty('noiseW');
      expect(o).not.toHaveProperty('trim');
    }
  });
  it('a sentence (no carrier) gets takes only; an acronym spelling is kept', () => {
    const sentence = { ...clip, text: 'Go to bed now.', carrier: undefined };
    let o = nextOverride(undefined, sentence, alternatives, 3);
    expect(o).toMatchObject({ take: 2 });
    o = nextOverride(o, sentence, alternatives, 3);
    expect(o).toMatchObject({ take: 3 });
    expect(nextOverride(o, sentence, alternatives, 3)).toBeNull();
    expect(nextOverride({ say: 'O-C-M-W' }, { ...clip, text: 'ocmw', carrier: 'Het woord is:' }, ['Hier is het woord:'], 3))
      .toMatchObject({ say: 'O-C-M-W', carrier: 'Hier is het woord:' });
  });
});

describe('recognizer downloads are pinned', () => {
  it('every Vosk model in tools/vosk-models.json has a sha256 that fetch-models.sh checks before unzipping', async () => {
    const fsm = await import('node:fs');
    const root = new URL('../../', import.meta.url);
    const models = JSON.parse(fsm.readFileSync(new URL('tools/vosk-models.json', root), 'utf8')).models;
    for (const m of Object.values(models)) expect(m.sha256, m.name).toMatch(/^[0-9a-f]{64}$/);
    const script = fsm.readFileSync(new URL('scripts/fetch-models.sh', root), 'utf8');
    expect(script).toContain('"${got}" != "${want}"');
  });
});

describe('audio check cache, accepted flags, dialogue overrides', () => {
  it('C7: a clip re-rendered under its name (another size or mtime) is analysed again; old entries are adopted', () => {
    // (measured with the shape measures: onsetMs present)
    const results = { a: { ok: true, stamp: '10:1', onsetMs: 80 }, b: { ok: true, stamp: '10:1', onsetMs: 80 }, c: { ok: true, onsetMs: 80 } };
    const stamp = { a: '10:1', b: '12:2', c: '9:9', d: '1:1' };
    const todo = staleClips(['a', 'b', 'c', 'd'].map((file) => ({ file })), results, (f) => stamp[f]);
    expect(todo.map((c) => c.file)).toEqual(['b', 'd']);
    expect(results.c.stamp).toBe('9:9');
  });

  it('C9: an accepted flag covers the speeds it names (a plain reason: all of them)', () => {
    const accepted = { en: { hi: 'two syllables', ok: { why: 'letters', speeds: ['normal'] } } };
    expect(acceptedFor(accepted, { track: 'en', text: 'hi', speed: 'slow' })).toBe('two syllables');
    expect(acceptedFor(accepted, { track: 'en', text: 'ok', speed: 'normal' })).toBe('letters');
    expect(acceptedFor(accepted, { track: 'en', text: 'ok', speed: 'slow' })).toBeNull();
    expect(acceptedFor(accepted, { track: 'fr', text: 'ok', speed: 'normal' })).toBeNull();
  });

  it('C8: an entry naming only a dialogue speed applies to that speed only', () => {
    const o = { clips: { en: { 'Oh no.': { 'dialogue-normal': { take: 2, noiseScale: 0.3 } } } } };
    expect(overrideFor(o, 'en', 'dialogue-normal', 'Oh no.')).toEqual({ take: 2, noiseScale: 0.3 });
    expect(overrideFor(o, 'en', 'normal', 'Oh no.')).toBeNull();
    expect(overrideFor({ clips: { en: { x: { take: 2 } } } }, 'en', 'slow', 'x')).toEqual({ take: 2 });
  });
});
