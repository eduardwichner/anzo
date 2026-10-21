import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  clipFile, clipsForPacks, collectPackTexts, normalizeText, tokenize, tokenKey,
} from '../src/audio/clips.js';
import { tokenKey as clientTokenKey } from '../../client/src/audio/tokens.js';
import { buildManifest, planRender, runRender } from '../../scripts/render-audio/render.js';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-audio-test-'));
afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

const VOICES = {
  en: { voice: 'en_GB-test-medium', speaker: null, lengthScale: 1.1, slowLengthScale: 1.6 },
  fr: { voice: 'fr_FR-test-medium', speaker: null, lengthScale: 1.1, slowLengthScale: 1.6 },
};

function pack(track = 'en', extra = {}) {
  return {
    id: `${track}-t`,
    track,
    units: [{
      vocabulary: [
        { id: `${track}.cat`, target: 'cat', native: { nl: 'kat' } },
        { id: `${track}.je`, target: "je m'appelle", native: { nl: 'ik heet' } },
      ],
      sentences: [{ id: `${track}-s1`, target: 'The cat is black.', native: { nl: 'De kat is zwart.' } }],
      lessons: [{
        exercises: [
          { type: 'multiple_choice', question: 'cat', options: [{ text: { nl: 'kat' }, correct: true }, { text: { nl: 'hond' } }] },
          { type: 'multiple_choice', question: { nl: 'hond' }, options: [{ text: 'dog', correct: true }, { text: 'Fish!' }] },
          { type: 'match_pairs', pairs: [{ left: 'bird', right: { nl: 'vogel' } }] },
          { type: 'build_sentence', tokens: ['The', 'cat', 'is', 'black.'], distractors: ['white.'] },
          { type: 'fill_blank', sentence: 'The ___ is green.', options: ['frog', 'duck'] },
          { type: 'listen_choose', answerSide: 'target', options: [{ text: 'cow', correct: true }, { text: 'sheep' }] },
          { type: 'listen_choose', answerSide: 'native', options: [{ text: { nl: 'koe' }, correct: true }, { text: { nl: 'schaap' } }] },
          ...(extra.exercises ?? []),
        ],
      }],
    }],
  };
}

describe('tokenize / tokenKey', () => {
  it('lower-cases, strips punctuation at the edges, drops blanks and punctuation-only pieces', () => {
    expect(tokenize('The ___ is green.')).toEqual(['the', 'is', 'green']);
    expect(tokenize('Salut ! Je m’appelle Liam.')).toEqual(['salut', 'je', "m'appelle", 'liam']);
    expect(tokenize('« Bonjour », dit-il…')).toEqual(['bonjour', 'dit-il']);
  });

  it('keeps French elisions whole instead of splitting them into fragments', () => {
    expect(tokenize("J'ai deux frères. C'est ma famille.")).toEqual(["j'ai", 'deux', 'frères', "c'est", 'ma', 'famille']);
    expect(tokenize("L'école, s'appelle")).toEqual(["l'école", "s'appelle"]);
  });

  it('French tap-to-hear units: elisions, qu\'est-ce, aujourd\'hui and hyphenated words stay whole; spaced ! ? : are not words', () => {
    expect(tokenize("Qu'est-ce que c'est, aujourd'hui ?")).toEqual(["qu'est-ce", 'que', "c'est", "aujourd'hui"]);
    expect(tokenize('Est-ce que ta grand-mère vient ?')).toEqual(['est-ce', 'que', 'ta', 'grand-mère', 'vient']);
    expect(tokenize("Mes activités préférées : nager. Moi aussi !")).toEqual(['mes', 'activités', 'préférées', 'nager', 'moi', 'aussi']);
    expect(tokenKey('Salut !')).toBe('salut');
  });

  it('the client tokenKey is identical to the server one', () => {
    for (const w of ['Cat', 'black.', 'J’ai', "m'appelle", '« Bonjour', 'grand-mère,', 'sœur.', '...', 'dit-il…', ' Tu ']) {
      expect(clientTokenKey(w)).toBe(tokenKey(w));
    }
  });
});

