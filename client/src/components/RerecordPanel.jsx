import { useCallback, useEffect, useState } from 'react';
import { decideRerecord, getRerecords, requestRerecord } from '../api/ops.js';
import { t } from '../i18n/index.js';
import Button from './Button.jsx';
import SpeakerButton from './SpeakerButton.jsx';

const fileOf = (url) => (url ? url.replace(/^\/audio\//, '') : null);
const BUSY = ['making', 'keeping', 'dropping'];

/**
 * "Record again" for the clips of one word or sentence (normal and slow): the content job makes a new take with
 * today's method and checks it; the admin hears ▶ Old (the file in use) and ▶ New (the take) and chooses: Keep new, Keep old,
 * or Neither — try again (the take goes, the old file stays; in the Listen check the clip stays in the fix queue, while Keep
 * old marks the old file heard OK). Used by Admin → Inbox (audio reports), the correction page and the Listen check's fix
 * queue. `clips`: [{ url, slow }]; `reportExercise`: the reported exercise, if any; `verdict`: the Bad verdict ({ reason,
 * note }) that put the clip in the fix queue; `fromQueue`: opened from the fix queue; `onDecided`: after a decision.
 */
export default function RerecordPanel({ clips, reportExercise = null, verdict = null, fromQueue = false, onDecided = null }) {
  const files = clips.map((c) => fileOf(c.url)).filter(Boolean);
  const key = files.join(',');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!key) return Promise.resolve();
    return getRerecords(key.split(',')).then((r) => setRows(r.rerecords)).catch(() => setError(t('ops.rerecord.failed')));
  }, [key]);
  useEffect(() => {
    load();
  }, [load]);
  // while the job works, ask again every few seconds
  const working = rows?.some((r) => BUSY.includes(r.status));
  useEffect(() => {
    if (!working) return undefined;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [working, load]);

  if (!files.length) return null;
  const act = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      onDecided?.();
    } catch {
      setError(t('ops.rerecord.failed'));
    } finally {
      setBusy(false);
    }
  };
  // the latest request per clip (normal / slow)
  const latest = (c) => rows?.find((r) => r.oldFile === fileOf(c.url) || r.newFile === fileOf(c.url)) ?? null;

  return (
    <div className="card stack inset rerecord" data-testid="rerecord">
      <p className="small muted">{t('ops.rerecord.intro')}</p>
      {verdict && (
        <p className="small" data-testid="rerecord-verdict">
          {t('ops.rerecord.heardBad', { reason: verdict.reason ? t(`listen.reason.${verdict.reason}`) : t('ops.rerecord.noReason') })}
          {verdict.note && <> <q className="rerecord-note" data-testid="rerecord-verdict-note">{verdict.note}</q></>}
        </p>
      )}
      {clips.filter((c) => c.url).map((c) => {
        const r = latest(c);
        const open = r && (BUSY.includes(r.status) || r.status === 'review');
        const speed = t(c.slow ? 'ops.rerecord.slow' : 'ops.rerecord.normal');
        return (
          <div key={c.url} className="stack rerecord-clip" data-testid="rerecord-clip" data-speed={c.slow ? 'slow' : 'normal'} data-status={r?.status ?? 'none'}>
            <div className="row wrap">
              <strong>{speed}</strong>
              {!open && (
                <Button size="small" variant="secondary" disabled={busy} data-testid="rerecord-start"
                  onClick={() => act(() => requestRerecord({ file: fileOf(c.url), ...(reportExercise ? { reportExercise } : {}) }))}>
                  {t('ops.rerecord.start')}
                </Button>
              )}
              {r && <span className="small muted" data-testid="rerecord-status">{t(`ops.rerecord.status.${r.status}`)}</span>}
            </div>
            {r?.status === 'review' && (
              <div className="stack" data-testid="rerecord-review">
                <div className="rerecord-compare">
                  <div className="rerecord-take">
                    <SpeakerButton url={r.oldUrl} slow={c.slow} testId="rerecord-old" label={t('ops.rerecord.playOld')} />
                    <span>{t('ops.rerecord.old')}</span>
                    <span className="small muted">{r.flagsOld.length ? t('ops.rerecord.flags', { flags: r.flagsOld.join(', ') }) : t('ops.rerecord.noFlags')}</span>
                  </div>
                  <div className="rerecord-take">
                    <SpeakerButton url={r.newUrl} slow={c.slow} testId="rerecord-new" label={t('ops.rerecord.playNew')} />
                    <span>{t('ops.rerecord.new')}</span>
                    <span className="small muted">{r.flagsNew.length ? t('ops.rerecord.flags', { flags: r.flagsNew.join(', ') }) : t('ops.rerecord.noFlags')}</span>
                  </div>
                </div>
                <div className="row wrap">
                  <Button size="small" variant="success" disabled={busy} data-testid="rerecord-keep" onClick={() => act(() => decideRerecord(r.id, 'keep'))}>
                    {t('ops.rerecord.keepNew')}
                  </Button>
                  <Button size="small" variant="secondary" disabled={busy} data-testid="rerecord-drop"
                    onClick={() => act(() => decideRerecord(r.id, 'drop', fromQueue ? { heardOk: true } : {}))}>
                    {t('ops.rerecord.keepOld')}
                  </Button>
                  <Button size="small" variant="secondary" disabled={busy} data-testid="rerecord-neither" onClick={() => act(() => decideRerecord(r.id, 'drop'))}>
                    {t('ops.rerecord.neither')}
                  </Button>
                </div>
              </div>
            )}
            {r?.reason && ['failed', 'review', 'kept'].includes(r.status) && <p className="small" data-testid="rerecord-reason">{r.reason}</p>}
          </div>
        );
      })}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
