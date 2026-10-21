import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getAudioQuality, listCorrections, searchContent, undoCorrection } from '../api/ops.js';
import { t } from '../i18n/index.js';
import { courseLabel } from '../lib/courseLabel.js';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import SpeakerButton from '../components/SpeakerButton.jsx';
import { Loading, LoadError } from '../components/Loading.jsx';
import HowItWorks from '../components/HowItWorks.jsx';
import { AudioQualityLine } from '../components/AudioQuality.jsx';
import { IconChevron } from '../icons/index.jsx';
import { dateTime } from '../lib/dates.js';

// Admin → Corrections: find a word or sentence (both languages, Dutch meaning, item or exercise id) and open it to
// correct it; the History tab lists every correction with its status, and undoes applied ones. On top: how it works, and the
// Audio quality numbers in one line (the table is in Admin → Listen check).
const HOW_PARTS = ['what', 'job', 'audio', 'undo', 'reports', 'limits'];
export default function Corrections() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'history' ? 'history' : 'search';
  const [quality, setQuality] = useState(null);
  useEffect(() => {
    getAudioQuality().then(setQuality).catch(() => setQuality(null));
  }, []);
  return (
    <main className="page page--wide" data-testid="corrections">
      <TopBar title={t('ops.corrections.title')} backTo="/admin" />
      <HowItWorks prefix="ops.corrections.how" parts={HOW_PARTS} />
      {quality && <AudioQualityLine quality={quality} />}
      <div className="tabs" role="tablist">
        {['search', 'history'].map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' is-active' : ''}`}
            data-testid={`corrections-tab-${k}`} onClick={() => setParams(k === 'history' ? { tab: 'history' } : {}, { replace: true })}>
            {t(`ops.corrections.tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'search' ? <Search initial={params.get('q') ?? ''} /> : <History highlight={Number(params.get('id')) || null} />}
    </main>
  );
}

