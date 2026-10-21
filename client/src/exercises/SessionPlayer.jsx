import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { t } from '../i18n/index.js';
import { IconCheck, IconClose, IconFlag, IconInfo } from '../icons/index.jsx';
import { isUnlocked, stop, unlock } from '../audio/player.js';
import { playSfx } from '../audio/sfx.js';
import { LessonAudioContext } from '../audio/LessonAudioContext.jsx';
import Button from '../components/Button.jsx';
import Mascot from '../components/Mascot.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import ReportSheet from '../components/ReportSheet.jsx';
import SpeakerButton from '../components/SpeakerButton.jsx';
import { mascotLine } from '../lib/lines.js';
import ExerciseRunner, { isPlayable } from './ExerciseRunner.jsx';
import { ListeningPanel, TextPanel, tfngLabel } from './TextQuestion.jsx';
import { textStep } from '../lib/textSteps.js';

/**
 * A dictation's sentence with what the learner made of each word: wrong words marked, missing
 * words shown in a dashed box, almost-right ones (accents, one letter) underlined; typed words the sentence lacks below it.
 * It keeps the test id and wording of the plain line it replaces (correct-answer, spelling-note, accent-note).
 */
function MarkedSentence({ words, lang, label, testId }) {
  // for screen readers: one line per kind of mark ("wrong: ons"), since the colours only show it
  const said = ['wrong', 'missing', 'accents', 'spelling']
    .map((st) => [st, words.marks.filter((m) => m.s === st).map((m) => m.t)])
    .filter(([, ws]) => ws.length)
    .map(([st, ws]) => `${t(`lesson.mark.${st}`)}: ${ws.join(' ')}`);
  return (
    <>
      <p className="result-detail" data-testid={testId}>
        {label} <span className="marked-sentence" lang={lang} data-testid="word-marks">
          {words.marks.map((m, i) => (
            <span key={i} className={`mark mark--${m.s}`} data-testid="word-mark" data-status={m.s}>{m.t}</span>
          )).reduce((out, el, i) => (i ? [...out, ' ', el] : [el]), [])}
        </span>
      </p>
      {said.length > 0 && <p className="visually-hidden">{said.join('; ')}</p>}
      {words.extra.length > 0 && (
        <p className="result-note" data-testid="word-extra">{t('lesson.extraWords', { words: words.extra.join(' ') })}</p>
      )}
    </>
  );
}

/** "Capitals and full stops don't count": shown when the learner left them out (they never make an answer wrong). */
const CapsNote = () => <p className="result-note" data-testid="caps-note">{t('lesson.capsNote')}</p>;

function ResultDetail({ exercise, result }) {
  if (result.words?.marks && exercise.type === 'listen_type') {
    const kind = !result.correct ? 'correctAnswer' : result.note === 'accents' ? 'accents' : 'spelling';
    const testId = { correctAnswer: 'correct-answer', accents: 'accent-note', spelling: 'spelling-note' }[kind];
    return (
      <>
        <MarkedSentence words={result.words} lang={exercise.lang} label={t(`lesson.${kind}`)} testId={testId} />
        {result.capsNote && <CapsNote />}
      </>
    );
  }
  if (result.capsNote && exercise.type === 'listen_type' && result.correct && !result.note) return <CapsNote />;
  if (result.correct) {
    if (result.note === 'spelling') {
      return (
        <p className="result-detail" data-testid="spelling-note">
          {t('lesson.spelling')} <strong lang={exercise.lang}>{result.correctAnswer}</strong>
        </p>
      );
    }
    if (result.note !== 'accents') return null;
    return (
      <p className="result-detail" data-testid="accent-note">
        {t('lesson.accents')} <strong lang={exercise.lang}>{result.correctAnswer}</strong>
      </p>
    );
  }
  if (exercise.type === 'match_pairs') return <p className="result-detail">{t('lesson.pairsWrong')}</p>;
  // order, cloze and the B2 kinds show what was right inside the exercise (the right order; each gap; each statement; the sentence)
  if (['order_paragraphs', 'cloze', 'open_cloze', 'word_form', 'gap_sentence', 'transform'].includes(exercise.type)) return null;
  if (exercise.question?.type === 'match_texts') return null;
  if (exercise.question?.type === 'true_false_notgiven') {
    return <p className="result-detail" data-testid="correct-answer">{t('lesson.correctAnswer')} <strong>{tfngLabel(result.correctAnswer)}</strong></p>;
  }
  const shown = exercise.type === 'fill_blank' ? exercise.sentence.replace('___', result.correctAnswer)
    : exercise.question?.type === 'complete' ? exercise.question.statement.replace('___', result.correctAnswer) : result.correctAnswer;
  return (
    <p className="result-detail" data-testid="correct-answer">
      {result.note === 'form' ? `${t('text.formNote')} ` : `${t('lesson.correctAnswer')} `}<strong>{shown}</strong>
    </p>
  );
}

