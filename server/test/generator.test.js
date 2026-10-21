// Content pipeline: generator rules + determinism (scripts/content/generator.js), source shorthands,
// trace rules (scripts/content/trace-lib.js) and the word-list parser (scripts/content/wordlist-en.js).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { generatePack, sameMeaning, blankPosition, LEVEL_RULES } from '../../scripts/content/generator.js';
import { expandIds, readPackSources } from '../../scripts/content/sources.js';
import { formatPack } from '../../scripts/format-packs.js';
import { indexWordlist, traceSentence, traceToken, traceVocab } from '../../scripts/content/trace-lib.js';
import { headwordForms, parseEntry, numberEntries } from '../../scripts/content/wordlist-en.js';
import { validateContent } from '../src/content/validate.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-gen-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

// A small two-unit source, written like content/src/en/<level>/*.yaml after parsing.
const v = (target, nl, pos, extra = {}) => ({ target, native: { nl }, pos, ...extra });
function units(cefr = 'Pre-A1') {
  const p = cefr === 'Pre-A1' ? 'en-pre-a1' : 'en-a1';
  const u1 = expandIds({
    id: `${p}-u01`, title: { nl: 'Dieren' }, icon: 'animals',
    vocabulary: [
      v('cat', 'kat', 'noun'), v('dog', 'hond', 'noun'), v('fish', 'vis', 'noun'), v('bird', 'vogel', 'noun'),
      v('horse', 'paard', 'noun'), v('cow', 'koe', 'noun'), v('sheep', 'schaap', 'noun'), v('animal', 'dier', 'noun', { category: true }),
      v('black', 'zwart', 'adjective'), v('white', 'wit', 'adjective'), v('big', 'groot', 'adjective'), v('small', 'klein', 'adjective'),
      v('brown', 'bruin', 'adjective'), v('large', 'groot', 'adjective'),
    ],
    sentences: [
      { id: 's01', target: 'The cat is black.', native: { nl: 'De kat is zwart.' }, items: ['en.cat', 'en.black'] },
      { id: 's02', target: 'The dog is white.', native: { nl: 'De hond is wit.' }, items: ['en.dog', 'en.white'] },
      { id: 's03', target: 'The bird is small.', native: { nl: 'De vogel is klein.' }, items: ['en.bird', 'en.small'] },
      { id: 's04', target: 'The fish is big.', native: { nl: 'De vis is groot.' }, items: ['en.fish', 'en.big'] },
      { id: 's05', target: 'The horse is brown.', native: { nl: 'Het paard is bruin.' }, items: ['en.horse', 'en.brown'] },
      { id: 's06', target: 'Today the cow is in the big black and white garden with the sheep.', native: { nl: 'Vandaag is de koe met het schaap in de grote zwart-witte tuin.' }, items: ['en.cow', 'en.sheep'] },
      { id: 's07', target: "It's a big animal.", native: { nl: 'Het is een groot dier.' }, items: ['en.animal', 'en.big'], acceptAlso: ['It is a big animal.'] },
      { id: 's08', target: 'The sheep is white.', native: { nl: 'Het schaap is wit.' }, items: ['en.sheep', 'en.white'] },
      { id: 's09', target: 'Today I see a cow.', native: { nl: 'Vandaag zie ik een koe.' }, items: ['en.cow'], acceptAlso: ['I see a cow today.'] },
      { id: 's10', target: 'The large dog is brown.', native: { nl: 'De grote hond is bruin.' }, items: ['en.large', 'en.dog', 'en.brown'] },
    ],
    lessons: [{ id: 'l01', title: { nl: 'Huisdieren' }, vocab: ['en.cat', 'en.dog', 'en.fish', 'en.bird', 'en.black', 'en.white', 'en.small'] }],
    file: 'u01.yaml',
  }, 'en');
  return [u1];
}
const META = { id: 'en-pre-a1', track: 'en', cefr: 'Pre-A1', source: 'Test source: a hand-made unit for the generator tests.' };
const allExercises = (pack) => pack.units.flatMap((u) => u.lessons.flatMap((l) => l.exercises.map((e) => ({ ...e, lessonId: l.id }))));
const text = (t) => (typeof t === 'string' ? t : t.nl);

