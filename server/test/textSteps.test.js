// One screen per text (client/src/lib/textSteps.js): the questions of a text are stepped through under one text; each
// question stays its own exercise, so the first-try score, XP and practice are counted per question as before.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { autoFold, textStep } from '../../client/src/lib/textSteps.js';
import { loadContent } from '../src/content/loader.js';

const ex = (id, type, textId) => ({ id, type, ...(textId ? { textId, question: { id: `${id}-q` } } : {}) });

describe('text steps', () => {
  const lesson = [
    ex('e1', 'reading', 't1'), ex('e2', 'reading', 't1'), ex('e3', 'reading', 't1'),
    { id: 'e4', type: 'cloze', textId: 't1' }, { id: 'e5', type: 'order_paragraphs', textId: 't1' },
  ];
  it('a question knows its text block: "Question 2 of 3"; cloze and ordering are not stepped', () => {
    expect(textStep(lesson, lesson[1])).toEqual({ textId: 't1', kind: 'text', ids: ['e1', 'e2', 'e3'], step: 2, total: 3 });
    expect(textStep(lesson, lesson[3])).toBeNull();
    expect(textStep(lesson, lesson[4])).toBeNull();
    expect(textStep(lesson, null)).toBeNull();
    expect(textStep(lesson, { id: 'x', type: 'multiple_choice' })).toBeNull();
  });

  it('listening questions of two texts form two blocks', () => {
    const review = [ex('r1', 'listening', 't1'), ex('r2', 'listening', 't1'), ex('r3', 'listening', 't2'), ex('r4', 'listening', 't2')];
    expect(textStep(review, review[2])).toMatchObject({ textId: 't2', kind: 'listening', step: 1, total: 2 });
  });

  it('the text folds after the first question on a phone, never on a wide screen', () => {
    expect(autoFold(1, false)).toBe(false);
    expect(autoFold(2, false)).toBe(true);
    expect(autoFold(3, true)).toBe(false);
  });

  it('every pilot question is still its own playable exercise (the lesson total counts each question)', () => {
    const content = loadContent({ contentDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content') });
    for (const id of ['nl-b1', 'en-b1', 'fr-b1']) {
      const pack = content.packs.get(id).pack;
      for (const unit of pack.units) {
        for (const lesson of unit.lessons) {
          const questions = lesson.exercises.filter((e) => ['reading', 'dialogue', 'listening'].includes(e.type));
          const blocks = new Map();
          for (const q of questions) {
            const s = textStep(lesson.exercises, q);
            blocks.set(s.textId, s.total);
          }
          expect([...blocks.values()].reduce((a, b) => a + b, 0)).toBe(questions.length);
          expect(content.lessons.get(lesson.id).playableCount).toBe(lesson.exercises.length);
        }
      }
    }
  });
});
