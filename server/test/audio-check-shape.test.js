// The sharpened audio check (scripts/audio-check/lib.js: one-word clips with an apostrophe or hyphen, tail
// 100 ms, second, onset, coda, quiet-tail, pronunciation), the 13 clips listeners reported, the pronunciation lexicon
// (content/src/<track>/pronunciations.yaml → content/pronunciations.json), the carrier sentence and pins in the clip hash,
// and synth.py's cut inside the carrier's pause.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  extraSpans, flagClip, intrusiveR, isSingle, phonemeInfo, staleClips, THRESHOLDS,
} from '../../scripts/audio-check/lib.js';
import {
  applyLexicon, carrierFor, clipFile, clipKind, clipsForPacks, pinFor, readAudioOverrides, readPronunciations,
} from '../src/audio/clips.js';
import { compileLexicon, lexiconText, unknownSymbols } from '../../scripts/render-audio/lexicon.js';
import { collectClips, readVoices } from '../../scripts/render-audio/collect.js';
import { ms } from './slow.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONTENT = path.join(ROOT, 'content');

describe('one spoken word, phoneme shape', () => {
  it('a word with an apostrophe or hyphen is one word', () => {
    for (const w of ["I've", "s'il", 'e-mail', "aujourd'hui", "j'ai", 'eight']) expect(isSingle(w)).toBe(true);
    expect(isSingle("s'il te plaît")).toBe(false);
    expect(clipKind('eight')).toBe('word');
    expect(clipKind("s'il te plaît")).toBe('short');
    expect(clipKind('Anna is my friend.')).toBe('sentence');
  });
  it('phonemeInfo: first and last sound, nuclei, closures between vowels, a final release', () => {
    expect(phonemeInfo('ˈeɪt')).toMatchObject({ first: 'vowel', last: 'stop', nuclei: 1, closures: 0, finalRelease: true });
    expect(phonemeInfo('snˈɛl')).toMatchObject({ first: 'fricative', voicelessFricativeStart: true, last: 'other', finalRelease: false });
    expect(phonemeInfo('ˈapəl')).toMatchObject({ closures: 1, nuclei: 2 });
    expect(phonemeInfo('tˈitʁ')).toMatchObject({ finalRelease: true, closures: 0 }); // French titre: t + ʁ at the end
  });
  it('extraSpans: a span per closure and a short final release are the word itself', () => {
    const info = phonemeInfo('ˈapəl');
    expect(extraSpans([[80, 300], [400, 600]], info)).toBe(0); // "ap … ple": the closure of p
    expect(extraSpans([[80, 300], [400, 600], [800, 1100]], info)).toBe(1);
    const eight = phonemeInfo('ˈeɪt');
    expect(extraSpans([[80, 470], [560, 620]], eight)).toBe(0); // the t's release, 60 ms
    expect(extraSpans([[80, 470], [570, 1070]], eight)).toBe(1); // "eight awrwrw"
    expect(extraSpans([[80, 470], [570, 610]], eight)).toBe(0); // under 60 ms: not a span
  });
  it("intrusiveR: espeak's linking r after a word that has no r", () => {
    expect(intrusiveR('Anna is my friend.', 'ˈanəɹ ɪz maɪ fɹˈɛnd.')).toEqual(['Anna']);
    expect(intrusiveR('The zebra is black and white.', 'ðə zˈɛbɹəɹ ɪz blˈak and wˈaɪt.')).toEqual(['zebra']);
    expect(intrusiveR('The car is red.', 'ðə kˈɑːɹ ɪz ɹˈɛd.')).toEqual([]); // a real r
    expect(intrusiveR('Anna is my friend.', 'ˈanə ɪz maɪ fɹˈɛnd.')).toEqual([]); // the lexicon's block
    expect(intrusiveR('Room 304 is at the back.', 'ɹˈuːm θɹˈiːhˈʌndɹɪdən fˈɔːɹ ɪz at ðə bˈak.')).toEqual([]); // digits: not aligned
  });
});

