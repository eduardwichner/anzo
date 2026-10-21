import { Fragment, useRef, useState } from 'react';
import { t } from '../i18n/index.js';
import { bankFree, dropOnSlot, slotsInitial, tapBankWord, tapSlot } from '../lib/arrange.js';
import { inside, useDrag } from './useDrag.js';

/**
 * cloze: the text with 3–6 numbered gaps. With a word bank (below B1) a tapped word fills the selected gap (replacing its
 * word) or the first empty one; a tapped filled gap is selected, and then another gap swaps the two words (into an empty
 * gap: moves it) while the same gap again empties it (lib/arrange.js). Bank words and filled gaps can also be dragged
 * onto a gap (useDrag). Typed at B1. A finite-verb gap shows its infinitive as the hint. After checking each gap is
 * marked right or wrong, with the expected word. Also the B2 open cloze (typed, no hints) and word formation (typed, the stem in
 * capitals beside each gap; a word of the right family in another form gets the note "right word, other form").
 */
export default function Cloze({ exercise, onAnswer, locked, track, nativeLang, result }) {
  const n = exercise.gaps.length;
  const [state, setState] = useState(() => slotsInitial(n));
  const { values, selected } = state;
  const bank = Boolean(exercise.options);
  const textRef = useRef(null);

  const update = (next) => {
    setState(next);
    onAnswer(next.values.every((v) => v.trim()) ? next.values : null);
  };
  const free = (word) => bankFree(exercise.options, values, word) > 0;
  // gaps are numbered in the order they appear in the text (an author may list them otherwise)
  const order = exercise.parts.flatMap((seg) => seg.parts.filter((x) => typeof x !== 'string').map((x) => x.gap));
  const shown = new Map(order.map((k, i) => [k, i + 1]));
  const firstEmpty = order.find((k) => values[k] === '') ?? -1;

  const { drag, bind } = useDrag({
    disabled: locked || !bank,
    resolve: (x, y, source) => {
      if (!inside(textRef.current, x, y, 0)) return null;
      const el = document.elementFromPoint(x, y)?.closest('[data-slot]');
      if (!el) return null;
      const k = Number(el.dataset.slot);
      return source.slot === k ? null : k;
    },
    onDrop: (source, k) => update(dropOnSlot(state, source, k)),
  });

  const gap = (k) => {
    const g = result?.gaps?.[k];
    const mark = g ? (g.correct ? 'right' : 'wrong') : 'none';
    const hint = exercise.gaps[k].hint;
    const number = shown.get(k) ?? k + 1;
    const label = t('cloze.gap', { n: number });
    return (
      <span key={`gap${k}`} className={`cloze-gap cloze-gap--${mark}`} data-testid="cloze-gap" data-gap={k + 1} data-number={number} data-result={mark} data-kind={exercise.gaps[k].kind}>
        <span className="cloze-number" aria-hidden="true">{number}</span>
        {bank ? (
          <button type="button" lang={track} aria-label={values[k] ? `${label}: ${values[k]}` : label} aria-pressed={selected === k}
            className={`cloze-slot${selected === k && !locked ? ' is-selected' : ''}${selected === null && k === firstEmpty && !locked ? ' is-next' : ''}${drag?.target === k ? ' is-target' : ''}`}
            disabled={locked} data-testid="cloze-slot" data-slot={k}
            {...(values[k] ? bind(`s${k}`, { slot: k }) : {})}
            onClick={() => update(tapSlot(state, k))}>
            {values[k] || '…'}
          </button>
        ) : (
          <input className="input cloze-input" lang={track} aria-label={label} autoCapitalize="off" autoCorrect="off" spellCheck="false"
            disabled={locked} value={values[k]} data-testid="cloze-input"
            onChange={(e) => update({ ...state, values: values.map((v, i) => (i === k ? e.target.value : v)) })} />
        )}
        {hint && <span className="cloze-hint" lang={nativeLang}>{hint}</span>}
        {/* B2 word formation: the stem in capitals (target language) beside the gap */}
        {exercise.gaps[k].stem && <span className="cloze-hint stem" lang={track} data-testid="cloze-stem">{exercise.gaps[k].stem}</span>}
        {g?.note === 'form' && <span className="cloze-note" data-testid="cloze-form-note">{t('text.formNote')}</span>}
        {g && !g.correct && <span className="cloze-expected" lang={track} data-testid="cloze-expected">{g.answer}</span>}
        {g?.note === 'accents' && <span className="cloze-expected" lang={track}>{g.answer}</span>}
      </span>
    );
  };

  let lastPara = null;
  return (
    <>
      <div ref={textRef} className="card text-card cloze-text" data-testid="cloze-text">
        {exercise.parts.map((seg) => {
          const newPara = lastPara !== null && seg.paragraph !== lastPara;
          lastPara = seg.paragraph;
          return (
            <Fragment key={seg.id}>
              {newPara && <span className="cloze-break" aria-hidden="true" />}
              <span className={`cloze-seg${seg.speaker ? ` cloze-seg--${seg.speaker.toLowerCase()}` : ''}`} lang={track}>
                {seg.parts.map((p, i) => (typeof p === 'string' ? <Fragment key={i}>{p}</Fragment> : gap(p.gap)))}
              </span>{' '}
            </Fragment>
          );
        })}
      </div>
      {bank && selected !== null && values[selected] && !locked && <p className="arrange-hint" data-testid="arrange-hint">{t('arrange.hintGaps')}</p>}
      {bank && (
        <div className="word-bank" aria-label={t('lesson.wordBank')}>
          {exercise.options.map((word, i) => {
            const usedUp = !free(word);
            return (
              <button key={`${word}${i}`} type="button" className={`token${usedUp ? ' token--used' : ''}`} lang={track} data-testid="cloze-option"
                disabled={locked || usedUp} {...(usedUp ? {} : bind(`b${i}`, { word }))} onClick={() => update(tapBankWord(state, word, order))}>
                {word}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
