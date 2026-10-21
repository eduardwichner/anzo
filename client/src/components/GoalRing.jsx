import { t } from '../i18n/index.js';

/** A ring that fills with today's XP towards the daily goal, around its children (the mascot). */
export default function GoalRing({ xp, goal, children }) {
  const percent = Math.min(100, Math.round((100 * xp) / goal));
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="goal-ring"
      data-testid="goal-ring"
      data-percent={percent}
      data-xp={xp}
      data-goal={goal}
      data-reached={String(xp >= goal)}
      role="img"
      aria-label={t('home.goalRingLabel', { xp, goal })}
    >
      <svg className="goal-ring-svg" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="goal-ring-track" cx="50" cy="50" r={r} />
        {percent > 0 && (
          <circle className="goal-ring-fill" cx="50" cy="50" r={r} strokeDasharray={`${(c * percent) / 100} ${c}`} transform="rotate(-90 50 50)" />
        )}
      </svg>
      <div className="goal-ring-inner">{children}</div>
    </div>
  );
}
