import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/index.js';
import { IconClose } from '../icons/index.jsx';
import Flag from './Flag.jsx';
import ProgressBar from './ProgressBar.jsx';
import { useSheetFocus } from '../lib/useSheetFocus.js';

/**
 * Bottom sheet over Home (the flag chip): the learner's courses with their progress — tap one to switch — and
 * "+ Add a course" with the courses offered for their native language. Removing a course only hides it (progress kept).
 *   data: GET /api/courses { active, courses: [{ track, progress, xp }], offered: [{ track, restore }], canSelfEnroll }
 *   onSwitch(track), onAdd(track), onRemove(track): async; the sheet shows `busy` while one runs.
 */
export default function CourseSheet({ data, onSwitch, onAdd, onRemove, onClose }) {
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const removingRef = useRef(removing);
  removingRef.current = removing;
  // Escape closes an open confirmation first, then the sheet
  useSheetFocus(dialogRef, { initialRef: closeRef, onClose: () => (removingRef.current ? setRemoving(null) : onCloseRef.current()) });
  // focus goes into the confirmation when it opens, and back into the sheet (never the page) when a choice removed its button
  useEffect(() => {
    if (removing) cancelRef.current?.focus();
    else if (!dialogRef.current?.contains(document.activeElement)) closeRef.current?.focus();
  }, [removing, adding, busy]);

  const run = (fn) => async () => {
    setBusy(true);
    setError(false);
    try {
      await fn();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bottom-sheet-backdrop" onClick={onClose} data-testid="course-sheet-backdrop">
      <div ref={dialogRef} className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="course-sheet-title" data-testid="course-sheet"
        onClick={(e) => e.stopPropagation()}>
        <header className="topbar">
          <h1 id="course-sheet-title">{t('courses.title')}</h1>
          <button type="button" className="icon-btn" ref={closeRef} onClick={onClose} aria-label={t('courses.close')} data-testid="course-sheet-close">
            <IconClose />
          </button>
        </header>

        <ul className="course-list" data-testid="course-list">
          {data.courses.map((c) => {
            const active = c.track === data.active;
            return (
              <li key={c.track} className="course-item" data-testid="course-item" data-track={c.track} data-active={String(active)}>
                <button type="button" className="course-pick" aria-current={active ? 'true' : undefined} disabled={busy}
                  data-testid={`course-switch-${c.track}`} onClick={active ? onClose : run(() => onSwitch(c.track))}>
                  <Flag track={c.track} target={c.target} className="flag flag--big" />
                  <span className="course-main">
                    <span className="course-name-row">
                      <span className="course-name">{t(`languages.${c.track}`)}</span>
                      {active && <span className="badge badge--available">{t('courses.active')}</span>}
                    </span>
                    <ProgressBar small value={c.progress.lessonsDone} max={c.progress.lessonsTotal} label={t(`languages.${c.track}`)} />
                    <span className="course-sub">{t('courses.progress', { n: c.progress.percent, xp: c.xp })}</span>
                  </span>
                </button>
                {data.canSelfEnroll && (removing === c.track ? (
                  <div className="confirm-box" role="alertdialog" aria-label={t('courses.removeTitle', { language: t(`languages.${c.track}`) })} data-testid="course-remove-confirm">
                    <p>{t('courses.removeText', { language: t(`languages.${c.track}`) })}</p>
                    <div className="row row--end">
                      <button type="button" ref={cancelRef} className="btn btn--secondary btn--small" onClick={() => setRemoving(null)}>{t('app.cancel')}</button>
                      <button type="button" className="btn btn--danger btn--small" disabled={busy} data-testid="course-remove-yes"
                        onClick={run(async () => { await onRemove(c.track); setRemoving(null); })}>{t('courses.remove')}</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="link-btn course-remove" data-testid={`course-remove-${c.track}`} onClick={() => setRemoving(c.track)}>
                    {t('courses.remove')}
                  </button>
                ))}
              </li>
            );
          })}
        </ul>

        {data.canSelfEnroll && data.offered.length > 0 && (adding ? (
          <section className="stack" data-testid="course-add-list">
            <h2>{t('courses.addTitle')}</h2>
            <ul className="course-list">
              {data.offered.map((c) => (
                <li key={c.track} className="course-item">
                  <button type="button" className="course-pick" disabled={busy} data-testid={`course-add-${c.track}`} onClick={run(() => onAdd(c.track))}>
                    <Flag track={c.track} target={c.target} className="flag flag--big" />
                    <span className="course-main">
                      <span className="course-name">{t(`languages.${c.track}`)}</span>
                      <span className="course-sub">{c.restore ? t('courses.restore') : t('courses.new')}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <button type="button" className="btn btn--secondary btn--block" data-testid="course-add" onClick={() => setAdding(true)}>
            {t('courses.add')}
          </button>
        ))}
        {data.soon?.length > 0 && (
          <section className="stack" data-testid="course-soon">
            <h2>{t('courses.soonTitle')}</h2>
            <ul className="course-list">
              {data.soon.map((c) => (
                <li key={c.track} className="course-item course-item--soon" data-testid="course-soon-item" data-track={c.track}>
                  <div className="course-pick" aria-disabled="true">
                    <Flag track={c.track} target={c.target} className="flag flag--big" />
                    <span className="course-main">
                      <span className="course-name">{t(`languages.${c.track}`)}</span>
                      <span className="course-sub">{t('levels.planned')}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {data.offered.length === 0 && data.courses.length > 0 && <p className="muted" data-testid="course-none-offered">{t('courses.noneOffered')}</p>}
        {!data.canSelfEnroll && data.courses.length === 0 && <p className="muted">{t('courses.askAdmin')}</p>}
        {error && <p className="form-error" role="alert">{t('app.error')}</p>}
      </div>
    </div>
  );
}