function Search({ initial }) {
  const [q, setQ] = useState(initial);
  const [result, setResult] = useState(null);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setResult(null);
      return undefined;
    }
    const n = ++seq.current;
    const timer = setTimeout(() => {
      searchContent(query).then((r) => n === seq.current && (setResult(r), setFailed(false))).catch(() => setFailed(true));
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const empty = result && !result.vocabulary.length && !result.sentences.length;
  return (
    <section className="stack">
      <p className="muted">{t('ops.corrections.intro')}</p>
      <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus
        placeholder={t('ops.corrections.searchPlaceholder')} aria-label={t('ops.corrections.searchPlaceholder')} data-testid="corrections-search" />
      {failed && <p className="form-error">{t('ops.loadFailed')}</p>}
      {empty && <p className="muted" data-testid="corrections-none">{t('ops.corrections.none')}</p>}
      {result?.exercise && (
        <p className="muted">{t('ops.corrections.exerciseHit', { id: result.exercise.id, lesson: result.exercise.lessonTitle })}</p>
      )}
      {result && ['vocabulary', 'sentences'].map((kind) => result[kind].length > 0 && (
        <section key={kind} className="card stack" data-testid={`corrections-${kind}`}>
          <h2>{t(`ops.corrections.${kind}`)}</h2>
          <ul className="result-list">
            {result[kind].map((it) => (
              <li key={it.id} className="result-row">
                <SpeakerButton url={it.audio} />
                <Link to={`/admin/corrections/item/${encodeURIComponent(it.id)}`} className="result-link" data-testid={`corrections-item-${it.id}`}>
                  <span className="result-main"><span lang={it.targetLang}>{it.target}</span> <span className="muted" lang={it.nativeLang}>— {it.native}</span></span>
                  <span className="result-meta">
                    {t('ops.corrections.where', { language: courseLabel(it), level: it.level, unit: it.unitTitle })}
                    {' · '}{t('ops.corrections.usedIn', { n: it.exercises.length })}
                  </span>
                </Link>
                <IconChevron className="user-row-chevron" width="20" height="20" />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}

const STATUS_CLASS = { queued: 'pill--wait', running: 'pill--wait', applied: 'pill--ok', rejected: 'pill--bad', undone: 'pill--muted' };

export function statusOf(c) {
  return c.status === 'applied' && c.undoneBy ? 'undone' : c.status;
}

function History({ highlight }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const load = useCallback(() => listCorrections().then((r) => (setData(r), setFailed(false))).catch(() => setFailed(true)), []);
  useEffect(() => {
    load();
  }, [load]);
  // While anything is waiting or running, refresh every 3 s.
  const pending = data?.corrections.some((c) => c.status === 'queued' || c.status === 'running');
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [pending, load]);

  if (failed && !data) return <LoadError onRetry={load} />;
  if (!data) return <Loading />;
  const undo = async (id) => {
    setBusy(true);
    setError(null);
    try {
      await undoCorrection(id);
      setConfirm(null);
      await load();
    } catch {
      setError(t('ops.corrections.undoFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="stack" data-testid="corrections-history">
      {data.queue.queued > 0 && <p className="notice" data-testid="corrections-queue">{t('ops.corrections.queueLine', { n: data.queue.queued })}</p>}
      {!data.corrections.length && <p className="muted">{t('ops.corrections.noHistory')}</p>}
      {data.corrections.map((c) => {
        const status = statusOf(c);
        return (
          <article key={c.id} className={`card stack correction${c.id === highlight ? ' is-highlight' : ''}`} data-testid={`correction-${c.id}`} data-status={status}>
            <div className="correction-head">
              <span className={`pill ${STATUS_CLASS[status]}`} data-testid="correction-status">
                {t(`ops.corrections.status.${status}`)}{status === 'running' && c.step ? ` · ${t(`ops.corrections.step.${c.step}`, {})}` : ''}
              </span>
              <span className="muted">#{c.id} · {c.author} · {dateTime(c.createdAt)}</span>
            </div>
            <p className="correction-summary">{c.summary}</p>
            {c.kind === 'edit' && <BeforeAfter before={c.before} after={c.after} track={c.track} />}
            {c.reason && c.kind !== 'undo' && <p className="muted">{t('ops.corrections.reasonLine', { reason: c.reason })}</p>}
            {c.resultReason && <p className={status === 'rejected' ? 'form-error' : 'form-ok'} data-testid="correction-result">{c.resultReason}</p>}
            {c.commit && c.commit !== 'stub' && <p className="muted">{t('ops.corrections.commit', { commit: c.commit.slice(0, 7) })}</p>}
            {c.undoneBy && <p className="muted">{t('ops.corrections.undoneBy', { id: c.undoneBy })}</p>}
            {c.detail && status === 'rejected' && (
              <details><summary>{t('ops.details')}</summary><pre className="raw">{c.detail}</pre></details>
            )}
            {c.canUndo && (confirm === c.id ? (
              <div className="row wrap">
                <span>{t('ops.corrections.undoConfirm')}</span>
                <Button size="small" variant="danger" disabled={busy} onClick={() => undo(c.id)} data-testid="correction-undo-yes">{t('ops.corrections.undoYes')}</Button>
                <Button size="small" variant="secondary" onClick={() => setConfirm(null)}>{t('admin.confirmNo')}</Button>
              </div>
            ) : (
              <div><Button size="small" variant="secondary" onClick={() => setConfirm(c.id)} data-testid="correction-undo">{t('ops.corrections.undo')}</Button></div>
            ))}
            {error && confirm === c.id && <p className="form-error">{error}</p>}
          </article>
        );
      })}
    </section>
  );
}

export function BeforeAfter({ before, after, track }) {
  const rows = Object.keys(after).filter((k) => ['target', 'native', 'acceptAlso'].includes(k));
  const show = (k, v) => (k === 'acceptAlso' ? (v?.length ? v.join(' · ') : t('ops.corrections.nothing')) : v);
  return (
    <dl className="before-after">
      {rows.map((k) => (
        <div key={k}>
          <dt>{t(`ops.corrections.field.${k}`, { language: t(`languages.${track}`) })}</dt>
          <dd><del lang={k === 'native' ? 'nl' : track}>{show(k, before[k])}</del> → <ins lang={k === 'native' ? 'nl' : track}>{show(k, after[k])}</ins></dd>
        </div>
      ))}
    </dl>
  );
}