/** "In the Netherlands: de mobiel (for de gsm)": the Belgian form is taught, the Netherlands one is worth knowing. */
function AlsoNL({ note }) {
  return <p className="result-detail result-note" data-testid="also-nl">{t('lesson.alsoNL', { nl: note.nl, word: note.target })}</p>;
}

/** "Question 2 of 5" and a dot per question of the text (current, right first time, wrong first time, to do). */
function QuestionSteps({ step, firstTry, currentId }) {
  return (
    <div className="question-steps" data-testid="question-steps" data-step={step.step} data-total={step.total}>
      <p className="question-step-label" data-testid="question-step">{t('text.questionOf', { n: step.step, total: step.total })}</p>
      <ol className="step-dots" aria-hidden="true">
        {step.ids.map((id) => {
          const state = id === currentId ? 'current' : id in firstTry ? (firstTry[id] ? 'right' : 'wrong') : 'todo';
          return <li key={id} className={`step-dot step-dot--${state}`} data-testid="step-dot" data-state={state} />;
        })}
      </ol>
    </div>
  );
}

/**
 * What went wrong with a request: no connection (retry helps), or the server said no (retrying the same request cannot
 * help: back to Home).
 */
const failure = (err) => (err?.status ? { text: t('app.error'), home: err.status < 500 } : { text: t('app.offline'), home: false });

/**
 * Plays a list of exercises the way a lesson does (lessons and practice sessions alike): check, result strip with the
 * mascot, wrong exercises come back at the end until right, audio and sound effects.
 *   exercises  public exercises in play order
 *   submit(exercise, answer, firstTry, startedAt) → graded result ({ correct, correctAnswer?, note?, audio?, audioSlow? })
 *   finish({ firstTryCorrect, total, startedAt }) → Promise; the caller navigates to its done screen
 *   rootProps  extra attributes for the root element (data-lesson-id, data-practice-id)
 *   track      the language the course teaches (the pack's `language`: fr for both fr and fr-en)
 */
