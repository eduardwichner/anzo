// The Dutch trace (scripts/content/trace-nl-lib.js) on a small fixture word list, and content:trace -- nl failing on an
// off-level fixture unit.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { indexWordlistNl, traceSentenceNl, traceTokenNl, traceVocabNl } from '../../scripts/content/trace-nl-lib.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-trace-nl-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const e = (lemma, pos, level, extra = {}) => ({ key: lemma, lemma, pos, level, ...extra });
const LIST = {
  entries: [
    e('ik', 'pronoun', 'Start'), e('hij', 'pronoun', 'Start'), e('we', 'pronoun', 'Start'), e('de', 'determiner', 'Start'), e('het', 'determiner', 'Start'),
    e('een', 'determiner', 'Start'), e('in', 'preposition', 'Start'), e('om', 'preposition', 'A1'), e('te', 'adverb', 'Start'), e('niet', 'adverb', 'Start'),
    e('werken', 'verb', 'Start'), e('wonen', 'verb', 'Start'), e('gaan', 'verb', 'Start'), e('zijn', 'verb', 'Start'), e('hebben', 'verb', 'Start'),
    e('opstaan', 'verb', 'A1', { separable: 'op' }), e('uur', 'noun', 'Start', { article: 'het', plural: 'uren' }), e('acht', 'number', 'Start'),
    e('kat', 'noun', 'Start', { article: 'de', plural: 'katten' }), e('huis', 'noun', 'Start', { article: 'het', plural: 'huizen' }),
    e('auto', 'noun', 'A1', { article: 'de', plural: "auto's" }), e('kamer', 'noun', 'Start', { article: 'de', plural: 'kamers' }),
    e('bus', 'noun', 'Start', { article: 'de', plural: 'bussen' }), e('halte', 'noun', 'A1', { article: 'de', plural: 'haltes' }),
    e('groot', 'adjective', 'Start'), e('lekker', 'adjective', 'Start'), e('iets', 'pronoun', 'A1'), e('gisteren', 'adverb', 'A1'),
    e('gsm', 'noun', 'Start', { article: 'de', plural: "gsm's", alsoNL: 'mobiel' }), e('vervelen', 'verb', 'A2', { reflexive: true }),
    e("'s morgens", 'phrase', 'Start'), e('verhuizen', 'verb', 'A2'), e('drinken', 'verb', 'Start'), e('wassen', 'verb', 'Start'),
    // B1: the passive, the pluperfect, the conditional, relative clauses
    e('worden', 'verb', 'A2'), e('zullen', 'verb', 'A1'), e('repareren', 'verb', 'A2'), e('die', 'pronoun', 'A1'), e('dat', 'conjunction', 'A2'),
    e('met', 'preposition', 'Start'), e('over', 'preposition', 'A1'), e('praten', 'verb', 'A2'), e('stad', 'noun', 'Start', { article: 'de', plural: 'steden' }),
    e('collega', 'noun', 'A1', { article: 'de', plural: 'collega\'s' }), e('graag', 'adverb', 'Start'), e('al', 'adverb', 'A1'), e('vergadering', 'noun', 'B1', { article: 'de', plural: 'vergaderingen' }),
  ],
  names: ['Lotte', 'Gent'],
  regional: [{ word: 'ov-chipkaart', ref: 'nn les 51' }, { word: 'pinnen', ref: 'nn les 53' }],
};
const index = indexWordlistNl(LIST);
const bad = (text, level) => traceSentenceNl(index, text, level).map((p) => p.word);