describe('collectPackTexts / clipsForPacks', () => {
  it('collects every target-language text the child can see, and only that', () => {
    const { phrases, words } = collectPackTexts(pack());
    expect([...phrases].sort()).toEqual(['The cat is black.', 'cat', "je m'appelle"]);
    // MC target question "cat"; reverse MC options "dog", "Fish!"; pair lefts; build tokens + distractors;
    // fill sentence + options; target-side listen options. Not: Dutch options/rights/native listen options.
    expect([...words].sort()).toEqual(
      ['bird', 'black', 'cat', 'cow', 'dog', 'duck', 'fish', 'frog', 'green', 'is', 'je', "m'appelle", 'sheep', 'the', 'white'].sort(),
    );
    for (const dutch of ['kat', 'hond', 'vogel', 'koe', 'schaap', 'zwart']) expect(words.has(dutch)).toBe(false);
  });

  it('vocabulary and sentences get normal + slow clips, single words only normal; shared texts are deduplicated', () => {
    const clips = clipsForPacks([pack()], VOICES);
    const slow = clips.filter((c) => c.speed === 'slow').map((c) => c.text).sort();
    expect(slow).toEqual(['The cat is black.', 'cat', "je m'appelle"]);
    // "cat" is both vocabulary and a word: one normal clip, not two.
    expect(clips.filter((c) => c.text === 'cat' && c.speed === 'normal')).toHaveLength(1);
    expect(new Set(clips.map((c) => c.file)).size).toBe(clips.length);
    expect(clips.every((c) => c.track === 'en' && c.voice === 'en_GB-test-medium')).toBe(true);
  });

  it('throws when a track has no voice', () => {
    expect(() => clipsForPacks([pack('fr')], { en: VOICES.en })).toThrow(/no voice for track "fr"/);
  });
});

describe('clipFile (content-addressed names)', () => {
  const cfg = { voice: 'en_GB-test-medium', speaker: null, lengthScale: 1.1 };
  it('is stable and never contains the word', () => {
    const a = clipFile('en', cfg, 'cat');
    expect(a).toMatch(/^en\/[0-9a-f]{16}\.mp3$/);
    expect(clipFile('en', cfg, 'cat')).toBe(a);
    expect(clipFile('en', cfg, '  cat ')).toBe(a); // same normalized text
    expect(a).not.toMatch(/cat/);
  });
  it('changes when voice, speaker, speed or text changes', () => {
    const a = clipFile('en', cfg, 'cat');
    expect(clipFile('en', { ...cfg, voice: 'en_GB-other-medium' }, 'cat')).not.toBe(a);
    expect(clipFile('en', { ...cfg, speaker: 1 }, 'cat')).not.toBe(a);
    expect(clipFile('en', { ...cfg, lengthScale: 1.6 }, 'cat')).not.toBe(a);
    expect(clipFile('en', cfg, 'Cat')).not.toBe(a);
  });
  it('normalizeText unifies apostrophes and spaces but keeps case and punctuation', () => {
    expect(normalizeText('  J’ai   deux  ')).toBe("J'ai deux");
    expect(normalizeText('The cat.')).toBe('The cat.');
  });
});

// A synthesizer that writes a fake WAV per job; the encoder just copies it.
function fakeTools() {
  const calls = [];
  return {
    calls,
    synthesizer: {
      async synthesize(jobs) {
        calls.push(jobs.length);
        return jobs.map((j) => {
          if (j.text === 'FAIL') return { out: j.out, ok: false, error: 'boom' };
          fs.writeFileSync(j.out, `wav:${j.text}`);
          return { out: j.out, ok: true, durationMs: 100 * j.text.length };
        });
      },
    },
    encode: async (wav, mp3) => fs.copyFileSync(wav, mp3),
    modelPath: (v) => `/models/${v}.onnx`,
  };
}

