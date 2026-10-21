import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { validateContent } from '../src/content/validate.js';
import { loadContent, ContentError, publicPack, attemptItemIds } from '../src/content/loader.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_CONTENT = path.resolve(here, '../../content');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-validate-'));
afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

const clone = (x) => JSON.parse(JSON.stringify(x));

const nl = (text) => ({ nl: text });

function goodPack(id = 'en-test', prefix = 'en') {
  return {
    schemaVersion: 2,
    id,
    track: 'en',
    cefr: 'Pre-A1',
    source: 'Test fixture drawn from the Starters word list.',
    units: [
      {
        id: `${id}-u01`,
        title: { nl: 'Dieren' },
        icon: 'animals',
        vocabulary: ['cat', 'dog', 'fish', 'bird'].map((w, i) => ({
          id: `${prefix}.${w}`, target: w, native: nl(['kat', 'hond', 'vis', 'vogel'][i]), pos: 'noun',
        })),
        sentences: [{ id: `${id}-u01-s01`, target: 'The cat is black.', native: nl('De kat is zwart.'), items: [`${prefix}.cat`] }],
        lessons: [
          {
            id: `${id}-u01-l01`,
            title: { nl: 'Huisdieren' },
            exercises: [
              { type: 'multiple_choice', id: `${id}-e1`, items: [`${prefix}.cat`], question: 'cat',
                options: [{ text: nl('kat'), correct: true }, { text: nl('hond') }, { text: nl('vis') }] },
              { type: 'match_pairs', id: `${id}-e2`, items: [`${prefix}.cat`, `${prefix}.dog`],
                pairs: [{ left: 'cat', right: nl('kat') }, { left: 'dog', right: nl('hond') }, { left: 'fish', right: nl('vis') }, { left: 'bird', right: nl('vogel') }] },
              { type: 'build_sentence', id: `${id}-e3`, items: [`${prefix}.cat`], sentenceId: `${id}-u01-s01`,
                answer: 'The cat is black.', tokens: ['The', 'cat', 'is', 'black.'], distractors: ['dog'] },
              { type: 'fill_blank', id: `${id}-e4`, items: [`${prefix}.cat`],
                sentence: 'The ___ is black.', answer: 'cat', hint: nl('kat'), options: ['cat', 'dog'] },
              { type: 'listen_choose', id: `${id}-e5`, items: [`${prefix}.dog`],
                listen: `${prefix}.dog`, answerSide: 'target', options: [{ text: 'dog', correct: true }, { text: 'cat' }, { text: 'fish' }] },
              { type: 'listen_choose', id: `${id}-e6`, items: [`${prefix}.dog`],
                listen: `${prefix}.dog`, answerSide: 'native', options: [{ text: nl('hond'), correct: true }, { text: nl('kat') }, { text: nl('vis') }, { text: nl('vogel') }] },
              { type: 'listen_type', id: `${id}-e7`, items: [`${prefix}.cat`],
                listen: `${id}-u01-s01`, answer: 'The cat is black.' },
              { type: 'speak', id: `${id}-e8`, items: [`${prefix}.cat`], phrase: 'cat' },
              { type: 'multiple_choice', id: `${id}-e9`, items: [`${prefix}.fish`], question: nl('vis'), instruction: 'exercise.multiple_choice.fromTarget',
                options: [{ text: 'fish', correct: true }, { text: 'bird' }, { text: 'cat' }] },
            ],
          },
        ],
      },
    ],
  };
}

function goodManifest(packs = [{ id: 'en-test', file: 'en/test.json' }]) {
  return {
    tracks: [
      {
        id: 'en', name: { nl: 'Engels' }, native: 'nl', mascot: 'otter',
        packs: [
          ...packs.map((p) => ({ id: p.id, file: p.file, cefr: 'Pre-A1', title: { nl: 'Starters' }, status: 'available' })),
          { id: 'en-a1', file: 'en/a1.json', cefr: 'A1', title: { nl: 'Movers' }, status: 'planned' },
          { id: 'en-b1', file: null, cefr: 'B1', title: { nl: 'B1' }, status: 'roadmap' },
        ],
      },
    ],
  };
}