describe('generator', () => {
  const pack = generatePack(META, units());
  const exs = allExercises(pack);
  const vocab = new Map(pack.units[0].vocabulary.map((x) => [x.id, x]));

  it('is deterministic: the same sources give a byte-identical pack', () => {
    expect(formatPack(generatePack(META, units()))).toBe(formatPack(pack));
  });

  // the repository packs are up to date with their sources: server/test/packs-{en,fr,nl}.test.js (one file per track runs
  // on its own worker, Dutch included)

  it('produces a valid schemaVersion 2 pack', () => {
    const dir = path.join(tmp, 'packs');
    fs.mkdirSync(path.join(dir, 'en'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'en/pre-a1.json'), formatPack(pack));
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ tracks: [{ id: 'en', name: { nl: 'Engels' }, native: 'nl', mascot: 'otter', packs: [
      { id: 'en-pre-a1', file: 'en/pre-a1.json', cefr: 'Pre-A1', title: { nl: 'Starters' }, status: 'available' }] }] }));
    expect(validateContent({ packsDir: dir }).errors).toEqual([]);
  });

  it('splits lessons: pinned ids kept, the rest in lessons of 6–8 words, then the review lesson "Herhaling"', () => {
    const lessons = pack.units[0].lessons;
    expect(lessons.map((l) => l.id)).toEqual(['en-pre-a1-u01-l01', 'en-pre-a1-u01-l02', 'en-pre-a1-u01-review']);
    expect(lessons[2].title).toEqual({ nl: 'Herhaling' });
    for (const l of lessons) expect(l.exercises.length, l.id).toBeGreaterThanOrEqual(12);
    for (const l of lessons) expect(l.exercises.length, l.id).toBeLessThanOrEqual(14);
  });

  it('every lesson mixes all six types, with one listen_choose per answer side', () => {
    for (const l of pack.units[0].lessons.slice(0, -1)) {
      const types = new Set(l.exercises.map((e) => e.type));
      expect([...types].sort()).toEqual(['build_sentence', 'fill_blank', 'listen_choose', 'listen_type', 'match_pairs', 'multiple_choice']);
      const sides = l.exercises.filter((e) => e.type === 'listen_choose').map((e) => e.answerSide).sort();
      expect(sides).toEqual(['native', 'target']);
    }
  });

  it('introduces before testing: first appearance is MC target→native; harder types only use words seen earlier', () => {
    const seen = new Set();
    for (const l of pack.units[0].lessons) {
      for (const e of l.exercises) {
        const ids = e.items;
        const fresh = ids.filter((id) => !seen.has(id));
        if (fresh.length) {
          expect(e.type, `${e.id} introduces ${fresh}`).toBe('multiple_choice');
          expect(typeof e.question, e.id).toBe('string');
          expect(fresh).toHaveLength(1);
        }
        if (['fill_blank', 'listen_type', 'build_sentence', 'match_pairs'].includes(e.type)) {
          for (const id of ids) expect(seen.has(id), `${e.id} uses ${id} before it was introduced`).toBe(true);
        }
        ids.forEach((id) => seen.add(id));
      }
    }
  });

  it('distractors: same pack and part of speech, never the same Dutch meaning, no duplicate options, no category for a member', () => {
    const wordQuestion = (x) => x.type === 'multiple_choice' && x.items.length === 1 && vocab.has(x.items[0])
      && [vocab.get(x.items[0]).target, vocab.get(x.items[0]).native.nl].includes(text(x.question));
    for (const e of exs.filter(wordQuestion)) {
      const answer = vocab.get(e.items[0]);
      const texts = e.options.map((o) => text(o.text));
      expect(new Set(texts).size, e.id).toBe(texts.length);
      for (const o of e.options.filter((x) => !x.correct)) {
        const d = [...vocab.values()].find((x) => (typeof o.text === 'string' ? x.target === o.text : x.native.nl === o.text.nl));
        expect(d, `${e.id} option ${text(o.text)} comes from the pack`).toBeTruthy();
        expect(sameMeaning(d.native.nl, answer.native.nl), `${e.id}: ${d.target} means the same as ${answer.target}`).toBe(false);
        if (answer.pos === 'noun') expect(d.id, e.id).not.toBe('en.animal');
      }
    }
    // "big" and "large" both mean "groot": never offered against each other.
    const big = exs.filter((e) => e.type === 'multiple_choice' && (e.items[0] === 'en.big' || e.items[0] === 'en.large'));
    for (const e of big) expect(e.options.filter((o) => ['groot', 'big', 'large'].includes(text(o.text)))).toHaveLength(1);
  });

  it('match_pairs: 4–6 pairs with distinct meanings', () => {
    const matches = exs.filter((e) => e.type === 'match_pairs');
    expect(matches.length).toBeGreaterThan(0);
    for (const e of matches) {
      expect(e.pairs.length).toBeGreaterThanOrEqual(4);
      expect(e.pairs.length).toBeLessThanOrEqual(6);
      const meanings = e.pairs.map((p) => p.right.nl);
      for (let i = 0; i < meanings.length; i++) for (let j = i + 1; j < meanings.length; j++) expect(sameMeaning(meanings[i], meanings[j]), e.id).toBe(false);
    }
  });

  it('fill_blank blanks a unit word (hint = its Dutch meaning), word bank at Pre-A1 and typed above', () => {
    const fills = exs.filter((e) => e.type === 'fill_blank');
    for (const e of fills) {
      const word = [...vocab.values()].find((x) => x.target.toLowerCase() === e.answer.toLowerCase());
      expect(word, e.id).toBeTruthy();
      expect(e.hint).toEqual({ nl: word.native.nl });
      expect(e.options, e.id).toContain(e.answer);
    }
    const a1 = allExercises(generatePack({ ...META, id: 'en-a1', cefr: 'A1' }, units('A1'))).filter((e) => e.type === 'fill_blank');
    expect(a1.length).toBeGreaterThan(0);
    for (const e of a1) expect(e.options).toBeUndefined();
    // Typed: never a word with a same-meaning twin (big/large both "groot"), the hint couldn't tell them apart.
    for (const e of a1) expect(['big', 'large']).not.toContain(e.answer.toLowerCase());
    expect(blankPosition('The cat is black.', 'cat')).toEqual({ index: 4, text: 'cat' });
    expect(blankPosition('Cat and cat.', 'cat')).toEqual({ index: 8, text: 'cat' }); // the initial one never
    expect(blankPosition('The cat and the cat.', 'cat')).toBeNull(); // two: ambiguous
  });

  it('length limits: build_sentence ≤ 7 words / listen_type ≤ 5 words at Pre-A1; ≤ 10 / ≤ 8 above', () => {
    for (const [cefr, list] of [['Pre-A1', exs], ['A1', allExercises(generatePack({ ...META, id: 'en-a1', cefr: 'A1' }, units('A1')))]]) {
      const { buildMax, listenMax } = LEVEL_RULES[cefr];
      for (const e of list.filter((x) => x.type === 'build_sentence')) {
        expect(e.tokens.length, e.id).toBeLessThanOrEqual(buildMax);
        expect(e.distractors).toHaveLength(2);
        for (const d of e.distractors) expect(e.tokens.map((t) => t.toLowerCase())).not.toContain(d);
      }
      for (const e of list.filter((x) => x.type === 'listen_type')) expect(e.answer.split(' ').length, e.id).toBeLessThanOrEqual(listenMax);
    }
    expect(exs.some((e) => e.sentenceId === 'en-pre-a1-u01-s06' && e.type === 'build_sentence')).toBe(false); // 14 words
  });

  it('acceptAlso: other orders go to build_sentence, every alternative to listen_type', () => {
    const generated = generatePack(META, units());
    const all = allExercises(generated);
    const b = all.filter((e) => e.type === 'build_sentence' && e.sentenceId === 'en-pre-a1-u01-s09');
    for (const e of b) expect(e.acceptAlso).toEqual(['I see a cow today.']);
    const b7 = all.filter((e) => e.type === 'build_sentence' && e.sentenceId === 'en-pre-a1-u01-s07');
    for (const e of b7) expect(e.acceptAlso).toBeUndefined(); // "It is" has other tokens than "It's"
    const lt7 = all.filter((e) => e.type === 'listen_type' && e.listen === 'en-pre-a1-u01-s07');
    for (const e of lt7) expect(e.acceptAlso).toEqual(['It is a big animal.']);
  });

  it('ids are stable: adding a unit or a sentence elsewhere leaves existing lesson and exercise ids alone', () => {
    const more = units();
    more.push(expandIds({ id: 'en-pre-a1-u02', title: { nl: 'Meer' }, icon: 'x', vocabulary: [v('red', 'rood', 'adjective'), v('blue', 'blauw', 'adjective'),
      v('pink', 'roze', 'adjective'), v('green', 'groen', 'adjective'), v('grey', 'grijs', 'adjective'), v('yellow', 'geel', 'adjective')],
    sentences: [{ id: 's01', target: 'The cat is red.', native: { nl: 'De kat is rood.' }, items: ['en.cat', 'en.red'] }], file: 'u02.yaml' }, 'en'));
    const ids = (p) => allExercises(p).filter((e) => e.lessonId.startsWith('en-pre-a1-u01')).map((e) => e.id);
    expect(ids(generatePack(META, more))).toEqual(ids(pack));
  });
});