export default function SessionPlayer({ user, track, mascot, exercises, wordAudio, texts = {}, submit, finish, testId = 'lesson', rootProps = {}, quitLabel, quitTo = '/', noReport = false }) {
  // Settings → Play words automatically (users.autoplay, default on). Manual 🔊 / 🐢 always work.
  const autoplay = user.autoplay !== false;
  const [queue, setQueue] = useState(() => exercises.map((_, i) => i)); // indexes still to do
  const [firstTry, setFirstTry] = useState({}); // exerciseId -> correct on the first attempt?
  const [doneCount, setDoneCount] = useState(0);
  const [round, setRound] = useState(0); // remounts the exercise when it comes back
  const [answer, setAnswer] = useState(null);
  const [result, setResult] = useState(null);
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportInfo, setReportInfo] = useState(false);
  const [reported, setReported] = useState({}); // exerciseId -> true once reported in this session
  const startedAt = useRef(new Date().toISOString());

  // The tap that opened the session normally unlocks audio already; after a reload the first tap or key press inside
  // does it. A touch pointerdown is not a user gesture for audio (click / pointerup / keydown are), and the listeners
  // stay until audio is really unlocked. Every tap also resumes sound effects an interruption (a call) suspended.
  // Leaving stops any clip.
  useEffect(() => {
    const events = ['click', 'pointerup', 'keydown'];
    const onGesture = () => {
      unlock();
      if (isUnlocked()) events.forEach((e) => document.removeEventListener(e, onGesture, { capture: true }));
    };
    events.forEach((e) => document.addEventListener(e, onGesture, { capture: true }));
    return () => {
      events.forEach((e) => document.removeEventListener(e, onGesture, { capture: true }));
      stop();
    };
  }, []);


  const total = exercises.filter(isPlayable).length;
  const exercise = queue.length ? { ...exercises[queue[0]], lang: track } : null;
  // one screen per text: its questions are stepped through under the same text (or listening player)
  const step = textStep(exercises, exercise);
  const stepText = step ? texts?.[step.textId] : null;

  const done = async (tries = firstTry) => {
    setBusy(true);
    setError(null);
    try {
      await finish({ firstTryCorrect: Object.values(tries).filter(Boolean).length, total, startedAt: startedAt.current });
    } catch (err) {
      setError(failure(err));
      setBusy(false);
    }
  };

  const check = async () => {
    if (answer === null || busy || result) return;
    setBusy(true);
    setError(null);
    try {
      const res = await submit(exercise, answer, !(exercise.id in firstTry), startedAt.current);
      if (res.retired) {
        // The admin hid this exercise while it was open: it counts as done, without a result strip.
        const tries = exercise.id in firstTry ? firstTry : { ...firstTry, [exercise.id]: true };
        setFirstTry(tries);
        setDoneCount((n) => n + 1);
        advance(true, tries);
        return;
      }
      setResult(res);
      setLine(mascotLine(res.correct ? 'correct' : 'wrong'));
      playSfx(res.correct ? 'correct' : 'wrong');
      setFirstTry((prev) => (exercise.id in prev ? prev : { ...prev, [exercise.id]: res.correct }));
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  };

  const advance = (correct, tries = firstTry) => {
    const [head, ...rest] = queue;
    const next = correct ? rest : [...rest, head];
    setAnswer(null);
    setResult(null);
    setReportInfo(false);
    setRound((r) => r + 1);
    setQueue(next);
    if (next.length === 0) done(tries);
  };

  const onContinue = () => {
    stop();
    if (result.correct) setDoneCount((n) => n + 1);
    advance(result.correct);
  };

  const onSkip = () => advance(true); // reserved exercise types are skipped, not counted

  const runner = exercise && (
    <ExerciseRunner
      key={`${exercise.id}:${round}`}
      exercise={exercise}
      answer={answer}
      onAnswer={setAnswer}
      onSubmit={check}
      onSkip={onSkip}
      locked={Boolean(result) || busy}
      result={result}
      track={track}
      nativeLang={user.nativeLang}
    />
  );

  return (
    <LessonAudioContext.Provider value={{ track, wordAudio, autoplay, texts }}>
      <div className={`lesson${step ? ' lesson--wide' : ''}`} data-testid={testId} {...rootProps}>
        <div className="lesson-top">
          <Link to={quitTo} className="icon-btn" aria-label={quitLabel ?? t('lesson.quit')} data-testid="quit-lesson">
            <IconClose />
          </Link>
          <ProgressBar value={doneCount} max={total} label={t('lesson.progress', { done: doneCount, total })} />
        </div>

        <div className="lesson-body">
          {exercise && step ? (
            stepText ? (
              <div className="text-block" data-testid="text-block" data-text-id={step.textId} data-kind={step.kind}>
                <div className="text-block-text">
                  {step.kind === 'listening'
                    ? <ListeningPanel key={`listening:${step.textId}`} text={stepText} track={track} nativeLang={user.nativeLang}
                        transcriptAllowed={Boolean(result) && step.ids.every((id) => id in firstTry)} />
                    : <TextPanel key={`text:${step.textId}`} text={stepText} track={track} nativeLang={user.nativeLang} step={step.step}
                        translation={Boolean(result) && step.ids.every((id) => id in firstTry)}
                        labels={exercises.find((e) => step.ids.includes(e.id) && e.question?.type === 'match_texts')?.question.labels ?? null} />}
                </div>
                <div className="text-block-question">
                  <QuestionSteps step={step} firstTry={firstTry} currentId={exercise.id} />
                  {runner}
                </div>
              </div>
            ) : <p className="form-error" role="alert">{t('text.missing')}</p>
          ) : exercise ? runner : error ? (
            <div className="center stack">
              <p className="form-error" role="alert" data-testid="session-error">{error.text}</p>
              {error.home
                ? <Link to="/" className="btn btn--primary" data-testid="session-error-home">{t('lesson.backHome')}</Link>
                : <Button onClick={() => done()} disabled={busy} data-testid="session-retry">{t('app.retry')}</Button>}
            </div>
          ) : (
            <div className="center muted" role="status">{t('app.loading')}</div>
          )}
        </div>

        {exercise && isPlayable(exercise) && (
          <div
            className="lesson-bottom"
            data-testid="result-strip"
            data-result={result ? (result.correct ? 'correct' : 'wrong') : 'none'}
            aria-live="polite"
          >
            {result ? (
              <div className="result-strip">
                <div className="row result-row">
                  <Mascot kind={mascot} pose={result.correct ? 'happy' : 'encouraging'} className="mascot mascot--strip" testId="result-mascot" />
                  <div className="result-head">
                    <p className="result-title">{result.correct ? t('lesson.correct') : t('lesson.wrong')}</p>
                    <p className="result-line" data-testid="mascot-line">{line}</p>
                  </div>
                  <SpeakerButton url={result.audio} testId="result-speaker" />
                  <SpeakerButton url={result.audioSlow} slow testId="result-speaker-slow" />
                </div>
                <ResultDetail exercise={exercise} result={result} />
                {(result.alsoNL || []).map((n) => <AlsoNL key={n.target} note={n} />)}
                {!result.correct && <p className="result-detail">{t('lesson.comesBack')}</p>}
                {/* Only after checking: the flag can never be used to fish for the answer. */}
                {!noReport && <div className="report-row">
                  {reportInfo && <p className="report-info" data-testid="report-info-text">{t(user.audience === 'adult' ? 'report.infoTextAdult' : 'report.infoText')}</p>}
                  <button type="button" className="icon-btn report-btn" aria-label={t('report.info')} aria-expanded={reportInfo}
                    data-testid="report-info" onClick={() => setReportInfo((v) => !v)}>
                    <IconInfo />
                  </button>
                  <button type="button" className="icon-btn report-btn" data-testid="report-flag" disabled={Boolean(reported[exercise.id])}
                    aria-label={reported[exercise.id] ? t('report.sent') : t('report.flag')} onClick={() => setReportOpen(true)}>
                    {reported[exercise.id] ? <IconCheck /> : <IconFlag />}
                  </button>
                </div>}
                <Button
                  variant={result.correct ? 'success' : 'error'}
                  size="big"
                  block
                  data-testid="continue-button"
                  disabled={busy}
                  onClick={onContinue}
                >
                  {t('lesson.continue')}
                </Button>
              </div>
            ) : (
              <div className="stack">
                {error && <p className="form-error" role="alert">{error.text}</p>}
                <Button size="big" block data-testid="check-button" disabled={answer === null || busy} onClick={check}>
                  {t('lesson.check')}
                </Button>
              </div>
            )}
            {result && error && <p className="form-error" role="alert">{error.text}</p>}
          </div>
        )}
        {reportOpen && exercise && (
          <ReportSheet exerciseId={exercise.id} track={track} nativeLang={user.nativeLang} onClose={() => setReportOpen(false)}
            onSent={() => setReported((r) => ({ ...r, [exercise.id]: true }))} />
        )}
      </div>
    </LessonAudioContext.Provider>
  );
}
