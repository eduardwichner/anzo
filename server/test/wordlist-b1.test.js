// The B1 Preliminary vocabulary list parser (scripts/content/wordlist-en-b1.js): column text from word boxes, entries,
// headword forms, examples, topic cells, malformed lines; and the real list's counts when the reference PDF is on disk.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  b1HeadwordForms, bboxPages, buildB1Entries, columnText, parseB1List, parseTopicLists, splitB1Entries,
} from '../../scripts/content/wordlist-en-b1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COLUMNS = path.join(root, 'content/reference/extracted/english/b1/506887-b1-preliminary-vocabulary-list.columns.txt');

/** A column-text fixture: page 5 of the list, two columns. */
const page = (left, right = []) => ['== page 5 column 1 ==', ...left, '== page 5 column 2 ==', ...right].join('\n');

describe('B1 list: headword forms', () => {
  it('expands slashes, optional letters, particles and alternates; drops notes and placeholders', () => {
    expect(b1HeadwordForms('all right/alright')).toEqual(['all right', 'alright']);
    expect(b1HeadwordForms('yog(h)urt')).toEqual(['yogurt', 'yoghurt']);
    expect(b1HeadwordForms('wrap (up)')).toEqual(['wrap', 'wrap up']);
    expect(b1HeadwordForms('among (amongst)')).toEqual(['among', 'amongst']);
    expect(b1HeadwordForms('ad (advertisement)')).toEqual(['ad', 'advertisement']);
    expect(b1HeadwordForms('background (experience)')).toEqual(['background']); // a gloss
    expect(b1HeadwordForms('laboratory (lab)')).toEqual(['laboratory', 'lab']);
    expect(b1HeadwordForms('deal with (sth/sb)')).toEqual(['deal with']);
    expect(b1HeadwordForms('suprising')).toEqual(['surprising']); // the PDF's misprint
    expect(b1HeadwordForms('made of/from/out of')).toEqual(['made of', 'made from', 'made out of']);
    expect(b1HeadwordForms('focus (sth) on/upon sth/sb')).toEqual(['focus on', 'focus upon']);
    expect(b1HeadwordForms('doctor / Dr')).toEqual(['doctor', 'Dr']);
    expect(b1HeadwordForms('Arithmetic')).toEqual(['arithmetic']);
  });
});

describe('B1 list: lines', () => {
  it('splits a line into entries and keeps a headword cut before its part of speech', () => {
    expect(splitB1Entries('dinner (n) dinosaur')).toEqual({ entries: [{ head: 'dinner', pos: ['n'] }], rest: 'dinosaur' });
    expect(splitB1Entries('above (adj, adv & prep)').entries[0].pos).toEqual(['adj', 'adv', 'prep']);
    expect(splitB1Entries('carefully (ad)').entries[0].pos).toEqual(['adv']); // the PDF's typo
    expect(splitB1Entries('truck (Am Eng) (Br Eng: lorry)').entries).toEqual([{ head: 'truck', pos: ['n'], us: true }]);
    expect(splitB1Entries('autumn (n) (Br Eng) (Am Eng: fall)').entries).toEqual([{ head: 'autumn', pos: ['n'] }]);
  });

  it('parses entries, examples (bulleted, bare, wrapped) and side-by-side cells', () => {
    const { entries, unparsed } = parseB1List(page([
      'A', 'able (adj)', '    • be able to', 'care (n & v)', '    • to care (about/for) someone /', '         something (v)',
      'dinner (n) dinosaur', '(n) diploma (n)', 'get down (phr v)', 'Get down at once!', '    • Go away! goal (n)',
      'kilometre (km) (n) (Br Eng) (Am Eng:', 'kilometer)', '© CUPA 2025 Page 5 of 53',
    ]));
    expect(unparsed).toEqual([]);
    expect(entries.map((e) => e.head)).toEqual(['able', 'care', 'dinner', 'dinosaur', 'diploma', 'get down', 'goal', 'kilometre (km)']);
    expect(entries[0].examples).toEqual(['be able to']);
    expect(entries[1].examples).toEqual(['to care (about/for) someone / something (v)']);
    expect(entries.find((e) => e.head === 'get down').examples).toEqual(['Get down at once!', 'Go away!']);
    expect(entries.at(-1).forms).toEqual(['kilometre', 'km']);
  });

  it('reports malformed lines instead of guessing', () => {
    const { entries, unparsed } = parseB1List(page(['abroad (adv)', '12345 ???', 'Ten Green Bottles', 'absent (adj)']));
    expect(entries.map((e) => e.head)).toEqual(['abroad', 'absent']);
    expect(unparsed.map((u) => u.text)).toEqual(['12345 ???', 'Ten Green Bottles']);
  });
});