describe('trace rules', () => {
  const list = [
    ['cat', 'S', 'n'], ['be', 'S', 'v'], ['the', 'S', 'det'], ['a', 'S', 'det'], ['big', 'S', 'adj'], ['I', 'S', 'pron'], ['it', 'S', 'pron'],
    ['do', 'S', 'v'], ['not', 'S', 'adv'], ['have', 'S', 'v'], ['have got', 'S', 'v'], ['go', 'S', 'v'], ['play', 'S', 'v'], ['baby', 'S', 'n'],
    ['box', 'S', 'n'], ['run', 'S', 'v'], ['can', 'S', 'v'], ['ice cream', 'S', 'n'], ['like', 'S', 'v'], ['neck', 'M', 'n'], ['slow', 'M', 'adj'],
    ['will', 'F', 'v'], ['Tom', 'S', 'name'], ['quiet', 'M', 'adj'], ['wolf', 'F', 'n'], ['let\'s', 'S', 'v'], ['mouse', 'S', 'n'], ['mice', 'S', 'n'],
  ].map(([word, level, pos]) => ({ word, level, pos }));
  const index = indexWordlist(list);
  const ok = (w, l = 'S') => traceToken(index, w, l).ok;

  it('vocabulary must be an entry at or below the level', () => {
    expect(traceVocab(index, 'cat', 'S').ok).toBe(true);
    expect(traceVocab(index, 'neck', 'S')).toMatchObject({ ok: false });
    expect(traceVocab(index, 'neck', 'M').ok).toBe(true);
    expect(traceVocab(index, 'cats', 'S').ok).toBe(false); // an inflection is not a vocabulary entry
  });

  it('Starters inflections: plural -s/-es/-ies, 3rd person -s, -ing, possessive, contractions', () => {
    for (const w of ['cats', 'boxes', 'babies', 'plays', 'goes', 'playing', 'running', 'Tom\'s', 'it\'s', 'don\'t', 'can\'t', 'I\'m', 'is', 'are', 'am', 'has', 'let\'s']) {
      expect(ok(w), w).toBe(true);
    }
    expect(ok('played')).toBe(false); // past simple is Movers grammar
    expect(ok('bigger')).toBe(false); // comparatives are Movers grammar
    expect(ok('went')).toBe(false);
  });

  it('Movers adds past simple, comparatives/superlatives and -ly; Flyers adds participles and will', () => {
    for (const w of ['played', 'went', 'bigger', 'biggest', 'slowly', 'quieter']) expect(ok(w, 'M'), w).toBe(true);
    expect(ok('gone', 'M')).toBe(false);
    expect(ok('gone', 'F')).toBe(true);
    expect(ok("it'll", 'M')).toBe(false);
    expect(ok("it'll", 'F')).toBe(true);
    expect(ok('wolves', 'F')).toBe(true);
  });

  it('sentences: multi-word entries, have got, numbers in range, names; off-level words are reported', () => {
    expect(traceSentence(index, 'I like ice cream.', 'S')).toEqual([]);
    expect(traceSentence(index, 'Tom has got a big cat.', 'S')).toEqual([]);
    expect(traceSentence(index, 'I have got 20 cats.', 'S')).toEqual([]);
    expect(traceSentence(index, 'Cat is C, A, T.', 'S')).toEqual([]); // letters of the alphabet
    expect(traceSentence(index, 'I have got 21 cats.', 'S').map((p) => p.word)).toEqual(['21']);
    expect(traceSentence(index, 'The cat has got a neck.', 'S').map((p) => p.word)).toEqual(['neck']);
    expect(traceSentence(index, 'The cat has got a neck.', 'M')).toEqual([]);
  });

  it('content:trace fails on an off-level fixture and passes when the word list is missing', () => {
    const src = path.join(tmp, 'src');
    fs.mkdirSync(path.join(src, 'en/pre-a1'), { recursive: true });
    fs.writeFileSync(path.join(src, 'en/pre-a1/pack.yaml'), 'id: en-pre-a1\ncefr: Pre-A1\nsource: test fixture\n');
    fs.writeFileSync(path.join(src, 'en/pre-a1/01-test.yaml'), [
      'id: en-pre-a1-u01', 'title: { nl: Test }', 'icon: animals', 'vocabulary:',
      '  - { target: cat, native: { nl: kat }, pos: noun }', '  - { target: neck, native: { nl: nek }, pos: noun }',
      'sentences:', '  - { id: s01, target: "The cat has got a long neck.", native: { nl: "De kat heeft een lange nek." }, items: [en.cat] }', ''].join('\n'));
    const wl = path.join(tmp, 'wordlist.json');
    fs.writeFileSync(wl, JSON.stringify(list));
    const run = (args) => {
      try {
        return { code: 0, out: execFileSync('node', [path.join(ROOT, 'scripts/content/trace.js'), 'en', ...args], { encoding: 'utf8', stdio: 'pipe' }) };
      } catch (err) {
        return { code: err.status, out: `${err.stdout}${err.stderr}` };
      }
    };
    const failed = run(['--src', src, '--wordlist', wl]);
    expect(failed.code).toBe(1);
    expect(failed.out).toMatch(/vocabulary en\.neck "neck": word-list level M, above S/);
    expect(failed.out).toMatch(/"neck" — not in the word list at this level/);
    const missing = run(['--src', src, '--wordlist', path.join(tmp, 'absent.json')]);
    expect(missing.code).toBe(0);
    expect(missing.out).toMatch(/is missing/);
  });
});