describe('Dutch trace: B1 grammar (passive, pluperfect, conditional, relative clauses)', () => {
  it('the passive with worden (present and past) and the pluperfect use A2 forms: fine at B1', () => {
    expect(bad('De auto wordt gerepareerd.', 'B1')).toEqual([]);
    expect(bad('De auto werd gisteren gerepareerd.', 'B1')).toEqual([]);
    expect(bad('Hij had al gewerkt.', 'B1')).toEqual([]);
    expect(bad('We waren al verhuisd.', 'B1')).toEqual([]);
    expect(bad('Hij zou graag in Gent wonen.', 'B1')).toEqual([]);
    expect(bad('De auto wordt gerepareerd.', 'A1')).toEqual(['wordt', 'gerepareerd']); // worden is A2 here, participles A2 grammar
  });

  it('relative clauses: die / dat, and waar + preposition only from B1; er / daar + preposition from A2', () => {
    expect(bad('De collega die in Gent woont.', 'B1')).toEqual([]);
    expect(bad('De stad waarin ik woon.', 'B1')).toEqual([]);
    expect(bad('De collega waarmee ik werk.', 'B1')).toEqual([]);
    expect(bad('De stad waarin ik woon.', 'A2')).toEqual(['waarin']);
    expect(bad('We praten erover.', 'A2')).toEqual([]);
    expect(bad('Hij werkt ermee.', 'A2')).toEqual([]);
    expect(bad('Hij werkt ermet.', 'B1')).toEqual(['ermet']); // met → mee
    expect(traceTokenNl(index, 'waarover', 'B1').how).toBe('waar + over (pronominal adverb)');
  });

  it('a split separable verb takes the nearest particle (neem … mee … aan de: meenemen, not aannemen)', () => {
    const list = { entries: [e('ik', 'pronoun', 'Start'), e('je', 'pronoun', 'Start'), e('de', 'determiner', 'Start'), e('aan', 'preposition', 'Start'),
      e('grens', 'noun', 'A2', { article: 'de', plural: 'grenzen' }), e('paspoort', 'noun', 'A2', { article: 'het', plural: 'paspoorten' }),
      e('aannemen', 'verb', 'A2', { separable: 'aan' }), e('meenemen', 'verb', 'B1', { separable: 'mee' })], names: [], regional: [] };
    const ix = indexWordlistNl(list);
    expect(traceSentenceNl(ix, 'Neem je paspoort mee aan de grens.', 'B1')).toEqual([]);
  });

  it('a B1 lemma is allowed at B1 only', () => {
    expect(bad('De vergadering.', 'B1')).toEqual([]);
    expect(bad('De vergadering.', 'A2')).toEqual(['vergadering']);
  });
});

describe('Dutch trace: sentence words', () => {
  it('conjugation: stem, stem + t, -en; irregular present', () => {
    expect(bad('Ik werk in Gent.', 'Start')).toEqual([]);
    expect(bad('Hij werkt niet.', 'Start')).toEqual([]);
    expect(bad('We werken.', 'Start')).toEqual([]);
    expect(bad('Hij is in het huis.', 'Start')).toEqual([]);
    expect(bad('Hij heeft een kat.', 'Start')).toEqual([]);
  });

  it("past tense ('t kofschip, irregulars) and participles only from A2", () => {
    expect(bad('Hij werkte in Gent.', 'A1')).toEqual(['werkte']);
    expect(bad('Hij werkte in Gent.', 'A2')).toEqual([]);
    expect(bad('Ik ging naar huis.', 'A2')).toContain('naar'); // naar is not on this fixture list; ging is fine
    expect(bad('Ik ging.', 'A2')).toEqual([]);
    expect(bad('Hij heeft gewerkt.', 'A1')).toEqual(['gewerkt']);
    expect(bad('Hij heeft gewerkt.', 'A2')).toEqual([]);
    expect(bad('We zijn verhuisd.', 'A2')).toEqual([]);
    expect(bad('Hij heeft gedronken.', 'A2')).toEqual([]);
  });

  it("plurals (-en, -s, 's), diminutives from A1, adjective -e, partitive", () => {
    expect(bad('De katten, de kamers.', 'Start')).toEqual([]);
    expect(bad("De auto's.", 'A1')).toEqual([]);
    expect(bad('Het katje.', 'Start')).toEqual(['katje']);
    expect(bad('Het katje.', 'A1')).toEqual([]);
    expect(bad('Het grote huis.', 'Start')).toEqual([]);
    expect(bad('iets lekkers', 'A1')).toEqual([]);
  });

  it('split separable verbs: the particle belongs to the lemma (A1); joined and te-forms too', () => {
    expect(bad('Ik sta om acht uur op.', 'A1')).toEqual([]);
    expect(bad('Ik sta om acht uur op.', 'Start')).toEqual(['sta', 'om', 'op']);
    expect(bad('Ik sta.', 'A1')).toEqual(['sta']);
  });

  it('compounds of two list words pass and are reported for review', () => {
    const review = [];
    expect(traceSentenceNl(index, 'De bushalte.', 'A1', review)).toEqual([]);
    expect(review).toEqual(['compound "bushalte" = bus + halte']);
  });

  it('a compound part is never a pronoun, determiner or conjunction (me + geven, dank + zij: B1 level review)', () => {
    expect(bad('De huiskat.', 'Start')).toEqual([]);
    expect(bad('De wekat.', 'Start')).toEqual(['wekat']); // we + kat
    expect(bad('De katwe.', 'Start')).toEqual(['katwe']); // kat + we
    expect(bad('De diekat.', 'A1')).toEqual(['diekat']); // die + kat
  });

  it('a homograph of a form above the level (was: ik was, or the past of zijn) passes and is reported for review', () => {
    const review = [];
    expect(traceSentenceNl(index, 'Ik was.', 'Start', review)).toEqual([]);
    expect(review).toEqual(['"was" = present of wassen, or past of zijn (A2): check the meaning']);
    const none = [];
    traceSentenceNl(index, 'Ik was.', 'A2', none);
    expect(none).toEqual([]);
  });

  it('names, numbers, multi-word expressions; regional: nl words never', () => {
    expect(bad("Lotte drinkt 's morgens.", 'Start')).toEqual([]);
    expect(bad('Ik werk 8 uur.', 'Start')).toEqual([]);
    expect(bad('Ik werk 25 uur.', 'Start')).toEqual(['25']);
    expect(bad('Ik werk 25 uur.', 'A1')).toEqual([]);
    expect(traceTokenNl(index, 'pinnen', 'A2')).toMatchObject({ ok: false, how: expect.stringMatching(/regional: nl/) });
    expect(bad('De ov-chipkaart.', 'A2')).toEqual(['ov-chipkaart']);
  });

  it('a word above the level fails (off-level), and one not on the list', () => {
    expect(bad('Gisteren werk ik.', 'Start')).toEqual(['Gisteren']);
    expect(bad('Ik werk vandaag.', 'A2')).toEqual(['vandaag']);
  });
});

