import { useEffect } from 'react';
import { play } from '../audio/player.js';
import { useLessonAudio } from '../audio/LessonAudioContext.jsx';
import SpeakerButton from '../components/SpeakerButton.jsx';
import TappableText from '../components/TappableText.jsx';

export default function MultipleChoice({ exercise, answer, onAnswer, locked, track }) {
  const { autoplay } = useLessonAudio();
  const targetQuestion = exercise.questionLang === track;

  // A target-language question is read aloud once when it appears (unless auto-play is off).
  useEffect(() => {
    if (autoplay && targetQuestion && exercise.audio) play(exercise.audio);
    // Only on appearance; toggling auto-play later must not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id]);

  return (
    <>
      <div className="ex-question" data-testid="mc-question">
        <span className="ex-question-text">
          {targetQuestion ? <TappableText text={exercise.question} lang={track} /> : <span lang={exercise.questionLang}>{exercise.question}</span>}
        </span>
        {targetQuestion && (
          <span className="speaker-row">
            <SpeakerButton url={exercise.audio} />
            <SpeakerButton url={exercise.audioSlow} slow />
          </span>
        )}
      </div>
      <div className="options-grid" role="group">
        {exercise.options.map((text) => (
          <button
            key={text}
            type="button"
            className="option-btn"
            data-testid="mc-option"
            lang={exercise.optionLang}
            aria-pressed={answer === text}
            disabled={locked}
            onClick={() => onAnswer(text)}
          >
            {text}
          </button>
        ))}
      </div>
    </>
  );
}