describe('word-list parser', () => {
  it('reads entries with their level, part of speech and variants', () => {
    expect(parseEntry('apartment (UK flat) n S')).toEqual([{ word: 'apartment', level: 'S', pos: 'n', us: true }, { word: 'flat', level: 'S', pos: 'n' }]);
    expect(parseEntry('favourite (US favorite) adj S').map((e) => [e.word, Boolean(e.us)])).toEqual([['favourite', false], ['favorite', true]]);
    expect(parseEntry('foot/feet n S').map((e) => e.word)).toEqual(['foot', 'feet']);
    expect(parseEntry('blond(e) adj M').map((e) => e.word)).toEqual(['blond', 'blonde']);
    expect(parseEntry('a lot of det S')).toEqual([{ word: 'a lot of', level: 'S', pos: 'det' }]);
    expect(parseEntry('at prep of place S')[0]).toMatchObject({ word: 'at', pos: 'prep of place' });
    expect(parseEntry('bat (as sports equipment) n S')[0].word).toBe('bat');
    expect(headwordForms('candy (UK sweet(s))').map((f) => f.form)).toEqual(['candy', 'sweet', 'sweets']);
    expect(parseEntry('apple n')).toBeNull();
  });

  it('expands the level notes into number words', () => {
    const n = numberEntries();
    expect(n.find((e) => e.word === 'twenty')).toMatchObject({ level: 'S' });
    expect(n.find((e) => e.word === 'twenty-one')).toMatchObject({ level: 'M' });
    expect(n.find((e) => e.word === 'twelfth')).toMatchObject({ level: 'M' });
    expect(n.find((e) => e.word === 'thirty-first')).toMatchObject({ level: 'F' });
  });
});

