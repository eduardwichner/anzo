// Rearranging what a learner placed, without clearing everything (build_sentence, order_paragraphs: a sequence of bank
// items; cloze and the word-bank fill_blank: slots). Pure; unit-tested from the server (server/test/arrange.test.js).
//
// Sequence state: { chosen: [bank index, …] (the answer line in order), selected: position | null }
//   tap a placed item       nothing selected → select it; the selected one again → back to the bank; another → swap
//   tap an insert marker    move the selected item to that gap (gap k = before position k; gap chosen.length = the end)
//   tap a bank item         append it (any selection ends)
//   drag a placed item      drop on a gap → move; anywhere else → nothing changes
//   keyboard                arrows move the focused item one place (nudge); Delete / Backspace send it back; Escape deselects
// Slot state: { values: [string, …] ('' = empty), selected: slot | null }
//   tap a slot              nothing selected → select it; the selected one again → empty it (filled) / deselect (empty);
//                           another while a filled one is selected → swap the two (into an empty slot = move)
//   tap a bank word         fills the selected slot (replacing its word), else the first empty one
//   drag                    a filled slot onto another → swap; a bank word onto a slot → fill it

export const seqInitial = () => ({ chosen: [], selected: null });

/** The list with the item at `from` moved to gap `gap` (0 … length). */
export function moveTo(list, from, gap) {
  if (from < 0 || from >= list.length || gap < 0 || gap > list.length) return list;
  if (gap === from || gap === from + 1) return list;
  const next = list.filter((_, i) => i !== from);
  next.splice(gap > from ? gap - 1 : gap, 0, list[from]);
  return next;
}

export function swap(list, a, b) {
  if (a === b || a < 0 || b < 0 || a >= list.length || b >= list.length) return list;
  const next = [...list];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

/** Gaps a move of the item at `from` can go to (its own two neighbouring gaps change nothing). */
export function usefulGaps(length, from) {
  const out = [];
  for (let g = 0; g <= length; g += 1) if (from === null || (g !== from && g !== from + 1)) out.push(g);
  return out;
}

export function tapPlaced(state, pos) {
  const { chosen, selected } = state;
  if (pos < 0 || pos >= chosen.length) return state;
  if (selected === null) return { chosen, selected: pos };
  if (selected === pos) return { chosen: chosen.filter((_, i) => i !== pos), selected: null };
  return { chosen: swap(chosen, selected, pos), selected: null };
}

export function tapGap(state, gap) {
  if (state.selected === null) return state;
  return { chosen: moveTo(state.chosen, state.selected, gap), selected: null };
}

export function tapBank(state, bankIndex) {
  if (state.chosen.includes(bankIndex)) return state;
  return { chosen: [...state.chosen, bankIndex], selected: null };
}

/** A drag of the placed item at `from` dropped on `gap` (null: not on the answer line — nothing changes). */
export function dropPlaced(state, from, gap) {
  if (gap === null || gap === undefined) return state;
  return { chosen: moveTo(state.chosen, from, gap), selected: null };
}

/** Keyboard: the item at `pos` one place earlier (-1) or later (+1); it stays selected at its new place. */
export function nudge(state, pos, delta) {
  const to = pos + delta;
  if (to < 0 || to >= state.chosen.length) return { ...state, selected: pos };
  return { chosen: swap(state.chosen, pos, to), selected: to };
}

export function removeAt(state, pos) {
  if (pos < 0 || pos >= state.chosen.length) return state;
  return { chosen: state.chosen.filter((_, i) => i !== pos), selected: null };
}

/**
 * Which gap a drag at (x, y) points to, from the placed items' boxes in order ({ left, top, width, height }).
 * `axis` 'x' for a wrapping line of words (the row under the pointer, then before/after the item's middle), 'y' for a
 * vertical list. Outside every box but inside the line: the gap after the nearest item of that row (the end when below).
 */
export function gapAt(rects, x, y, axis = 'x') {
  if (!rects.length) return 0;
  if (axis === 'y') {
    for (let i = 0; i < rects.length; i += 1) if (y < rects[i].top + rects[i].height / 2) return i;
    return rects.length;
  }
  const row = rects.map((r, i) => ({ r, i })).filter(({ r }) => y >= r.top && y < r.top + r.height);
  if (!row.length) return y < rects[0].top ? 0 : rects.length;
  for (const { r, i } of row) if (x < r.left + r.width / 2) return i;
  return row[row.length - 1].i + 1;
}

// ---------- slots (cloze, fill_blank) ----------

export const slotsInitial = (n) => ({ values: Array(n).fill(''), selected: null });

export function tapSlot(state, k) {
  const { values, selected } = state;
  if (k < 0 || k >= values.length) return state;
  if (selected === null) return { values, selected: k };
  if (selected === k) return { values: values[k] ? values.map((v, i) => (i === k ? '' : v)) : values, selected: null };
  if (!values[selected]) return { values, selected: k };
  return { values: swap(values, selected, k), selected: null };
}

/** `order`: the slots in the order they appear (a cloze's gaps in text order); default 0, 1, 2 … */
export function tapBankWord(state, word, order = null) {
  const { values, selected } = state;
  const at = selected !== null ? selected : (order ?? values.map((_, i) => i)).find((i) => values[i] === '') ?? -1;
  if (at < 0) return state;
  return { values: values.map((v, i) => (i === at ? word : v)), selected: null };
}

/** A drag dropped on slot `to` (null: nowhere — nothing changes): from slot `from.slot` (swap) or a bank word (fill). */
export function dropOnSlot(state, from, to) {
  if (to === null || to === undefined || to < 0 || to >= state.values.length) return state;
  if (from.slot !== undefined) {
    if (from.slot === to || !state.values[from.slot]) return state;
    return { values: swap(state.values, from.slot, to), selected: null };
  }
  if (typeof from.word !== 'string') return state;
  return { values: state.values.map((v, i) => (i === to ? from.word : v)), selected: null };
}

/** How many times a bank word is still free (the bank may hold a word twice). */
export function bankFree(options, values, word) {
  return options.filter((o) => o === word).length - values.filter((v) => v === word).length;
}