describe('B1 list: column text and topics', () => {
  it('rebuilds two columns from word boxes and splits topic pages at their headings', () => {
    const w = (x, y, text) => `<word xMin="${x}" yMin="${y}" xMax="${x + 30}" yMax="${y + 12}">${text}</word>`;
    const list = [w(68, 50, 'able'), w(100, 50, '(adj)'), w(330.6, 50, 'absent'), w(370, 50, '(adj)'),
      w(330.6, 62, 'abroad'), w(370, 62, '(adv)'), w(330.6, 74, 'accept'), w(370, 74, '(v)'), w(68, 62, 'about'), w(100, 62, '(adv)')];
    const topics = [w(40, 40, 'Colours'), w(40, 60, 'black'), w(150, 60, 'blue'), w(260, 60, 'brown'), w(40, 72, 'gold'), w(150, 72, 'green'),
      w(260, 72, 'grey'), w(40, 84, 'pink'), w(150, 84, 'red'), w(260, 84, 'white'), w(40, 96, 'Weather'), w(40, 108, 'fog'), w(150, 108, 'sunny'),
      w(260, 108, 'wind'), w(40, 120, 'cold'), w(150, 120, 'storm'), w(260, 120, 'icy')];
    const html = Array.from({ length: 42 }, (_, i) => `<page width="595" height="842">${i === 3 ? list.join('') : i === 41 ? topics.join('') : ''}</page>`).join('');
    const text = columnText(bboxPages(html));
    const { entries } = parseB1List(text);
    expect(entries.map((e) => e.head)).toEqual(['able', 'about', 'absent', 'abroad', 'accept']);
    const cells = parseTopicLists(text);
    expect(cells.filter((c) => c.topic === 'Colours').map((c) => c.text)).toEqual(['black', 'gold', 'pink', 'blue', 'green', 'red', 'brown', 'grey', 'white']);
    expect(cells.filter((c) => c.topic === 'Weather').map((c) => c.text)).toEqual(['fog', 'cold', 'sunny', 'storm', 'wind', 'icy']);
  });

  it('joins wrapped topic cells; a cell matching no headword is a topic word or a compound of list words', () => {
    const text = ['== page 42 topics ==', 'Food and Drink\tbarbecue (n &', 'Food and Drink\tv)', 'Food and Drink\tgo', 'Food and Drink\t(with/together)',
      'Food and Drink\t(shopping) mall', 'Food and Drink\tcellar', 'Food and Drink\tsoft drink', '== page 43 column 1 =='].join('\n');
    expect(parseTopicLists(text).map((c) => c.text)).toEqual(['barbecue (n & v)', 'go (with/together)', '(shopping) mall', 'cellar', 'soft drink']);
    const cols = `${page(['barbecue (n & v)', 'drink (n & v)'])}\n${text}`;
    const r = buildB1Entries(cols, (f) => ['soft', 'go', 'mall', 'shopping'].includes(f));
    expect(r.words.find((x) => x.word === 'barbecue').topics).toEqual(['Food and Drink']);
    expect(r.words.find((x) => x.word === 'cellar')).toMatchObject({ source: 'B1 topic list', topics: ['Food and Drink'] });
    expect(r.topicCompounds.map((c) => c.text)).toContain('soft drink');
  });
});

describe.skipIf(!fs.existsSync(COLUMNS))('B1 list: the real 2025 list (reference PDF on disk)', () => {
  it('parses every line: 3,120 entries, 0 unparsed, 23 topics', () => {
    const text = fs.readFileSync(COLUMNS, 'utf8');
    const { entries, unparsed } = parseB1List(text);
    expect(unparsed).toEqual([]);
    expect(entries).toHaveLength(3120);
    expect(new Set(parseTopicLists(text).map((c) => c.topic)).size).toBe(23);
    const heel = entries.find((e) => e.head === 'heel');
    expect(heel.examples).toEqual(["I can't walk in high heels."]);
  });
});

describe('English trace at B1', async () => {
  const { indexWordlist, traceSentence } = await import('../../scripts/content/trace-lib.js');
  const w = (word, level, pos = 'n') => ({ word, level, pos });
  const index = indexWordlist([
    w('the', 'S', 'det'), w('a', 'S', 'det'), w('my', 'S', 'det'), w('she', 'S', 'pron'), w('they', 'S', 'pron'), w('we', 'S', 'pron'),
    w('be', 'S', 'v'), w('and', 'S', 'conj'), w('with', 'S', 'prep'), w('visit', 'M', 'v'), w('year', 'S'),
    w('grandchild', 'B1'), w('split up', 'B1', 'phr v'), w('get on with', 'B1', 'phr v'), w('postpone', 'B1', 'v'), w('trip', 'B1'),
  ]);
  const bad = (text, level) => traceSentence(index, text, level).map((p) => p.word);
  it('irregular B1 plurals, inflected phrase heads, numbers without a ceiling at B1', () => {
    expect(bad('My grandchildren visit.', 'B1')).toEqual([]);
    expect(bad('They split up.', 'B1')).toEqual([]);
    expect(bad('She splits up with a dragon.', 'B1')).toEqual(['dragon']);
    expect(bad('We got on with the trip.', 'B1')).toEqual([]);
    expect(bad('They postponed the trip.', 'B1')).toEqual([]);
    expect(bad('They postponed the trip.', 'F')).toEqual(['postponed', 'trip']);
    expect(bad('We visit 2026 grandchildren.', 'B1')).toEqual([]);
  });
});