describe('homophone rule for single-word listen_type (new packs only)', () => {
  const single = (pack) => allExercises(pack).filter((e) => e.type === 'listen_type' && !e.listen.includes('-s')).map((e) => e.answer);
  it('a word that sounds like another word of the course is never a single-word listen_type', () => {
    const legacy = generatePack({ ...META, legacyListenType: true }, units(), { homophones: [['cat', 'kat']] });
    const words = single(legacy);
    expect(words.length).toBeGreaterThan(0);
    const banned = words[0];
    const fresh = generatePack(META, units(), { homophones: [[banned, 'x-sound-alike']] });
    expect(single(fresh)).not.toContain(banned);
    // Legacy packs ignore the list: their locked exercises stay.
    expect(formatPack(generatePack({ ...META, legacyListenType: true }, units(), { homophones: [[banned, 'x']] }))).toBe(formatPack(legacy));
  });

  it('the six English and French packs are marked legacy, every new pack is not', () => {
    for (const id of ['en-pre-a1', 'en-a1', 'en-a2', 'fr-a1-1', 'fr-a1', 'fr-a2']) expect(readPackSources(id).meta.legacyListenType, id).toBe(true);
    const nlDir = path.join(ROOT, 'content/src/nl');
    for (const dir of (fs.existsSync(nlDir) ? fs.readdirSync(nlDir) : []).filter((d) => fs.existsSync(path.join(ROOT, 'content/src/nl', d, 'pack.yaml')))) {
      expect(readPackSources(`nl-${dir}`).meta.legacyListenType, dir).toBeUndefined();
    }
  });

  it('a course with English meanings: options, hints, titles and the review title are { en }', () => {
    const en = (target, meaning, pos, extra = {}) => ({ target, native: { en: meaning }, pos, ...extra });
    const u = expandIds({
      id: 'nl-pre-a1-u99', title: { en: 'Animals' }, icon: 'animals',
      vocabulary: [en('de kat', 'cat', 'noun', { plural: 'katten' }), en('de hond', 'dog', 'noun', { plural: 'honden' }), en('de vis', 'fish', 'noun', { plural: 'vissen' }),
        en('de vogel', 'bird', 'noun', { plural: 'vogels' }), en('het paard', 'horse', 'noun', { plural: 'paarden' }), en('het schaap', 'sheep', 'noun', { plural: 'schapen' }),
        en('zwart', 'black', 'adjective'), en('wit', 'white', 'adjective'), en('groot', 'big', 'adjective'), en('klein', 'small', 'adjective')],
      sentences: [
        { id: 's01', target: 'De kat is zwart.', native: { en: 'The cat is black.' }, items: ['nl.kat', 'nl.zwart'] },
        { id: 's02', target: 'De hond is wit.', native: { en: 'The dog is white.' }, items: ['nl.hond', 'nl.wit'] },
        { id: 's03', target: 'De vogel is klein.', native: { en: 'The bird is small.' }, items: ['nl.vogel', 'nl.klein'] },
        { id: 's04', target: 'De vis is groot.', native: { en: 'The fish is big.' }, items: ['nl.vis', 'nl.groot'] },
        { id: 's05', target: 'Het paard is groot.', native: { en: 'The horse is big.' }, items: ['nl.paard', 'nl.groot'] },
        { id: 's06', target: 'Het schaap is wit.', native: { en: 'The sheep is white.' }, items: ['nl.schaap', 'nl.wit'] },
      ],
      lessons: [{ id: 'l01', title: { en: 'Pets' }, vocab: ['nl.kat', 'nl.hond', 'nl.vogel', 'nl.zwart', 'nl.wit', 'nl.klein'] }],
      file: 'u99.yaml',
    }, 'nl');
    const pack = generatePack({ id: 'nl-pre-a1', track: 'nl', native: 'en', cefr: 'Pre-A1', source: 'Test source: Dutch with English meanings.' }, [u]);
    const json = JSON.stringify(pack);
    expect(json).not.toMatch(/"nl":/);
    expect(pack.units[0].lessons.at(-1).title).toEqual({ en: 'Review' });
    // A Dutch noun's options share its article (de / het): the article never gives the answer away.
    for (const e of allExercises(pack).filter((x) => x.type === 'multiple_choice' && typeof x.question === 'object' && x.items.length === 1)) {
      const arts = new Set(e.options.map((o) => o.text.split(' ')[0]).filter((a) => a === 'de' || a === 'het'));
      expect(arts.size, e.id).toBeLessThanOrEqual(1);
    }
  });
});