describe('the sharpened flags', () => {
  const stats = new Map([['en|normal|xs', { n: 100, medLog: Math.log(150), mad: 0.15, medPerLetter: 150 }]]);
  const base = (m, extra = {}) => ({
    track: 'en', speed: 'normal', text: 'cat', phonemes: 'kˈat',
    m: { voicedMs: 420, voicedStartMs: 80, leadMs: 80, trailMs: 200, clipped: 0, durationMs: 800, transcript: 'cat',
      segments: [[80, 500]], onsetMs: 80, vowelStartMs: 120, vowelEndMs: 400, afterVowelMs: 60, quietTailMs: 0, ...m },
    ...extra,
  });
  it('a clean word has no flag', () => expect(flagClip(base({}), stats).flags).toEqual([]));
  it('tail: 100 ms of voice past the expected end (was 300)', () => {
    // expected end: 80 + 1.5 × 450 = 755 ms
    expect(flagClip(base({ segments: [[80, 500], [600, 860]], voicedMs: 680 }), stats).flags).toContain('tail');
    expect(flagClip(base({ segments: [[80, 500], [600, 840]], voicedMs: 660 }), stats).flags).not.toContain('tail');
  });
  it('second: another voiced span ≥ 60 ms after a pause, unless a closure explains it', () => {
    expect(flagClip(base({ segments: [[80, 450], [530, 640]], voicedMs: 480 }, { text: 'a', phonemes: 'ˈeɪ' }), stats).flags).toContain('second');
    expect(flagClip(base({ segments: [[80, 450], [530, 640]], voicedMs: 480 }, { text: 'apple', phonemes: 'ˈapəl' }), stats).flags)
      .not.toContain('second');
  });
  it('extra words heard in a single word with a second span are flagged (were "uncertain")', () => {
    expect(flagClip(base({ segments: [[80, 460], [850, 980]], transcript: 'he him' }, { text: 'is', phonemes: 'ɪz' }), stats).flags)
      .toEqual(expect.arrayContaining(['second', 'extra-words']));
    expect(flagClip(base({ transcript: 'cat the' }), stats).flags).not.toContain('extra-words'); // one span: Vosk invents words
  });
  it('onset: voice at the cut, a voiceless fricative with nothing before its vowel, a carrier gap under 40 ms', () => {
    expect(flagClip(base({ onsetMs: 40 }), stats).flags).toContain('onset'); // k starts 10 ms after the 30 ms pad
    expect(flagClip(base({ onsetMs: 40 }, { text: 'egg', phonemes: 'ˈɛɡ' }), stats).flags).not.toContain('onset'); // a vowel may start at once
    expect(flagClip(base({ onsetMs: 100, vowelStartMs: 110 }, { text: 'snel', track: 'nl', phonemes: 'snˈɛl' }), stats).flags).toContain('onset');
    expect(flagClip(base({ onsetMs: 100, vowelStartMs: 190 }, { text: 'snel', track: 'nl', phonemes: 'snˈɛl' }), stats).flags).not.toContain('onset');
    expect(flagClip(base({ onsetMs: 90 }, { gapMs: 30 }), stats).flags).toContain('onset');
    expect(flagClip(base({ onsetMs: 90 }, { gapMs: 60 }), stats).flags).not.toContain('onset');
    // a carrier clip: the silence kept, measured in the clip itself after the 30 ms padding, must be 40 ms too
    expect(flagClip(base({ onsetMs: 60 }, { gapMs: 60 }), stats).flags).toContain('onset');
    expect(flagClip(base({ onsetMs: 70 }, { gapMs: 45 }), stats).flags).not.toContain('onset');
  });
  it('coda: sound after the last vowel longer than the last consonant needs; quiet-tail: a murmur after the voice', () => {
    expect(flagClip(base({ afterVowelMs: 170 }, { text: 'the', phonemes: 'ðə' }), stats).flags).toContain('coda');
    expect(flagClip(base({ afterVowelMs: 340 }), stats).flags).not.toContain('coda'); // cat ends in a stop: 350 allowed
    expect(flagClip(base({ afterVowelMs: 360 }), stats).flags).toContain('coda');
    expect(flagClip(base({ afterVowelMs: 280 }, { text: 'bus', phonemes: 'bˈʌs' }), stats).flags).not.toContain('coda');
    expect(flagClip(base({ quietTailMs: 440 }), stats).flags).toContain('quiet-tail');
    expect(flagClip(base({ quietTailMs: 300 }), stats).flags).not.toContain('quiet-tail');
  });
  it('weak: a carrier clip whose word came out whispered next to its carrier', () => {
    expect(flagClip(base({}, { gapMs: 60, wordDb: -30 }), stats).flags).toContain('weak');
    expect(flagClip(base({}, { gapMs: 60, wordDb: -3 }), stats).flags).toEqual([]);
  });
  it('sentences are not judged by the word rules', () => {
    const s = base({ onsetMs: 30, afterVowelMs: 400, quietTailMs: 600, segments: [[30, 500], [600, 900]], transcript: 'the cat is black' },
      { text: 'The cat is black.', phonemes: 'ðə kˈat ɪz blˈak.' });
    expect(flagClip(s, new Map()).flags).toEqual([]);
  });
  it('pronunciation: an intrusive r, or a clip rendered before the lexicon entry that applies to it', () => {
    const anna = base({ transcript: 'anna is my friend' }, { text: 'Anna is my friend.', phonemes: 'ˈanəɹ ɪz maɪ fɹˈɛnd.' });
    expect(flagClip(anna, new Map()).flags).toEqual(['pronunciation']);
    const job = base({}, { track: 'nl', text: 'job', phonemes: 'jˈɔp', expectedSaid: '[[ dʒˈɔp ]]' });
    expect(flagClip(job, new Map()).flags).toContain('pronunciation');
    expect(flagClip({ ...job, said: '[[ dʒˈɔp ]]', phonemes: 'dʒˈɔp' }, new Map()).flags).not.toContain('pronunciation');
  });
  it('a word or short phrase analysed before the shape measures is analysed again; a sentence is not', () => {
    const results = { 'en/a.mp3': { ok: true, stamp: 's' }, 'en/b.mp3': { ok: true, stamp: 's' }, 'en/c.mp3': { ok: true, stamp: 's', onsetMs: 80 } };
    const clips = [{ file: 'en/a.mp3', text: 'eight' }, { file: 'en/b.mp3', text: 'The cat is black.' }, { file: 'en/c.mp3', text: 'old' }];
    expect(staleClips(clips, results, () => 's').map((c) => c.file)).toEqual(['en/a.mp3']);
  });
  it('the thresholds asked for', () => {
    expect(THRESHOLDS).toMatchObject({ tailMs: 100, secondMinMs: 60, gapMinMs: 40, cutOnsetMs: 20 });
  });
});