describe('Dutch trace: vocabulary', () => {
  it('nouns carry the list article; separable verbs joined; reflexive verbs with zich; plural and alsoNL as listed', () => {
    expect(traceVocabNl(index, 'de kat', 'Start')).toMatchObject({ ok: true, key: 'kat' });
    expect(traceVocabNl(index, 'het kat', 'Start')).toMatchObject({ ok: false, reason: 'the word list has de kat, not het kat' });
    expect(traceVocabNl(index, 'kat', 'Start')).toMatchObject({ ok: false, reason: 'a noun needs its article: de kat' });
    expect(traceVocabNl(index, 'opstaan', 'A1')).toMatchObject({ ok: true });
    expect(traceVocabNl(index, 'opstaan', 'Start')).toMatchObject({ ok: false });
    expect(traceVocabNl(index, 'zich vervelen', 'A2')).toMatchObject({ ok: true });
    expect(traceVocabNl(index, 'de gsm', 'Start', { plural: "gsm's" })).toMatchObject({ ok: false, reason: expect.stringMatching(/alsoNL/) });
    expect(traceVocabNl(index, 'de gsm', 'Start', { plural: "gsm's", alsoNL: 'de mobiel' })).toMatchObject({ ok: true });
    expect(traceVocabNl(index, 'de kat', 'Start', { plural: 'kats' })).toMatchObject({ ok: false, reason: expect.stringMatching(/plural/) });
  });
});

describe('content:trace -- nl on fixture sources', () => {
  it('an off-level word in a Start unit fails the trace (exit 1, the word named)', () => {
    const src = path.join(tmp, 'src');
    fs.mkdirSync(path.join(src, 'nl/pre-a1'), { recursive: true });
    fs.writeFileSync(path.join(src, 'nl/pre-a1/pack.yaml'), 'id: nl-pre-a1\ncefr: Pre-A1\nnative: en\nsource: test fixture for the Dutch trace\n');
    fs.writeFileSync(path.join(src, 'nl/pre-a1/01-test.yaml'), [
      'id: nl-pre-a1-u01', 'title: { en: Test }', 'icon: home', 'vocabulary:',
      '  - { target: de kat, native: { en: cat }, pos: noun, plural: katten }',
      'sentences:',
      '  - { id: s01, target: "Gisteren werkte de kat.", native: { en: "Yesterday the cat worked." }, items: [nl.kat] }', '',
    ].join('\n'));
    const list = path.join(tmp, 'list.json');
    fs.writeFileSync(list, JSON.stringify(LIST));
    let out = '';
    let code = 0;
    try {
      out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/content/trace.js'), 'nl', '--src', src, '--wordlist', list], { encoding: 'utf8', stdio: 'pipe' });
    } catch (err) {
      code = err.status;
      out = `${err.stdout}${err.stderr}`;
    }
    expect(code).toBe(1);
    expect(out).toMatch(/"Gisteren" — gisteren is A1, above Start/);
    expect(out).toMatch(/"werkte" — past form of werken is not Start grammar/);
  });
});