describe('noBlank items and inflected forms in English/French B1 texts', () => {
  it('a vocabulary item with noBlank: true is never a typed fill-in; without it, it can be', () => {
    const META_A1 = { id: 'en-a1', track: 'en', cefr: 'A1', source: 'Test source: a hand-made unit for the generator tests.' };
    const plain = allExercises(generatePack(META_A1, units('A1'))).filter((e) => e.type === 'fill_blank');
    const blanked = new Set(plain.map((e) => e.answer.toLowerCase()));
    expect(blanked.size).toBeGreaterThan(0);
    const target = [...blanked][0];
    const marked = units('A1');
    marked[0].vocabulary = marked[0].vocabulary.map((x) => (x.target === target ? { ...x, noBlank: true } : x));
    const after = allExercises(generatePack(META_A1, marked)).filter((e) => e.type === 'fill_blank');
    expect(after.some((e) => e.answer.toLowerCase() === target)).toBe(false);
  });

  it('a build keeps an acceptAlso order that moves the capital and full stop; a B1 dictation accepts only what was said', () => {
    const builds = allExercises(generatePack({ ...META, id: 'en-a1', cefr: 'A1' }, units('A1'))).filter((e) => e.type === 'build_sentence' && e.sentenceId === 'en-a1-u01-s09');
    for (const e of builds) expect(e.acceptAlso).toEqual(['I see a cow today.']);
    const b1 = allExercises(generatePack({ ...META, id: 'en-b1', cefr: 'B1' }, units('B1').map((u) => ({ ...u, id: u.id }))));
    for (const e of b1.filter((x) => x.type === 'listen_type' && x.listen?.endsWith('-s09'))) expect(e.acceptAlso).toBeUndefined();
    expect(LEVEL_RULES.B1.orderAlternatives).toBe(true);
  });

  it('a B1 dictation keeps an alternative that is not another order (a spelling), drops reorderings', () => {
    const us = units('B1').map((u) => ({ ...u, sentences: u.sentences.map((x) => (x.target.includes(' is ')
      ? { ...x, acceptAlso: [...(x.acceptAlso ?? []), x.target.replace(' is ', ' is really ')] } : x)) }));
    const dict = allExercises(generatePack({ ...META, id: 'en-b1', cefr: 'B1' }, us)).filter((x) => x.type === 'listen_type' && x.listen?.includes('-s'));
    expect(dict.length).toBeGreaterThan(0);
    for (const e of dict) {
      const src = us[0].sentences.find((x) => x.id === e.listen);
      if (src.target.includes(' is ')) expect(e.acceptAlso, e.id).toEqual([src.target.replace(' is ', ' is really ')]);
      else expect(e.acceptAlso, e.id).toBeUndefined();
    }
  });

  it('the B1 packs carry forms for verb forms and plurals of a text\'s items (English and French)', () => {
    const texts = (track) => JSON.parse(fs.readFileSync(path.join(ROOT, `content/packs/${track}/b1.json`), 'utf8')).units.flatMap((u) => u.texts || []);
    const en = texts('en');
    const t06 = en.find((t) => t.id === 'en-b1-t06');
    expect(t06.forms).toMatchObject({ postponed: 'en.postpone', arranged: 'en.arrange' });
    expect(en.filter((t) => t.forms).length).toBeGreaterThan(20);
    for (const t of en) for (const w of Object.keys(t.forms || {})) expect(w).toMatch(/^[a-z]+$/);
    const fr = texts('fr');
    expect(fr.find((t) => t.id === 'fr-b1-t03').forms).toMatchObject({ soutient: 'fr.soutenir' });
    expect(LEVEL_RULES.A2.textForms).toBeUndefined();
  });
});

