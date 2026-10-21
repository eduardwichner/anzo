import { useRef } from 'react';
import { t, loc } from '../i18n/index.js';
import { play } from '../audio/player.js';
import { tokenKey } from '../audio/tokens.js';
import { useLessonAudio } from '../audio/LessonAudioContext.jsx';
import TappableText from '../components/TappableText.jsx';
import { inside, useDrag } from './useDrag.js';

// Word bank when the exercise has options, typed input otherwise. The words around the blank can be
// tapped to hear them; the whole sentence is not played before checking (it would say the answer). With a bank, another
// word replaces the chosen one, a tap on the filled blank empties it, and a bank word can be dragged onto the blank.
export default function FillBlank({ exercise, answer, onAnswer, onSubmit, locked, track }) {
  const { wordAudio } = useLessonAudio();
  const [before, after] = exercise.sentence.split('___');
  const hint = loc(exercise.hint);
  const blankRef = useRef(null);
  const { drag, bind } = useDrag({
    disabled: locked || !exercise.options,
    resolve: (x, y) => (inside(blankRef.current, x, y, 12) ? 'blank' : null),
    onDrop: (source) => onAnswer(source.word),
  });
  return (
    <>
      <p className="fill-sentence" lang={track} data-testid="fill-sentence">
        <TappableText text={before} lang={track} />
        {exercise.options && answer ? (
          <button ref={blankRef} type="button" className={`blank blank--filled${drag?.target ? ' is-target' : ''}`} data-testid="fill-blank" lang={track}
            disabled={locked} aria-label={t('arrange.emptyBlank', { word: answer })} onClick={() => onAnswer(null)}>
            {answer}
          </button>
        ) : (
          <span ref={blankRef} className={`blank${drag?.target ? ' is-target' : ''}`} data-testid="fill-blank">
            {answer || <span className="visually-hidden">{t('lesson.blank')}</span>}
          </span>
        )}
        <TappableText text={after} lang={track} />
      </p>
      {hint && <p className="hint">{t('lesson.hint', { hint })}</p>}
      {/* B2 word formation: make the word in the gap from this one */}
      {exercise.stem && <p className="hint stem" lang={track} data-testid="fill-stem">{exercise.stem}</p>}
      {exercise.options ? (
        <div className="word-bank" role="group">
          {exercise.options.map((word) => (
            <button
              key={word}
              type="button"
              className="token"
              data-testid="fill-option"
              lang={track}
              aria-pressed={answer === word}
              disabled={locked}
              {...bind(`b${word}`, { word })}
              onClick={() => {
                play(wordAudio?.[tokenKey(word)]);
                onAnswer(word);
              }}
            >
              {word}
            </button>
          ))}
        </div>
      ) : (
        <div className="field">
          <label htmlFor="fill-input" className="visually-hidden">{t('lesson.typeLabel')}</label>
          <input
            id="fill-input"
            className="input"
            data-testid="fill-input"
            lang={track}
            value={answer || ''}
            placeholder={t('lesson.typeHere')}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="done"
            disabled={locked}
            onChange={(e) => onAnswer(e.target.value.trim() ? e.target.value : null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit?.();
            }}
          />
        </div>
      )}
    </>
  );
}
