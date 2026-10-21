import { t } from '../i18n/index.js';
import Button from '../components/Button.jsx';
import MultipleChoice from './MultipleChoice.jsx';
import MatchPairs from './MatchPairs.jsx';
import BuildSentence from './BuildSentence.jsx';
import FillBlank from './FillBlank.jsx';
import ListenChoose from './ListenChoose.jsx';
import ListenType from './ListenType.jsx';
import TextQuestion from './TextQuestion.jsx';
import OrderParagraphs from './OrderParagraphs.jsx';
import Cloze from './Cloze.jsx';
import GapSentence from './GapSentence.jsx';
import Transform from './Transform.jsx';

const COMPONENTS = {
  multiple_choice: MultipleChoice,
  match_pairs: MatchPairs,
  build_sentence: BuildSentence,
  fill_blank: FillBlank,
  listen_choose: ListenChoose,
  listen_type: ListenType,
  reading: TextQuestion,
  dialogue: TextQuestion,
  listening: TextQuestion,
  order_paragraphs: OrderParagraphs,
  cloze: Cloze,
  // B2
  open_cloze: Cloze,
  word_form: Cloze,
  gap_sentence: GapSentence,
  transform: Transform,
};

export const isPlayable = (exercise) => Boolean(COMPONENTS[exercise.type]);

/**
 * Renders one exercise. The instruction is an i18n key chosen by the server (packs contain no UI text),
 * shown in the interface language. Types without a component (speak) show a placeholder with a skip button.
 */
export default function ExerciseRunner({ exercise, onSkip, result, ...props }) {
  const Component = COMPONENTS[exercise.type];
  if (!Component) {
    return (
      <div className="reserved" data-testid="exercise-reserved">
        <h2>{t('lesson.reservedTitle')}</h2>
        <p className="muted">{t('lesson.reservedText')}</p>
        <Button onClick={onSkip}>{t('lesson.skip')}</Button>
      </div>
    );
  }
  return (
    <section
      className="stack exercise"
      data-testid="exercise"
      data-type={exercise.type}
      data-exercise-id={exercise.id}
      data-result={result ? (result.correct ? 'correct' : 'wrong') : 'none'}
    >
      <h2 className="ex-prompt" data-testid="exercise-instruction">
        {t(exercise.instruction, { language: t(`languages.${props.track}`) })}
      </h2>
      <Component exercise={exercise} result={result} {...props} />
    </section>
  );
}
