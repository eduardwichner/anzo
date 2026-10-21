import { useEffect, useRef, useState } from 'react';
import { sendReport } from '../api/ops.js';
import { t } from '../i18n/index.js';
import { IconClose } from '../icons/index.jsx';
import Button from './Button.jsx';
import { useSheetFocus } from '../lib/useSheetFocus.js';

const REASONS = ['native', 'target', 'audio', 'other'];
export const NOTE_MAX = 200;

/**
 * The child's 🚩 report sheet (only reachable after checking an exercise). An optional short note, then one tap on a
 * reason sends it. After sending: "Bedankt! 🙂" and the sheet closes by itself.
 */
export default function ReportSheet({ exerciseId, track, nativeLang = 'nl', onClose, onSent }) {
  const [note, setNote] = useState('');
  const [state, setState] = useState('open'); // open | sending | sent | error | limit
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dialogRef = useRef(null);
  useSheetFocus(dialogRef, { initialRef: closeRef, onClose: () => onCloseRef.current() });
  useEffect(() => {
    if (state !== 'sent') return undefined;
    const timer = setTimeout(() => onCloseRef.current(), 1800);
    return () => clearTimeout(timer);
  }, [state]);

  const send = async (reason) => {
    setState('sending');
    try {
      await sendReport({ exerciseId, reason, note });
      setState('sent');
      onSent?.();
    } catch (e) {
      setState(e.status === 429 ? 'limit' : 'error');
    }
  };

  return (
    <div className="bottom-sheet-backdrop" onClick={onClose} data-testid="report-sheet-backdrop">
      <div ref={dialogRef} className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="report-sheet-title" data-testid="report-sheet"
        onClick={(e) => e.stopPropagation()}>
        <header className="topbar">
          <h1 id="report-sheet-title">{t('report.title')}</h1>
          <button type="button" className="icon-btn" ref={closeRef} onClick={onClose} aria-label={t('report.close')} data-testid="report-close">
            <IconClose />
          </button>
        </header>
        {state === 'sent' ? (
          <p className="report-thanks" role="status" data-testid="report-thanks">{t('report.thanks')}</p>
        ) : (
          <div className="stack">
            <label className="field">
              <span className="field-label">{t('report.note')}</span>
              <textarea className="input textarea" rows={2} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} data-testid="report-note" />
            </label>
            <p className="muted">{t('report.pick')}</p>
            <div className="report-reasons">
              {REASONS.map((r) => (
                <Button key={r} block size="big" variant="secondary" disabled={state === 'sending'} onClick={() => send(r)} data-testid={`report-reason-${r}`}>
                  {t(`report.reason.${r}`, { language: t(`languages.${track}`), native: t(`nativeLanguages.${nativeLang}`) })}
                </Button>
              ))}
            </div>
            {state === 'error' && <p className="form-error" role="alert">{t('report.failed')}</p>}
            {state === 'limit' && <p className="form-error" role="alert" data-testid="report-limit">{t('report.limit')}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
