import { Fragment, useEffect, useRef } from 'react';
import { t } from '../i18n/index.js';
import { dropPlaced, gapAt, nudge, removeAt, tapGap, tapPlaced, usefulGaps } from '../lib/arrange.js';
import { boxes, inside, useDrag } from './useDrag.js';

const EARLIER = new Set(['ArrowLeft', 'ArrowUp']);
const LATER = new Set(['ArrowRight', 'ArrowDown']);

/**
 * The answer line of build_sentence / order_paragraphs: the placed items in order, rearrangeable (lib/arrange.js).
 * Tap: select, swap, move to an insert marker, tap again = back to the bank. Drag (useDrag): a placed item to another
 * place in the line; the marker of the gap it would land in lights up. Keyboard: Enter/Space as a tap, arrows move the
 * item one place, Delete/Backspace send it back, Escape deselects.
 *   state { chosen, selected }, setState(next)   axis 'x' (a wrapping line of words) | 'y' (a list of cards)
 *   renderItem(bankIndex, pos)                   the content of a placed item
 */
export default function PlacedSequence({ state, setState, axis = 'x', locked, className, testId, itemClass, itemTestId, lang, label, itemLabel, itemProps, renderItem, after = null }) {
  const listRef = useRef(null);
  const focusPos = useRef(null);
  const keyMoved = useRef(null); // the position an item reached with the arrow keys: Enter then only deselects it
  const { chosen, selected } = state;

  const { drag, bind } = useDrag({
    disabled: locked,
    resolve: (x, y, source, offset) => {
      if (!inside(listRef.current, x, y)) return null;
      const gap = gapAt(boxes(listRef.current, '[data-arrange-pos]', offset), x, y, axis);
      return gap === source.pos || gap === source.pos + 1 ? null : gap;
    },
    onDrop: (source, gap) => setState(dropPlaced(state, source.pos, gap)),
  });

  useEffect(() => {
    if (focusPos.current === null) return;
    listRef.current?.querySelector(`[data-arrange-pos="${focusPos.current}"]`)?.focus();
    focusPos.current = null;
  });

  const gaps = selected === null ? [] : usefulGaps(chosen.length, selected);
  const marker = (gap) => {
    const active = !locked && gaps.includes(gap);
    const target = drag?.target === gap;
    return (
      <button key={`gap${gap}`} type="button" tabIndex={active ? 0 : -1} aria-hidden={!active} disabled={!active}
        className={`insert-marker insert-marker--${axis}${active ? ' is-active' : ''}${target ? ' is-target' : ''}`}
        data-testid="insert-marker" data-arrange-gap={gap} data-target={target ? 'true' : 'false'}
        aria-label={t('arrange.moveHere', { n: gap + 1 })} onClick={() => setState(tapGap(state, gap))} />
    );
  };
  const withMarkers = chosen.length >= 2;

  return (
    <>
      <div ref={listRef} className={className} role="list" aria-label={label} data-testid={testId} data-axis={axis} data-dragging={drag ? 'true' : 'false'}>
        {chosen.map((b, pos) => {
          const drags = bind(`p${b}`, { pos });
          return (
            <Fragment key={b}>
              {withMarkers && marker(pos)}
              {/* the list item is the wrapper, so a screen reader still announces a (toggle) button */}
              <span role="listitem" className="placed-item">
              <button type="button" className={itemClass} data-testid={itemTestId} data-arrange-pos={pos} lang={lang}
                aria-pressed={selected === pos} aria-label={itemLabel?.(b, pos)} aria-describedby="arrange-keys" disabled={locked}
                {...itemProps?.(b)}
                {...drags}
                onClick={(e) => {
                  keyMoved.current = null;
                  if (e.detail === 0) focusPos.current = pos; // a keyboard tap: keep the focus at this place after a swap
                  setState(tapPlaced(state, pos));
                }}
                onKeyDown={(e) => {
                  if (EARLIER.has(e.key) || LATER.has(e.key)) {
                    e.preventDefault();
                    const next = nudge(state, pos, EARLIER.has(e.key) ? -1 : 1);
                    focusPos.current = next.selected;
                    keyMoved.current = next.selected;
                    setState(next);
                  } else if (e.key === 'Enter' && keyMoved.current === pos && selected === pos) {
                    e.preventDefault(); // done moving it: deselect, never send it back
                    keyMoved.current = null;
                    setState({ ...state, selected: null });
                  } else if (e.key === 'Delete' || e.key === 'Backspace') {
                    e.preventDefault();
                    keyMoved.current = null;
                    if (chosen.length > 1) focusPos.current = Math.min(pos, chosen.length - 2);
                    setState(removeAt(state, pos));
                  } else if (e.key === 'Escape') {
                    keyMoved.current = null;
                    setState({ ...state, selected: null });
                  }
                }}>
                {renderItem(b, pos)}
              </button>
              </span>
            </Fragment>
          );
        })}
        {withMarkers && marker(chosen.length)}
        {chosen.length > 0 && after}
      </div>
      <span id="arrange-keys" className="visually-hidden">{t('arrange.keys')}</span>
      {selected !== null && !locked && <p className="arrange-hint" data-testid="arrange-hint">{t(axis === 'y' ? 'arrange.hintParts' : 'arrange.hint')}</p>}
    </>
  );
}
