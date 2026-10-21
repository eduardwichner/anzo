import { memo, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconCheck, IconLock, IconStar, UnitIcon } from '../icons/index.jsx';
import { loc, t, useLang } from '../i18n/index.js';
import { unlock } from '../audio/player.js';
import { isBeforeStart, lessonStates } from '../lib/path.js';

// Horizontal offsets (in viewBox units, centre = 150) that make the lesson path wind.
const OFFSETS = [0, 55, 75, 45, -10, -60, -75, -45];
const VIEW_W = 300;
// Gaps leave room for a two-line label under a node plus the "Start" bubble above the next one.
const PACK_GAP = 120;
const UNIT_GAP = 124;
const LESSON_GAP = 160;

/** Lay out levels, units and lessons as positioned nodes along one winding path. */
function layout(packs, done, startPack) {
  const states = lessonStates(packs, done, startPack);
  const items = [];
  let y = 50;
  for (const pack of packs) {
    if (packs.length > 1) {
      items.push({ kind: 'pack', key: `pack-${pack.id}`, pack, optional: isBeforeStart(packs, pack.id, startPack), branch: Boolean(pack.branch), x: VIEW_W / 2, y });
      y += PACK_GAP;
    }
    for (const unit of pack.units) {
      items.push({ kind: 'unit', key: unit.id, unit, pack, x: VIEW_W / 2, y });
      y += UNIT_GAP;
      // a unit with two or more extra lessons numbers them: Extra oefening 1, Extra oefening 2
      const extras = unit.lessons.filter((l) => l.extra);
      unit.lessons.forEach((lesson, i) => {
        const extraN = lesson.extra && extras.length > 1 ? extras.indexOf(lesson) + 1 : null;
        items.push({ kind: 'lesson', key: lesson.id, lesson, extraN, state: states.get(lesson.id), x: VIEW_W / 2 + OFFSETS[i % OFFSETS.length], y });
        y += LESSON_GAP;
      });
    }
  }
  return { items, height: y - LESSON_GAP + 90 };
}

const LABEL_KEY = { done: 'home.lessonDone', current: 'home.lessonCurrent', locked: 'home.lessonLocked', optional: 'home.lessonOptional' };
const lessonTitle = (it) => (it.extraN ? t('home.extraNumbered', { title: loc(it.lesson.title), n: it.extraN }) : loc(it.lesson.title));

// Memoised: Home re-renders while scrolling (the level bar follows the unit in view); the path of ~300 nodes only when its
// data or the interface language change.
export default memo(function Track({ packs, done, startPack = null }) {
  useLang();
  const navigate = useNavigate();
  const ref = useRef(null);
  const { items, height } = useMemo(() => layout(packs, done, startPack), [packs, done, startPack]);

  // Open on the current lesson: the path can be hundreds of lessons long.
  useEffect(() => {
    const node = ref.current?.querySelector('[data-state="current"]');
    if (node) node.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, []);

  if (!items.length) return <p className="muted">{t('home.empty')}</p>;
  const d = items.filter((it) => it.kind !== 'pack').map((it, i) => `${i ? 'L' : 'M'}${it.x} ${it.y}`).join(' ');

  return (
    <div className="path" style={{ height }} data-testid="track-path" ref={ref}>
      <svg className="path-line" viewBox={`0 0 ${VIEW_W} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={d} vectorEffect="non-scaling-stroke" />
      </svg>
      <ol className="path-list">
        {items.map((it) => (
          <li key={it.key} className={`path-item path-item--${it.kind}${it.state === 'current' ? ' is-current' : ''}`} style={{ left: `${(100 * it.x) / VIEW_W}%`, top: it.y }}>
            {it.kind === 'pack' && (
              <div className={`pack-heading${it.branch ? ' pack-heading--branch' : ''}`} data-testid="pack-heading" data-pack-id={it.pack.id}
                data-optional={String(it.optional)} data-branch={String(it.branch)}>
                <span className="pack-heading-cefr">{it.pack.cefr}</span>
                <span className="pack-heading-title">{loc(it.pack.title)}</span>
                {it.optional && <span className="pack-heading-note">{t('home.optionalLevel')}</span>}
                {it.branch && <span className="pack-heading-note" data-testid="pack-heading-branch">{t('levels.branch')} · {t('home.branchLevel')}</span>}
              </div>
            )}
            {it.kind === 'unit' && (
              <div className="unit-node" data-testid="unit-node" data-unit-id={it.unit.id} data-pack-id={it.pack.id}>
                <span className="unit-icon"><UnitIcon name={it.unit.icon} /></span>
                <span>{loc(it.unit.title)}</span>
              </div>
            )}
            {it.kind === 'lesson' && (
              <>
                <button
                  type="button"
                  className="lesson-node"
                  data-testid="lesson-node"
                  data-lesson-id={it.lesson.id}
                  data-state={it.state}
                  data-extra={it.lesson.extra ? 'true' : undefined}
                  disabled={it.state === 'locked'}
                  aria-label={t(it.lesson.extra && it.state === 'done' ? 'home.lessonExtraDone' : LABEL_KEY[it.state], { title: lessonTitle(it) })}
                  onClick={() => {
                    unlock(); // inside the tap: lets the lesson play audio on iOS
                    navigate(`/lesson/${it.lesson.id}`);
                  }}
                >
                  {/* a finished Extra oefening keeps its star, now green with a small check: done, and still extra */}
                  {it.state === 'done' && !it.lesson.extra && <IconCheck />}
                  {it.state === 'done' && it.lesson.extra && <><IconStar /><span className="extra-check" aria-hidden="true"><IconCheck /></span></>}
                  {(it.state === 'current' || it.state === 'optional') && <IconStar />}
                  {it.state === 'locked' && <IconLock />}
                  {it.state === 'current' && <span className="start-bubble" aria-hidden="true">{t('home.start')}</span>}
                </button>
                <span className="lesson-label" data-state={it.state} data-extra={it.lesson.extra ? 'true' : undefined} aria-hidden="true">{lessonTitle(it)}</span>
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
});
