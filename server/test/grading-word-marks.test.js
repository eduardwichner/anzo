// What the result strip shows after a dictation — the sentence's words marked (wordMarks) and the line that
// capitals and full stops never count (leftOutCapsOrStop) — and Dutch compounds typed as two course words (joinCompounds).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dictationFeedback, grade, joinCompounds, leftOutCapsOrStop, wordMarks } from '../src/content/grading.js';
import { loadContent, knownWordsOf } from '../src/content/loader.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const content = loadContent({ contentDir: path.join(ROOT, 'content') });
const known = (track) => knownWordsOf(content, track);
// what the answer route sends: the grade plus the result strip's feedback (dictationFeedback)
const dictation = (answer, track, typed) => {
  const ex = { type: 'listen_type', id: 'x', answer };
  const opts = { track, knownWords: known(track) };
  const r = grade(ex, typed, opts);
  return { ...r, ...dictationFeedback(ex, typed, r, opts) };
};
const marks = (r) => r.words.marks.map((m) => `${m.t}:${m.s}`);

describe('D1: the words of a dictation, marked', () => {
  it("Alex's dictation (diagnostics A4): the wrong word marked, the accent noted, the rest right", () => {
    const r = dictation('Mon frère a dix ans.', 'fr', 'mon frere a dix ons');
    expect(r.correct).toBe(false);
    expect(marks(r)).toEqual(['Mon:ok', 'frère:accents', 'a:ok', 'dix:ok', 'ans.:wrong']);
    expect(r.words.extra).toEqual([]);
  });
  it('a missing word is shown, an extra one listed; a mark standing alone stays with its word', () => {
    const r = dictation('Quel est ton nom ?', 'fr', 'quel ton nom');
    expect(marks(r)).toEqual(['Quel:ok', 'est:missing', 'ton:ok', 'nom ?:ok']);
    const x = dictation('I have a dog.', 'en', 'I have got a dog');
    expect(x.words.extra).toEqual(['got']);
    expect(marks(x).every((m) => m.endsWith(':ok'))).toBe(true);
  });
  it('almost right (a slip of one letter) is marked as spelling; a plainly right answer has no marks', () => {
    const r = dictation('The horse is big.', 'en', 'The hors is big');
    expect(r).toMatchObject({ correct: true, note: 'spelling' });
    expect(marks(r)).toEqual(['The:ok', 'horse:spelling', 'is:ok', 'big.:ok']);
    expect(dictation('The horse is big.', 'en', 'The horse is big.').words).toBeUndefined();
  });
  it('English variants count as right words in the marks', () => {
    expect(marks({ words: wordMarks('My favorite colour is blue', 'My favourite colour is red.', { track: 'en' }) }))
      .toEqual(['My:ok', 'favourite:ok', 'colour:ok', 'is:ok', 'red.:wrong']);
  });
});

describe('D1: capitals and full stops never count — and the strip says so when they were left out', () => {
  it('leftOutCapsOrStop', () => {
    expect(leftOutCapsOrStop('mon frere a dix ans', 'Mon frère a dix ans.')).toBe(true);
    expect(leftOutCapsOrStop('Mon frère a dix ans', 'Mon frère a dix ans.')).toBe(true); // no full stop
    expect(leftOutCapsOrStop('mon frère a dix ans.', 'Mon frère a dix ans.')).toBe(true); // no capital
    expect(leftOutCapsOrStop('Mon frère a dix ans.', 'Mon frère a dix ans.')).toBe(false);
    expect(leftOutCapsOrStop('ik ben moe', 'ik ben moe')).toBe(false);
  });
  it('a right answer without them is still plainly right, with the line', () => {
    expect(dictation('Mon frère a dix ans.', 'fr', 'mon frère a dix ans')).toEqual({ correct: true, capsNote: true });
    expect(dictation('Mon frère a dix ans.', 'fr', 'Mon frère a dix ans.')).toEqual({ correct: true });
  });
});

describe('D2: a Dutch compound typed as two course words', () => {
  it('a Dutch compound typed as two course words is right with the spelling note', () => {
    const r = dictation('Ik ben net thuisgekomen.', 'nl', 'ik ben net thuis gekomen');
    expect(r).toMatchObject({ correct: true, note: 'spelling' });
    expect(marks(r)).toEqual(['Ik:ok', 'ben:ok', 'net:ok', 'thuisgekomen.:spelling']);
  });
  it('both parts must be words of the course; never in English or French', () => {
    const k = new Set(['thuis', 'gekomen']);
    expect([...joinCompounds(['ik', 'thuis', 'gekomen'], ['ik', 'thuisgekomen'], k)]).toEqual(['ik', 'thuisgekomen']);
    expect(joinCompounds(['ik', 'thuis', 'gkomen'], ['ik', 'thuisgekomen'], k)).toBeNull(); // not a course word
    expect(joinCompounds(['ik', 'thuisgekomen'], ['ik', 'thuisgekomen'], k)).toBeNull(); // nothing to join
    expect(dictation('I have a football.', 'en', 'I have a foot ball').correct).toBe(false);
  });
  it('typed fill-ins too', () => {
    const typed = (answer, given) => grade({ type: 'fill_blank', id: 'x', sentence: 'Ik ben net ___.', answer }, given, { track: 'nl', knownWords: known('nl') });
    expect(typed('thuisgekomen', 'thuis gekomen')).toMatchObject({ correct: true, note: 'spelling' });
    expect(typed('thuisgekomen', 'thuis')).toMatchObject({ correct: false });
  });
});