describe('B1 guards: cognate blanks, build: true, finite = infinitive', () => {
  const en = (target, meaning, pos, extra = {}) => ({ target, native: { en: meaning }, pos, ...extra });
  const unit = (sentenceExtra = {}, finite = { word: 'werkt', hint: { en: 'werken (present)' } }) => expandIds({
    id: 'nl-b1-u99', title: { en: 'Work' }, icon: 'work',
    vocabulary: [en('de camera', 'camera', 'noun', { plural: "camera's" }), en('de collega', 'colleague', 'noun', { plural: "collega's" }), en('het kantoor', 'office', 'noun', { plural: 'kantoren' }),
      en('de baas', 'boss', 'noun', { plural: 'bazen' }), en('werken', 'to work', 'verb'), en('groot', 'big', 'adjective'), en('nieuw', 'new', 'adjective'), en('klein', 'small', 'adjective')],
    sentences: [
      { id: 's01', target: 'De camera hangt in het kantoor.', native: { en: 'The camera is in the office.' }, items: ['nl.camera', 'nl.kantoor'] },
      { id: 's02', target: 'Mijn collega werkt in een groot kantoor.', native: { en: 'My colleague works in a big office.' }, items: ['nl.collega', 'nl.werken', 'nl.groot'], finite },
      { id: 's03', target: 'De nieuwe baas is klein.', native: { en: 'The new boss is short.' }, items: ['nl.baas', 'nl.nieuw', 'nl.klein'] },
      { id: 's04', target: 'Het kantoor van de baas is klein.', native: { en: "The boss's office is small." }, items: ['nl.kantoor', 'nl.baas', 'nl.klein'], ...sentenceExtra },
      { id: 's05', target: 'De camera is nieuw.', native: { en: 'The camera is new.' }, items: ['nl.camera', 'nl.nieuw'] },
      { id: 's06', target: 'Mijn collega is groot.', native: { en: 'My colleague is tall.' }, items: ['nl.collega', 'nl.groot'] },
    ],
    file: 'u99.yaml',
  }, 'nl');
  const META_B1 = { id: 'nl-b1', track: 'nl', native: 'en', cefr: 'B1', finiteVerbFill: true, source: 'Test source: Dutch B1 with English meanings.' };
  it('B1 never blanks a word whose meaning is the word itself (camera); lower levels have no such rule', () => {
    expect(LEVEL_RULES.B1.noCognateBlank).toBe(true);
    const fills = allExercises(generatePack(META_B1, [unit()])).filter((e) => e.type === 'fill_blank' && e.kind !== 'finite_verb');
    expect(fills.length).toBeGreaterThan(0);
    expect(fills.some((e) => /camera/i.test(e.answer))).toBe(false);
    expect(LEVEL_RULES.A2.noCognateBlank).toBeUndefined();
  });
  it('a sentence marked build: true is built in the review lesson', () => {
    const pack = generatePack(META_B1, [unit({ build: true })]);
    const review = pack.units[0].lessons.find((l) => l.id.endsWith('-review'));
    const builds = allExercises(pack).filter((e) => e.type === 'build_sentence' && e.sentenceId === 'nl-b1-u99-s04');
    expect(builds.length).toBeGreaterThan(0);
    expect(review.exercises.some((e) => e.type === 'build_sentence' && e.sentenceId === 'nl-b1-u99-s04') || builds.some((e) => e.lessonId !== review.id)).toBe(true);
  });
  it('a finite word that is its hint\'s infinitive fails the build', () => {
    expect(() => generatePack(META_B1, [unit({}, { word: 'werkt', hint: { en: 'werkt (present)' } })])).toThrow(/infinitive of its hint/);
  });
});

