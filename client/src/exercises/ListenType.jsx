import { t } from '../i18n/index.js';
import ListenPlayer from './ListenPlayer.jsx';

// Hear a word or sentence and type it. Graded with a small spelling tolerance for long words.
export default function ListenType({ exercise, answer, onAnswer, onSubmit, locked, track }) {
  return (
    <>
      <ListenPlayer exercise={exercise} />
      <div className="field">
        <label htmlFor="listen-input" className="visually-hidden">{t('lesson.typeLabel')}</label>
        <input
          id="listen-input"
          className="input"
          data-testid="listen-input"
          lang={track}
          value={answer || ''}
          placeholder={t('lesson.typeWhatYouHear')}
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
    </>
  );
}