let n = 0;
function writeFixture({ manifest = goodManifest(), packs = { 'en/test.json': goodPack() } } = {}) {
  const dir = path.join(tmpRoot, `case-${++n}`);
  fs.mkdirSync(path.join(dir, 'en'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  for (const [file, pack] of Object.entries(packs)) {
    fs.writeFileSync(path.join(dir, file), typeof pack === 'string' ? pack : JSON.stringify(pack));
  }
  return dir;
}

function errorsFor(opts) {
  return validateContent({ packsDir: writeFixture(opts) }).errors;
}

function packWith(mutate) {
  const p = goodPack();
  mutate(p, p.units[0].lessons[0].exercises);
  return { packs: { 'en/test.json': p } };
}

describe('validateContent', () => {
  it('the repository content is valid', () => {
    const { errors, packs } = validateContent({ packsDir: path.join(REPO_CONTENT, 'packs') });
    expect(errors).toEqual([]);
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_CONTENT, 'packs/manifest.json'), 'utf8'));
    // available and preview packs are loaded and validated (preview: the B1 pilots, Admin → Levels → Preview)
    expect(packs.map((p) => p.entry.id)).toEqual(manifest.tracks.flatMap((t) => t.packs.filter((x) => ['available', 'preview'].includes(x.status)).map((x) => x.id)));
  });

  it('a good pack passes (reserved exercise types included, planned file absent)', () => {
    expect(errorsFor()).toEqual([]);
  });

  it('manifest: rejects an unknown status', () => {
    const m = goodManifest();
    m.tracks[0].packs[0].status = 'soon';
    const errs = errorsFor({ manifest: m });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ path: '/tracks/0/packs/0/status' });
  });

  it('manifest: an available pack must have a file', () => {
    const m = goodManifest();
    m.tracks[0].packs[0].file = null;
    expect(errorsFor({ manifest: m }).length).toBeGreaterThan(0);
  });

  it('available pack: missing file is reported', () => {
    const errs = errorsFor({ packs: {} });
    expect(errs).toEqual([expect.objectContaining({ message: 'file does not exist' })]);
  });

  it('available pack: invalid JSON is reported', () => {
    const errs = errorsFor({ packs: { 'en/test.json': '{ nope' } });
    expect(errs[0].message).toMatch(/invalid JSON/);
  });

  it('schema: missing required field is reported with its path', () => {
    const errs = errorsFor(packWith((p, ex) => { delete ex[0].question; }));
    expect(errs).toContainEqual(expect.objectContaining({ path: '/units/0/lessons/0/exercises/0', message: expect.stringMatching(/question/) }));
  });

  it('schema: unknown exercise type is rejected', () => {
    const errs = errorsFor(packWith((p, ex) => { ex[0].type = 'drag_drop'; }));
    expect(errs.some((e) => e.path === '/units/0/lessons/0/exercises/0/type')).toBe(true);
  });

  it('pack id must match the manifest', () => {
    const errs = errorsFor(packWith((p) => { p.id = 'en-other'; }));
    expect(errs).toContainEqual(expect.objectContaining({ path: '/id', message: expect.stringMatching(/does not match manifest/) }));
  });

  it('rule: ids are unique within a pack', () => {
    const errs = errorsFor(packWith((p, ex) => { ex[1].id = ex[0].id; }));
    expect(errs).toContainEqual(expect.objectContaining({ message: expect.stringMatching(/duplicate id "en-test-e1"/) }));
  });

  it('rule: ids are globally unique across packs', () => {
    const second = goodPack('en-second', 'en'); // reuses vocabulary ids en.cat, en.dog, ...
    const manifest = goodManifest([{ id: 'en-test', file: 'en/test.json' }, { id: 'en-second', file: 'en/second.json' }]);
    const errs = errorsFor({ manifest, packs: { 'en/test.json': goodPack(), 'en/second.json': second } });
    expect(errs.filter((e) => /duplicate id "en\.cat"/.test(e.message))).toHaveLength(1);
    expect(errs[0].file).toMatch(/second\.json$/);
  });

  it('rule: every items reference resolves to a vocabulary id in the same pack', () => {
    const errs = errorsFor(packWith((p, ex) => { ex[0].items = ['en.cow']; }));
    expect(errs).toEqual([expect.objectContaining({ path: '/units/0/lessons/0/exercises/0/items/0', message: 'item "en.cow" is not a vocabulary id in this pack' })]);
  });

  it('rule: sentence items resolve too', () => {
    const errs = errorsFor(packWith((p) => { p.units[0].sentences[0].items = ['en.zebra']; }));
    expect(errs[0].path).toBe('/units/0/sentences/0/items/0');
  });

  it('rule: sentenceId must resolve', () => {
    const errs = errorsFor(packWith((p, ex) => { ex[2].sentenceId = 'en-test-u01-s99'; }));
    expect(errs[0].message).toMatch(/sentence "en-test-u01-s99" is not a sentence id/);
  });

  it('rule: match_pairs has at least 4 pairs', () => {
    const errs = errorsFor(packWith((p, ex) => { ex[1].pairs = ex[1].pairs.slice(0, 3); }));
    expect(errs).toEqual([expect.objectContaining({ message: 'match_pairs must have 4-6 pairs (found 3)' })]);
  });

  it('rule: match_pairs has at most 6 pairs', () => {
    const errs = errorsFor(packWith((p, ex) => {
      ex[1].pairs = [...ex[1].pairs, { left: 'a', right: nl('b') }, { left: 'c', right: nl('d') }, { left: 'e', right: nl('f') }];
    }));
    expect(errs).toEqual([expect.objectContaining({ message: 'match_pairs must have 4-6 pairs (found 7)' })]);
  });

  it('rule: build_sentence tokens joined with spaces equal answer', () => {
    const errs = errorsFor(packWith((p, ex) => { ex[2].tokens = ['The', 'cat', 'is', 'white.']; }));
    expect(errs).toEqual([expect.objectContaining({ path: '/units/0/lessons/0/exercises/2/tokens', message: expect.stringMatching(/must equal answer/) })]);
  });

  it('rule: build_sentence names its sentence (schema) and answers with its target', () => {
    expect(errorsFor(packWith((p, ex) => { delete ex[2].sentenceId; }))[0].message).toMatch(/sentenceId/);
    const errs = errorsFor(packWith((p, ex) => {
      ex[2].answer = 'The cat is white.';
      ex[2].tokens = ['The', 'cat', 'is', 'white.'];
    }));
    expect(errs).toEqual([expect.objectContaining({
      path: '/units/0/lessons/0/exercises/2/answer',
      message: 'build_sentence answer ("The cat is white.") must equal the target of sentence "en-test-u01-s01" ("The cat is black.")',
    })]);
  });

  it('rule: multiple_choice has exactly one correct option (none)', () => {
    const errs = errorsFor(packWith((p, ex) => { delete ex[0].options[0].correct; }));
    expect(errs).toEqual([expect.objectContaining({ message: 'multiple_choice must have exactly one option with "correct": true (found 0)' })]);
  });

  it('rule: multiple_choice has exactly one correct option (two)', () => {
    const errs = errorsFor(packWith((p, ex) => { ex[0].options[1].correct = true; }));
    expect(errs).toEqual([expect.objectContaining({ message: 'multiple_choice must have exactly one option with "correct": true (found 2)' })]);
  });

  it('rule: fill_blank options include the answer and the sentence has one blank', () => {
    expect(errorsFor(packWith((p, ex) => { ex[3].options = ['dog', 'fish']; }))[0].message).toMatch(/must include the answer/);
    expect(errorsFor(packWith((p, ex) => { ex[3].sentence = 'The ___ is ___.'; }))[0].message).toMatch(/exactly one "___"/);
  });

  it('rule: listen must resolve to a vocabulary or sentence id in the pack', () => {
    const errs = errorsFor(packWith((p, ex) => { ex[4].listen = 'en.cow'; }));
    expect(errs).toEqual([expect.objectContaining({ path: '/units/0/lessons/0/exercises/4/listen', message: 'listen "en.cow" is not a vocabulary or sentence id in this pack' })]);
  });

  it('rule: listen_choose has exactly one correct option', () => {
    expect(errorsFor(packWith((p, ex) => { ex[4].options[1].correct = true; }))[0].message)
      .toBe('listen_choose must have exactly one option with "correct": true (found 2)');
    expect(errorsFor(packWith((p, ex) => { delete ex[4].options[0].correct; }))[0].message)
      .toBe('listen_choose must have exactly one option with "correct": true (found 0)');
  });

  it('rule: listen_choose has 3-4 options (schema)', () => {
    expect(errorsFor(packWith((p, ex) => { ex[4].options = ex[4].options.slice(0, 2); }))[0])
      .toMatchObject({ path: '/units/0/lessons/0/exercises/4/options', message: 'must NOT have fewer than 3 items' });
    expect(errorsFor(packWith((p, ex) => { ex[5].options.push({ text: nl('koe') }); }))[0])
      .toMatchObject({ path: '/units/0/lessons/0/exercises/5/options', message: 'must NOT have more than 4 items' });
  });

  it('rule: answerSide target — the correct option is the listened target text', () => {
    const errs = errorsFor(packWith((p, ex) => { ex[4].options = [{ text: 'cat', correct: true }, { text: 'dog' }, { text: 'fish' }]; }));
    expect(errs[0].message).toBe('listen_choose (answerSide target) correct option ("cat") must equal the target text of "en.dog" ("dog")');
  });

  it('rule: answerSide native — the correct option is the listened Dutch text', () => {
    const errs = errorsFor(packWith((p, ex) => { ex[5].options[0].text = nl('poes'); }));
    expect(errs[0].message).toBe('listen_choose (answerSide native) correct option ({"nl":"poes"}) must equal the native text of "en.dog" ({"nl":"hond"})');
  });

  it('rule: listen_choose option texts are unique', () => {
    expect(errorsFor(packWith((p, ex) => { ex[5].options[2].text = nl('kat'); }))[0].message).toBe('listen_choose option texts must be unique');
  });

  it('rule: listen_type answer equals the listened target text', () => {
    const errs = errorsFor(packWith((p, ex) => { ex[6].answer = 'The cat is white.'; }));
    expect(errs).toEqual([expect.objectContaining({
      path: '/units/0/lessons/0/exercises/6/answer',
      message: 'listen_type answer ("The cat is white.") must equal the target text of "en-test-u01-s01" ("The cat is black.")',
    })]);
  });

  it('schema: listening exercises need listen, and audio paths are no longer allowed anywhere', () => {
    expect(errorsFor(packWith((p, ex) => { delete ex[6].listen; }))[0].message).toMatch(/listen/);
    expect(errorsFor(packWith((p) => { p.units[0].vocabulary[0].audio = 'en/cat.mp3'; }))[0].message).toBe('unexpected property "audio"');
  });

  // --- schemaVersion 2: no UI text in packs -------------------------------------------------------

  it('v2: a v1 "prompt" is rejected with a pointer to the i18n files', () => {
    const errs = errorsFor(packWith((p, ex) => { ex[0].prompt = nl('Wat betekent dit?'); }));
    expect(errs).toEqual([expect.objectContaining({
      path: '/units/0/lessons/0/exercises/0',
      message: expect.stringMatching(/^unexpected property "prompt": packs contain no UI text since schemaVersion 2/),
    })]);
  });

  it('v2: schemaVersion is required and must be 2', () => {
    expect(errorsFor(packWith((p) => { delete p.schemaVersion; }))[0].message).toMatch(/missing "schemaVersion": 2/);
    expect(errorsFor(packWith((p) => { p.schemaVersion = 1; }))[0]).toMatchObject({ path: '/schemaVersion', message: 'schemaVersion must be 2 (see content/README.md)' });
  });

  it('v2: native text must be a localized object with the course\'s native key ("nl" for the English course)', () => {
    expect(errorsFor(packWith((p) => { p.units[0].vocabulary[0].native = 'kat'; })).map((e) => e.path)).toContain('/units/0/vocabulary/0/native');
    const noNl = errorsFor(packWith((p) => { p.units[0].sentences[0].native = { en: 'The cat is black.' }; }));
    expect(noNl).toContainEqual(expect.objectContaining({ path: '/units/0/sentences/0/native', message: 'native-side text has no "nl" (the course\'s native language)' }));
    expect(errorsFor(packWith((p, ex) => { ex[1].pairs[0].right = { nl: '' }; }))[0].path).toBe('/units/0/lessons/0/exercises/1/pairs/0/right/nl');
    expect(errorsFor(packWith((p, ex) => { ex[3].hint = { dutch: 'kat', nl: 'kat' }; })).length).toBeGreaterThan(0);
  });

  it('v2: an unknown instruction key is rejected; a known one passes', () => {
    const errs = errorsFor(packWith((p, ex) => { ex[0].instruction = 'exercise.multiple_choice.doesNotExist'; }));
    expect(errs).toEqual([expect.objectContaining({
      path: '/units/0/lessons/0/exercises/0/instruction',
      message: 'instruction key "exercise.multiple_choice.doesNotExist" is missing in client/src/i18n/{en,nl}.json',
    })]);
    expect(errorsFor(packWith((p, ex) => { ex[0].instruction = 'app.back'; }))[0].path).toBe('/units/0/lessons/0/exercises/0/instruction');
  });

  it('v2: an instruction key missing in one locale is rejected', () => {
    const locales = path.join(tmpRoot, 'locales');
    fs.mkdirSync(locales, { recursive: true });
    const read = (l) => JSON.parse(fs.readFileSync(path.join(here, `../../client/src/i18n/${l}.json`), 'utf8'));
    const en = read('en');
    delete en.exercise.listen_type;
    fs.writeFileSync(path.join(locales, 'nl.json'), JSON.stringify(read('nl')));
    fs.writeFileSync(path.join(locales, 'en.json'), JSON.stringify(en));
    const { errors } = validateContent({ packsDir: writeFixture(), localesDir: locales });
    expect(errors.map((e) => e.message)).toEqual([
      'default instruction "exercise.listen_type" is missing in {en}.json',
      'instruction key "exercise.listen_type" is missing in client/src/i18n/{en}.json',
    ]);
  });

  it('v2: multiple_choice sides are opposite (target question → native options and the reverse)', () => {
    expect(errorsFor(packWith((p, ex) => { ex[0].options[1].text = 'dog'; }))[0])
      .toMatchObject({ path: '/units/0/lessons/0/exercises/0/options/1/text', message: expect.stringMatching(/target-language question needs native/) });
    expect(errorsFor(packWith((p, ex) => { ex[8].options[0].text = nl('vis'); }))[0].message).toMatch(/native-language question needs target-language/);
  });

  it('v2: listen_choose option sides follow answerSide', () => {
    expect(errorsFor(packWith((p, ex) => { ex[4].options[1].text = nl('kat'); }))[0].message)
      .toBe('listen_choose answerSide target needs target-language (string) options');
    expect(errorsFor(packWith((p, ex) => { ex[5].options[3].text = 'bird'; }))[0].message)
      .toBe('listen_choose answerSide native needs native (localized { "<native>": … }) options');
  });

  it('per-course native key: a course with native "en" needs English meanings, and accepts them', () => {
    const m = goodManifest();
    m.tracks[0].native = 'en';
    // (an English course for English speakers is itself an error: its target is its native language)
    const others = (errs) => errs.filter((e) => e.message !== 'target "en" is the course\'s native language');
    const withNl = others(errorsFor({ manifest: m }));
    expect(withNl.length).toBeGreaterThan(0);
    expect(withNl[0].message).toBe('native-side text has no "en" (the course\'s native language)');
    const toEn = (v) => (Array.isArray(v) ? v.map(toEn) : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k === 'nl' && typeof x === 'string' ? 'en' : k, toEn(x)])) : v);
    expect(others(errorsFor({ manifest: m, packs: { 'en/test.json': toEn(goodPack()) } }))).toEqual([]);
  });

  it('the committed v2 fixtures fail, one pack per new rule', () => {
    const { errors } = validateContent({ packsDir: path.join(here, 'fixtures/broken-v2') });
    const byFile = Object.fromEntries(errors.map((e) => [path.basename(e.file), e.message]));
    expect(byFile).toEqual({
      'old-prompt.json': expect.stringMatching(/unexpected property "prompt"/),
      'no-schema-version.json': expect.stringMatching(/missing "schemaVersion": 2/),
      'missing-nl.json': 'native-side text has no "nl" (the course\'s native language)',
      'unknown-instruction.json': expect.stringMatching(/instruction key "exercise\.say_hello" is missing/),
      'mc-sides.json': expect.stringMatching(/target-language question needs native/),
    });
  });

  it('the committed broken fixture fails with clear messages', () => {
    const { errors } = validateContent({ packsDir: path.join(here, 'fixtures/broken') });
    expect(errors.map((e) => e.message)).toEqual([
      'multiple_choice must have exactly one option with "correct": true (found 2)',
      'item "en.dog" is not a vocabulary id in this pack',
      'build_sentence tokens joined with spaces ("The cat is white.") must equal answer ("The cat is black.")',
    ]);
  });
});

