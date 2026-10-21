import { useCallback, useEffect, useState } from 'react';
import { getListen, postListen } from '../api/ops.js';
import { t } from '../i18n/index.js';
import { play, unlock } from '../audio/player.js';
import TopBar from '../components/TopBar.jsx';
import AudioQuality, { upperText } from '../components/AudioQuality.jsx';
import AudioSample from '../components/AudioSample.jsx';
import HowItWorks from '../components/HowItWorks.jsx';
import RerecordPanel from '../components/RerecordPanel.jsx';
import SpeakerButton from '../components/SpeakerButton.jsx';
import { Loading, LoadError } from '../components/Loading.jsx';
import { IconSpeaker } from '../icons/index.jsx';

const REASONS = ['babble', 'cut-off', 'wrong-word', 'wrong-pronunciation', 'other'];
const HOW_PARTS = ['what', 'picked', 'verdict', 'bad', 'pronunciation', 'machine', 'table', 'later'];
const speedClass = (speed) => (speed.endsWith('slow') ? 'slow' : 'normal');

/**
 * A clip of the fix queue: what was heard (the reason and the note), ▶, *Heard OK now* (an OK verdict for this very file, no new
 * take) and Record again (mounted only when opened: one request per opened clip). `onChange(state)`: the page's new state.
 */
