import { loc, t } from '../i18n/index.js';
import { IconChevron } from '../icons/index.jsx';

/** "Starters · Pre-A1"; a level whose title is its CEFR code ("A1.1") is named once. */
export function levelName(pack) {
  const title = loc(pack.title);
  return title === pack.cefr ? title : `${title} · ${pack.cefr}`;
}

/** Small progress ring (lessons done of a level). Decorative: the bar's label says the percentage. */
export function ProgressRing({ percent, size = 40 }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <circle className="ring-track" cx="18" cy="18" r={r} />
      {percent > 0 && <circle className="ring-fill" cx="18" cy="18" r={r} strokeDasharray={`${(c * percent) / 100} ${c}`} transform="rotate(-90 18 18)" />}
      <text x="18" y="18" className="ring-text" dominantBaseline="central" textAnchor="middle">{percent}</text>
    </svg>
  );
}

/**
 * Sticky bar at the top of the Home path: the level and unit in view and the level's progress. Tapping it opens
 * the level overview.
 */
export default function LevelBar({ pack, unit, percent, onOpen }) {
  return (
    <button
      type="button"
      className="level-bar"
      data-testid="level-bar"
      data-pack-id={pack.id}
      data-unit-id={unit?.id ?? ''}
      onClick={onOpen}
      aria-label={t('home.levelBarLabel', { level: levelName(pack), unit: unit ? loc(unit.title) : '', n: percent })}
    >
      <ProgressRing percent={percent} />
      <span className="level-bar-text">
        <span className="level-bar-level" data-testid="level-bar-level">{levelName(pack)}</span>
        <span className="level-bar-unit" data-testid="level-bar-unit">{unit ? loc(unit.title) : ''}</span>
      </span>
      <IconChevron className="level-bar-chevron" />
    </button>
  );
}
