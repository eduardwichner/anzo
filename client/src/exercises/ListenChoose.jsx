import ListenPlayer from './ListenPlayer.jsx';

// Hear a word or sentence, pick what it was (written target language) or what it means (Dutch).
// The options are not tappable for audio: that would give the answer away.
export default function ListenChoose({ exercise, answer, onAnswer, locked }) {
  return (
    <>
      <ListenPlayer exercise={exercise} />
      <div className="options-grid" role="group">
        {exercise.options.map((text) => (
          <button
            key={text}
            type="button"
            className="option-btn"
            data-testid="listen-option"
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