function WaitingClip({ c, onChange, reload }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const heardOk = async () => {
    setBusy(true);
    setError(null);
    try {
      onChange(await postListen({ file: c.file, verdict: 'ok' }));
    } catch {
      setError(t('app.error'));
      setBusy(false);
    }
  };
  return (
    <li data-testid="listen-waiting-clip" data-file={c.file}>
      <details onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          <span lang={c.track}>{c.text}</span> · {t(`languages.${c.track}`)} · {t(`listen.speed.${speedClass(c.speed)}`)}
          {c.reason ? ` · ${t(`listen.reason.${c.reason}`)}` : ''}
        </summary>
        {c.note && <p className="small" data-testid="listen-waiting-note">{t('listen.noteSaid')} <q className="rerecord-note">{c.note}</q></p>}
        {c.reason === 'wrong-pronunciation' && <p className="small notice" data-testid="listen-needs-lexicon">{t('listen.needsLexicon')}</p>}
        <div className="row wrap">
          <SpeakerButton url={c.url} slow={speedClass(c.speed) === 'slow'} testId="listen-waiting-play" />
          <button type="button" className="btn btn--small btn--secondary" data-testid="listen-heard-ok" disabled={busy} onClick={heardOk}>
            {t('listen.heardOkNow')}
          </button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {open && <RerecordPanel clips={[{ url: c.url, slow: speedClass(c.speed) === 'slow' }]} verdict={{ reason: c.reason, note: c.note }}
          fromQueue onDecided={reload} />}
      </details>
    </li>
  );
}
// Admin → Listen check: the Audio quality table, then one clip of the live audio at
// a time — OK or Bad — then the fix queue (Record again on each Bad clip) and per stratum how many were heard, how many were
// bad and the 95 % upper bound on the error rate. Resumes by itself: only the verdicts are kept.
export default function ListenCheck() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [bad, setBad] = useState(false); // choosing a reason for Bad
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setFailed(false);
    getListen().then(setData).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const clip = data?.next ?? null;
  // a fix-queue action reloads the state and may put another clip on top: the Bad form starts again
  const clipFile = clip?.file ?? null;
  useEffect(() => {
    setBad(false);
    setReason(null);
    setNote('');
  }, [clipFile]);
  const listen = () => {
    unlock();
    play(clip.url);
  };
  const judge = async (verdict) => {
    unlock(); // the tap is a gesture: the next clip may play on its own
    setBusy(true);
    setError(null);
    try {
      const next = await postListen({ file: clip.file, verdict, ...(verdict === 'bad' ? { reason, note: note.trim() || null } : {}) });
      setData(next);
      setBad(false);
      setReason(null);
      setNote('');
      if (next.next) play(next.next.url).catch(() => {}); // a blocked autoplay: the ▶ button stays
    } catch {
      setError(t('app.error'));
    } finally {
      setBusy(false);
    }
  };

  if (failed) return <LoadError onRetry={load} />;
  if (!data) return <Loading />;

  const tracks = [...new Set(data.strata.map((s) => s.track))];
  return (
    <main className="page page--wide" data-testid="listen-check">
      <TopBar title={t('listen.title')} backTo="/admin" />
      <section className="card stack">
        <p>{t('listen.intro')}</p>
        <HowItWorks prefix="listen.how" parts={HOW_PARTS} />
      </section>

      <AudioSample />

      <AudioQuality quality={data.quality} />

      {clip ? (
        <section className="card stack listen-clip" data-testid="listen-clip" data-file={clip.file} data-again={clip.again ? 'yes' : 'no'}>
          {clip.again && <p className="notice small" data-testid="listen-again">{t('listen.again')}</p>}
          <p className="listen-text" lang={clip.track}>{clip.text}</p>
          <p className="muted small">
            {t(`languages.${clip.track}`)} · {t(`listen.kind.${clip.kind}`)} · {t(`listen.speed.${clip.speed.endsWith('slow') ? 'slow' : 'normal'}`)}
          </p>
          <button type="button" className="btn btn--secondary listen-play" data-testid="listen-play" onClick={listen}>
            <IconSpeaker /> {t('listen.play')}
          </button>
          {error && <p className="form-error" role="alert">{error}</p>}
          {!bad ? (
            <div className="listen-verdict">
              <button type="button" className="btn" data-testid="listen-ok" disabled={busy} onClick={() => judge('ok')}>{t('listen.ok')}</button>
              <button type="button" className="btn btn--danger" data-testid="listen-bad" disabled={busy} onClick={() => setBad(true)}>{t('listen.bad')}</button>
            </div>
          ) : (
            <div className="stack" data-testid="listen-bad-form">
              <p className="small">{t('listen.whatWrong')}</p>
              <div className="lab-filters" role="group" aria-label={t('listen.whatWrong')}>
                {REASONS.map((r) => (
                  <button key={r} type="button" className="chip-btn" aria-pressed={reason === r} data-testid={`listen-reason-${r}`}
                    onClick={() => setReason(reason === r ? null : r)}>
                    {t(`listen.reason.${r}`)}
                  </button>
                ))}
              </div>
              <label className="field">
                <span className="small">{t('listen.note')}</span>
                <input type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} data-testid="listen-note" />
              </label>
              <div className="listen-verdict">
                <button type="button" className="btn btn--danger" data-testid="listen-save-bad" disabled={busy} onClick={() => judge('bad')}>{t('listen.saveBad')}</button>
                <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => { setBad(false); setReason(null); setNote(''); }}>{t('listen.cancel')}</button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <p className="notice" data-testid="listen-done">{t('listen.done')}</p>
      )}

      <section className="card stack" data-testid="listen-queue">
        <h2>{t('listen.queueTitle')}</h2>
        <p className="small">{t('listen.queue', data.queue)}</p>
        {data.queue.waitingClips.length > 0 && (
          <>
            <p className="muted small">{t('listen.queueAbout')}</p>
            <ul className="small listen-waiting">
              {data.queue.waitingClips.map((c) => <WaitingClip key={`${c.track}|${c.speed}|${c.text}|${c.file}`} c={c} onChange={setData} reload={load} />)}
            </ul>
          </>
        )}
      </section>

      <section className="card stack" data-testid="listen-stats">
        <h2>{t('listen.statsTitle')}</h2>
        <p className="muted small">{t('listen.statsAbout')}</p>
        {tracks.map((tr) => (
          <details key={tr} className="report-table-toggle" data-testid="listen-stats-track" data-track={tr}>
            <summary>{t(`languages.${tr}`)}</summary>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>{t('listen.col.stratum')}</th><th className="num">{t('listen.col.heard')}</th><th className="num">{t('listen.col.bad')}</th><th className="num">{t('listen.col.upper')}</th></tr>
                </thead>
                <tbody>
                  {data.strata.filter((s) => s.track === tr).map((s) => (
                    <tr key={s.key} data-testid="listen-stratum" data-key={s.key}>
                      <td>{t(`listen.kind.${s.kind}`)} · {t(`listen.speed.${s.speed}`)}</td>
                      <td className="num">{t('listen.heardOf', { heard: s.heard, clips: s.clips })}</td>
                      <td className="num">{s.bad}</td>
                      <td className="num">
                        {upperText(s.upper)}
                        {s.mayBeBad !== null && <span className="muted small listen-maybe">{t('listen.mayBeBad', { n: s.mayBeBad })}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </section>

    </main>
  );
}
