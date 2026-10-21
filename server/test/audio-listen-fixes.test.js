// The Listen check's Bad clips and what fixed them — the pronunciation lexicon (a hiatus, not a
// glottal stop, against the intrusive r; grammatica, plu; French words espeak reads as English, Dutch -tie compounds,
// campagnes, handkerchief), the check's sentence rules (`pause` and `hiatus` only list a clip), synth.py's seeded noise and
// hiatus break, audio:fix's rules (no take for a pronunciation remark, the bulk guard), and the acceptance fixture: every
// sentence heard as Bad is flagged or listed by the check without the `listen` flag.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { flagClip, pauseFlag, pauseGaps, THRESHOLDS } from '../../scripts/audio-check/lib.js';
import { BULK, isSentence, pronunciationRemark } from '../../scripts/audio-check/fix.js';
import { seedOf } from '../../scripts/render-audio/render.js';
import { applyLexicon, hiatusIn, OVERRIDE_FIELDS, readAudioOverrides, readPronunciations } from '../src/audio/clips.js';
import { compileLexicon } from '../../scripts/render-audio/lexicon.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONTENT = path.join(ROOT, 'content');
const lex = readPronunciations(CONTENT);

describe('the lexicon entries for the Listen check\'s Bad clips', () => {
  it('compiled JSON = YAML sources', () => {
    expect(compileLexicon(CONTENT).tracks).toEqual(lex);
  });
  it('the 16 r words are a hiatus — the block ends in a comma, no glottal stop (it sounded like a d/t)', () => {
    expect(lex.en.beforeVowel ?? {}).toEqual({ hurry: 'hˈʌɹi' }); // No glottal stop, only the ʲ glide left out
    expect(Object.keys(lex.en.hiatus).sort()).toEqual(['anna', 'area', 'asia', 'bacteria', 'cinema', 'data', 'diploma', 'grandma', 'grandpa',
      'maya', 'opera', 'sarah', 'sofa', 'umbrella', 'vanilla', 'zebra']);
    for (const [w, ph] of Object.entries(lex.en.hiatus)) expect(ph, w).not.toMatch(/ʔ/);
    expect(JSON.stringify(lex)).not.toMatch(/ʔ/);
    expect(applyLexicon('This sofa is really comfortable.', lex.en)).toBe('This [[ sˈəʊfə, ]] is really comfortable.');
    expect(hiatusIn('This sofa is really comfortable.', lex.en)).toEqual(['sˈəʊfə']);
    expect(applyLexicon('Grandpa and I are playing football.', lex.en)).toBe('[[ ɡɹˈandpɑː, ]] and I are playing football.');
    // before a consonant or a mark nothing changes (no junction, no r)
    expect(applyLexicon('My grandma likes cats.', lex.en)).toBe('My grandma likes cats.');
    expect(applyLexicon('Hello Anna, how are you?', lex.en)).toBe('Hello Anna, how are you?');
    expect(hiatusIn('My grandma likes cats.', lex.en)).toEqual([]);
  });
  it('the pronunciation remarks are lexicon entries — grammatica with ɪ (no hiss after the t), plu with a long y (no s)', () => {
    expect(lex.nl.words.grammatica).toBe('ɣrɑmˈaːtɪkaː');
    expect(lex.fr.words.plu).toBe('plˈyː');
  });
  it('handkerchief without the d (ŋ); French words espeak reads as English; Dutch -tie compounds and campagnes', () => {
    expect(applyLexicon('a handkerchief', lex.en)).toBe('a [[ hˈaŋkətʃiːf ]]');
    expect(lex.fr.words.jury).toBe('ʒyʁˈi');
    for (const w of ['bruns', 'parking', 't-shirt', 'stress', 'assieds-toi']) expect(lex.fr.words[w], w).toBeTruthy();
    for (const ph of Object.values(lex.fr.words)) expect(ph).not.toMatch(/ɹ|ʊə|æ|ʌ|ɜ/);
    expect(lex.nl.words.motivatiebrief).toBe('moːtivˈaːtsibrˌif');
    expect(lex.nl.words.campagnes).toBe('kɑmpˈɑɲəs');
    // no -tie compound left with a bare "ti" before a consonant (espeak's reading inside compounds)
    for (const [w, ph] of Object.entries(lex.nl.words)) if (/[aeiou]tie[a-z]/.test(w)) expect(ph, w).not.toMatch(/aːti[^sː]/);
  });
});