describe('acceptance: the check flags the 13 clips listeners reported (none before)', () => {
  // metrics of the production clips as they were reported, measured by analyze.py, with each
  // clip's group statistics: what `npm run audio:check -- --manifest audio/manifest.before-s15.json` saw
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/test/fixtures/reported-clips.json'), 'utf8'));
  it('has all 13', () => expect(fixture.clips).toHaveLength(13));
  for (const c of fixture.clips) {
    it(`${c.track} ${c.speed} "${c.text}" is flagged (${c.expect.join(', ')})`, () => {
      const stats = new Map([[c.group, c.groupStats]]);
      const f = flagClip(c, stats);
      expect(f.flags.length).toBeGreaterThan(0);
      for (const flag of c.expect) expect(f.flags).toContain(flag);
    });
  }
});

describe('pronunciation lexicon', () => {
  const lex = {
    words: { job: 'dʒˈɔp', 't-shirt': 'tˈiːʃʏrt' },
    alone: { a: 'ə' },
    beforeVowel: { anna: 'ˈanə' },
  };
  it('replaces whole words (any case), keeps punctuation, never parts of a word', () => {
    // punctuation right after the word goes inside the block (Piper drops a leading comma of the text after a block)
    expect(applyLexicon('Ik heb een nieuwe job.', lex)).toBe('Ik heb een nieuwe [[ dʒˈɔp. ]]');
    expect(applyLexicon('Job!', lex)).toBe('[[ dʒˈɔp! ]]');
    expect(applyLexicon('Mijn job, mijn leven.', lex)).toBe('Mijn [[ dʒˈɔp, ]] mijn leven.');
    expect(applyLexicon('("job")', lex)).toBe('("[[ dʒˈɔp ]]")');
    expect(applyLexicon('jobs', lex)).toBe('jobs');
    expect(applyLexicon('een t-shirt', lex)).toBe('een [[ tˈiːʃʏrt ]]');
  });
  it('alone: only when the clip is that word; beforeVowel: only before a vowel letter', () => {
    expect(applyLexicon('a', lex)).toBe('[[ ə ]]');
    expect(applyLexicon('a cat', lex)).toBe('a cat');
    expect(applyLexicon('Anna is my friend.', lex)).toBe('[[ ˈanə ]] is my friend.');
    expect(applyLexicon('Anna has a cat.', lex)).toBe('Anna has a cat.');
    expect(applyLexicon('This is Anna.', lex)).toBe('This is Anna.');
  });
  it('content/pronunciations.json is compiled from the YAML and up to date (npm run audio:lexicon)', () => {
    expect(fs.readFileSync(path.join(CONTENT, 'pronunciations.json'), 'utf8')).toBe(lexiconText(CONTENT));
    const l = compileLexicon(CONTENT);
    expect(l.tracks.nl.words).toMatchObject({ job: 'dʒˈɔp', roer: 'rˈuːr', vuur: 'vˈyːr', maaltijdcheques: 'mˌaːltɛɪtʃˈɛks' });
    expect(l.tracks.nl.words.hospitalisatieverzekering).toMatch(/zˈeːkərɪŋ$/); // stress on "ze"
    expect(l.tracks.en.alone).toEqual({ a: 'ˈə' });
    expect(l.tracks.en.hiatus.anna).toBe('ˈanə'); // A hiatus (a glottal stop there sounds like a d)
  });
  it('every phoneme symbol is one the voice knows', () => {
    expect(unknownSymbols(compileLexicon(CONTENT), readVoices())).toEqual([]);
  });
});

