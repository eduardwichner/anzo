import { t } from '../i18n/index.js';

export const GOALS = [
  { xp: 20, key: 'calm' },
  { xp: 50, key: 'normal' },
  { xp: 100, key: 'fanatic' },
];

/** The three daily goals as big buttons (Home's first-time card and Settings). */
export default function GoalPicker({ value, onChange, testId = 'goal-picker' }) {
  return (
    <div className="goal-options" role="group" aria-label={t('goal.label')} data-testid={testId}>
      {GOALS.map((g) => (
        <button
          key={g.xp}
          type="button"
          className="goal-option"
          aria-pressed={value === g.xp}
          data-testid={`goal-${g.xp}`}
          onClick={() => onChange(g.xp)}
        >
          <span className="goal-option-name">{t(`goal.${g.key}`)}</span>
          <span className="goal-option-xp">{t('goal.xp', { n: g.xp })}</span>
        </button>
      ))}
    </div>
  );
}