describe('the targeted fixes of the Bad clips', () => {
  const o = readAudioOverrides(CONTENT);
  it('slow landen is cut after its last sound and de inenting keeps a chosen take; no take is kept for a pronunciation', () => {
    expect(OVERRIDE_FIELDS).toContain('end');
    expect(o.clips.nl.landen.slow).toMatchObject({ end: 'cut' });
    expect(o.clips.nl['de inenting'].slow.take).toBe(2);
    expect(o.clips.fr.plu).toBeUndefined(); // the lexicon fixes plu: no cut, no take
    // grammatica (take 3) and OK/Maya (take 5) were takes chosen by a measure: back to their earlier settings
    expect(o.clips.nl['Bovendien passen we leenwoorden aan onze eigen uitspraak en grammatica aan: we zeggen ik heb het gedownload.']?.slow?.take).not.toBe(3);
    expect(o.clips.en['OK. Shall I ask Maya as well? She hardly ever goes out at weekends.'].slow.take).toBe(2);
  });
});

describe('sentence rules: pause and hiatus only list a clip', () => {
  it('pauseGaps: a mark sits at the share of the sounds before it; gaps elsewhere are pauses without a mark', () => {
    // "Georges et Ismaël jouent au foot." — 180 ms after "Georges et" (no mark there)
    const g = pauseGaps([[120, 710], [890, 1990], [2120, 2180]], 'ʒˈɔʁʒ e ismaˈɛl ʒˈu o fˈʊt.');
    expect(g.marks).toEqual([]);
    expect(g.extra).toEqual([180, 130]); // 130: the closure before the final t of "foot" — under the 170 ms line
    expect(pauseFlag({ track: 'fr', speed: 'normal', text: 'Georges et Ismaël jouent au foot.', m: { segments: [[120, 710], [890, 1990], [2120, 2180]] },
      phonemes: 'ʒˈɔʁʒ e ismaˈɛl ʒˈu o fˈʊt.' })).toBe(true);
    // a comma with no pause at all (the Dutch voice)
    const nl = pauseGaps([[160, 6620], [6730, 7070]], 'pˌɛsimˈɪstən vrˈeːzən dɑ tə ˌʌʊtoːmˌaːtizˈɪːrɪŋ vˈɔːrɑl dʒˈɔps vɔːr lˈaːɣɛsxˌoːldən zɑl dˈun vərdʋˈɛɪnən, tˈɛrʋɛɪl də ʋˈɪnst bɛɪ ən klˈɛɪn ˈaːntˌɑl mˈɛnsən tərˈɛxtkɔmt.');
    expect(nl.marks).toEqual([0]);
  });
  it('pauseFlag: by the renderer\'s own measures when present, else by the estimate; never for words and short phrases', () => {
    const base = { track: 'nl', speed: 'normal', text: 'Pessimisten vrezen dat de automatisering vooral jobs, terwijl.' };
    expect(pauseFlag({ ...base, pauseMarkMs: 200, pauseExtraMs: 90 })).toBe(false);
    expect(pauseFlag({ ...base, pauseMarkMs: 60 })).toBe(true);
    expect(pauseFlag({ ...base, speed: 'slow', pauseMarkMs: 150 })).toBe(true); // slow wants ≥ 180
    expect(pauseFlag({ ...base, pauseExtraMs: THRESHOLDS.pauseExtraMs.normal })).toBe(true);
    expect(pauseFlag({ track: 'fr', speed: 'normal', text: 'Oui, merci', carrier: 'Le mot :', m: { segments: [[0, 500]] }, phonemes: 'wˈi, mɛʁsˈi' })).toBe(false);
  });
  it('a short pause or a hiatus the voice ran through is listed (uncertain), never a flag: audio:fix spends no take on it', () => {
    const stats = new Map([['en|slow|l', { n: 100, medLog: Math.log(120), mad: 0.15, medPerLetter: 120 }]]);
    const clip = (extra) => ({ track: 'en', speed: 'slow', text: 'This sofa is really comfortable.', pauseMarkMs: null, pauseExtraMs: 60, ...extra,
      m: { voicedMs: 3000, voicedStartMs: 80, leadMs: 80, trailMs: 150, clipped: 0, durationMs: 3300, transcript: 'this sofa is really comfortable', segments: [[80, 3080]] } });
    for (const x of [{ hiatusMs: 0 }, { hiatusMs: 160 }, { pauseExtraMs: 900 }]) {
      const f = flagClip(clip(x), stats);
      expect(f.flags).not.toContain('pause');
      expect(f.flags).not.toContain('hiatus');
      expect(f.flags).not.toContain('linking-r');
    }
    expect(flagClip(clip({ hiatusMs: 0 }), stats).uncertain).toContain('hiatus');
    expect(flagClip(clip({ hiatusMs: 160 }), stats).uncertain).not.toContain('hiatus');
    expect(flagClip(clip({ pauseExtraMs: 900 }), stats).uncertain).toContain('pause');
  });
});

