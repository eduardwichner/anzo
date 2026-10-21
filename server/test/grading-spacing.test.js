// Grading. E1 build tiles without punctuation and capitals (old tiles still graded), E2 `,; :` as word
// breaks and spaces around an apostrophe (Alex's four answers), E3 English variants plainly right in dictation.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { grade, normalize } from '../src/content/grading.js';
import { loadContent, knownWordsOf, publicExercise } from '../src/content/loader.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const content = loadContent({ contentDir: path.join(ROOT, 'content') });
const dictation = (answer, track, typed) => grade({ type: 'listen_type', id: 'x', answer }, typed, { track, knownWords: knownWordsOf(content, track) });

describe('E2: spacing in typed answers and dictation', () => {
  it("Alex's four answers (diagnostics A4) are right", () => {
    expect(dictation('Oui, ça va bien.', 'fr', 'Oui,ça va bien')).toEqual({ correct: true });
    expect(dictation('Tu as un frère ? Oui !', 'fr', 'tu as un frere,oui')).toMatchObject({ correct: true, note: 'accents' });
    expect(dictation('Zéro, un, deux, trois !', 'fr', '0,1,2,3')).toEqual({ correct: true });
    expect(dictation("J'ai huit ans.", 'fr', "j ' ai huit ans")).toEqual({ correct: true });
  });
  it('typed fill-ins too; both sides pass the same normalisation', () => {
    const typed = (answer, given, track = 'fr') => grade({ type: 'fill_blank', id: 'x', sentence: '___', answer }, given, { track });
    expect(typed('Oui, ça va bien.', 'oui,ça va bien')).toEqual({ correct: true });
    expect(typed("J'ai huit ans.", "J 'ai huit ans")).toEqual({ correct: true });
    expect(typed('Bonjour : ça va ?', 'bonjour:ça va?')).toEqual({ correct: true });
    expect(typed('Oui, ça va bien.', 'oui ça va bien').correct).toBe(false); // a typed fill-in still needs its comma
    expect(normalize("'s Morgens")).toBe("'s morgens"); // a leading apostrophe is left alone
    expect(normalize('a ,b ;c')).toBe('a, b; c');
  });
  it('a missing word or a wrong word is still wrong', () => {
    expect(dictation('Oui, ça va bien.', 'fr', 'Oui,va bien').correct).toBe(false);
    expect(dictation("J'ai huit ans.", 'fr', "j ' ai neuf ans").correct).toBe(false);
  });
});

describe('E3: English variants come before the one-letter-slip rule in dictation', () => {
  it('a valid US/British variant is plainly right (no "spelling" note)', () => {
    expect(dictation('My favourite colour is red.', 'en', 'My favorite color is red')).toEqual({ correct: true });
    expect(dictation('I realise it.', 'en', 'I realize it')).toEqual({ correct: true });
    expect(dictation('The train was cancelled.', 'en', 'The train was canceled')).toEqual({ correct: true });
    expect(dictation('We went to the theatre.', 'en', 'We went to the theater')).toEqual({ correct: true });
  });
  it('a real slip still gets the note, also next to a variant', () => {
    expect(dictation('My favourite colour is red.', 'en', 'My favourit colour is red')).toMatchObject({ correct: true, note: 'spelling' });
    expect(dictation('My favourite colour is purple.', 'en', 'My favorite color is purpel')).toMatchObject({ correct: true, note: 'spelling' });
  });
});

describe('E1: build tiles', () => {
  const builds = (track) => [...content.exercises.values()].filter((e) => e.trackId === track && e.exercise.type === 'build_sentence').map((e) => e.exercise);
  it('English and French tiles carry no punctuation; a sentence start is lower case unless a name, a language or I', () => {
    for (const track of ['en', 'fr', 'nl']) {
      const list = builds(track);
      expect(list.length).toBeGreaterThan(500);
      for (const ex of list) {
        for (const tok of ex.tokens) expect(/[,!?;:]$|(?<!\p{L}\.\p{L})\.$/u.test(tok), `${ex.id} "${tok}"`).toBe(false);
      }
    }
    const capitals = new Set(builds('en').map((ex) => ex.tokens[0]).filter((tok) => /^\p{Lu}/u.test(tok)));
    for (const w of capitals) expect(/^I(?:'|$)|^(Mum|Dad|Grandma|Mr|Tom|Ben|English)$/u.test(w), w).toBe(true);
  });
  it('the client gets the final mark; a lesson opened before the reload (old tiles) grades the same', () => {
    const ex = builds('en').find((e) => e.id === 'en-pre-a1-u01-l03-e12');
    expect(ex.tokens).toEqual(['this', 'is', 'a', 'long', 'snake']);
    expect(publicExercise(content, 'en-pre-a1', ex).end).toBe('.');
    const frEx = builds('fr').find((e) => / !$/.test(e.answer));
    expect(publicExercise(content, content.exercises.get(frEx.id).packId, frEx).end).toBe(' !'); // French: the space stays
    expect(grade(ex, ['this', 'is', 'a', 'long', 'snake'])).toEqual({ correct: true });
    expect(grade(ex, ['This', 'is', 'a', 'long', 'snake.'])).toEqual({ correct: true }); // the tiles of the old pack
    expect(grade(ex, ['is', 'this', 'a', 'long', 'snake']).correct).toBe(false);
    expect(grade(ex, ['this', 'is', 'a', 'long', 'snake', 'snake']).correct).toBe(false);
    const fr = builds('fr').find((e) => /[!?]$/.test(e.answer) && / [!?]$/.test(e.answer));
    expect(fr.tokens.at(-1)).not.toMatch(/[!?]/);
  });
});
