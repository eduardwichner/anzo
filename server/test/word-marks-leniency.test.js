// The word marks under a dictation follow the grade — a word the grader accepted through a
// leniency (a written-out contraction, digits for number words, a hyphen as a space or left out, a US or British spelling,
// another accepted spelling of the sentence) is never marked wrong.
import { describe, expect, it } from 'vitest';
import { dictationFeedback, grade, wordMarks } from '../src/content/grading.js';

const dictation = (answer, track, typed, acceptAlso) => {
  const ex = { type: 'listen_type', id: 'x', answer, ...(acceptAlso ? { acceptAlso } : {}) };
  const r = grade(ex, typed, { track });
  return { ...r, ...dictationFeedback(ex, typed, r, { track }) };
};
const marks = (w) => w.marks.map((m) => `${m.t}:${m.s}`);
const of = (typed, sentence, track) => wordMarks(typed, sentence, { track });

describe('C8: the marks use the grade\'s equivalences', () => {
  it('a contraction written out, or written in, is right (and the grade agrees)', () => {
    expect(marks(of('I do not like it mum', "I don't like it, mum.", 'en'))).toEqual(["I:ok", "don't:ok", 'like:ok', 'it,:ok', 'mum.:ok']);
    expect(marks(of("I don't like it", 'I do not like it.', 'en'))).toEqual(['I:ok', 'do:ok', 'not:ok', 'like:ok', 'it.:ok']);
    expect(marks(of('I cannot swim', "I can't swim.", 'en'))).toEqual(['I:ok', "can't:ok", 'swim.:ok']);
    const r = dictation("I've got two brothers and a sister.", 'en', 'I have got two brothers and a sistr');
    expect(r).toMatchObject({ correct: true, note: 'spelling' });
    expect(marks(r.words)).toEqual(["I've:ok", 'got:ok', 'two:ok', 'brothers:ok', 'and:ok', 'a:ok', 'sister.:spelling']);
    expect(r.words.extra).toEqual([]);
  });
  it('digits for number words, and number words for digits, in English, French and Dutch', () => {
    const en = dictation('There are a hundred people.', 'en', 'There are 100 peple');
    expect(en).toMatchObject({ correct: true, note: 'spelling' });
    expect(marks(en.words)).toEqual(['There:ok', 'are:ok', 'a:ok', 'hundred:ok', 'people.:spelling']);
    expect(marks(of('She is 21 todey', 'She is twenty-one today.', 'en'))).toEqual(['She:ok', 'is:ok', 'twenty-one:ok', 'today.:spelling']);
    expect(marks(of("J'ai 21 an", "J'ai vingt et un ans.", 'fr'))).toEqual(["J'ai:ok", 'vingt:ok', 'et:ok', 'un:ok', 'ans.:wrong']);
    expect(marks(of("J'ai vingt et un an", "J'ai 21 ans.", 'fr'))).toEqual(["J'ai:ok", '21:ok', 'ans.:wrong']);
    expect(marks(of('Ik ben 21 jaar ou', 'Ik ben eenentwintig jaar oud.', 'nl'))).toEqual(['Ik:ok', 'ben:ok', 'eenentwintig:ok', 'jaar:ok', 'oud.:wrong']);
    // where the grade refuses a number, the mark does too: "1" is not the article "een"
    expect(marks(of('Ik heb 1 kat', 'Ik heb een kat.', 'nl'))).toEqual(['Ik:ok', 'heb:ok', 'een:wrong', 'kat.:ok']);
    expect(dictation('Ik heb een kat.', 'nl', 'Ik heb 1 kat').correct).toBe(false);
  });
  it('a hyphen typed as a space or left out, and a space typed as a hyphen', () => {
    expect(marks(of('I have a stomach ache', 'I have a stomach-ache.', 'en'))).toEqual(['I:ok', 'have:ok', 'a:ok', 'stomach-ache.:ok']);
    expect(marks(of('I have a stomachache', 'I have a stomach-ache.', 'en'))).toEqual(['I:ok', 'have:ok', 'a:ok', 'stomach-ache.:ok']);
    expect(marks(of('It is well-made', 'It is well made.', 'en'))).toEqual(['It:ok', 'is:ok', 'well:ok', 'made.:ok']);
    const fr = dictation('Bon week-end, maman !', 'fr', 'Bon week end mamn');
    expect(fr).toMatchObject({ correct: true, note: 'spelling' });
    expect(marks(fr.words)).toEqual(['Bon:ok', 'week-end,:ok', 'maman !:spelling']);
  });
  it('US and British spellings, and the other past form, are plainly right', () => {
    const r = dictation('My favourite colour is blue.', 'en', 'My favorite color is blu');
    expect(r.correct).toBe(false);
    expect(marks(r.words)).toEqual(['My:ok', 'favourite:ok', 'colour:ok', 'is:ok', 'blue.:wrong']);
    expect(marks(of('I learned to swim', 'I learnt to sing.', 'en'))).toEqual(['I:ok', 'learnt:ok', 'to:ok', 'sing.:wrong']);
  });
  it('another accepted spelling of the sentence (acceptAlso): marked against the one the answer is closest to', () => {
    const r = dictation("There's a fly on my sandwich!", 'en', 'There is a fly on my sandwch', ['There is a fly on my sandwich!']);
    expect(r).toMatchObject({ correct: true, note: 'spelling' });
    expect(marks(r.words)).toEqual(['There:ok', 'is:ok', 'a:ok', 'fly:ok', 'on:ok', 'my:ok', 'sandwich!:spelling']);
    // without it the marks stay on the sentence as written
    expect(marks(dictation("There's a fly on my sandwich!", 'en', "There's a fly on my sandwch").words)[5]).toBe('sandwich!:spelling');
  });
  it('wrong, missing and extra words are still found next to a leniency', () => {
    const w = of('I do not like the green it', "I don't like it.", 'en');
    expect(marks(w)).toEqual(['I:ok', "don't:ok", 'like:ok', 'it.:ok']);
    expect(w.extra).toEqual(['the', 'green']);
    expect(marks(of('I like it', "I don't like it.", 'en'))).toEqual(['I:ok', "don't:missing", 'like:ok', 'it.:ok']);
  });
  it('a long crafted answer stays fast (the answer limit is 400 characters)', () => {
    const typed = Array.from({ length: 60 }, (_, i) => `x${(i * 7919) % 1000}-y${i}`).join(' ').slice(0, 400);
    const sentence = Array.from({ length: 40 }, (_, i) => `x${i}-y${i}`).join(' ');
    const t0 = Date.now();
    expect(of(typed, sentence, 'fr').marks).toHaveLength(40);
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});
