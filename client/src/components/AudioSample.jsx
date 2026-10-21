import { useCallback, useEffect, useState } from 'react';
import { getAudioSample, voteAudioSample } from '../api/ops.js';
import { t } from '../i18n/index.js';
import SpeakerButton from './SpeakerButton.jsx';

const slowOf = (speed) => speed.endsWith('slow');

/** One row: the text, ▶ Old (in use) and ▶ New (made, not in use), what the check noticed, the three choices and a note. */
function SampleRow({ row, onVote }) {
  const [note, setNote] = useState(row.note ?? '');
  const [busy, setBusy] = useState(false);
  const vote = async (v) => {
    setBusy(true);
    try {
      await onVote(row.id, { vote: v, note: note.trim() || null });
    } finally {
      setBusy(false);
    }
  };
  const flags = (list) => (list.length ? t('ops.rerecord.flags', { flags: list.join(', ') }) : t('ops.rerecord.noFlags'));
  return (
    <li className="stack sample-row" data-testid="sample-row" data-row={row.id} data-vote={row.vote ?? 'none'}>
      <p className="sample-text" lang={row.track}>{row.text}</p>
      <p className="muted small">{t(`languages.${row.track}`)} · {t(`listen.speed.${slowOf(row.speed) ? 'slow' : 'normal'}`)}</p>
      <div className="rerecord-compare">
        <div className="rerecord-take">
          <SpeakerButton url={row.oldUrl} slow={slowOf(row.speed)} testId="sample-old" label={t('ops.rerecord.playOld')} />
          <span>{t('ops.rerecord.old')}</span>
          <span className="small muted">{flags(row.flagsOld)}</span>
        </div>
        <div className="rerecord-take">
          <SpeakerButton url={row.newUrl} slow={slowOf(row.speed)} testId="sample-new" label={t('ops.rerecord.playNew')} />
          <span>{t('ops.rerecord.new')}</span>
          <span className="small muted">{flags(row.flagsNew)}</span>
        </div>
      </div>
      <label className="field">
        <span className="small">{t('listen.note')}</span>
        <input type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} data-testid="sample-note" />
      </label>
      <div className="row wrap" role="group" aria-label={t('sample.choose')}>
        {[['new', 'ops.rerecord.keepNew'], ['old', 'ops.rerecord.keepOld'], ['neither', 'ops.rerecord.neither']].map(([v, key]) => (
          <button key={v} type="button" className={`btn btn--small ${row.vote === v ? '' : 'btn--secondary'}`} aria-pressed={row.vote === v}
            disabled={busy} data-testid={`sample-vote-${v}`} onClick={() => vote(v)}>
            {t(key)}
          </button>
        ))}
      </div>
    </li>
  );
}

/**
 * Admin → Listen check → *Before release*: a sample of new recordings to hear next to the ones in use before a
 * change is released. Shown only while an authoring session has put a sample in place; the votes are kept for that session.
 */
export default function AudioSample() {
  const [sample, setSample] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => getAudioSample().then((r) => setSample(r.sample)).catch(() => setError(t('app.error'))), []);
  useEffect(() => {
    load();
  }, [load]);
  if (!sample) return error ? <p className="form-error" role="alert">{error}</p> : null;
  const onVote = async (rowId, body) => {
    setError(null);
    try {
      setSample((await voteAudioSample(rowId, body)).sample);
    } catch {
      setError(t('app.error'));
    }
  };
  return (
    <section className="card stack" data-testid="audio-sample" data-sample={sample.name}>
      <h2>{t('sample.title')}</h2>
      <p>{t('sample.intro')}</p>
      {sample.about && <p className="small muted">{sample.about}</p>}
      <p className="small" data-testid="sample-progress">{t('sample.progress', { voted: sample.voted, total: sample.rows.length })}</p>
      {sample.voted === sample.rows.length && <p className="notice notice--green" data-testid="sample-done">{t('sample.done')}</p>}
      <ol className="stack sample-rows">
        {sample.rows.map((row) => <SampleRow key={row.id} row={row} onVote={onVote} />)}
      </ol>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