describe('append-only content: extra lessons and appended blocks never move an existing id', () => {
  const base = generatePack(META, units());
  const sameExisting = (a, b) => {
    for (const [i, u] of a.units.entries()) {
      for (const l of u.lessons) expect(b.units[i].lessons.find((x) => x.id === l.id), l.id).toEqual(l);
      expect(b.units[i].vocabulary.slice(0, u.vocabulary.length)).toEqual(u.vocabulary);
      expect(b.units[i].sentences.slice(0, u.sentences.length)).toEqual(u.sentences);
    }
  };
  const usedSentences = (pack) => {
    const u = pack.units[0];
    const asked = new Set(u.lessons.flatMap((l) => l.exercises.filter((e) => e.type === 'multiple_choice' && typeof e.question === 'string').map((e) => e.question)));
    const used = new Set(u.lessons.flatMap((l) => l.exercises.flatMap((e) => [e.sentenceId, e.listen])));
    return u.sentences.filter((x) => used.has(x.id) || asked.has(x.target)).length;
  };

  it('extraLessons: every unused sentence reaches an exercise in <unit>-extra (optional, ≥ 4 and ≤ 14), existing lessons identical, deterministic', () => {
    const withExtra = generatePack({ ...META, extraLessons: true }, units());
    sameExisting(base, withExtra);
    const extra = withExtra.units[0].lessons.filter((l) => l.extra);
    expect(extra.map((l) => l.id)).toEqual(['en-pre-a1-u01-extra']);
    expect(withExtra.units[0].lessons.at(-1).extra).toBe(true); // after the review lesson
    for (const l of extra) {
      expect(l.exercises.length).toBeGreaterThanOrEqual(4);
      expect(l.exercises.length).toBeLessThanOrEqual(14);
      expect(l.exercises.map((e) => e.id)).toEqual(l.exercises.map((_, i) => `${l.id}-e${String(i + 1).padStart(2, '0')}`));
    }
    expect(usedSentences(withExtra)).toBe(withExtra.units[0].sentences.length);
    expect(usedSentences(base)).toBeLessThan(base.units[0].sentences.length);
    expect(formatPack(generatePack({ ...META, extraLessons: true }, units()))).toBe(formatPack(withExtra));
    expect(formatPack(withExtra)).toContain('"extra": true');
  });

  it('append: new words and sentences get a lesson of their own before the review, with new ids; nothing else changes', () => {
    const u = units();
    u[0].append = [{
      lesson: { id: 'en-pre-a1-u01-l03', title: { nl: 'Nog meer dieren' } },
      vocabulary: [{ id: 'en.duck', target: 'duck', native: { nl: 'eend' }, pos: 'noun' }, { id: 'en.goat', target: 'goat', native: { nl: 'geit' }, pos: 'noun' }],
      sentences: [
        { id: 'en-pre-a1-u01-s11', target: 'The duck is white.', native: { nl: 'De eend is wit.' }, items: ['en.duck', 'en.white'] },
        { id: 'en-pre-a1-u01-s12', target: 'The goat is brown.', native: { nl: 'De geit is bruin.' }, items: ['en.goat', 'en.brown'] },
        { id: 'en-pre-a1-u01-s13', target: 'I see a duck.', native: { nl: 'Ik zie een eend.' }, items: ['en.duck'] },
      ],
    }];
    const appended = generatePack(META, u);
    sameExisting(base, appended);
    const lessons = appended.units[0].lessons.map((l) => l.id);
    expect(lessons.slice(-2)).toEqual(['en-pre-a1-u01-l03', 'en-pre-a1-u01-review']);
    const l03 = appended.units[0].lessons.find((l) => l.id === 'en-pre-a1-u01-l03');
    expect(l03.exercises[0]).toMatchObject({ type: 'multiple_choice', items: ['en.duck'] });
    expect(appended.units[0].vocabulary.map((x) => x.id).slice(-2)).toEqual(['en.duck', 'en.goat']);
    // an appended word is never a wrong option in an existing exercise (it was not there when they were locked)
    const before = JSON.stringify(base.units[0].lessons);
    expect(before.includes('duck')).toBe(false);
    expect(formatPack(generatePack(META, u))).toBe(formatPack(appended));
  });
});
