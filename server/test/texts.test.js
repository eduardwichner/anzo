// Text rules, grading of the text types, the generator for text units and finite-verb
// fill-ins, the trace of texts, dialogue clips and the sequential player.
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { clozeParts, clozeProblems, containsWord, glossaryLimit, textProblems } from '../src/content/texts.js';
import { grade, gradeCloze, gradeOrder, gradeTextQuestion, orderToken } from '../src/content/grading.js';
import { instructionKey } from '../src/content/instructions.js';
import { generatePack } from '../../scripts/content/generator.js';
import { formatPack } from '../../scripts/format-packs.js';
import { traceTexts } from '../../scripts/content/trace-texts.js';
import { clipsForPacks } from '../src/audio/clips.js';

const sentence = (id, target, en = 'x') => ({ id, target, native: { en } });
const READING = {
  id: 'nl-b1-t99', kind: 'reading', title: { en: 'The garden' }, level: 'B1',
  paragraphs: [
    [sentence('t99-s01', 'Vorige maand maakten we een tuin.'), sentence('t99-s02', 'De grond was hard.')],
    [sentence('t99-s03', 'Toen hielp een buurman ons.')],
    [sentence('t99-s04', 'Nu werkt iedereen in de tuin.')],
  ],
  glossary: [{ word: 'buurman', native: { en: 'neighbour' } }],
  items: ['nl.tuin'],
  questions: [
    { id: 't99-q1', type: 'mc', question: 'Wat maakten ze?', options: ['Een tuin.', 'Een huis.', 'Een taart.'], correct: 0 },
    { id: 't99-q2', type: 'true_false_notgiven', statement: 'De grond was zacht.', answer: false },
    { id: 't99-q3', type: 'match_heading', paragraph: 2, options: ['Hulp', 'Het begin', 'Nu'], correct: 0 },
  ],
  orderable: true,
};
const DIALOGUE = {
  id: 'nl-b1-t98', kind: 'dialogue', title: { en: 'A call' }, level: 'B1',
  speakers: { A: { name: 'Karim' }, B: { name: 'Sofie' } },
  turns: [
    { id: 't98-s01', speaker: 'A', target: 'Dag Sofie, heb je even tijd?', native: { en: 'Hi' } },
    { id: 't98-s02', speaker: 'B', target: 'Ja, natuurlijk.', native: { en: 'Yes' } },
    { id: 't98-s03', speaker: 'A', target: 'Er komt water door het plafond.', native: { en: 'Water' } },
  ],
  items: ['nl.plafond'],
  questions: [{ id: 't98-q1', type: 'true_false_notgiven', statement: 'Sofie heeft geen tijd.', answer: false }],
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const problems = (mutate, base = READING) => {
  const t = clone(base);
  mutate(t);
  return textProblems(t, { native: 'en' }).join('\n');
};

describe('text rules (each with a failing fixture)', () => {
  it('a sound reading text and a sound dialogue pass', () => {
    expect(textProblems(READING, { native: 'en' })).toEqual([]);
    expect(textProblems(DIALOGUE, { native: 'en' })).toEqual([]);
  });
  it('kind, title, paragraphs / turns', () => {
    expect(problems((t) => { t.kind = 'poem'; })).toMatch(/kind must be reading or dialogue/);
    expect(problems((t) => { t.title = { nl: 'x' }; })).toMatch(/title needs \{ en/);
    expect(problems((t) => { delete t.paragraphs; })).toMatch(/needs paragraphs/);
    expect(problems((t) => { t.turns = []; }, DIALOGUE)).toMatch(/at least two turns/);
  });
  it('every sentence or turn has its meaning, and a unique id', () => {
    expect(problems((t) => { delete t.paragraphs[0][1].native; })).toMatch(/t99-s02: needs its meaning \{ en/);
    expect(problems((t) => { t.paragraphs[1][0].id = 't99-s01'; })).toMatch(/sentence id t99-s01 is used twice/);
  });
  it('dialogue speakers: defined, alternating, both speaking', () => {
    expect(problems((t) => { delete t.speakers.B; }, DIALOGUE)).toMatch(/speaker B is not defined/);
    expect(problems((t) => { t.turns[1].speaker = 'A'; }, DIALOGUE)).toMatch(/speaker A speaks twice in a row/);
    expect(problems((t) => { t.turns = t.turns.map((x) => ({ ...x, speaker: 'A' })); }, DIALOGUE)).toMatch(/both speakers must speak/);
  });
  it('questions: options, one right answer, not_given only for true/false/not given, existing paragraphs', () => {
    expect(problems((t) => { t.questions[0].options = ['a', 'b']; })).toMatch(/at least 3 options/);
    expect(problems((t) => { t.questions[0].options = ['a', 'a', 'b']; })).toMatch(/options must be unique/);
    expect(problems((t) => { t.questions[0].correct = 3; })).toMatch(/correct must be the index of one option/);
    expect(problems((t) => { t.questions[0].answer = 'not_given'; })).toMatch(/only for true_false_notgiven/);
    expect(problems((t) => { t.questions[1].answer = 'maybe'; })).toMatch(/answer must be true, false or not_given/);
    expect(problems((t) => { t.questions[1].options = ['a', 'b', 'c']; })).toMatch(/true_false_notgiven has no options/);
    expect(problems((t) => { t.questions[2].paragraph = 7; })).toMatch(/paragraph 7 does not exist/);
    expect(problems((t) => { t.questions = [{ id: 'q', type: 'match_heading', paragraph: 1, options: ['a', 'b', 'c'], correct: 0 }]; }, DIALOGUE)).toMatch(/match_heading is for reading texts/);
    expect(problems((t) => { t.questions[1].id = 't99-q1'; })).toMatch(/question id t99-q1 is used twice/);
  });
  it('glossary: words of the text, with a meaning, at most ~5 % of its tokens', () => {
    expect(problems((t) => { t.glossary = [{ word: 'olifant', native: { en: 'elephant' } }]; })).toMatch(/glossary word "olifant" does not occur/);
    expect(problems((t) => { t.glossary[0].native = { nl: 'x' }; })).toMatch(/glossary buurman: needs a meaning/);
    expect(glossaryLimit(READING)).toBe(2); // 22 tokens → 5 % → 2
    expect(problems((t) => { t.glossary.push({ word: 'grond', native: { en: 'ground' } }, { word: 'hard', native: { en: 'hard' } }); })).toMatch(/glossary has 3 words; at most 2/);
  });
  it('items and questions are required; orderable needs three parts', () => {
    expect(problems((t) => { t.items = []; })).toMatch(/needs items/);
    expect(problems((t) => { t.questions = []; })).toMatch(/needs questions/);
    expect(problems((t) => { t.paragraphs = [t.paragraphs[0].slice(0, 1)]; t.questions = t.questions.slice(0, 2); })).toMatch(/orderable needs at least 3/);
  });
  it('cloze gaps: 3–6, in their sentence, not twice', () => {
    const gaps = [{ sentence: 't99-s01', word: 'maakten' }, { sentence: 't99-s02', word: 'grond' }, { sentence: 't99-s04', word: 'werkt' }];
    expect(clozeProblems(gaps, READING)).toEqual([]);
    expect(clozeProblems(gaps.slice(0, 2), READING).join()).toMatch(/needs 3–6 gaps/);
    expect(clozeProblems([...gaps.slice(0, 2), { sentence: 't99-s03', word: 'tuin' }], READING).join()).toMatch(/"tuin" does not occur in t99-s03/);
    expect(clozeProblems([...gaps.slice(0, 2), { sentence: 'nope', word: 'x' }], READING).join()).toMatch(/not a sentence of the text/);
    expect(clozeProblems([...gaps, gaps[0]], READING).join()).toMatch(/twice/);
  });
  it('a finite-verb gap that is its hint\'s infinitive tests nothing and is rejected (we geven, hint "geven (present)")', () => {
    const gaps = [{ sentence: 't99-s01', word: 'maakten', kind: 'finite_verb', hint: { en: 'maken (past)' } }, { sentence: 't99-s02', word: 'grond' }, { sentence: 't99-s04', word: 'werkt', kind: 'finite_verb', hint: { en: 'werken (present)' } }];
    expect(clozeProblems(gaps, READING)).toEqual([]);
    const same = [...gaps.slice(0, 2), { sentence: 't99-s04', word: 'werkt', kind: 'finite_verb', hint: { en: 'werkt (present)' } }];
    expect(clozeProblems(same, READING).join()).toMatch(/"werkt" in t99-s04 is the infinitive of its hint/);
  });
  it('whole words only, and the text cut at its gaps', () => {
    expect(containsWord('De grond was hard.', 'grond')).toBe(true);
    expect(containsWord('De ondergrond was hard.', 'grond')).toBe(false);
    const parts = clozeParts(READING, [{ sentence: 't99-s01', word: 'maakten' }, { sentence: 't99-s04', word: 'werkt' }]);
    expect(parts[0].parts).toEqual(['Vorige maand ', { gap: 0 }, ' we een tuin.']);
    expect(parts[3]).toMatchObject({ paragraph: 2, parts: ['Nu ', { gap: 1 }, ' iedereen in de tuin.'] });
  });
});

describe('grading the text types', () => {
  const q = (question) => ({ type: 'reading', question });
  it('multiple choice and headings by option text; true / false / not given by code', () => {
    expect(gradeTextQuestion(q(READING.questions[0]), 'Een tuin.')).toEqual({ correct: true, correctAnswer: 'Een tuin.' });
    expect(gradeTextQuestion(q(READING.questions[0]), 'Een huis.')).toMatchObject({ correct: false });
    expect(gradeTextQuestion(q(READING.questions[1]), 'false')).toEqual({ correct: true, correctAnswer: 'false' });
    expect(gradeTextQuestion(q(READING.questions[1]), 'not_given')).toMatchObject({ correct: false, correctAnswer: 'false' });
    expect(gradeTextQuestion(q({ ...READING.questions[1], answer: 'not_given' }), 'not_given').correct).toBe(true);
    expect(gradeTextQuestion(q(READING.questions[2]), 'Hulp').correct).toBe(true);
    expect(grade({ type: 'listening', question: READING.questions[1] }, 'false').correct).toBe(true);
    expect(grade({ type: 'dialogue', question: DIALOGUE.questions[0] }, 'true').correct).toBe(false);
  });
  it('order: exactly the right sequence', () => {
    const ex = { id: 'x-e01', type: 'order_paragraphs', segments: ['a', 'b', 'c'] };
    const tok = ['a', 'b', 'c'].map((id) => orderToken('x-e01', id));
    expect(gradeOrder(ex, tok)).toEqual({ correct: true, correctOrder: tok });
    expect(gradeOrder(ex, ['a', 'b', 'c']).correct).toBe(false); // segment ids are not what the client gets
    expect(gradeOrder(ex, ['b', 'a', 'c']).correct).toBe(false);
    expect(gradeOrder(ex, ['a', 'b']).correct).toBe(false);
    expect(gradeOrder(ex, null).correct).toBe(false);
  });
  it('cloze: per gap (typed rules, accents note), all right = correct; a bank compares case-insensitively', () => {
    const ex = { type: 'cloze', gaps: [{ word: 'maakten', kind: 'finite_verb' }, { word: 'één' }, { word: 'werkt' }] };
    const r = gradeCloze(ex, ['maakten', 'een', 'werkte'], { track: 'nl' });
    expect(r.correct).toBe(false);
    expect(r.gaps).toEqual([{ correct: true, answer: 'maakten' }, { correct: true, answer: 'één', note: 'accents' }, { correct: false, answer: 'werkt' }]);
    expect(gradeCloze(ex, ['Maakten ', 'één', 'werkt'], { track: 'nl' }).correct).toBe(true);
    expect(gradeCloze({ ...ex, options: ['maakten', 'één', 'werkt', 'tuin'] }, ['MAAKTEN', 'één', 'tuin']).gaps.map((g) => g.correct)).toEqual([true, true, false]);
    expect(gradeCloze(ex, 'nonsense').correct).toBe(false);
  });
  it('instructions by type and question kind; a finite-verb fill-in has its own', () => {
    expect(instructionKey({ type: 'reading', question: { type: 'true_false_notgiven' } })).toBe('exercise.reading.true_false_notgiven');
    expect(instructionKey({ type: 'listening', question: { type: 'mc' } })).toBe('exercise.listening.mc');
    expect(instructionKey({ type: 'cloze', options: ['a'] })).toBe('exercise.cloze.choose');
    expect(instructionKey({ type: 'cloze' })).toBe('exercise.cloze.type');
    expect(instructionKey({ type: 'fill_blank', kind: 'finite_verb' })).toBe('exercise.fill_blank.finiteVerb');
    expect(instructionKey({ type: 'order_paragraphs' })).toBe('exercise.order_paragraphs');
  });
});

describe('generator: text units and finite-verb fill-ins', () => {
  const vocab = [
    { id: 'nl.tuin', target: 'de tuin', native: { en: 'garden' }, pos: 'noun', plural: 'tuinen' },
    { id: 'nl.plafond', target: 'het plafond', native: { en: 'ceiling' }, pos: 'noun', plural: 'plafonds' },
    { id: 'nl.grond', target: 'de grond', native: { en: 'ground' }, pos: 'noun', plural: 'gronden' },
  ];
  const textUnit = () => [{
    id: 'nl-b1-u99', title: { en: 'Home' }, icon: 'house', file: 'u99.yaml', vocabulary: clone(vocab),
    texts: [
      { ...clone(READING), cloze: [{ sentence: 't99-s01', word: 'maakten', kind: 'finite_verb', hint: { en: 'maken (past)' } }, { sentence: 't99-s02', word: 'grond', hint: { en: 'ground' } }, { sentence: 't99-s04', word: 'werkt', kind: 'finite_verb', hint: { en: 'werken (present)' } }] },
      { ...clone(DIALOGUE), orderable: true, cloze: [{ sentence: 't98-s01', word: 'tijd', hint: { en: 'time' } }, { sentence: 't98-s02', word: 'natuurlijk', hint: { en: 'of course' } }, { sentence: 't98-s03', word: 'plafond', hint: { en: 'ceiling' } }] },
    ],
  }];
  const META = { id: 'nl-b1', track: 'nl', cefr: 'B1', native: 'en', source: 'Test: a text unit for the generator tests.' };

  it('one lesson per text: its questions, a cloze, ordering when orderable; a review lesson that listens to the texts', () => {
    const pack = generatePack(META, textUnit());
    const [l1, l2, review] = pack.units[0].lessons;
    expect(l1.exercises.map((e) => e.type)).toEqual(['reading', 'reading', 'reading', 'cloze', 'order_paragraphs']);
    expect(l1.exercises.map((e) => e.id)).toEqual(['nl-b1-u99-l01-e01', 'nl-b1-u99-l01-e02', 'nl-b1-u99-l01-e03', 'nl-b1-u99-l01-e04', 'nl-b1-u99-l01-e05']);
    expect(l1.exercises[4]).toMatchObject({ unit: 'paragraph', segments: ['t99-s01', 't99-s03', 't99-s04'] });
    expect(l2.exercises.map((e) => e.type)).toEqual(['dialogue', 'cloze', 'order_paragraphs']);
    expect(l2.exercises[2]).toMatchObject({ unit: 'turn', segments: ['t98-s01', 't98-s02', 't98-s03'] });
    // the review listens to every text; a heading question needs the text, so listening leaves it out
    expect(review.exercises.map((e) => [e.type, e.textId, e.question.id])).toEqual([
      ['listening', 'nl-b1-t99', 't99-q1'], ['listening', 'nl-b1-t99', 't99-q2'], ['listening', 'nl-b1-t98', 't98-q1']]);
    expect(pack.units[0].texts.map((t) => t.id)).toEqual(['nl-b1-t99', 'nl-b1-t98']);
    expect(pack.units[0].texts[0].cloze).toBeUndefined();
    // the cloze practises the text's items (none of its gap words is one of them here)
    expect(l1.exercises[3]).toMatchObject({ type: 'cloze', textId: 'nl-b1-t99', items: ['nl.tuin'] });
  });
  it('a cloze is typed at B1 and has a word bank below it (the gap words + two unit words)', () => {
    expect(generatePack(META, textUnit()).units[0].lessons[0].exercises[3].options).toBeUndefined();
    const a2 = generatePack({ ...META, cefr: 'A2' }, textUnit()).units[0].lessons[0].exercises[3];
    expect(a2.options).toEqual(expect.arrayContaining(['maakten', 'grond', 'werkt']));
    expect(a2.options).toHaveLength(5);
  });
  it('is deterministic: the same sources give a byte-identical pack', () => {
    expect(formatPack(generatePack(META, textUnit()))).toBe(formatPack(generatePack(META, textUnit())));
  });
  it('a missing cloze is chosen from the text\'s own course words, or the author is asked for one', () => {
    const u = textUnit();
    delete u[0].texts[0].cloze;
    expect(() => generatePack(META, u)).toThrow(/needs a cloze/);
  });
  it('finiteVerbFill: an annotated sentence gets a typed finite-verb fill-in in the review lesson; off by default', () => {
    const regular = () => [{
      id: 'nl-a2-u99', title: { en: 'Work' }, icon: 'work', file: 'u99.yaml',
      vocabulary: [
        { id: 'nl.werken', target: 'werken', native: { en: 'to work' }, pos: 'verb' }, { id: 'nl.kantoor', target: 'het kantoor', native: { en: 'office' }, pos: 'noun', plural: 'kantoren' },
        { id: 'nl.baas', target: 'de baas', native: { en: 'boss' }, pos: 'noun', plural: 'bazen' }, { id: 'nl.collega', target: 'de collega', native: { en: 'colleague' }, pos: 'noun', plural: "collega's" },
        { id: 'nl.vergadering', target: 'de vergadering', native: { en: 'meeting' }, pos: 'noun', plural: 'vergaderingen' }, { id: 'nl.pauze', target: 'de pauze', native: { en: 'break' }, pos: 'noun', plural: 'pauzes' },
      ],
      sentences: [
        { id: 'nl-a2-u99-s01', target: 'Ik werkte gisteren op kantoor.', native: { en: 'I worked at the office yesterday.' }, items: ['nl.werken', 'nl.kantoor'], finite: { word: 'werkte', hint: { en: 'werken (past)' } } },
        { id: 'nl-a2-u99-s02', target: 'De baas is op kantoor.', native: { en: 'The boss is at the office.' }, items: ['nl.baas', 'nl.kantoor'] },
        { id: 'nl-a2-u99-s03', target: 'Mijn collega heeft pauze.', native: { en: 'My colleague is on a break.' }, items: ['nl.collega', 'nl.pauze'] },
        { id: 'nl-a2-u99-s04', target: 'De vergadering is lang.', native: { en: 'The meeting is long.' }, items: ['nl.vergadering'] },
      ],
    }];
    const meta = { id: 'nl-a2', track: 'nl', cefr: 'A2', native: 'en', source: 'Test: a regular unit for the finite-verb fill-in.' };
    const off = generatePack(meta, regular());
    const on = generatePack({ ...meta, finiteVerbFill: true }, regular());
    const rev = (p) => p.units[0].lessons.find((l) => l.id.endsWith('-review')).exercises;
    expect(rev(off).some((e) => e.kind === 'finite_verb')).toBe(false);
    const fv = rev(on).find((e) => e.kind === 'finite_verb');
    expect(fv).toMatchObject({ type: 'fill_blank', sentence: 'Ik ___ gisteren op kantoor.', answer: 'werkte', hint: { en: 'werken (past)' }, sentenceId: 'nl-a2-u99-s01' });
    expect(fv.options).toBeUndefined(); // typed
    expect(rev(on).slice(0, rev(off).length)).toEqual(rev(off)); // appended: no other exercise moves
  });
});

describe('trace of texts', () => {
  it('a word off the list passes only through the glossary or the unit\'s own words (also inflected)', () => {
    const unit = { file: 'u.yaml', vocabulary: [{ target: 'de vrijwilliger' }], texts: [{ ...clone(READING), paragraphs: [[sentence('s1', 'De buurman en twee vrijwilligers hielpen.')]], questions: [{ id: 'q', type: 'mc', question: 'Wie hielp?', options: ['De olifant.', 'b c', 'd e'], correct: 0 }] }] };
    const offList = new Set(['buurman', 'vrijwilligers', 'olifant']);
    const fakeTrace = (text) => text.split(/[^\p{L}]+/u).filter((w) => offList.has(w.toLowerCase())).map((word) => ({ word, reason: 'not in the list' }));
    const reported = [];
    traceTexts(unit, fakeTrace, (m) => reported.push(m));
    expect(reported).toHaveLength(1);
    expect(reported[0]).toMatch(/"olifant" — not in the list/);
  });
});

describe('audio for texts', () => {
  const voices = {
    nl: { voice: 'nl_BE-rdh-medium', speaker: null, lengthScale: 1.1, slowLengthScale: 1.6, dialogue: { voice: 'nl_BE-nathalie-medium', speaker: null, lengthScale: 1.1, slowLengthScale: 1.6 } },
  };
  const pack = { track: 'nl', units: [{ vocabulary: [], sentences: [], texts: [clone(DIALOGUE), clone(READING)], lessons: [] }] };
  it('one clip per sentence or turn (normal + slow); speaker B in the dialogue voice', () => {
    const clips = clipsForPacks([pack], voices);
    const of = (text) => clips.filter((c) => c.text === text).map((c) => `${c.speed}:${c.voice}`).sort();
    expect(of('Ja, natuurlijk.')).toEqual(['dialogue-normal:nl_BE-nathalie-medium', 'dialogue-slow:nl_BE-nathalie-medium']);
    expect(of('Dag Sofie, heb je even tijd?')).toEqual(['normal:nl_BE-rdh-medium', 'slow:nl_BE-rdh-medium']);
    expect(of('De grond was hard.')).toEqual(['normal:nl_BE-rdh-medium', 'slow:nl_BE-rdh-medium']);
    expect(() => clipsForPacks([pack], { nl: { ...voices.nl, dialogue: undefined } })).toThrow(/no dialogue voice/);
  });
});

describe('the sequential player (two voices)', () => {
  let player;
  let el;
  beforeAll(async () => {
    const listeners = {};
    el = {
      played: [], attrs: {}, readyState: 0, paused: true, currentTime: 0,
      set src(v) { this.attrs.src = v; this._src = new URL(v, 'http://anzo.test/').href; this.readyState = 0; },
      get src() { return this._src ?? ''; },
      get currentSrc() { return this._src ?? ''; },
      getAttribute(k) { return this.attrs[k] ?? null; },
      addEventListener(k, fn) { (listeners[k] ??= []).push(fn); },
      fire(k) { (listeners[k] || []).forEach((fn) => fn()); },
      pause() { this.paused = true; },
      play() { this.paused = false; this.readyState = 4; this.played.push(this.attrs.src); return Promise.resolve(); },
    };
    globalThis.location = { href: 'http://anzo.test/' };
    globalThis.window = {};
    globalThis.document = { createElement: () => el, body: { appendChild() {} } };
    player = await import('../../client/src/audio/player.js?seq');
  });
  afterAll(() => {
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.location;
  });
  const tick = (ms) => new Promise((r) => setTimeout(r, ms));

  it('plays the clips in order with the pauses between them, the current index in the state; another clip ends it', async () => {
    const items = [{ url: '/audio/nl/aaaaaaaaaaaaaaaa.mp3', pauseMs: 5 }, { url: '/audio/nl/bbbbbbbbbbbbbbbb.mp3', pauseMs: 5 }, { url: '/audio/nl/cccccccccccccccc.mp3', pauseMs: 5 }];
    await player.playSequence('nl-b1-t98', items);
    expect(player.getState().sequence).toEqual({ key: 'nl-b1-t98', index: 0, total: 3, paused: false });
    el.fire('ended');
    await tick(20);
    expect(player.getState().sequence).toEqual({ key: 'nl-b1-t98', index: 1, total: 3, paused: false });
    expect(el.played).toEqual(['/audio/nl/aaaaaaaaaaaaaaaa.mp3', '/audio/nl/bbbbbbbbbbbbbbbb.mp3']); // A, then B's voice
    await player.play('/audio/nl/dddddddddddddddd.mp3'); // a tap elsewhere
    expect(player.getState().sequence).toBeNull();
    el.fire('ended');
    await tick(20);
    expect(el.played.at(-1)).toBe('/audio/nl/dddddddddddddddd.mp3');
  });
  it('the last clip ends the sequence; stop() ends it at once', async () => {
    await player.playSequence('t', [{ url: '/audio/nl/aaaaaaaaaaaaaaaa.mp3', pauseMs: 1 }]);
    el.fire('ended');
    await tick(10);
    expect(player.getState().sequence).toBeNull();
    await player.playSequence('t', [{ url: '/audio/nl/aaaaaaaaaaaaaaaa.mp3', pauseMs: 1 }, { url: '/audio/nl/bbbbbbbbbbbbbbbb.mp3', pauseMs: 1 }]);
    player.stop();
    expect(player.getState().sequence).toBeNull();
    expect(await player.playSequence('t', [{ url: null }])).toBe(false);
  });
});

describe('a typed cloze gives every gap a hint', () => {
  it('the generator refuses a typed gap without a hint; a word bank does not need one', () => {
    const u = [{ id: 'nl-b1-u98', title: { en: 'X' }, icon: 'house', file: 'u98.yaml', vocabulary: [{ id: 'nl.tuin', target: 'de tuin', native: { en: 'garden' }, pos: 'noun', plural: 'tuinen' }],
      texts: [{ ...JSON.parse(JSON.stringify(READING)), cloze: [{ sentence: 't99-s01', word: 'maakten', hint: { en: 'maken (past)' } }, { sentence: 't99-s02', word: 'grond' }, { sentence: 't99-s04', word: 'werkt', hint: { en: 'werken' } }] }] }];
    expect(() => generatePack({ id: 'nl-b1', track: 'nl', cefr: 'B1', native: 'en', source: 'Test: hints for typed gaps.' }, u)).toThrow(/cloze gap "grond" needs a hint/);
    expect(() => generatePack({ id: 'nl-a2', track: 'nl', cefr: 'A2', native: 'en', source: 'Test: a word bank needs no hint.' }, u)).not.toThrow();
  });
});

describe('one word-edge rule for the cloze validator and the gaps', () => {
  const text = { id: 'x', kind: 'reading', title: { nl: 'x' }, paragraphs: [[
    { id: 's1', target: "'Hello,' she said to her parents' friend.", native: { nl: 'x' } },
    { id: 's2', target: "C'est l'école, well-made.", native: { nl: 'x' } }]] };
  it('a word next to a quote or a plural possessive is placed; an elided or compound part is not a gap at all', () => {
    const parts = clozeParts(text, [{ sentence: 's1', word: 'Hello' }, { sentence: 's1', word: 'parents' }, { sentence: 's1', word: 'friend' }]);
    expect(parts[0].parts.filter((p) => typeof p !== 'string')).toEqual([{ gap: 0 }, { gap: 1 }, { gap: 2 }]);
    expect(clozeProblems([{ sentence: 's1', word: 'Hello' }, { sentence: 's1', word: 'parents' }, { sentence: 's1', word: 'friend' }], text)).toEqual([]);
    expect(clozeProblems([{ sentence: 's2', word: 'école' }, { sentence: 's2', word: 'made' }, { sentence: 's1', word: 'she' }], text).join('\n'))
      .toMatch(/"école" does not occur in s2[\s\S]*"made" does not occur in s2/);
  });
});
