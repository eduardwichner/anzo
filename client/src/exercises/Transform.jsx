import { t } from '../i18n/index.js';

/**
 * transform (B2 key word transformation): the first sentence, the key word in capitals, and the second sentence with one
 * gap for 2–6 words that keep the meaning — the key word among them, unchanged. Typed; after checking a wrong answer shows
 * one right answer in the sentence, and the sentence's meaning in the learner's language (`native`, when the pack has one).
 */
export default function Transform({ exercise, answer, onAnswer, onSubmit, locked, track, nativeLang, result }) {
  return (
    <div className="stack transform">
      <p className="card transform-from" lang={track} data-testid="transform-from">{exercise.from}</p>
      <p className="transform-key-row">
        <span className="muted small">{t('transform.keyWord')}</span>
        <span className="transform-key stem" lang={track} data-testid="transform-key">{exercise.key}</span>
      </p>
      <p className="transform-gapped" lang={track} data-testid="transform-gapped">
        {exercise.before}
        <input className="input transform-input" lang={track} aria-label={t('transform.yourAnswer')} data-testid="transform-input"
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="done" disabled={locked}
          value={answer || ''} onChange={(e) => onAnswer(e.target.value.trim() ? e.target.value : null)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit?.(); }} />
        {exercise.after}
      </p>
      {result && !result.correct && result.correctAnswer && (
        <p className="result-detail transform-correct" data-testid="transform-correct">
          {t('transform.correct')} <strong lang={track}>{`${exercise.before}${result.correctAnswer}${exercise.after}`}</strong>
        </p>
      )}
      {result && exercise.native && (
        <p className="result-detail muted" data-testid="transform-meaning">
          {t('transform.meaning')} <span lang={nativeLang}>{exercise.native}</span>
        </p>
      )}
    </div>
  );
}
