import { IconStar } from '../icons/index.jsx';
import { t } from '../i18n/index.js';

export default function XpBadge({ xp }) {
  return (
    <span className="stat-pill stat-pill--xp" data-testid="xp" aria-label={t('home.xpLabel', { n: xp })}>
      <IconStar />
      <span>{xp}</span>
    </span>
  );
}
