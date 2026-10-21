import { IconFlame } from '../icons/index.jsx';
import { t } from '../i18n/index.js';

export default function StreakFlame({ streak, activeToday }) {
  return (
    <span
      className="stat-pill stat-pill--streak"
      data-testid="streak"
      data-active={String(Boolean(activeToday))}
      aria-label={t('home.streakLabel', { n: streak })}
    >
      <IconFlame />
      <span>{streak}</span>
    </span>
  );
}
