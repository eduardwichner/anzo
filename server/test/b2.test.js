// The new exercise kinds (gapped text, word formation, open cloze, key word transformation,
// multiple matching, summary, listening completion) — rules with a failing fixture each, grading, public shapes, generator
// determinism and order, the lock key — and optional branch packs (manifest rules, courses, path, practice bands).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { gappedParts, gappedProblems, questionProblems, textProblems, transformProblems } from '../src/content/texts.js';
import { grade, orderToken, sameStem } from '../src/content/grading.js';
import { instructionKey } from '../src/content/instructions.js';
import { loadContent, packPath, publicExercise } from '../src/content/loader.js';
import { textExerciseKey } from '../src/content/idlock.js';
import { validateContent } from '../src/content/validate.js';
import { generatePack } from '../../scripts/content/generator.js';
import { formatPack } from '../../scripts/format-packs.js';
import { exerciseBand, PRACTICE_TYPES, TEXT_QUESTION_TYPES } from '../src/practice/select.js';
import { allCourses } from '../src/lib/courses.js';
import { lessonStates, currentPosition } from '../../client/src/lib/path.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const s = (id, target) => ({ id, target, native: { en: 'x' } });
const TEXT = {
  id: 'nl-b2-t99', kind: 'reading', title: { en: 'Moving' }, level: 'B2',
  paragraphs: [
    [s('t99-s01', 'Tom verhuisde naar Gent.'), s('t99-s02', 'Hij kende er niemand.'), s('t99-s03', 'Dat vond hij moeilijk.')],
    [s('t99-s04', 'Leila woont in Leuven.'), s('t99-s05', 'Ze vond de taal moeilijk.'), s('t99-s06', 'Een cursus hielp haar.')],
    [s('t99-s07', 'Bram ging spontaan naar Brussel.'), s('t99-s08', 'Hij had geen plan.'), s('t99-s09', 'Een appartement vinden duurde lang.')],
  ],
  items: ['nl.stap'],
  questions: [
    { id: 't99-q1', type: 'summary', options: ['Drie mensen vertellen over hun verhuizing naar een andere stad.', 'Drie mensen leggen uit waarom ze nooit willen verhuizen.', 'Een man vertelt hoe hij een appartement in Brussel kocht.'], correct: 0 },
    { id: 't99-q2', type: 'match_texts', labels: ['Tom', 'Leila', 'Bram'], statements: [
      { id: 't99-q2-a', statement: 'Deze persoon had geen plan.', paragraph: 3 }, { id: 't99-q2-b', statement: 'Deze persoon volgde een cursus.', paragraph: 2 },
      { id: 't99-q2-c', statement: 'Deze persoon kende niemand.', paragraph: 1 }, { id: 't99-q2-d', statement: 'Voor deze persoon was de taal moeilijk.', paragraph: 2 }] },
  ],
  listeningQuestions: [{ id: 't99-l1', type: 'complete', statement: 'Tom verhuisde naar ___.', answers: ['Gent'] }],
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const problems = (mutate) => {
  const t = clone(TEXT);
  mutate(t);
  return textProblems(t, { native: 'en' }).join('\n');
};

describe('B2 question rules (a failing fixture each)', () => {
  it('a sound text with summary, matching and a listening completion passes', () => {
    expect(textProblems(TEXT, { native: 'en' })).toEqual([]);
  });
  it('summary: whole-text summaries of 6+ words, 3+ options', () => {
    expect(problems((t) => { t.questions[0].options[1] = 'Nee.'; })).toMatch(/summaries of the whole text/);
  });
  it('match_texts: a label per paragraph, 4–8 statements, existing paragraphs, every text used, no options', () => {
    expect(problems((t) => { t.questions[1].labels.pop(); })).toMatch(/one label per paragraph \(3\)/);
    expect(problems((t) => { t.questions[1].statements.length = 3; })).toMatch(/4–8 statements/);
    expect(problems((t) => { t.questions[1].statements[0].paragraph = 7; })).toMatch(/paragraph 7 does not exist/);
    expect(problems((t) => { t.questions[1].statements.forEach((x) => { x.paragraph = 2; }); })).toMatch(/every text should be the answer/);
    expect(problems((t) => { t.questions[1].options = ['a', 'b', 'c']; })).toMatch(/no options/);
  });
  it('complete: a listening question with exactly one ___ and answers of 1–3 words', () => {
    expect(problems((t) => { t.listeningQuestions[0].statement = 'Tom verhuisde.'; })).toMatch(/exactly one ___/);
    expect(problems((t) => { t.listeningQuestions[0].answers = ['naar de mooie stad Gent']; })).toMatch(/1–3 words/);
    expect(problems((t) => { t.questions.push({ ...t.listeningQuestions[0], id: 't99-q9' }); })).toMatch(/complete is a listening question/);
    expect(problems((t) => { t.listeningQuestions.push({ ...t.questions[1], id: 't99-l9' }); })).toMatch(/a listening question is mc, true_false_notgiven, complete/);
  });
});

describe('gapped text and transformation rules', () => {
  const ok = { gaps: ['t99-s03', 't99-s05', 't99-s08'], extra: [s('t99-x1', 'Daarom bleef hij thuis.')] };
  it('a sound gapped text passes; first sentence, neighbours, order, unknown ids and extras fail', () => {
    expect(gappedProblems(ok, TEXT, { native: 'en' })).toEqual([]);
    const p = (g) => gappedProblems({ ...ok, ...g }, TEXT, { native: 'en' }).join('\n');
    expect(p({ gaps: ['t99-s01', 't99-s05', 't99-s08'] })).toMatch(/the first sentence stays/);
    expect(p({ gaps: ['t99-s03', 't99-s04', 't99-s08'] })).toMatch(/next to each other/);
    expect(p({ gaps: ['t99-s05', 't99-s03', 't99-s08'] })).toMatch(/text order/);
    expect(p({ gaps: ['t99-s03', 't99-s05', 'nope'] })).toMatch(/nope is not a sentence/);
    expect(p({ gaps: ['t99-s03', 't99-s05'] })).toMatch(/needs 3–6 gaps/);
    expect(p({ extra: [] })).toMatch(/1–2 extra sentences/);
    expect(p({ extra: [{ id: 't99-s02', target: 'x', native: { en: 'x' } }] })).toMatch(/needs its own id/);
  });
  it('gappedParts: removed sentences become gaps in text order, the rest stays as written', () => {
    const parts = gappedParts(TEXT, ok.gaps);
    expect(parts.find((x) => x.id === 't99-s05').parts).toEqual([{ gap: 1 }]);
    expect(parts.find((x) => x.id === 't99-s04')).toEqual({ id: 't99-s04', paragraph: 1, parts: ['Leila woont in Leuven.'] });
  });
  it('transform: one ___, the key in every answer and not in the first sentence, 2–6 words', () => {
    const t = { from: 'Ik wilde die stap zetten.', key: 'willen', gapped: 'Ik had die stap ___.', answers: ['willen zetten'] };
    expect(transformProblems(t, 'x')).toEqual([]);
    expect(transformProblems({ ...t, gapped: 'Ik had die stap.' }, 'x').join()).toMatch(/exactly one ___/);
    expect(transformProblems({ ...t, from: 'Ik wilde willen.' }, 'x').join()).toMatch(/already in the first sentence/);
    expect(transformProblems({ ...t, answers: ['zetten'] }, 'x').join()).toMatch(/2–6 words[\s\S]*does not use the key word/);
    expect(transformProblems({ ...t, answers: ['willen zetten', 'Willen zetten'] }, 'x').join()).toMatch(/listed twice/);
  });
});

describe('B2 grading', () => {
  const nl = { track: 'nl' };
  it('gap_sentence: per gap by opaque token; correct only when every gap has its sentence', () => {
    const ex = { id: 'x-e01', type: 'gap_sentence', gaps: ['a', 'b', 'c'], extra: [{ id: 'z' }] };
    const tok = (id) => orderToken('x-e01', id);
    expect(grade(ex, ['a', 'b', 'c'].map(tok)).correct).toBe(true);
    const r = grade(ex, [tok('a'), tok('z'), tok('c')]);
    expect(r.correct).toBe(false);
    expect(r.gaps.map((g) => g.correct)).toEqual([true, false, true]);
    expect(r.gaps[1].answer).toBe(tok('b'));
    expect(grade(ex, ['a', 'b', 'c']).correct).toBe(false); // the sentence ids themselves are not what the client gets
  });
  it('word_form: typed per gap; a word of the stem in another form gets note "form" and stays wrong', () => {
    const ex = { type: 'word_form', gaps: [{ word: 'beslissing', kind: 'word_form', stem: 'BESLISSEN' }, { word: 'vertrouwde', kind: 'word_form', stem: 'VERTROUWEN' }] };
    expect(grade(ex, ['beslissing', 'vertrouwde'], nl).correct).toBe(true);
    const r = grade(ex, ['beslissen', 'bekend'], nl);
    expect(r.gaps).toEqual([{ correct: false, answer: 'beslissing', note: 'form' }, { correct: false, answer: 'vertrouwde' }]);
    expect(sameStem('creation', 'CREATE')).toBe(true);
    expect(sameStem('kreative', 'CREATE')).toBe(false);
    const fill = { type: 'fill_blank', kind: 'word_form', stem: 'AANPASSEN', answer: 'aanpassing', sentence: 'x ___' };
    expect(grade(fill, 'aanpassen', nl)).toMatchObject({ correct: false, note: 'form' });
    expect(grade(fill, 'aanpassing', nl)).toEqual({ correct: true });
  });
  it('open_cloze: no hints; acceptAlso lists the other words that fit', () => {
    const ex = { type: 'open_cloze', gaps: [{ word: 'zo', kind: 'open', acceptAlso: ['heel', 'erg'] }, { word: 'voor', kind: 'open' }, { word: 'iets', kind: 'open' }] };
    expect(grade(ex, ['erg', 'voor', 'iets'], nl).correct).toBe(true);
    expect(grade(ex, ['te', 'voor', 'iets'], nl).gaps[0]).toEqual({ correct: false, answer: 'zo' });
  });
  it('transform: any authored answer under the typed rules; a wrong one shows the first', () => {
    const ex = { type: 'transform', answers: ['zou zich ooit kunnen vestigen'] };
    expect(grade(ex, 'Zou zich ooit kunnen vestigen', nl)).toEqual({ correct: true });
    expect(grade(ex, 'kan zich vestigen', nl)).toEqual({ correct: false, correctAnswer: 'zou zich ooit kunnen vestigen' });
    expect(grade({ type: 'transform', answers: ["won't catch the bus unless"] }, 'will not catch the bus unless', { track: 'en' }).correct).toBe(true);
  });
  it('match_texts: a paragraph per statement, each row graded; summary as mc; complete with dictation tolerance', () => {
    const q = TEXT.questions[1];
    const r = grade({ type: 'reading', question: q }, [3, 2, 1, 1]);
    expect(r.correct).toBe(false);
    expect(r.statements.map((x) => x.correct)).toEqual([true, true, true, false]);
    expect(r.statements[3].answer).toBe('Leila');
    expect(grade({ type: 'reading', question: q }, ['3', '2', '1', '2']).correct).toBe(true);
    expect(grade({ type: 'reading', question: TEXT.questions[0] }, TEXT.questions[0].options[0]).correct).toBe(true);
    const c = { type: 'listening', question: { type: 'complete', statement: 'x ___', answers: ['Antwerpen'] } };
    expect(grade(c, 'antwerpen', nl)).toEqual({ correct: true });
    expect(grade(c, 'Antwerpn', nl)).toMatchObject({ correct: true, note: 'spelling' });
    expect(grade(c, 'Gent', nl)).toEqual({ correct: false, correctAnswer: 'Antwerpen' });
  });
  it('instruction keys by kind', () => {
    expect(instructionKey({ type: 'gap_sentence' })).toBe('exercise.gap_sentence');
    expect(instructionKey({ type: 'transform' })).toBe('exercise.transform');
    expect(instructionKey({ type: 'fill_blank', kind: 'word_form' })).toBe('exercise.fill_blank.wordForm');
    expect(instructionKey({ type: 'reading', question: { type: 'match_texts' } })).toBe('exercise.reading.match_texts');
    expect(instructionKey({ type: 'listening', question: { type: 'complete' } })).toBe('exercise.listening.complete');
  });
});

describe('the B2 pilot (nl-b2 unit 1, preview): generated kinds, public shapes, practice, lock keys', () => {
  const content = loadContent({ contentDir: path.join(ROOT, 'content') });
  const pack = content.packs.get('nl-b2').pack;
  const all = pack.units.flatMap((u) => u.lessons.flatMap((l) => l.exercises));
  const of = (type) => all.filter((e) => e.type === type);
  it('every new kind is generated: a gapped text first in its lesson, summary, matching, word formation, open cloze, transforms, completion', () => {
    const textLesson = pack.units[0].lessons.find((l) => l.exercises.some((e) => e.type === 'gap_sentence'));
    expect(textLesson.exercises[0].type).toBe('gap_sentence');
    for (const t of ['gap_sentence', 'word_form', 'open_cloze', 'transform']) expect(of(t).length, t).toBeGreaterThan(0);
    const qtypes = all.filter((e) => e.question).map((e) => e.question.type);
    for (const q of ['summary', 'match_texts', 'complete']) expect(qtypes, q).toContain(q);
    expect(of('fill_blank').some((e) => e.kind === 'word_form' && /^[A-Z]+$/.test(e.stem))).toBe(true);
    expect(pack.units[0].texts.every((t) => !('gapped' in t) && !('wordForm' in t) && !('openCloze' in t))).toBe(true);
  });
  it('public shapes carry no answers', () => {
    const pub = (ex) => publicExercise(content, 'nl-b2', ex, { nativeLang: 'en' });
    const gs = pub(of('gap_sentence')[0]);
    expect(gs.bank.length).toBe(of('gap_sentence')[0].gaps.length + of('gap_sentence')[0].extra.length);
    // which bank sentence fills which gap is not in the exercise: opaque tokens, and the gaps carry no text
    expect(gs.bank.every((x) => /^p[0-9a-z]+$/.test(x.id))).toBe(true);
    expect(gs.parts.filter((x) => typeof x.parts[0] !== 'string').every((x) => x.parts.length === 1 && Number.isInteger(x.parts[0].gap))).toBe(true);
    expect('gaps' in gs || 'extra' in gs).toBe(false);
    const tr = pub(of('transform')[0]);
    expect(tr).toMatchObject({ from: expect.any(String), key: 'WILLEN', before: 'Ik had die stap eerder ', after: '.' });
    expect(JSON.stringify(tr)).not.toContain('willen zetten');
    const mt = pub(all.find((e) => e.question?.type === 'match_texts'));
    expect(mt.question.statements.every((x) => !('paragraph' in x))).toBe(true);
    const cp = pub(all.find((e) => e.question?.type === 'complete'));
    expect(cp.question).toEqual({ id: expect.any(String), type: 'complete', statement: expect.stringContaining('___') });
    const wf = pub(of('word_form')[0]);
    expect(wf.gaps.every((g) => g.kind === 'word_form' && g.stem)).toBe(true);
    expect(JSON.stringify(wf.gaps)).not.toMatch(/"word"/);
  });
  it('practice: the typed kinds are "produce", a gapped text is a text exercise; lock keys name kind and gaps', () => {
    for (const t of ['open_cloze', 'word_form', 'transform']) {
      expect(PRACTICE_TYPES).toContain(t);
      expect(exerciseBand({ type: t })).toBe(2);
    }
    expect(PRACTICE_TYPES).not.toContain('gap_sentence');
    expect(TEXT_QUESTION_TYPES).toContain('gap_sentence');
    expect(textExerciseKey(of('word_form')[0])).toMatch(/^nl-b2-t01 word_form nl-b2-t01-s08:eenzaam/);
    expect(textExerciseKey(of('gap_sentence')[0])).toBe('nl-b2-t01 gaps nl-b2-t01-s06 nl-b2-t01-s12 nl-b2-t01-s16 nl-b2-t01-x1');
  });
  it('the generator is deterministic for the B2 kinds', async () => {
    const { readPackSources, generatorOptions } = await import('../../scripts/content/sources.js');
    const { meta, units } = readPackSources('nl-b2');
    const a = formatPack(generatePack({ track: 'nl', ...meta }, units, generatorOptions('nl-b2')));
    expect(formatPack(generatePack({ track: 'nl', ...meta }, units, generatorOptions('nl-b2')))).toBe(a);
    expect(a).toBe(fs.readFileSync(path.join(ROOT, 'content/packs/nl/b2.json'), 'utf8'));
  });
});

describe('optional branch packs', () => {
  const manifestWith = (extra) => {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/packs/manifest.json'), 'utf8'));
    m.tracks.find((t) => t.id === 'nl').packs.push(...extra);
    return m;
  };
  const validateWith = (extra) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-validate-'));
    try {
      fs.cpSync(path.join(ROOT, 'content/packs'), dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifestWith(extra)));
      return validateContent({ packsDir: dir }).errors.map((e) => e.message).join('\n');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  it('manifest rules: branch and after together, after an earlier core pack of the same level', () => {
    const row = (o) => ({ id: 'nl-b2-x', file: null, cefr: 'B2', title: { en: 'x', nl: 'x' }, status: 'roadmap', ...o });
    expect(validateWith([row({ branch: true, after: 'nl-b2' })])).toBe('');
    expect(validateWith([row({ branch: true })])).toMatch(/needs both branch: true and after/);
    expect(validateWith([row({ branch: true, after: 'nl-c1' })])).toMatch(/not an earlier pack of nl/);
    expect(validateWith([row({ branch: true, after: 'nl-b1' })])).toMatch(/the level of its core \(B1\)/);
    expect(validateWith([row({ branch: true, after: 'nl-b2' }), row({ id: 'nl-b2-y', branch: true, after: 'nl-b2-x' })])).toMatch(/is itself a branch/);
  });
  it('courses: a branch never counts for course progress nor is a start level; the path keeps it optional and never current', () => {
    const content = loadContent({ contentDir: path.join(ROOT, 'content') });
    const fake = { ...content, manifest: manifestWith([]) };
    const nl = fake.manifest.tracks.find((t) => t.id === 'nl');
    nl.packs = nl.packs.map((p) => (p.id === 'nl-b1' ? { ...p } : p));
    nl.packs.push({ id: 'nl-b1-x', file: 'nl/b1.json', cefr: 'B1', title: { en: 'x' }, status: 'available', branch: true, after: 'nl-b1' });
    const packs = new Map(content.packs);
    packs.set('nl-b1-x', content.packs.get('nl-b1'));
    const c = allCourses({ ...fake, packs }).find((x) => x.track === 'nl');
    expect(c.packIds).toContain('nl-b1-x');
    expect(c.corePackIds).not.toContain('nl-b1-x');
    const core = { id: 'core', units: [{ lessons: [{ id: 'c1' }, { id: 'c2' }] }] };
    const branch = { id: 'br', branch: true, after: 'core', units: [{ lessons: [{ id: 'b1' }, { id: 'b2' }] }] };
    const next = { id: 'next', units: [{ lessons: [{ id: 'n1' }] }] };
    const states = lessonStates([core, branch, next], { c1: {}, c2: {} }, null);
    expect([states.get('b1'), states.get('b2'), states.get('n1')]).toEqual(['optional', 'optional', 'current']);
    expect(currentPosition([core, branch, next], states)).toMatchObject({ packId: 'next' });
    expect(lessonStates([core, branch], { c1: {}, c2: {}, b2: {} }, null).get('b2')).toBe('done');
  });
  it('packPath carries branch and after', () => {
    const content = loadContent({ contentDir: path.join(ROOT, 'content') });
    expect(packPath(content, 'nl-b2', {}).branch).toBeUndefined();
    const p = content.packs.get('nl-b2');
    const withBranch = { ...content, packs: new Map([...content.packs, ['nl-b2', { ...p, entry: { ...p.entry, branch: true, after: 'nl-b1' } }]]) };
    expect(packPath(withBranch, 'nl-b2', {})).toMatchObject({ branch: true, after: 'nl-b1' });
  });
});

describe('questionProblems for listening questions', () => {
  it('a match_heading or matching question is never a listening question', () => {
    expect(questionProblems({ id: 'x', type: 'complete', statement: 'a ___', answers: ['b'] }, TEXT, 'x', 'en')).toEqual([]);
  });
});

describe('B2 courses of English and French', () => {
  const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, 'content/packs', rel), 'utf8'));
  for (const rel of ['en/b2.json', 'fr/b2.json']) {
    it(`${rel}: transformsFirst — every review opens with its key word transformations`, () => {
      const pack = read(rel);
      let units = 0;
      for (const u of pack.units) {
        const rv = u.lessons.find((l) => l.id.endsWith('-review'));
        const types = rv.exercises.map((e) => e.type);
        const n = types.filter((t) => t === 'transform').length;
        if (!n) continue;
        units++;
        expect(types.slice(0, n)).toEqual(Array(n).fill('transform'));
      }
      expect(units).toBe(20);
    });
  }
  it('nl-b2 (locked) keeps its transformations at the end of the review', () => {
    const rv = read('nl/b2.json').units[0].lessons.find((l) => l.id.endsWith('-review'));
    expect(rv.exercises.at(-1).type).toBe('transform');
  });
});
