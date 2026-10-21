import { Fragment, useRef, useState } from 'react';
import { t } from '../i18n/index.js';
import { bankFree, dropOnSlot, slotsInitial, tapBankWord, tapSlot } from '../lib/arrange.js';
import { inside, useDrag } from './useDrag.js';

/**
 * gap_sentence (B2 gapped text): sentences are missing from the text; the learner puts one of the offered sentences (one
 * more than there are gaps) into each gap. A tapped sentence fills the selected gap or the first empty one; a tapped filled
 * gap is selected, then another gap swaps the two and the same gap again empties it (lib/arrange.js, as the word-bank cloze);
 * sentences can be dragged onto a gap. After checking each gap is right or wrong, with the right sentence.
 */
export default function GapSentence({ exercise, onAnswer, locked, track, result }) {
  const order = exercise.parts.flatMap((seg) => seg.parts.filter((x) => typeof x !== 'string').map((x) => x.gap));
  const n = order.length;
  const [state, setState] = useState(() => slotsInitial(n));
  const { values, selected } = state;
  const textRef = useRef(null);
  const tokens = exercise.bank.map((x) => x.id);
  const textOf = new Map(exercise.bank.map((x) => [x.id, x.text]));
  const update = (next) => {
    setState(next);
    onAnswer(next.values.every((v) => v) ? next.values : null);
  };
  const { drag, bind } = useDrag({
    disabled: locked,
    resolve: (x, y, source) => {
      if (!inside(textRef.current, x, y, 0)) return null;
      const el = document.elementFromPoint(x, y)?.closest('[data-slot]');
      if (!el) return null;
      const k = Number(el.dataset.slot);
      return source.slot === k ? null : k;
    },
    onDrop: (source, k) => update(dropOnSlot(state, source, k)),
  });
  const firstEmpty = order.find((k) => !values[k]) ?? -1;

  const gap = (k) => {
    const g = result?.gaps?.[k];
    const mark = g ? (g.correct ? 'right' : 'wrong') : 'none';
    const number = order.indexOf(k) + 1;
    return (
      <span key={`gap${k}`} className={`gapped-gap gapped-gap--${mark}`} data-testid="gapped-gap" data-gap={k + 1} data-result={mark}>
        <button type="button" lang={track} data-testid="gapped-slot" data-slot={k} aria-pressed={selected === k} disabled={locked}
          aria-label={values[k] ? `${t('text.gapSentence', { n: number })}: ${textOf.get(values[k])}` : t('text.gapSentence', { n: number })}
          className={`gapped-slot${selected === k && !locked ? ' is-selected' : ''}${selected === null && k === firstEmpty && !locked ? ' is-next' : ''}${drag?.target === k ? ' is-target' : ''}`}
          {...(values[k] ? bind(`s${k}`, { slot: k }) : {})}
          onClick={() => update(tapSlot(state, k))}>
          <span className="gapped-number" aria-hidden="true">{number}</span>
          {values[k] ? textOf.get(values[k]) : '…'}
        </button>
        {g && !g.correct && <span className="gapped-expected" lang={track} data-testid="gapped-expected">{textOf.get(g.answer)}</span>}
      </span>
    );
  };

  let lastPara = null;
  return (
    <>
      <div ref={textRef} className="card text-card gapped-text" data-testid="gapped-text">
        {exercise.parts.map((seg) => {
          const newPara = lastPara !== null && seg.paragraph !== lastPara;
          lastPara = seg.paragraph;
          return (
            <Fragment key={seg.id}>
              {newPara && <span className="cloze-break" aria-hidden="true" />}
              {seg.parts.map((p, i) => (typeof p === 'string' ? <span key={i} lang={track}>{p} </span> : gap(p.gap)))}
            </Fragment>
          );
        })}
      </div>
      <div className="gapped-bank" aria-label={t('text.sentences')} data-testid="gapped-bank">
        {exercise.bank.map((x, i) => {
          const usedUp = bankFree(tokens, values, x.id) <= 0;
          return (
            <button key={x.id} type="button" className={`order-card${usedUp ? ' token--used' : ''}`} lang={track} data-testid="gapped-option" data-token={x.id}
              disabled={locked || usedUp} {...(usedUp ? {} : bind(`b${i}`, { word: x.id }))} onClick={() => update(tapBankWord(state, x.id, order))}>
              {x.text}
            </button>
          );
        })}
      </div>
    </>
  );
}
