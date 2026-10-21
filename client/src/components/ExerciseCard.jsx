import SpeakerButton from './SpeakerButton.jsx';
import { t } from '../i18n/index.js';

// One exercise as the child sees it, drawn statically for the admin (Corrections preview, Inbox): the instruction,
// the question / options / pairs / tiles, the clip, and the correct answer. `ex` is an admin exercise view
// (server/src/ops/corrections.js adminExerciseView): the public exercise plus answer, heard text and acceptAlso.
export default function ExerciseCard({ ex, track, title, mark, testId }) {
  if (!ex) return null;
  const language = t(`languages.${track}`);
  const target = (text) => <span lang={track}>{text}</span>;
  const isAnswer = (o) => o === ex.answer;
  return (
    <article className={`ex-card${mark ? ` ex-card--${mark}` : ''}`} data-testid={testId ?? 'exercise-card'} data-exercise={ex.id}>
      <header className="ex-card-head">
        <span className="ex-card-type">{t(`exerciseTypes.${ex.type}`)}</span>
        {title && <span className="ex-card-title">{title}</span>}
        <code className="ex-card-id">{ex.id}</code>
      </header>
      {ex.instruction && <p className="ex-card-instruction">{t(ex.instruction, { language })}</p>}

      {ex.type === 'multiple_choice' && (
        <>
          <p className="ex-card-question">
            {ex.questionLang === track ? target(ex.question) : ex.question}
            <SpeakerButton url={ex.audio} />
          </p>
          <ul className="ex-card-options">
            {ex.options.map((o) => <li key={o} className={isAnswer(o) ? 'is-answer' : ''} lang={ex.optionLang}>{o}</li>)}
          </ul>
        </>
      )}

      {ex.type === 'match_pairs' && (
        <ul className="ex-card-pairs">
          {ex.pairs.map((p) => <li key={p.left}>{target(p.left)} <span aria-hidden="true">=</span> {p.right}</li>)}
        </ul>
      )}

      {ex.type === 'build_sentence' && (
        <>
          <p className="ex-card-question">{ex.native}</p>
          <ul className="ex-card-tiles" lang={track}>{ex.bank.map((w, i) => <li key={`${w}-${i}`}>{w}</li>)}</ul>
        </>
      )}

      {ex.type === 'fill_blank' && (
        <>
          <p className="ex-card-question">{target(ex.sentence.replace('___', '_____'))}</p>
          {ex.hint && <p className="muted">{t('ops.card.hint', { hint: ex.hint })}</p>}
          {ex.options && <ul className="ex-card-tiles" lang={track}>{ex.options.map((o) => <li key={o} className={isAnswer(o) ? 'is-answer' : ''}>{o}</li>)}</ul>}
        </>
      )}

      {(ex.type === 'listen_choose' || ex.type === 'listen_type') && (
        <>
          <p className="ex-card-question">
            <SpeakerButton url={ex.audio} />
            <SpeakerButton url={ex.audioSlow} slow />
            {ex.heard && <span className="muted">{t('ops.card.heard')} {target(ex.heard)}</span>}
          </p>
          {ex.options && (
            <ul className="ex-card-options">
              {ex.options.map((o) => <li key={o} className={isAnswer(o) ? 'is-answer' : ''} lang={ex.optionLang}>{o}</li>)}
            </ul>
          )}
        </>
      )}

      {ex.answer && ex.type !== 'match_pairs' && <p className="ex-card-answer">{t('ops.card.answer')} <strong lang={track}>{ex.answer}</strong></p>}
      {ex.acceptAlso?.length > 0 && <p className="muted">{t('ops.card.acceptAlso', { list: ex.acceptAlso.join(' · ') })}</p>}
    </article>
  );
}