describe('acceptance: the check flags (pronunciation) or lists (pause) every sentence heard as Bad, without the listen flag', () => {
  // the 15 sentences and text sentences marked Bad in the Listen check (and jury), as they were live
  // (audio/manifest.before-s16.json), with analyze.py's measures, the phonemes of what they said, what the new lexicon says
  // and their group statistics: what `npm run audio:check` saw before they were rendered again
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/test/fixtures/listen-bad-sentences.json'), 'utf8'));
  it('has the 15 sentences', () => expect(fixture.clips.filter((c) => c.kind !== 'word')).toHaveLength(15));
  for (const c of fixture.clips) {
    it(`${c.track} ${c.speed} "${c.text.slice(0, 50)}" → ${c.expect.join(', ')}`, () => {
      const f = flagClip(c, new Map([[c.group, c.groupStats]]));
      for (const flag of c.expect) expect(flag === 'pause' ? f.uncertain : f.flags).toContain(flag); // Pause only lists
    });
  }
});

describe('audio:fix: takes 2–4 for a sentence like any clip; never a take for a pronunciation; the bulk guard', () => {
  it('a sentence is more than three words or a dialogue turn', () => {
    expect(isSentence({ speed: 'normal', text: 'This sofa is really comfortable.' })).toBe(true);
    expect(isSentence({ speed: 'dialogue-normal', text: 'Ja, graag.' })).toBe(true);
    expect(isSentence({ speed: 'slow', text: 'de inenting' })).toBe(false);
  });
  it('a clip heard Bad for its pronunciation is a lexicon matter; more than 50 clips in a round need --bulk', () => {
    expect(pronunciationRemark({ listen: { reason: 'wrong-pronunciation' } })).toBe(true);
    expect(pronunciationRemark({ listen: { reason: 'babble' } })).toBe(false);
    expect(pronunciationRemark({ flags: ['long'] })).toBe(false);
    expect(BULK).toBe(50);
    const src = fs.readFileSync(path.join(ROOT, 'scripts/audio-check/fix.js'), 'utf8');
    expect(src).toMatch(/changed > BULK && !args\.includes\('--bulk'\)/);
    expect(src).not.toMatch(/bestTake|SENTENCE_TAKES/);
  });
});

