// Bad clips of the Listen check's fix queue and their fixes — a
// lexicon `initial` section (French "Entre, …" stressed at a sentence start hissed before the t), `beforeVowel: hurry` (espeak's
// ʲ glide said as a consonant: "hurry fap"), and per-clip overrides that say a clip with another phoneme spelling, with the
// hiatus break kept (`say` + `hiatus`: "We will visit Grandma on Sunday." slow).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyLexicon, clipFile, clipsForPacks, hiatusIn, OVERRIDE_FIELDS, readAudioOverrides, readPronunciations } from '../src/audio/clips.js';
import { compileLexicon, SECTIONS } from '../../scripts/render-audio/lexicon.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONTENT = path.join(ROOT, 'content');
const lex = readPronunciations(CONTENT);
const voices = { en: { voice: 'en_GB-cori-medium', lengthScale: 1.1, slowLengthScale: 1.6 }, fr: { voice: 'fr_FR-siwis-medium', lengthScale: 1.1, slowLengthScale: 1.6 } };
const pack = (track, sentences) => ({ id: `${track}-x`, track, units: [{ id: `${track}-x-u01`, vocabulary: [], sentences: sentences.map((target, i) => ({ id: `s${i}`, target })), lessons: [] }] });

describe('lexicon section `initial`: only the first word of a clip of several words', () => {
  it('is a known section and compiled', () => {
    expect(SECTIONS).toContain('initial');
    expect(compileLexicon(CONTENT).tracks.fr.initial).toEqual({ entre: 'ɑ̃tʁ' });
  });
  it('Entre at the start of a sentence gets the unstressed block; inside a sentence and alone it does not', () => {
    expect(applyLexicon("Entre, s'il te plaît !", lex.fr)).toBe("[[ ɑ̃tʁ, ]] s'il te plaît !");
    expect(applyLexicon('Je suis entre Rose et Paul.', lex.fr)).toBe('Je suis entre Rose et Paul.');
    expect(applyLexicon('entre', lex.fr)).toBe('entre');
    // a leading mark or quote does not hide the first word
    expect(applyLexicon('« Entre, Paul ! »', { initial: { entre: 'X' } })).toBe('« [[ X, ]] Paul ! »');
    // `initial` wins over `words` for that position only
    expect(applyLexicon('Entre entre.', { words: { entre: 'W' }, initial: { entre: 'I' } })).toBe('[[ I ]] [[ W. ]]');
  });
});

describe('beforeVowel: hurry — the ʲ glide is left out (a plain vowel junction)', () => {
  it('only before a vowel', () => {
    expect(lex.en.beforeVowel.hurry).toBe('hˈʌɹi');
    expect(applyLexicon('Hurry up! The film is almost over.', lex.en)).toBe('[[ hˈʌɹi ]] up! The film is almost over.');
    expect(applyLexicon("We only eat junk food when we're in a hurry.", lex.en)).toBe("We only eat junk food when we're in a hurry.");
    expect(hiatusIn('Hurry up, we\'re late!', lex.en)).toEqual([]); // beforeVowel is no hiatus: no comma, no break
  });
});

describe('override `hiatus` with `say`: one clip with another hiatus spelling', () => {
  const overrides = readAudioOverrides(CONTENT);
  it('is a synthesis field (part of the name) and the two clips that have it use it as written', () => {
    expect(OVERRIDE_FIELDS).toContain('hiatus');
    const g = overrides.clips.en['We will visit Grandma on Sunday.'].slow;
    expect(g.say).toBe('We will visit [[ ɡɹˈandmɑ, ]] on Sunday.');
    expect(g.hiatus).toEqual(['ɡɹˈandmɑ']);
    expect(overrides.clips.en["I didn't recognise you with your new glasses!"].slow.say).toMatch(/^\[\[ ˈaɪ \]\] didn't/);
  });
  it('the clip list passes the override hiatus to synth.py (not the lexicon one) for that speed only', () => {
    const clips = clipsForPacks([pack('en', ['We will visit Grandma on Sunday.'])], voices, overrides, lex);
    const slow = clips.find((c) => c.speed === 'slow' && c.kind === 'sentence');
    const normal = clips.find((c) => c.speed === 'normal' && c.kind === 'sentence');
    expect(slow.hiatus).toEqual(['ɡɹˈandmɑ']);
    expect(slow.override.say).toMatch(/ɡɹˈandmɑ,/);
    expect(normal.hiatus).toEqual(['ɡɹˈandmɑː']);
    expect(normal.override).toBeUndefined();
    // a new name, so a new seed (never the old file under the old name)
    expect(slow.file).not.toBe(clipFile('en', { voice: 'en_GB-cori-medium', lengthScale: 1.6 }, 'We will visit Grandma on Sunday.', null,
      { said: applyLexicon('We will visit Grandma on Sunday.', lex.en) }));
  });
});
