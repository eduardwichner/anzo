import { useEffect, useRef } from 'react';
import { loc, t } from '../i18n/index.js';
import { IconClose, IconStar } from '../icons/index.jsx';
import ProgressBar from './ProgressBar.jsx';
import { useSheetFocus } from '../lib/useSheetFocus.js';

/**
 * One manifest row of a level: CEFR, title, status badge and (available levels) the share of lessons done.
 * `children` render below the progress (the sheet's "Go here"). Used by the level sheet and the admin Levels page.
 */
export function LevelRow({ pack, progress, extras = null, optional = false, current = false, after = null, children }) {
  return (
    <div className={`level-row${pack.branch ? ' level-row--branch' : ''}`} data-testid="level-row" data-pack-id={pack.id} data-status={pack.status}
      data-current={String(current)} data-branch={String(Boolean(pack.branch))}>
      <span className="level-cefr">{pack.cefr}</span>
      <div className="level-main">
        <span className="level-head">
          <span className="level-title">{loc(pack.title)}</span>
          <span className={`badge badge--${pack.status}`} data-testid="level-badge">{t(`levels.${pack.status}`)}</span>
        </span>
        {optional && <span className="level-note" data-testid="level-optional">{t('levels.optional')}</span>}
        {pack.branch && (
          // an optional branch of the level before it (same level, another domain): never needed, open to everyone
          <span className="level-note level-note--branch" data-testid="level-branch">
            <span className="badge badge--branch">{t('levels.branch')}</span> {t('levels.branchOf', { level: after ? loc(after.title) : pack.after })}
          </span>
        )}
        {current && <span className="level-note level-note--here" data-testid="level-current">{t('levels.current')}</span>}
        {progress && (
          <>
            <ProgressBar small value={progress.done} max={progress.total} label={loc(pack.title)} />
            <span className="level-percent" data-testid="level-percent">{t('levels.percentDone', { n: progress.percent })}</span>
          </>
        )}
        {extras?.total > 0 && (
          // Extra oefening: optional, apart from the level's progress; a green star once any is done
          <span className={`level-extras${extras.done ? ' level-extras--done' : ''}`} data-testid="level-extras" data-done={extras.done} data-total={extras.total}>
            <IconStar aria-hidden="true" />
            {t('levels.extrasDone', { n: extras.done, total: extras.total })}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * Full-screen level overview over Home: every level of the child's track from the manifest (available, coming soon,
 * later), % done, "Go here" for available levels, ✕ back to the current lesson.
 *   rows: [{ pack (manifest row), progress?, optional, current }]
 */
export default function LevelSheet({ trackId, rows, onClose, onGo }) {
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dialogRef = useRef(null);
  useSheetFocus(dialogRef, { initialRef: closeRef, onClose: () => onCloseRef.current() });
  useEffect(() => {
    document.documentElement.classList.add('sheet-open');
    return () => document.documentElement.classList.remove('sheet-open');
  }, []);

  return (
    <div ref={dialogRef} className="sheet" role="dialog" aria-modal="true" aria-labelledby="level-sheet-title" data-testid="level-sheet">
      <div className="sheet-inner">
        <header className="topbar">
          <h1 id="level-sheet-title">{t('levels.title')}</h1>
          <button type="button" className="icon-btn" ref={closeRef} onClick={onClose} aria-label={t('levels.close')} data-testid="level-sheet-close">
            <IconClose />
          </button>
        </header>
        <p className="muted">{t(`languages.${trackId}`)}</p>
        <div className="track-block" data-testid="levels">
          {rows.map(({ pack, progress, extras, optional, current, after }) => (
            <LevelRow key={pack.id} pack={pack} progress={progress} extras={extras} optional={optional} current={current} after={after}>
              {pack.status === 'available' && progress && (
                <button type="button" className="btn btn--secondary btn--small level-go" data-testid="level-go" onClick={() => onGo(pack.id)}>
                  {t('levels.goHere')}
                </button>
              )}
            </LevelRow>
          ))}
        </div>
      </div>
    </div>
  );
}