describe('carrier sentence, lexicon and pins in the clip hash', () => {
  const cfg = { voice: 'en_GB-cori-medium', speaker: null, lengthScale: 1.1 };
  const voices = {
    en: { voice: 'en_GB-cori-medium', speaker: null, lengthScale: 1.1, slowLengthScale: 1.6, carrier: { text: 'The word,', kinds: ['word', 'short'] } },
  };
  const pack = { track: 'en', units: [{ vocabulary: [{ id: 'en.eight', target: 'eight' }], sentences: [{ id: 'en-s1', target: 'Anna is my friend.' }], lessons: [] }] };
  it('a clip without lexicon or carrier keeps its name; each of them is part of the name', () => {
    const plain = clipFile('en', cfg, 'eight');
    expect(clipFile('en', cfg, 'eight', null, { said: 'eight' })).toBe(plain);
    expect(clipFile('en', cfg, 'eight', null, { carrier: 'The word,' })).not.toBe(plain);
    expect(clipFile('en', cfg, 'eight', null, { carrier: 'The word;' })).not.toBe(clipFile('en', cfg, 'eight', null, { carrier: 'The word,' }));
    expect(clipFile('en', cfg, 'Anna is my friend.', null, { said: '[[ ˈanə ]] is my friend.' })).not.toBe(clipFile('en', cfg, 'Anna is my friend.'));
  });
  it('carrierFor: words and short phrases of the main voice only; an override may name another carrier', () => {
    expect(carrierFor(voices, 'en', 'normal', 'eight')).toBe('The word,');
    expect(carrierFor(voices, 'en', 'slow', 'in ink')).toBe('The word,');
    expect(carrierFor(voices, 'en', 'normal', 'Anna is my friend.')).toBeNull();
    expect(carrierFor(voices, 'en', 'dialogue-normal', 'Yes.')).toBeNull();
    expect(carrierFor(voices, 'en', 'normal', 'eight', { carrier: 'The word;' })).toBe('The word;');
  });
  it('clipsForPacks: carrier for the word, lexicon for the sentence, a pin keeps the old name', () => {
    const lexicon = { en: { beforeVowel: { anna: 'ˈanə' } } };
    const clips = clipsForPacks([pack], voices, null, lexicon);
    const eight = clips.find((c) => c.text === 'eight' && c.speed === 'normal');
    expect(eight).toMatchObject({ carrier: 'The word,', kind: 'word' });
    expect(clips.find((c) => c.text === 'Anna is my friend.' && c.speed === 'slow')).toMatchObject({ said: '[[ ˈanə ]] is my friend.' });
    const old = clipFile('en', cfg, 'eight');
    const pinned = clipsForPacks([pack], voices, { pins: { en: { eight: { normal: { file: old, why: 'test' } } } } }, lexicon);
    const p = pinned.find((c) => c.text === 'eight' && c.speed === 'normal');
    expect(p.file).toBe(old);
    expect(p.carrier).toBeUndefined();
    expect(pinned.find((c) => c.text === 'eight' && c.speed === 'slow').carrier).toBe('The word,'); // the other speed is not pinned
  });
  it('every pin in content/audio-overrides.json still resolves to its file', () => {
    const overrides = readAudioOverrides(CONTENT);
    const pins = Object.entries(overrides.pins).flatMap(([track, texts]) => Object.entries(texts)
      .flatMap(([text, speeds]) => Object.entries(speeds).map(([speed, pin]) => ({ track, text, speed, ...pin }))));
    // the clips voted Worse in compare rounds and kept as they are, plus mettre (slow);
    // plus 5 English sentences heard OK whose name the hiatus would have changed
    expect(pins.length).toBe(36);
    const clips = collectClips();
    for (const p of pins) {
      expect(pinFor(overrides, p.track, p.speed, p.text)).toBeTruthy();
      const c = clips.find((x) => x.track === p.track && x.speed === p.speed && x.text === p.text);
      expect(c?.file, `${p.track} ${p.speed} ${p.text}`).toBe(p.file);
      expect(c).toMatchObject({ pinned: true });
      expect(c.carrier).toBeUndefined();
      if (fs.existsSync(path.join(ROOT, 'audio', 'manifest.json'))) expect(fs.existsSync(path.join(ROOT, 'audio', p.file)), p.file).toBe(true);
    }
  }, ms(120_000));
  it('the renderer never renders a pinned clip again, and a missing one is a failure, not a new rendering', async () => {
    const { planRender } = await import('../../scripts/render-audio/render.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-render-pin-'));
    try {
      fs.mkdirSync(path.join(dir, 'en'));
      fs.writeFileSync(path.join(dir, 'en', '0000000000000001.mp3'), 'x');
      const clips = [
        { file: 'en/0000000000000001.mp3', text: 'and', pinned: true },
        { file: 'en/0000000000000002.mp3', text: 'mend', pinned: true },
        { file: 'en/0000000000000003.mp3', text: 'eight' },
      ];
      const plan = planRender(clips, dir, { force: true });
      expect(plan.render.map((c) => c.text)).toEqual(['eight']);
      expect(plan.reuse.map((c) => c.text)).toEqual(['and']);
      expect(plan.lostPins.map((c) => c.text)).toEqual(['mend']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('no override asks for lower noise than the voice default, except pinned clips', () => {
    const overrides = readAudioOverrides(CONTENT);
    for (const [track, texts] of Object.entries(overrides.clips)) {
      for (const [text, entry] of Object.entries(texts)) {
        const per = ['normal', 'slow', 'dialogue-normal', 'dialogue-slow'].some((k) => k in entry) ? entry : { normal: entry, slow: entry };
        for (const [speed, e] of Object.entries(per)) {
          if (e.noiseScale !== undefined || e.noiseW !== undefined) {
            const isShort = clipKind(text) !== 'sentence';
            if (isShort) expect(pinFor(overrides, track, speed, text), `${track} ${speed} ${text}`).toBeTruthy();
          }
        }
      }
    }
    expect(readPronunciations(CONTENT).nl.words.job).toBe('dʒˈɔp');
  });
});

describe('rendering in several processes (standing rule 13: 4 ONNX threads in all)', () => {
  it('splits the jobs by voice into at most 4 slices', async () => {
    const { splitJobs } = await import('../../scripts/render-audio/tools.js');
    const jobs = ['en', 'fr', 'nl', 'en', 'fr', 'nl', 'en', 'nl'].map((voice, i) => ({ voice, i }));
    const slices = splitJobs(jobs, 4);
    expect(slices.length).toBeLessThanOrEqual(4);
    expect(slices.flat()).toHaveLength(8);
    for (const sl of slices) expect(new Set(sl.map((j) => j.voice)).size).toBeLessThanOrEqual(2);
    expect(splitJobs(jobs, 9)).toHaveLength(4);
    expect(splitJobs(jobs.slice(0, 2), 4)).toHaveLength(2);
  });
});

describe("synth.py: the cut lies in the carrier's pause and keeps ≥ 40 ms of silence before the word", () => {
  const python = path.join(ROOT, 'tools', 'piper-venv', 'bin', 'python');
  const run = (code) => spawnSync(python, ['-c', code], { cwd: path.join(ROOT, 'scripts', 'render-audio'), encoding: 'utf8' });
  it.skipIf(!fs.existsSync(python))('cuts at the quietest point of the pause, not into the word', () => {
    // 22050 Hz: "carrier" 0–400 ms (tone), pause 400–600 ms (faint noise, quietest at 480 ms), the word's soft fricative
    // from 580 ms (40 dB under the peak, above the silence line), its vowel from 650 ms; alignments put the word at 640 ms
    const code = `
import json, numpy as np
from types import SimpleNamespace as N
import synth
r = 22050
t = np.arange(int(r * 1.2)) / r
a = np.zeros_like(t, dtype=np.float32)
a[t < 0.4] = 0.8 * np.sin(2 * np.pi * 200 * t[t < 0.4])
rng = np.random.default_rng(1)
pause = (t >= 0.4) & (t < 0.58)
a[pause] = 0.0005 * rng.standard_normal(pause.sum())
a[(t >= 0.47) & (t < 0.49)] = 0.0
fric = (t >= 0.58) & (t < 0.65)
a[fric] = 0.012 * rng.standard_normal(fric.sum())
a[t >= 0.65] = 0.8 * np.sin(2 * np.pi * 220 * t[t >= 0.65])
al = [N(phoneme='w', num_samples=int(0.4 * r)), N(phoneme=',', num_samples=int(0.2 * r)), N(phoneme=' ', num_samples=int(0.04 * r)),
      N(phoneme='s', num_samples=int(0.1 * r)), N(phoneme='a', num_samples=int(0.46 * r))]
start, gap = synth.carrier_cut(a.astype(np.float32), r, al)
assert synth.with_stop("[[ dʒˈɔp ]]") == "[[ dʒˈɔp ]]."
assert synth.with_stop("de [[ wˈiːkɛndz. ]]") == "de [[ wˈiːkɛndz. ]]"
assert synth.with_stop("eight") == "eight." and synth.with_stop("Really?") == "Really?"
print(json.dumps({"startMs": start * 1000 / r, "gapMs": gap}))
`;
    const res = run(code);
    expect(res.status, res.stderr).toBe(0);
    const { startMs, gapMs } = JSON.parse(res.stdout.trim().split('\n').at(-1));
    expect(startMs).toBeGreaterThanOrEqual(400); // after the carrier
    expect(startMs).toBeLessThanOrEqual(580 - 40); // ≥ 40 ms before the word's first (soft) sound
    expect(gapMs).toBeGreaterThanOrEqual(40);
    expect(gapMs).toBeLessThanOrEqual(150);
  });
});
