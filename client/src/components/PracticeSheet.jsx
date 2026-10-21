import { useRef } from 'react';
import { t } from '../i18n/index.js';
import { IconClose } from '../icons/index.jsx';
import Button from './Button.jsx';
import { useSheetFocus } from '../lib/useSheetFocus.js';

/**
 * Bottom sheet over Home: start spaced practice ("Herhalen": due words, or recent lessons when all caught up) or
 * "Mijn fouten". Before the first lesson it only explains that practice unlocks after it.
 *   summary: { unlocked, due, mistakes }; onStart(mode) runs inside the tap (audio unlock).
 */
export default function PracticeSheet({ summary, onStart, onClose }) {
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dialogRef = useRef(null);
  useSheetFocus(dialogRef, { initialRef: closeRef, onClose: () => onCloseRef.current() });

  return (
    <div className="bottom-sheet-backdrop" onClick={onClose} data-testid="practice-sheet-backdrop">
      <div ref={dialogRef} className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="practice-sheet-title" data-testid="practice-sheet"
        onClick={(e) => e.stopPropagation()}>
        <header className="topbar">
          <h1 id="practice-sheet-title">{t('practice.sheetTitle')}</h1>
          <button type="button" className="icon-btn" ref={closeRef} onClick={onClose} aria-label={t('practice.close')} data-testid="practice-sheet-close">
            <IconClose />
          </button>
        </header>
        {!summary.unlocked ? (
          <section className="practice-option" data-testid="practice-locked">
            <h2>{t('practice.lockedTitle')}</h2>
            <p className="muted">{t('practice.locked')}</p>
          </section>
        ) : (
          <>
            <section className="practice-option" data-testid="practice-option-due">
              <h2>{summary.due ? t('practice.dueTitle') : t('practice.caughtUp')}</h2>
              <p className="muted">
                {summary.due === 1 ? t('practice.dueTextOne') : summary.due ? t('practice.dueText', { n: summary.due }) : t('practice.caughtUpText')}
              </p>
              <Button block size="big" data-testid="practice-start-due" onClick={() => onStart('due')}>{t('practice.start')}</Button>
            </section>
            <section className="practice-option" data-testid="practice-option-mistakes">
              <h2>{t('practice.mistakesTitle')}</h2>
              <p className="muted">
                {summary.mistakes === 1 ? t('practice.mistakesTextOne') : summary.mistakes ? t('practice.mistakesText', { n: summary.mistakes }) : t('practice.mistakesNone')}
              </p>
              <Button block variant="secondary" disabled={!summary.mistakes} data-testid="practice-start-mistakes" onClick={() => onStart('mistakes')}>
                {t('practice.start')}
              </Button>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
