import { useState } from 'react';
import { t } from '../i18n/index.js';
import { seqInitial, tapBank } from '../lib/arrange.js';
import PlacedSequence from './PlacedSequence.jsx';

/**
 * order_paragraphs: the parts of a text (paragraphs, sentences or a dialogue's turns) shuffled; tap them in order. Placed
 * parts can be rearranged (PlacedSequence: tap to select, tap another to swap or a marker to move; drag; keys); the
 * selected part tapped again goes back. After checking, a wrong order shows the right one.
 */
export default function OrderParagraphs({ exercise, onAnswer, locked, track, result }) {
  const [state, setState] = useState(seqInitial); // chosen: indexes into exercise.bank
  const update = (next) => {
    setState(next);
    onAnswer(next.chosen.length === exercise.bank.length ? next.chosen.map((i) => exercise.bank[i].id) : null);
  };
  const byId = new Map(exercise.bank.map((x) => [x.id, x]));
  return (
    <>
      {!state.chosen.length && <p className="order-empty" data-testid="order-empty">{t('order.tapInOrder')}</p>}
      <PlacedSequence state={state} setState={update} axis="y" locked={locked} className="order-answer" testId="order-answer"
        label={t('order.yourOrder')} itemClass="order-card order-card--placed" itemTestId="order-placed" lang={track}
        itemProps={(i) => ({ 'data-seg-id': exercise.bank[i].id })}
        renderItem={(i, k) => (
          <>
            <span className="order-number">{k + 1}</span>
            <span>{exercise.bank[i].text}</span>
          </>
        )} />
      <div className="order-bank" aria-label={t('order.parts')}>
        {exercise.bank.map((x, i) => (state.chosen.includes(i) ? null : (
          <button key={x.id} type="button" className="order-card" lang={track} data-testid="order-part" data-seg-id={x.id} disabled={locked}
            onClick={() => update(tapBank(state, i))}>
            {x.text}
          </button>
        )))}
      </div>
      {result && !result.correct && result.correctOrder && (
        <div className="stack-tight" data-testid="order-correct">
          <p className="muted small">{t('order.correctOrder')}</p>
          <ol className="order-list">
            {result.correctOrder.map((id) => <li key={id} lang={track}>{byId.get(id)?.text}</li>)}
          </ol>
        </div>
      )}
    </>
  );
}
