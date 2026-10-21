import { useEffect, useRef, useState } from 'react';
import { playSequence } from '../audio/player.js';
import { t } from '../i18n/index.js';
import { useLessonAudio } from '../audio/LessonAudioContext.jsx';
import TextView, { TextPlayButtons, textPlaylist } from '../components/TextView.jsx';
import { autoFold } from '../lib/textSteps.js';

export const TFNG = ['true', 'false', 'not_given'];
/** The label of a true / false / not given answer, in the interface language. */
export const tfngLabel = (code) => t(`text.tfng.${code}`);

/**
 * One comprehension question (in the target language): multiple choice, a heading for paragraph n, or a statement to
 * judge true / false / not given (the three answers are UI text).
 */
export function QuestionView({ question, answer, onAnswer, locked, track, result }) {
  // B2 multiple matching: a person (paragraph) per statement; the answer once every statement has one
  if (question.type === 'match_texts') return <MatchTexts question={question} locked={locked} track={track} result={result} onAnswer={onAnswer} />;
  // B2 listening completion: 1–3 words typed into the statement's gap
  if (question.type === 'complete') {
    const [before, after] = question.statement.split('___');
    return (
      <div className="stack question" data-testid="question" data-question-type={question.type}>
        <p className="question-text complete-line" lang={track}>
          {before}
          <input className="input complete-input" lang={track} aria-label={t('text.completeLabel')} autoCapitalize="off" autoCorrect="off"
            spellCheck="false" disabled={locked} data-testid="complete-input" value={typeof answer === 'string' ? answer : ''}
            onChange={(e) => onAnswer(e.target.value.trim() ? e.target.value : null)} />
          {after}
        </p>
      </div>
    );
  }
  if (question.type === 'true_false_notgiven') {
    return (
      <div className="stack question" data-testid="question" data-question-type={question.type}>
        <p className="question-text" lang={track} data-testid="question-statement">{question.statement}</p>
        <div className="options-grid options-grid--three" role="group">
          {TFNG.map((code) => (
            <button key={code} type="button" className="option-btn" data-testid="tfng-option" data-value={code}
              aria-pressed={answer === code} disabled={locked} onClick={() => onAnswer(code)}>
              {tfngLabel(code)}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="stack question" data-testid="question" data-question-type={question.type}>
      {question.type === 'match_heading'
        ? <p className="question-text" data-testid="question-paragraph">{t('text.headingFor', { n: question.paragraph })}</p>
        : question.type === 'summary'
          ? null // the instruction asks it ("which summary fits it best?")
          : <p className="question-text" lang={track} data-testid="question-text">{question.question}</p>}
      <div className={`options-grid options-grid--stack${question.type === 'summary' ? ' options-grid--long' : ''}`} role="group">
        {question.options.map((text) => (
          <button key={text} type="button" className="option-btn" lang={track} data-testid="question-option"
            aria-pressed={answer === text} disabled={locked} onClick={() => onAnswer(text)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * B2 multiple matching: each statement gets one of the labels (the people of the short texts, paragraph 1…n). After checking
 * each row shows right or wrong and the right person.
 */
function MatchTexts({ question, locked, track, result, onAnswer }) {
  const [picks, setPicks] = useState(() => question.statements.map(() => null));
  const pick = (i, n) => {
    const next = picks.map((x, k) => (k === i ? n : x));
    setPicks(next);
    onAnswer(next.every((x) => x !== null) ? next : null);
  };
  return (
    <div className="stack question" data-testid="question" data-question-type="match_texts">
      <ol className="match-texts">
        {question.statements.map((st, i) => {
          const r = result?.statements?.[i];
          const mark = r ? (r.correct ? 'right' : 'wrong') : 'none';
          return (
            <li key={st.id} className={`match-row match-row--${mark}`} data-testid="match-row" data-result={mark}>
              <p className="match-statement" lang={track}>{st.statement}</p>
              <div className="match-labels" role="group" aria-label={t('text.matchStatement', { n: i + 1 })}>
                {question.labels.map((label, k) => (
                  <button key={label} type="button" className="chip-btn" lang={track} data-testid="match-label" data-paragraph={k + 1}
                    aria-pressed={picks[i] === k + 1} disabled={locked} onClick={() => pick(i, k + 1)}>
                    {label}
                  </button>
                ))}
              </div>
              {r && !r.correct && <p className="match-expected" lang={track} data-testid="match-expected">{r.answer}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * reading / dialogue / listening: one question. The text (or the listening player) sits above it on the stepped text
 * screen (SessionPlayer → TextBlock), shared by all questions of the text.
 */
export default function TextQuestion({ exercise, answer, onAnswer, locked, track, result }) {
  return <QuestionView question={exercise.question} answer={answer} onAnswer={onAnswer} locked={locked} track={track} result={result} />;
}

/** The top of a text screen: the text, folded after the first question on a phone, its meanings after checking. */
export function TextPanel({ text, track, nativeLang, step, translation, labels = null }) {
  const wide = useWide();
  // a long text (B2: 400–700 words), or short texts to match statements to (labels), gets its own scroll pane on a phone and
  // stays open: the question stays in view below it
  const long = isLongText(text) || Boolean(labels);
  const [open, setOpen] = useState(true);
  const folded = useRef(false);
  useEffect(() => {
    if (!long && !folded.current && autoFold(step, wide)) {
      folded.current = true; // once: after that the learner's own choice stands
      setOpen(false);
    }
  }, [step, wide, long]);
  return <TextView text={text} track={track} nativeLang={nativeLang} collapsible={!wide} open={wide || open} onToggle={setOpen} translation={translation}
    bounded={long && !wide} labels={labels} />;
}

/** Words of a text (its sentences or turns). */
export const textWordCount = (text) => (text.kind === 'dialogue' ? text.turns : text.paragraphs.flat())
  .reduce((n, x) => n + String(x.target).split(/\s+/).filter(Boolean).length, 0);
/** Long enough to need its own scroll pane on a phone. */
export const LONG_TEXT_WORDS = 180;
export const isLongText = (text) => textWordCount(text) > LONG_TEXT_WORDS;

/**
 * The top of a listening screen: the text's audio only (two voices for a dialogue), heard once when the screen appears
 * (Settings → Play words automatically); the transcript once every question of the text has been answered.
 */
export function ListeningPanel({ text, track, nativeLang, transcriptAllowed }) {
  const { autoplay } = useLessonAudio();
  const [transcript, setTranscript] = useState(false);
  useEffect(() => {
    if (autoplay) playSequence(text.id, textPlaylist(text));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text.id]);
  return (
    <div className="stack">
      <div className="listen-player" data-testid="listening-player">
        <TextPlayButtons text={text} big testId="listening-play" />
      </div>
      {transcriptAllowed && !transcript && (
        <button type="button" className="btn btn--secondary" data-testid="show-transcript" onClick={() => setTranscript(true)}>{t('text.showTranscript')}</button>
      )}
      {transcriptAllowed && transcript && <TextView text={text} track={track} nativeLang={nativeLang} translation testId="transcript" />}
    </div>
  );
}

const WIDE = '(min-width: 900px)';
/** Text and question side by side (wide screens) or stacked with the text foldable (phones). */
export function useWide() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(WIDE);
    if (!mq) return undefined;
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return Boolean(wide);
}
