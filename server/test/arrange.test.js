// Rearranging placed answers (client/src/lib/arrange.js): build_sentence and order_paragraphs (a sequence), cloze and the
// word-bank fill-in (slots). Grading is unchanged: these only decide what the learner's answer is.
import { describe, expect, it } from 'vitest';
import {
  bankFree, dropOnSlot, dropPlaced, gapAt, moveTo, nudge, removeAt, seqInitial, slotsInitial, swap, tapBank, tapBankWord, tapGap,
  tapPlaced, tapSlot, usefulGaps,
} from '../../client/src/lib/arrange.js';

const seq = (chosen, selected = null) => ({ chosen, selected });

describe('sequence (build the sentence, order the paragraphs)', () => {
  it('moveTo: gap k is before position k; its own neighbouring gaps change nothing', () => {
    expect(moveTo(['a', 'b', 'c', 'd'], 0, 4)).toEqual(['b', 'c', 'd', 'a']);
    expect(moveTo(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveTo(['a', 'b', 'c', 'd'], 1, 3)).toEqual(['a', 'c', 'b', 'd']);
    expect(moveTo(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
    expect(moveTo(['a', 'b', 'c'], 1, 2)).toEqual(['a', 'b', 'c']);
    expect(moveTo(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
    expect(usefulGaps(4, 1)).toEqual([0, 3, 4]);
  });

  it('tap: select, swap with another, the selected one again goes back to the bank', () => {
    let s = tapBank(tapBank(tapBank(seqInitial(), 2), 0), 1); // bank items 2, 0, 1 placed
    expect(s).toEqual(seq([2, 0, 1]));
    s = tapPlaced(s, 0);
    expect(s.selected).toBe(0);
    s = tapPlaced(s, 2); // swap the first and the last
    expect(s).toEqual(seq([1, 0, 2]));
    s = tapPlaced(tapPlaced(s, 1), 1); // the selected one again: back to the bank
    expect(s).toEqual(seq([1, 2]));
    expect(tapBank(s, 1)).toBe(s); // already placed: nothing changes
  });

  it('tap a marker: the selected item moves there; without a selection nothing happens', () => {
    expect(tapGap(seq([3, 0, 1, 2], 0), 4)).toEqual(seq([0, 1, 2, 3]));
    expect(tapGap(seq([0, 1, 2]), 0)).toEqual(seq([0, 1, 2]));
    expect(tapBank(seq([0, 1], 0), 2)).toEqual(seq([0, 1, 2])); // a bank tap ends a selection
  });

  it('drag: dropped on a gap moves the item; dropped nowhere changes nothing', () => {
    expect(dropPlaced(seq([1, 0, 2]), 0, 2)).toEqual(seq([0, 1, 2]));
    const s = seq([1, 0, 2]);
    expect(dropPlaced(s, 0, null)).toBe(s);
  });

  it('keyboard: arrows move the item one place and keep it selected; Delete sends it back', () => {
    expect(nudge(seq([0, 1, 2]), 0, 1)).toEqual(seq([1, 0, 2], 1));
    expect(nudge(seq([0, 1, 2]), 0, -1)).toEqual(seq([0, 1, 2], 0)); // at the edge: stays
    expect(removeAt(seq([0, 1, 2], 1), 1)).toEqual(seq([0, 2]));
  });

  it('gapAt: a wrapping line of words (row under the pointer, before or after the middle), a vertical list', () => {
    const row1 = [{ left: 0, top: 0, width: 50, height: 40 }, { left: 60, top: 0, width: 50, height: 40 }];
    const row2 = [{ left: 0, top: 50, width: 80, height: 40 }];
    const rects = [...row1, ...row2];
    expect(gapAt(rects, 10, 20)).toBe(0);
    expect(gapAt(rects, 40, 20)).toBe(1);
    expect(gapAt(rects, 100, 20)).toBe(2); // after the last word of the first row
    expect(gapAt(rects, 70, 60)).toBe(3);
    expect(gapAt(rects, 10, 200)).toBe(3); // below everything: the end
    expect(gapAt(rects, 10, -5)).toBe(0);
    const cards = [{ left: 0, top: 0, width: 300, height: 60 }, { left: 0, top: 70, width: 300, height: 60 }];
    expect(gapAt(cards, 10, 20, 'y')).toBe(0);
    expect(gapAt(cards, 10, 40, 'y')).toBe(1);
    expect(gapAt(cards, 10, 125, 'y')).toBe(2);
    expect(gapAt([], 0, 0)).toBe(0);
    expect(swap(['a', 'b'], 0, 1)).toEqual(['b', 'a']);
  });
});

describe('slots (word-bank cloze, word-bank fill-in)', () => {
  it('a bank word fills the selected gap (replacing its word), else the first empty one', () => {
    let s = tapBankWord(slotsInitial(3), 'ging');
    expect(s).toEqual({ values: ['ging', '', ''], selected: null });
    s = tapBankWord(tapSlot(s, 2), 'nam');
    expect(s.values).toEqual(['ging', '', 'nam']);
    s = tapBankWord(tapSlot(s, 0), 'kwam'); // a filled gap selected: its word is replaced (and goes back to the bank)
    expect(s.values).toEqual(['kwam', '', 'nam']);
    expect(tapBankWord({ values: ['a', 'b'], selected: null }, 'c').values).toEqual(['a', 'b']); // full: nothing
  });

  it('tap a filled gap, then another: the words swap (into an empty gap: the word moves); the same gap again empties it', () => {
    let s = { values: ['nam', 'ging', ''], selected: null };
    s = tapSlot(tapSlot(s, 0), 1);
    expect(s).toEqual({ values: ['ging', 'nam', ''], selected: null });
    s = tapSlot(tapSlot(s, 1), 2);
    expect(s.values).toEqual(['ging', '', 'nam']);
    s = tapSlot(tapSlot(s, 0), 0);
    expect(s).toEqual({ values: ['', '', 'nam'], selected: null });
    // an empty gap selected, then another gap: that one is selected instead (nothing to move)
    expect(tapSlot(tapSlot(s, 0), 2)).toEqual({ values: ['', '', 'nam'], selected: 2 });
  });

  it('drag: a filled gap onto another swaps; a bank word onto a gap fills it; nowhere changes nothing', () => {
    const s = { values: ['nam', 'ging', ''], selected: null };
    expect(dropOnSlot(s, { slot: 0 }, 1).values).toEqual(['ging', 'nam', '']);
    expect(dropOnSlot(s, { slot: 0 }, 2).values).toEqual(['', 'ging', 'nam']);
    expect(dropOnSlot(s, { word: 'kwam' }, 1).values).toEqual(['nam', 'kwam', '']);
    expect(dropOnSlot(s, { slot: 2 }, 0)).toBe(s); // an empty gap has nothing to drag
    expect(dropOnSlot(s, { slot: 0 }, null)).toBe(s);
    expect(bankFree(['a', 'a', 'b'], ['a', ''], 'a')).toBe(1);
  });
});

describe('a bank word fills the first empty gap in text order', () => {
  it('with the gaps listed 0, 2, 1 in the text, the second tap fills gap 2', () => {
    let s = tapBankWord(slotsInitial(3), 'a', [0, 2, 1]);
    s = tapBankWord(s, 'b', [0, 2, 1]);
    expect(s.values).toEqual(['a', '', 'b']);
    expect(tapBankWord(slotsInitial(2), 'x').values).toEqual(['x', '']); // default order
  });
});