describe('runRender (with a fake synthesizer)', () => {
  it('renders everything once, then nothing; removed content deletes its orphan; voice change re-renders', async () => {
    const audioDir = path.join(tmpRoot, 'render');
    const tools = fakeTools();
    const clips = clipsForPacks([pack()], VOICES);

    const first = await runRender({ clips, voices: VOICES, audioDir, ...tools });
    expect(first).toMatchObject({ rendered: clips.length, reused: 0, deleted: 0, failed: [], total: clips.length });
    expect(fs.readdirSync(path.join(audioDir, 'en'))).toHaveLength(clips.length);
    const manifest = JSON.parse(fs.readFileSync(path.join(audioDir, 'manifest.json'), 'utf8'));
    expect(manifest.clips.en.normal.cat).toBe(clips.find((c) => c.text === 'cat' && c.speed === 'normal').file);
    expect(manifest.clips.en.slow['The cat is black.']).toMatch(/^en\/[0-9a-f]{16}\.mp3$/);
    expect(manifest.files[manifest.clips.en.normal.cat]).toMatchObject({ durationMs: 300 });

    const second = await runRender({ clips, voices: VOICES, audioDir, ...tools });
    expect(second).toMatchObject({ rendered: 0, reused: clips.length, deleted: 0 });
    expect(tools.calls).toEqual([clips.length]); // the synthesizer was not called again

    // Content change: the fill_blank option "duck" disappears -> its word clip is an orphan.
    const smaller = pack();
    smaller.units[0].lessons[0].exercises[4].options = ['frog'];
    const clips2 = clipsForPacks([smaller], VOICES);
    const third = await runRender({ clips: clips2, voices: VOICES, audioDir, ...tools });
    expect(third).toMatchObject({ rendered: 0, deleted: 1 });
    const duckFile = clips.find((c) => c.text === 'duck').file;
    expect(fs.existsSync(path.join(audioDir, duckFile))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(audioDir, 'manifest.json'), 'utf8')).clips.en.normal.duck).toBeUndefined();

    // Voice change: every English clip gets a new name -> all re-rendered, all old ones deleted.
    const voices2 = { ...VOICES, en: { ...VOICES.en, voice: 'en_GB-other-medium' } };
    const clips3 = clipsForPacks([smaller], voices2);
    const fourth = await runRender({ clips: clips3, voices: voices2, audioDir, ...tools });
    expect(fourth).toMatchObject({ rendered: clips3.length, reused: 0, deleted: clips2.length });
  });

  it('files outside the track clip folders are never treated as orphans', async () => {
    const audioDir = path.join(tmpRoot, 'render-unrelated');
    fs.mkdirSync(path.join(audioDir, 'notes', 'v'), { recursive: true });
    fs.writeFileSync(path.join(audioDir, 'notes', 'v', '01.mp3'), 'x');
    const tools = fakeTools();
    const clips = clipsForPacks([pack()], VOICES);
    const r = await runRender({ clips, voices: VOICES, audioDir, ...tools });
    expect(r.deleted).toBe(0);
    expect(fs.existsSync(path.join(audioDir, 'notes', 'v', '01.mp3'))).toBe(true);
    expect(planRender(clips, audioDir).orphans).toEqual([]);
  });

  it('reports synthesis failures and leaves them out of the manifest', async () => {
    const audioDir = path.join(tmpRoot, 'render-fail');
    const tools = fakeTools();
    const clips = [...clipsForPacks([pack()], VOICES), { file: 'en/ffffffffffffffff.mp3', track: 'en', speed: 'normal', text: 'FAIL', voice: 'x', speaker: null, lengthScale: 1.1 }];
    const r = await runRender({ clips, voices: VOICES, audioDir, ...tools });
    expect(r.failed).toEqual([expect.objectContaining({ text: 'FAIL', error: 'boom' })]);
    const manifest = JSON.parse(fs.readFileSync(path.join(audioDir, 'manifest.json'), 'utf8'));
    expect(manifest.clips.en.normal.FAIL).toBeUndefined();
  });

  it('buildManifest maps track/speed/text to files', () => {
    const m = buildManifest([{ file: 'en/aaaaaaaaaaaaaaaa.mp3', track: 'en', speed: 'slow', text: 'cat' }], VOICES, {});
    expect(m.clips).toEqual({ en: { normal: {}, slow: { cat: 'en/aaaaaaaaaaaaaaaa.mp3' } } });
    expect(m.voices.en).toEqual({ voice: 'en_GB-test-medium', speaker: null, lengthScale: 1.1, slowLengthScale: 1.6 });
  });
});
