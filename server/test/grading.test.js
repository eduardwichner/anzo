import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  dutchDigits, dutchNumber, frenchDigits, frenchNumber, hyphenVariants,
  editDistance, grade, gradeListenType, gradeTyped, normalize, stripDiacritics, UnsupportedExerciseError,
} from '../src/content/grading.js';
import { knownWordsOf, loadContent } from '../src/content/loader.js';

const mc = {
  type: 'multiple_choice', id: 'x-e1', items: ['en.cat'], prompt: { nl: 'Wat betekent dit?' }, question: 'cat',
  options: [{ text: 'kat', correct: true }, { text: 'hond' }, { text: 'vis' }, { text: 'vogel' }],
};
const pairs = {
  type: 'match_pairs', id: 'x-e2', items: ['en.cat'], prompt: { nl: 'Zoek de paren' },
  pairs: [{ left: 'cat', right: 'kat' }, { left: 'dog', right: 'hond' }, { left: 'fish', right: 'vis' }, { left: 'bird', right: 'vogel' }],
};
const build = {
  type: 'build_sentence', id: 'x-e3', items: ['en.cat'], prompt: { nl: 'Vertaal: De kat is zwart.' },
  answer: 'The cat is black.', tokens: ['The', 'cat', 'is', 'black.'], distractors: ['dog', 'white'],
};
const fillBank = {
  type: 'fill_blank', id: 'x-e4', items: ['en.cat'], prompt: { nl: 'Vul in' }, sentence: 'The ___ is black.',
  answer: 'cat', options: ['cat', 'dog', 'fish'],
};
const fillTypedFr = {
  type: 'fill_blank', id: 'x-e5', items: ['fr.grand-mere'], prompt: { nl: 'Typ het woord' },
  sentence: 'Ma ___ s\'appelle Rose.', answer: 'grand-mère',
};