describe('loadContent / publicPack', () => {
  it('throws ContentError naming file and path for invalid content', () => {
    const dir = path.join(tmpRoot, 'load-bad');
    fs.mkdirSync(dir, { recursive: true });
    fs.cpSync(path.join(here, 'fixtures/broken'), path.join(dir, 'packs'), { recursive: true });
    expect(() => loadContent({ contentDir: dir })).toThrow(ContentError);
    try {
      loadContent({ contentDir: dir });
    } catch (err) {
      expect(err.message).toMatch(/broken\.json \/units\/0\/lessons\/0\/exercises\/1\/tokens/);
    }
  });

  it('public pack contains no answers, no listened text, and a shuffled word bank', () => {
    const index = loadContent({ contentDir: REPO_CONTENT });
    const pub = publicPack(index, 'en-pre-a1');
    const json = JSON.stringify(pub);
    expect(json).not.toMatch(/"correct":/);
    expect(json).not.toMatch(/"answer":/);
    expect(json).not.toMatch(/"tokens"/);
    expect(json).not.toMatch(/"listen":/);
    expect(json).not.toMatch(/"target":/);
    const exercises = pub.units[0].lessons[0].exercises;
    const authored = new Map(index.packs.get('en-pre-a1').pack.units[0].lessons[0].exercises.map((e) => [e.id, e]));
    const build = exercises.find((e) => e.type === 'build_sentence');
    const buildSrc = authored.get(build.id);
    expect(build.bank).toHaveLength(buildSrc.tokens.length + buildSrc.distractors.length);
    expect(build.bank.slice(0, buildSrc.tokens.length)).not.toEqual(buildSrc.tokens);
    const lt = exercises.find((e) => e.type === 'listen_type');
    expect(Object.keys(lt).sort()).toEqual(['audio', 'audioSlow', 'id', 'instruction', 'type']);
    expect(lt.instruction).toBe('exercise.listen_type');
    expect(json).not.toMatch(/"prompt"/);
    expect(json).not.toMatch(/"acceptAlso"/);
    // Native-side text is resolved to the user's native language; the build exercise shows its sentence's.
    const sentence = index.packs.get('en-pre-a1').sentenceById.get(buildSrc.sentenceId);
    expect(build).toMatchObject({ instruction: 'exercise.build_sentence', native: sentence.native.nl });
    const mc = exercises[0];
    const mcSrc = authored.get(mc.id);
    expect(mc).toMatchObject({ instruction: 'exercise.multiple_choice.fromTarget', question: 'cat', questionLang: 'en', optionLang: 'nl' });
    expect(mc.options.sort()).toEqual(mcSrc.options.map((o) => o.text.nl).sort());
    expect(mc.options).toContain('kat');
    expect(pub.units[0].title).toBe('Dieren');
    expect(pub.units[0].lessons[0].title).toBe('Huisdieren');
    const pairs = exercises.find((e) => e.type === 'match_pairs');
    expect(pairs.pairs[0]).toEqual({ left: 'cat', right: 'kat' });
    const lc = exercises.find((e) => e.type === 'listen_choose' && e.answerSide === 'target');
    expect(lc.options.sort()).toEqual(authored.get(lc.id).options.map((o) => o.text).sort());
    expect(lc.optionLang).toBe('en');
    // Without an audio manifest there are no URLs, never an error.
    expect(exercises[0].audio).toBeNull();
    expect(pub.wordAudio).toEqual({});
    expect(pub.units[0].vocabulary[0]).toEqual({ id: 'en.cat', audio: null, audioSlow: null });
  });

  it('a target-language sentence question is recognised as such', () => {
    const index = loadContent({ contentDir: REPO_CONTENT });
    const pub = publicPack(index, 'en-pre-a1').units[0].lessons;
    const all = pub.flatMap((l) => l.exercises);
    const sentences = new Set(index.packs.get('en-pre-a1').pack.units[0].sentences.map((x) => x.target));
    const mc = all.find((e) => e.type === 'multiple_choice' && sentences.has(e.question));
    expect(mc.questionLang).toBe('en');
    const reverse = all.find((e) => e.type === 'multiple_choice' && e.instruction === 'exercise.multiple_choice.toTarget');
    expect(reverse).toMatchObject({ questionLang: 'nl', optionLang: 'en' });
  });

  it('indexes lessons with their playable exercise count (listening types included)', () => {
    const index = loadContent({ contentDir: REPO_CONTENT });
    expect(index.lessons.get('en-pre-a1-u01-l01')).toMatchObject({ packId: 'en-pre-a1', trackId: 'en' });
    expect(index.lessons.get('en-pre-a1-u01-l01').playableCount).toBe(index.lessons.get('en-pre-a1-u01-l01').lesson.exercises.length);
    expect(clone(index.packs.get('fr-a1-1').lessonIds).slice(0, 3)).toEqual(['fr-a1-1-u01-l01', 'fr-a1-1-u01-l02', 'fr-a1-1-u01-l03']);
  });

  it('attempt item ids include the sentence and the listened item', () => {
    expect(attemptItemIds({ items: ['en.cat'], sentenceId: 's1' })).toEqual(['en.cat', 's1']);
    expect(attemptItemIds({ items: ['en.cat', 'en.black'], listen: 's1' })).toEqual(['en.cat', 'en.black', 's1']);
    expect(attemptItemIds({ items: ['en.cat'], listen: 'en.cat' })).toEqual(['en.cat']);
  });
});

describe('courses: the manifest names each course\'s native language', () => {
  it('native must be a known native language, and every native-side text of its packs must have it', () => {
    const m = goodManifest();
    m.tracks[0].native = 'xx';
    expect(errorsFor({ manifest: m }).map((e) => e.message).join('\n')).toMatch(/native "xx" is not a native language/);
    const enCourse = goodManifest();
    enCourse.tracks[0].native = 'en';
    expect(errorsFor({ manifest: enCourse }).map((e) => e.message).join('\n')).toMatch(/native-side text has no "en"/);
    const missing = goodManifest();
    delete missing.tracks[0].native;
    expect(errorsFor({ manifest: missing }).length).toBeGreaterThan(0);
  });
});