describe('synth.py: seeded noise and the hiatus break (no pause shaping)', () => {
  const python = path.join(ROOT, 'tools', 'piper-venv', 'bin', 'python');
  const run = (code) => spawnSync(python, ['-c', code], { cwd: path.join(ROOT, 'scripts', 'render-audio'), encoding: 'utf8', env: { ...process.env, ANZO_ONNX_THREADS: '1' } });
  it('the seed comes from the clip name', () => {
    expect(seedOf('en/0123abcd4567ef89.mp3')).toBe(0x0123abcd);
  });
  it.skipIf(!fs.existsSync(python))('cap_hiatus: the break after a hiatus comma is 160 ms (240 slow), cut or widened only inside silence', () => {
    const code = `
import json, numpy as np
import synth
r = 22050
S = lambda ms: int(r * ms / 1000)
def tone(ms): t = np.arange(S(ms)) / r; return (0.8 * np.sin(2 * np.pi * 200 * t)).astype(np.float32)
sil = lambda ms: np.zeros(S(ms), dtype=np.float32)
def case(gap, slow):
    # "Anna, is": ˈ a n ə , ␠ ɪ z — the word 400 ms, then gap ms of silence, then "is" 300 ms
    a = np.concatenate([tone(400), sil(gap), tone(300)])
    g = 400 + gap
    spans = [('ˈ', 0, 0), ('a', 0, S(130)), ('n', S(130), S(260)), ('ə', S(260), S(400)), (',', S(400), S(400)), (' ', S(400), S(g)),
             ('ɪ', S(g), S(g + 150)), ('z', S(g + 150), S(g + 300))]
    out, kept = synth.cap_hiatus(a, r, spans, ['ˈanə'], slow)
    return [round(len(out) / r * 1000), kept]
print(json.dumps({"long": case(400, False), "slow": case(400, True), "short": case(100, False), "none": case(0, False), "other": synth.cap_hiatus(np.ones(10, dtype=np.float32), r, [], ['ˈanə'], False)[1]}))
print(json.dumps({"shape_pauses": hasattr(synth, "shape_pauses"), "r_dip": hasattr(synth, "r_dip")}))
`;
    const res = run(code);
    expect(res.status, res.stderr).toBe(0);
    const [o, gone] = res.stdout.trim().split('\n').slice(-2).map((l) => JSON.parse(l));
    const near = (x, y) => expect(Math.abs(x - y)).toBeLessThanOrEqual(12); // 5 ms frames at the tones' edges
    near(o.long[1], 160);
    near(o.long[0], 400 + 160 + 300);
    near(o.slow[1], 240);
    near(o.short[1], 160); // widened in its middle
    near(o.short[0], 400 + 160 + 300);
    expect(o.none).toEqual([700, 0]); // the voice ran through: nothing put inside a sound, listed as 0
    expect(o.other).toBeNull();
    expect(gone).toEqual({ shape_pauses: false, r_dip: false });
  });
  it.skipIf(!fs.existsSync(path.join(ROOT, 'models/piper/en_GB-cori-medium.onnx')))(
    'the same seed renders the same samples; another seed another take', () => {
      const code = `
import json, hashlib, numpy as np
import synth
from piper import SynthesisConfig
v = synth.get_voice("${path.join(ROOT, 'models/piper/en_GB-cori-medium.onnx')}")
def take(seed):
    synth._noise["seed"] = seed
    return hashlib.sha1(np.concatenate([c.audio_int16_array for c in v.synthesize("The word, eight.", syn_config=SynthesisConfig(length_scale=1.1))]).tobytes()).hexdigest()
print(json.dumps([take(7), take(7), take(8)]))
`;
      const res = run(code);
      expect(res.status, res.stderr).toBe(0);
      const [a, b, c] = JSON.parse(res.stdout.trim().split('\n').at(-1));
      expect(a).toBe(b);
      expect(c).not.toBe(a);
    },
    60_000,
  );
});