describe('normalize', () => {
  it.each([
    ['  The   cat ', 'the cat'],
    ['The cat is black.', 'the cat is black'],
    ['Really?!', 'really'],
    ['Salut !', 'salut'],
    ['Je m’appelle Rose', "je m'appelle rose"],
    ['CAT', 'cat'],
    ['cat\t\n', 'cat'],
    ['', ''],
    [null, ''],
  ])('%j -> %j', (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it('keeps inner punctuation', () => {
    expect(normalize('Bonjour, je m\'appelle Paul.')).toBe("bonjour, je m'appelle paul");
  });
});

describe('stripDiacritics', () => {
  it('removes accents and expands ligatures', () => {
    expect(stripDiacritics('grand-mère')).toBe('grand-mere');
    expect(stripDiacritics('français ça')).toBe('francais ca');
    expect(stripDiacritics('sœur')).toBe('soeur');
    expect(stripDiacritics('élève à côté')).toBe('eleve a cote');
  });
});

describe('gradeTyped', () => {
  it('accepts exact and normalized matches', () => {
    expect(gradeTyped('dog', 'dog')).toEqual({ correct: true });
    expect(gradeTyped(' Dog. ', 'dog')).toEqual({ correct: true });
  });

  it('rejects wrong and empty answers with the correct answer', () => {
    expect(gradeTyped('cat', 'dog')).toEqual({ correct: false, correctAnswer: 'dog' });
    expect(gradeTyped('   ', 'dog')).toEqual({ correct: false, correctAnswer: 'dog' });
  });

  it('French: accent-only difference is correct with an accents note', () => {
    expect(gradeTyped('grand-mere', 'grand-mère', { track: 'fr' })).toEqual({
      correct: true, note: 'accents', correctAnswer: 'grand-mère',
    });
    expect(gradeTyped('frere', 'frère', { track: 'fr' })).toMatchObject({ correct: true, note: 'accents' });
  });

  it('French: correct accents give no note', () => {
    expect(gradeTyped('grand-mère', 'grand-mère', { track: 'fr' })).toEqual({ correct: true });
  });

  it('French: other spelling mistakes are still wrong', () => {
    expect(gradeTyped('grand-mare', 'grand-mère', { track: 'fr' })).toEqual({ correct: false, correctAnswer: 'grand-mère' });
  });

  it('accent leniency applies only to French', () => {
    expect(gradeTyped('cafe', 'café', { track: 'en' })).toEqual({ correct: false, correctAnswer: 'café' });
  });
});

describe('grade: multiple_choice', () => {
  it('correct option', () => expect(grade(mc, 'kat')).toEqual({ correct: true }));
  it('case/space-insensitive', () => expect(grade(mc, ' Kat ')).toEqual({ correct: true }));
  it('wrong option returns the right one', () => expect(grade(mc, 'hond')).toEqual({ correct: false, correctAnswer: 'kat' }));
  it('non-string answer is wrong', () => expect(grade(mc, 1).correct).toBe(false));
});

describe('grade: match_pairs', () => {
  it('no mistakes is correct', () => expect(grade(pairs, { mistakes: 0 })).toEqual({ correct: true }));
  it('any mistake is wrong', () => expect(grade(pairs, { mistakes: 2 })).toEqual({ correct: false }));
  it('malformed answer is wrong', () => {
    expect(grade(pairs, {}).correct).toBe(false);
    expect(grade(pairs, null).correct).toBe(false);
    expect(grade(pairs, { mistakes: '0' }).correct).toBe(false);
  });
});

describe('grade: build_sentence', () => {
  it('exact token sequence is correct', () => {
    expect(grade(build, ['The', 'cat', 'is', 'black.'])).toEqual({ correct: true });
  });
  it('wrong order is wrong', () => {
    expect(grade(build, ['cat', 'The', 'is', 'black.'])).toEqual({ correct: false, correctAnswer: 'The cat is black.' });
  });
  it('a distractor or a missing token is wrong', () => {
    expect(grade(build, ['The', 'dog', 'is', 'black.']).correct).toBe(false);
    expect(grade(build, ['The', 'cat', 'is']).correct).toBe(false);
    expect(grade(build, ['The', 'cat', 'is', 'black.', 'dog']).correct).toBe(false);
  });
  it('tiles are compared as words (tiles without capital and full stop; older tiles still grade)', () => {
    expect(grade(build, ['the', 'cat', 'is', 'black']).correct).toBe(true);
    expect(grade(build, ['the', 'cat', 'is', 'white']).correct).toBe(false); // not one of the tiles
    expect(grade(build, ['the', 'cat', 'black', 'is']).correct).toBe(false);
  });
  it('non-array answer is wrong', () => expect(grade(build, 'The cat is black.').correct).toBe(false));
});

describe('grade: fill_blank', () => {
  it('word bank: correct and wrong', () => {
    expect(grade(fillBank, 'cat')).toEqual({ correct: true });
    expect(grade(fillBank, 'dog')).toEqual({ correct: false, correctAnswer: 'cat' });
  });
  it('typed French: accent note', () => {
    expect(grade(fillTypedFr, 'Grand-mere', { track: 'fr' })).toEqual({ correct: true, note: 'accents', correctAnswer: 'grand-mère' });
    expect(grade(fillTypedFr, 'grand-mère', { track: 'fr' })).toEqual({ correct: true });
    expect(grade(fillTypedFr, 'maman', { track: 'fr' })).toEqual({ correct: false, correctAnswer: 'grand-mère' });
  });
  it('non-string answer is wrong', () => expect(grade(fillBank, ['cat']).correct).toBe(false));
});

describe('grade: listen_choose', () => {
  const lc = { type: 'listen_choose', options: [{ text: 'cat', correct: true }, { text: 'dog' }, { text: 'fish' }] };
  it('correct option', () => expect(grade(lc, 'cat')).toEqual({ correct: true }));
  it('wrong option returns the right one', () => expect(grade(lc, 'dog')).toEqual({ correct: false, correctAnswer: 'cat' }));
});

describe('editDistance (Damerau-Levenshtein)', () => {
  it.each([
    ['black', 'black', 0], ['blak', 'black', 1], ['balck', 'black', 1], ['blacks', 'black', 1],
    ['bleck', 'black', 1], ['blk', 'black', 2], ['cap', 'cat', 1], ['', 'cat', 3], ['sœur', 'sœur', 0],
  ])('%s -> %s = %i', (a, b, d) => expect(editDistance(a, b)).toBe(d));
});

describe('gradeListenType', () => {
  const en = { type: 'listen_type', answer: 'The cat is black.' };
  const fr = { type: 'listen_type', answer: "J'ai deux frères." };
  const ok = { correct: true };
  const spelling = (answer) => ({ correct: true, note: 'spelling', correctAnswer: answer });
  const wrong = (answer) => ({ correct: false, correctAnswer: answer });

  it.each([
    ['exact', 'The cat is black.', ok],
    ['no full stop', 'The cat is black', ok],
    ['case and spaces', '  the  CAT is black ', ok],
    ['other terminal punctuation', 'The cat is black!', ok],
    ['missing letter in a 5-letter word', 'The cat is blak.', spelling('The cat is black.')],
    ['swapped letters in a 5-letter word', 'The cat is balck', spelling('The cat is black.')],
    ['extra letter in a 5-letter word', 'The cat is blacck', spelling('The cat is black.')],
    ['wrong letter in a 5-letter word', 'The cat is bleck', spelling('The cat is black.')],
    ['two errors in a 5-letter word', 'The cat is blk', wrong('The cat is black.')],
    ['one error in a 3-letter word (cat/cap)', 'The cap is black.', wrong('The cat is black.')],
    ['swap in a 3-letter word', 'The cta is black.', wrong('The cat is black.')],
    ['missing word', 'The cat black.', wrong('The cat is black.')],
    ['extra word', 'The cat is very black.', wrong('The cat is black.')],
    ['wrong order', 'The black is cat.', wrong('The cat is black.')],
    ['empty', '   ', wrong('The cat is black.')],
  ])('EN %s', (name, given, expected) => {
    expect(gradeListenType(en, given, { track: 'en' })).toEqual(expected);
  });

  it.each([
    ['exact', "J'ai deux frères.", { correct: true }],
    ['curly apostrophe', 'J’ai deux frères', { correct: true }],
    ['accents only', "j'ai deux freres", { correct: true, note: 'accents', correctAnswer: "J'ai deux frères." }],
    ['spelling in a long word', "J'ai deux frère", { correct: true, note: 'spelling', correctAnswer: "J'ai deux frères." }],
    ['accent + spelling -> spelling wins', "J'ai deux frere", { correct: true, note: 'spelling', correctAnswer: "J'ai deux frères." }],
    ['short word must be exact (deux/deus)', "J'ai deus frères.", { correct: false, correctAnswer: "J'ai deux frères." }],
  ])('FR %s', (name, given, expected) => {
    expect(gradeListenType(fr, given, { track: 'fr' })).toEqual(expected);
  });

  it('short French words may still differ only in accents (frère/frere)', () => {
    expect(gradeListenType({ answer: "J'ai un frère." }, "J'ai un frere", { track: 'fr' }))
      .toEqual({ correct: true, note: 'accents', correctAnswer: "J'ai un frère." });
  });

  it('non-string answers are wrong', () => {
    expect(gradeListenType(en, ['The'], { track: 'en' }).correct).toBe(false);
    expect(grade(en, 'The cat is black', { track: 'en' })).toEqual({ correct: true });
  });
});

describe('grade: reserved types', () => {
  it('throws UnsupportedExerciseError', () => {
    expect(() => grade({ type: 'speak' }, 'x')).toThrow(UnsupportedExerciseError);
  });
});

describe('acceptAlso', () => {
  it('build_sentence accepts another listed order of the same tokens, and nothing else', () => {
    const ex = { type: 'build_sentence', tokens: ['Today', 'I', 'see', 'a', 'cow.'], answer: 'Today I see a cow.', acceptAlso: ['I see a cow today.'] };
    expect(grade(ex, ['Today', 'I', 'see', 'a', 'cow.'])).toEqual({ correct: true });
    // tokens carry their punctuation; an alternative is a whole-sentence string split on spaces
    expect(grade({ ...ex, tokens: ['I', 'see', 'a', 'cow', 'today.'], answer: 'I see a cow today.', acceptAlso: ['Today I see a cow.'] },
      ['today.', 'I', 'see', 'a', 'cow'])).toEqual({ correct: true });
    expect(grade(ex, ['I', 'see', 'Today', 'a', 'cow.'])).toEqual({ correct: false, correctAnswer: 'Today I see a cow.' });
  });

  it('build_sentence: a fronted alternative uses the target tiles with their capital and full stop (Dutch V2)', () => {
    const ex = { type: 'build_sentence', tokens: ['De', 'les', 'begint', 'om', 'negen', 'uur.'], answer: 'De les begint om negen uur.', acceptAlso: ['Om negen uur begint de les.'] };
    expect(grade(ex, ['om', 'negen', 'uur.', 'begint', 'De', 'les'])).toEqual({ correct: true });
    expect(grade(ex, ['De', 'les', 'begint', 'om', 'negen', 'uur.'])).toEqual({ correct: true });
    expect(grade(ex, ['om', 'negen', 'uur.', 'De', 'les', 'begint'])).toEqual({ correct: false, correctAnswer: 'De les begint om negen uur.' });
  });

  it('English listen_type: a contraction may be typed out, and the other way round (not \'s or \'d)', () => {
    const ex = { type: 'listen_type', answer: "I don't think we'll be late, but I can't promise." };
    expect(grade(ex, 'I do not think we will be late, but I cannot promise.', { track: 'en' })).toEqual({ correct: true });
    expect(grade(ex, 'I do not think we will be late, but I can not promise', { track: 'en' })).toEqual({ correct: true });
    expect(grade({ type: 'listen_type', answer: "They have finished and I am tired." }, "They've finished and I'm tired", { track: 'en' })).toEqual({ correct: true });
    expect(grade({ type: 'listen_type', answer: "It's late." }, 'It is late', { track: 'en' }).correct).toBe(false); // 's: is or has
    expect(grade({ type: 'listen_type', answer: "Je n'ai pas faim." }, 'Je ne ai pas faim', { track: 'fr' }).correct).toBe(false);
  });

  it('listen_type accepts a listed alternative spelling; the note still shows the main answer', () => {
    const ex = { type: 'listen_type', answer: "It's a big animal.", acceptAlso: ['It is a big animal.'] };
    expect(grade(ex, 'it is a big animal')).toEqual({ correct: true });
    expect(grade(ex, "It's a big animal")).toEqual({ correct: true });
    expect(grade(ex, 'It is a big animl')).toEqual({ correct: true, note: 'spelling', correctAnswer: "It's a big animal." });
    expect(grade(ex, 'It was a big animal')).toMatchObject({ correct: false, correctAnswer: "It's a big animal." });
    expect(grade({ type: 'listen_type', answer: 'cat' }, 'cat')).toEqual({ correct: true });
  });
});

describe('numbers in dictation', () => {
  it('English digits count as the number word, both ways', () => {
    const ex = { type: 'listen_type', answer: "I've got two brothers." };
    expect(grade(ex, "I've got 2 brothers", { track: 'en' })).toEqual({ correct: true });
    expect(grade({ type: 'listen_type', answer: 'There are 20 cats.' }, 'There are twenty cats', { track: 'en' })).toEqual({ correct: true });
    expect(grade({ type: 'listen_type', answer: 'She is twenty-one.' }, 'She is 21', { track: 'en' })).toEqual({ correct: true });
    expect(grade(ex, "I've got 3 brothers", { track: 'en' })).toMatchObject({ correct: false });
    expect(grade({ type: 'listen_type', answer: 'deux chats' }, '3 chats', { track: 'fr' })).toMatchObject({ correct: false });
  });
});

describe('hyphenated words in dictation', () => {
  it('stomach-ache may be typed as one word or two; other answers stay strict', () => {
    const ex = { type: 'listen_type', answer: "I've got a stomach-ache." };
    for (const typed of ["I've got a stomachache", "I've got a stomach ache", "I've got a stomach-ache"]) expect(grade(ex, typed, { track: 'en' })).toEqual({ correct: true });
    expect(grade(ex, "I've got a headache", { track: 'en' })).toMatchObject({ correct: false });
    expect(grade({ type: 'listen_type', answer: 'The cat is black.' }, 'Thecat is black', { track: 'en' })).toMatchObject({ correct: false });
  });
});

describe('French typing on a phone', () => {
  const fill = (answer) => ({ type: 'fill_blank', answer, sentence: 'x ___' });
  const dict = (answer) => ({ type: 'listen_type', answer });
  const fr = { track: 'fr' };

  it("a curly apostrophe (’) is the straight one (')", () => {
    expect(grade(fill("l'école"), 'l’école', fr)).toEqual({ correct: true });
    expect(grade(dict("J'ai un chat."), 'J’ai un chat', fr)).toEqual({ correct: true });
    expect(grade(dict("Qu'est-ce que c'est ?"), 'Qu’est-ce que c’est?', fr)).toEqual({ correct: true });
  });

  it('the space before ? ! : ; is optional, also a no-break space (U+00A0) or a narrow one (U+202F)', () => {
    for (const typed of ['Salut! Ça va?', 'Salut ! Ça va ?', 'Salut\u00a0! Ça va\u00a0?', 'Salut\u202f! Ça va\u202f?']) {
      expect(grade(dict('Salut ! Ça va ?'), typed, fr), JSON.stringify(typed)).toEqual({ correct: true });
    }
    expect(grade(fill('Salut !'), 'Salut!', fr)).toEqual({ correct: true });
    expect(normalize('Regarde\u202f: un chat')).toBe(normalize('Regarde: un chat'));
    expect(normalize('Il est là\u00a0; il dort')).toBe('il est là; il dort');
  });

  it('a hyphen may be typed as a space or left out in a typed fill-in', () => {
    expect(grade(fill('bon week-end'), 'bon weekend', fr)).toEqual({ correct: true });
    expect(grade(fill('grand-mère'), 'grand mère', fr)).toEqual({ correct: true });
    // Hyphen and accent tolerance combine: no hyphen and no accent is right, with the accents note.
    expect(grade(fill('grand-mère'), 'grandmere', fr)).toMatchObject({ correct: true, note: 'accents' });
    expect(grade(fill('grand-mère'), 'grandpere', fr)).toMatchObject({ correct: false });
  });

  it('English typed answers: contractions written out and both British past forms', () => {
    const en = { track: 'en' };
    expect(grade(fill("haven't"), 'have not', en)).toEqual({ correct: true });
    expect(grade(fill('did not'), "didn't", en)).toEqual({ correct: true });
    expect(grade(fill('learned'), 'learnt', en)).toEqual({ correct: true });
    expect(grade(fill('spilt'), 'spilled', en)).toEqual({ correct: true });
    expect(grade(fill('learn'), 'learnt', en)).toMatchObject({ correct: false });
    expect(grade(fill("it's"), 'it is', en)).toMatchObject({ correct: false }); // 's stays ambiguous
    expect(grade(dict('I learned a lot.'), 'I learnt a lot.', en)).toMatchObject({ correct: true });
    expect(grade(fill('learned'), 'learnt', fr)).toMatchObject({ correct: false });
    expect(grade(fill('realize'), 'realise', en)).toEqual({ correct: true });
    expect(grade(fill('organisation'), 'organization', en)).toEqual({ correct: true });
    expect(grade(fill('sise'), 'size', en)).toMatchObject({ correct: false });
    expect(grade(fill('canceled'), 'cancelled', en)).toEqual({ correct: true });
    expect(grade(dict('We traveled by train.'), 'We travelled by train.', en)).toMatchObject({ correct: true });
  });

  it('French B1 typed answers: subjonctif and conditionnel forms, accents as a note, no tense swap', () => {
    expect(grade(fill('écrivions'), 'écrivions', fr)).toEqual({ correct: true });
    expect(grade(fill('écrivions'), 'ecrivions', fr)).toMatchObject({ correct: true, note: 'accents' });
    expect(grade(fill('apparaît'), 'apparait', fr)).toMatchObject({ correct: true, note: 'accents' });
    expect(grade(fill('pourriez'), 'pourriez', fr)).toEqual({ correct: true });
    expect(grade(fill('pouvez'), 'pourriez', fr)).toMatchObject({ correct: false });
    expect(grade(fill('soit'), 'sois', fr)).toMatchObject({ correct: false });
    expect(grade(fill('écrivons'), 'écrivions', fr)).toMatchObject({ correct: false });
  });

  it('a space may be typed as a hyphen (well made / well-made)', () => {
    const en = { track: 'en' };
    expect(grade(fill('well made'), 'well-made', en)).toEqual({ correct: true });
    expect(grade(fill('well made'), 'wellmade', en)).toMatchObject({ correct: false });
  });

  it('oe is œ and ae is æ, without an accent note', () => {
    expect(grade(fill('sœur'), 'soeur', fr)).toEqual({ correct: true });
    expect(grade(fill("l'œuf"), "l'oeuf", fr)).toEqual({ correct: true });
    expect(grade(dict("J'ai une sœur."), "j'ai une soeur", fr)).toEqual({ correct: true });
    expect(grade(fill('ex æquo'), 'ex aequo', fr)).toEqual({ correct: true });
    expect(grade(fill('sœur'), 'soeurs', fr)).toMatchObject({ correct: false });
  });

  it('a missing accent is still correct with the accents note (l’ecole for l’école)', () => {
    expect(grade(fill("l'école"), 'l’ecole', fr)).toEqual({ correct: true, note: 'accents', correctAnswer: "l'école" });
    expect(grade(dict("Je vais à l'école."), 'Je vais a l’ecole', fr)).toEqual({ correct: true, note: 'accents', correctAnswer: "Je vais à l'école." });
    expect(grade(dict('Ma sœur est très jolie.'), 'Ma soeur est tres jolie', fr)).toEqual({ correct: true, note: 'accents', correctAnswer: 'Ma sœur est très jolie.' });
  });

  it('a French agreement ending you cannot hear (allé / allée, amusés / amusé) is correct with the spelling note', () => {
    expect(grade(dict("Hier, je suis allé à l'école."), "Hier, je suis allée à l'école", fr))
      .toEqual({ correct: true, note: 'spelling', correctAnswer: "Hier, je suis allé à l'école." });
    expect(grade(dict("On s'est bien amusés !"), "On s'est bien amusé", fr)).toMatchObject({ correct: true, note: 'spelling' });
    expect(grade(dict('Elle est perdue.'), 'Elle est perdu', fr)).toMatchObject({ correct: true, note: 'spelling' });
    expect(grade(dict('fier'), 'fière', fr)).toMatchObject({ correct: true, note: 'spelling' });
    expect(grade(dict('Il est gros.'), 'Il est grosse', fr)).toMatchObject({ correct: false });
    expect(grade(dict('Je les vois.'), 'Je le vois', fr)).toMatchObject({ correct: false });
  });

  it('digits count as French number words (0–100), un/une included', () => {
    expect(frenchNumber(21)).toBe('vingt et un');
    expect(frenchNumber(71)).toBe('soixante et onze');
    expect(frenchNumber(80)).toBe('quatre-vingts');
    expect(frenchNumber(97)).toBe('quatre-vingt-dix-sept');
    expect(frenchDigits(['vingt', 'et', 'un', 'ans'])).toEqual(['21', 'ans']);
    expect(grade(dict("J'ai dix ans."), "J'ai 10 ans", fr)).toEqual({ correct: true });
    expect(grade(dict("J'ai vingt et un livres."), "J'ai 21 livres", fr)).toEqual({ correct: true });
    expect(grade(dict("J'ai 21 livres."), "J'ai vingt et un livres", fr)).toEqual({ correct: true });
    expect(grade(dict('Il y a soixante-dix élèves.'), 'Il y a 70 élèves', fr)).toEqual({ correct: true });
    expect(grade(dict("J'ai une sœur."), "J'ai 1 sœur", fr)).toEqual({ correct: true });
    expect(grade(dict("J'ai quatre-vingts ans."), "J'ai 80 ans", fr)).toEqual({ correct: true });
    expect(grade(dict("J'ai dix ans."), "J'ai 11 ans", fr)).toMatchObject({ correct: false });
    expect(grade(dict('I am ten.'), 'I am 10', { track: 'en' })).toEqual({ correct: true });
  });
});

describe('no credit for a different word', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const content = loadContent({ contentDir: path.resolve(here, '../../content') });
  const lt = (answer, acceptAlso) => ({ type: 'listen_type', answer, ...(acceptAlso ? { acceptAlso } : {}) });
  const en = { track: 'en', knownWords: knownWordsOf(content, 'en') };
  const fr = { track: 'fr', knownWords: knownWordsOf(content, 'fr') };

  it('un and une are different words in a dictation without digits; with a digit typed they still count as 1', () => {
    expect(gradeListenType(lt('un chat'), 'une chat', fr).correct).toBe(false);
    expect(gradeListenType(lt('une fille'), 'un fille', fr).correct).toBe(false);
    expect(gradeListenType(lt('une sœur'), '1 sœur', fr).correct).toBe(true);
    expect(gradeListenType(lt("J'ai vingt et un ans"), "j'ai 21 ans", fr).correct).toBe(true);
  });

  it('a one-letter "slip" that is another word of the course is wrong; a real slip still counts with the spelling note', () => {
    for (const [answer, typed] of [['donkey', 'monkey'], ['grandma', 'grandpa'], ['three', 'tree'], ['house', 'horse'], ['jacket', 'racket']]) {
      expect(gradeListenType(lt(answer), typed, en).correct, `${answer}/${typed}`).toBe(false);
    }
    for (const [answer, typed] of [['la pomme', 'la homme'], ['les cheveux', 'les chevaux'], ['un petit chat', 'un petite chat']]) {
      expect(gradeListenType(lt(answer), typed, fr).correct, `${answer}/${typed}`).toBe(false);
    }
    expect(gradeListenType(lt('elephant'), 'elphant', en)).toMatchObject({ correct: true, note: 'spelling' });
    expect(gradeListenType(lt('allée'), 'allé', fr)).toMatchObject({ correct: true, note: 'spelling' });
  });

  it('a hyphen may be a space or left out inside its word only, and combines with accent tolerance', () => {
    expect(gradeListenType(lt('ma grand-mère'), 'magrand-mère', fr).correct).toBe(false);
    expect(gradeListenType(lt('ma grand-mère'), 'ma grand mere', fr)).toMatchObject({ correct: true, note: 'accents' });
    expect(gradeListenType(lt('ma grand-mère'), 'ma grandmère', fr)).toEqual({ correct: true });
    expect(gradeListenType(lt('a stomach-ache'), 'a stomachache', en)).toEqual({ correct: true });
    expect(gradeTyped('bon weekend', 'bon week-end', { track: 'fr' })).toEqual({ correct: true });
    expect(gradeTyped('bonweek-end', 'bon week-end', { track: 'fr' }).correct).toBe(false);
    expect(hyphenVariants('bon week-end')).toEqual(['bon week-end', 'bon week end', 'bon weekend']);
  });
});

describe('Dutch typing', () => {
  const lt = (answer) => ({ type: 'listen_type', answer });
  it('a missing accent in één, café, ideeën, België is right with the accent note (typed fill-in and dictation)', () => {
    expect(grade(lt('Ik heb één broer.'), 'Ik heb een broer', { track: 'nl' })).toMatchObject({ correct: true, note: 'accents' });
    expect(grade(lt('We gaan naar het café.'), 'We gaan naar het cafe', { track: 'nl' })).toMatchObject({ correct: true, note: 'accents' });
    expect(grade(lt('Goede ideeën!'), 'Goede ideeen', { track: 'nl' })).toMatchObject({ correct: true, note: 'accents' });
    expect(grade(lt('Ik woon in België.'), 'ik woon in belgie', { track: 'nl' })).toMatchObject({ correct: true, note: 'accents' });
    expect(gradeTyped('cafe', 'café', { track: 'nl' })).toMatchObject({ correct: true, note: 'accents' });
    expect(grade(lt('Ik woon in België.'), 'Ik woon in België.', { track: 'nl' })).toEqual({ correct: true });
  });

  it("a curly apostrophe equals a straight one ('s morgens, auto's)", () => {
    expect(grade(lt("Ik werk 's morgens."), 'Ik werk ’s morgens', { track: 'nl' })).toEqual({ correct: true });
    expect(grade(lt("Twee auto's."), 'Twee auto’s', { track: 'nl' })).toEqual({ correct: true });
    expect(gradeTyped("auto’s", "auto's", { track: 'nl' })).toEqual({ correct: true });
  });

  it('digits equal number words 0–1000, both ways; een / één count as 1 only when a digit is involved', () => {
    expect(dutchNumber(21)).toBe('eenentwintig');
    expect(dutchNumber(22)).toBe('tweeëntwintig');
    expect(dutchNumber(235)).toBe('tweehonderdvijfendertig');
    expect(dutchNumber(1000)).toBe('duizend');
    expect(dutchDigits(['ik', 'ben', 'eenentwintig'])).toEqual(['ik', 'ben', '21']);
    expect(grade(lt('Ik ben eenentwintig.'), 'Ik ben 21', { track: 'nl' })).toEqual({ correct: true });
    expect(grade(lt('Het kost 250 euro.'), 'Het kost tweehonderdvijftig euro', { track: 'nl' })).toEqual({ correct: true });
    expect(grade(lt('Ik heb twee kinderen.'), 'Ik heb 2 kinderen', { track: 'nl' })).toEqual({ correct: true });
    expect(grade(lt('Ik heb één kind.'), 'Ik heb 1 kind', { track: 'nl' })).toEqual({ correct: true });
    expect(grade(lt('Ik heb twee kinderen.'), 'Ik heb 3 kinderen', { track: 'nl' })).toMatchObject({ correct: false });
    expect(grade(lt('Ik ben tweeëntwintig.'), 'Ik ben 22', { track: 'nl' })).toEqual({ correct: true });
  });

  it('one-edit tolerance for words of 5+ letters, never when the typed word is another word of the course', () => {
    const known = new Set(['fiets', 'feest', 'brood', 'broer']);
    expect(grade(lt('Ik heb een fiets.'), 'Ik heb een fiest', { track: 'nl', knownWords: known })).toMatchObject({ correct: true, note: 'spelling' });
    expect(grade(lt('Ik heb een broer.'), 'Ik heb een brood', { track: 'nl', knownWords: known })).toMatchObject({ correct: false });
    expect(grade(lt('Ik heb een kat.'), 'Ik heb een kot', { track: 'nl', knownWords: known })).toMatchObject({ correct: false }); // < 5 letters
  });
});

describe('grading edge cases', () => {
  const fill = (answer) => ({ type: 'fill_blank', answer, sentence: 'x ___' });
  const dict = (answer, acceptAlso) => ({ type: 'listen_type', answer, ...(acceptAlso ? { acceptAlso } : {}) });
  const en = { track: 'en' };
  const fr = { track: 'fr' };
  const nl = { track: 'nl' };

  it('C1: -ize only for stems that really have both spellings', () => {
    expect(grade(fill('surprise'), 'surprize', en)).toMatchObject({ correct: false });
    expect(grade(fill('surprised'), 'surprized', en)).toMatchObject({ correct: false });
    expect(grade(fill('exercise'), 'exercize', en)).toMatchObject({ correct: false });
    expect(grade(fill('promise'), 'promize', en)).toMatchObject({ correct: false });
    expect(grade(fill('sunrise'), 'sunrize', en)).toMatchObject({ correct: false });
    expect(grade(fill('realised'), 'realized', en)).toEqual({ correct: true });
    expect(grade(fill('recognise'), 'recognize', en)).toEqual({ correct: true });
    expect(grade(fill('apologising'), 'apologizing', en)).toEqual({ correct: true });
  });

  it('C10: American spellings of British words', () => {
    expect(grade(fill('centre'), 'center', en)).toEqual({ correct: true });
    expect(grade(fill('favour'), 'favor', en)).toEqual({ correct: true });
    expect(grade(fill('jewellery'), 'jewelry', en)).toEqual({ correct: true });
    expect(grade(fill('colours'), 'colors', en)).toEqual({ correct: true });
    expect(grade(fill('licence'), 'license', en)).toEqual({ correct: true });
    expect(grade(fill('check'), 'cheque', en)).toMatchObject({ correct: false }); // another British word
    expect(grade(fill('story'), 'storey', en)).toMatchObject({ correct: false });
  });

  it('C11: an added or changed accent is wrong, a missing one almost right', () => {
    expect(grade(fill('a'), 'à', fr)).toMatchObject({ correct: false });
    expect(grade(fill('ou'), 'où', fr)).toMatchObject({ correct: false });
    expect(grade(fill('sur'), 'sûr', fr)).toMatchObject({ correct: false });
    expect(grade(fill('où'), 'ou', fr)).toMatchObject({ correct: true, note: 'accents' });
    expect(grade(dict('Il a faim.'), 'Il à faim.', fr)).toMatchObject({ correct: false });
    expect(grade(dict('Il est là.'), 'Il est la.', fr)).toMatchObject({ correct: true, note: 'accents' });
    expect(grade(fill('één'), 'een', nl)).toMatchObject({ correct: true, note: 'accents' });
  });

  it('C4: with a digit in the sentence, an article written out is still compared as written', () => {
    const s = 'Courir quarante kilomètres, c\'est un grand défi.';
    expect(grade(dict(s), "Courir 40 kilomètres, c'est une grand défi.", fr)).toMatchObject({ correct: false });
    expect(grade(dict(s), "Courir 40 kilomètres, c'est un grand défi.", fr)).toEqual({ correct: true });
    expect(grade(dict("J'ai vingt et un ans."), "J'ai 21 ans.", fr)).toEqual({ correct: true });
    expect(grade(dict('une sœur'), '1 sœur', fr)).toEqual({ correct: true });
    expect(grade(dict('Ik heb een kat.'), 'Ik heb 1 kat.', nl)).toMatchObject({ correct: false });
    expect(grade(dict('Ik heb één kat.'), 'Ik heb 1 kat.', nl)).toEqual({ correct: true });
  });

  it('C5: English hundreds as digits', () => {
    expect(grade(dict('There are a hundred sweets in the bag!'), 'There are 100 sweets in the bag!', en)).toEqual({ correct: true });
    expect(grade(dict('It costs two hundred and five pounds.'), 'It costs 205 pounds.', en)).toEqual({ correct: true });
    expect(grade(dict('I have two brothers.'), 'I have 3 brothers.', en)).toMatchObject({ correct: false });
  });

  it('C6: a space typed as a hyphen in dictation', () => {
    expect(grade(dict('It is well made.'), 'It is well-made.', en)).toEqual({ correct: true });
  });

  it('S2: the tail strip is linear', () => {
    const t = Date.now();
    expect(normalize(`${'.'.repeat(30000)}x`)).toBe(`${'.'.repeat(30000)}x`);
    expect(Date.now() - t).toBeLessThan(200);
    expect(normalize('Hello . ?! ')).toBe('hello');
  });
});
