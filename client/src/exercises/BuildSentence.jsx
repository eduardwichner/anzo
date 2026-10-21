import { useState } from 'react';
import { t } from '../i18n/index.js';
import { play } from '../audio/player.js';
import { tokenKey } from '../audio/tokens.js';
import { useLessonAudio } from '../audio/LessonAudioContext.jsx';
import { seqInitial, tapBank } from '../lib/arrange.js';
import PlacedSequence from './PlacedSequence.jsx';

// Tap words from the bank to build the sentence (each tap also says the word). Placed words can be rearranged
// (PlacedSequence: tap to select, then tap another word to swap or a marker to move; drag; keys); the selected word
// tapped again goes back to the bank.
export default function BuildSentence({ exercise, onAnswer, locked, track, nativeLang }) {
  const { wordAudio } = useLessonAudio();
  const [state, setState] = useState(seqInitial); // chosen: indexes into exercise.bank

  const update = (next) => {
    setState(next);
    onAnswer(next.chosen.length ? next.chosen.map((i) => exercise.bank[i]) : null);
  };

  return (
    <>
      {exercise.native && (
        <p className="ex-native" lang={nativeLang} data-testid="build-native">
          {exercise.native}
        </p>
      )}
      <PlacedSequence state={state} setState={update} axis="x" locked={locked} className="build-answer" testId="build-answer"
        label={t('lesson.yourSentence')} itemClass="token" itemTestId="answer-token" lang={track}
        renderItem={(i) => exercise.bank[i]}
        // the sentence's final mark, shown after the built sentence (tiles carry no punctuation)
        // (French " !" keeps its space before the mark)
        after={exercise.end ? <span className={`build-end${/^\s/.test(exercise.end) ? ' build-end--spaced' : ''}`} aria-hidden="true" data-testid="build-end" lang={track}>{exercise.end.trim()}</span> : null} />
      <div className="word-bank" aria-label={t('lesson.wordBank')}>
        {exercise.bank.map((word, i) => {
          const used = state.chosen.includes(i);
          return (
            <button
              key={i}
              type="button"
              className={`token${used ? ' token--used' : ''}`}
              data-testid="bank-token"
              lang={track}
              aria-hidden={used}
              tabIndex={used ? -1 : 0}
              disabled={locked || used}
              onClick={() => {
                play(wordAudio?.[tokenKey(word)]);
                update(tapBank(state, i));
              }}
            >
              {word}
            </button>
          );
        })}
      </div>
    </>
  );
}
