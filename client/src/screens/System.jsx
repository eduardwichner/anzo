import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { acknowledgeProblems, getDiagnostics, getSystem } from '../api/ops.js';
import { t } from '../i18n/index.js';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import { Loading, LoadError } from '../components/Loading.jsx';
import { IconCopy } from '../icons/index.jsx';
import { copyText, downloadText } from '../lib/clipboard.js';
import { dateTime } from '../lib/dates.js';

export function ago(iso) {
  if (!iso) return t('ops.time.never');
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return t('ops.time.justNow');
  if (s < 5400) return t('ops.time.minutes', { n: Math.round(s / 60) });
  if (s < 36 * 3600) return t('ops.time.hours', { n: Math.round(s / 3600) });
  return t('ops.time.days', { n: Math.round(s / 86400) });
}
export const size = (bytes) => (bytes == null ? '—' : bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
  : bytes >= 1024 ** 2 ? `${Math.round(bytes / 1024 ** 2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const kb = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} KB`;
const duration = (s) => (s < 3600 ? t('ops.time.durationMinutes', { n: Math.max(1, Math.round(s / 60)) }) : s < 172800 ? t('ops.time.durationHours', { n: Math.round(s / 3600) }) : t('ops.time.durationDays', { n: Math.round(s / 86400) }));

/** The plain-English lines of one tile, from its data. */
function tileLines(tile) {
  const d = tile.data;
  const L = (key, params) => t(`ops.system.${tile.id}.${key}`, params);
  switch (tile.id) {
    case 'app':
      return [
        L('version', { version: d.version, commit: d.commit ?? '—' }),
        L('uptime', { time: duration(d.uptimeS), started: dateTime(d.startedAt) }),
        d.restartReason ? L('restartedBy', { by: d.restartReason.by, reason: d.restartReason.reason }) : L('restartUnknown'),
        !d.proxy ? L('proxyNone') : L('proxy', {
          peer: d.proxy.peer,
          when: ago(d.proxy.at),
          trust: L(d.proxy.trusted ? 'proxyTrusted' : 'proxyUntrusted'),
          cookie: L(d.proxy.secure === true ? 'cookieSecure' : d.proxy.secure === false ? 'cookieNotSecure' : 'cookieUnknown'),
        }),
      ];
    case 'health':
      return d.ok ? [L('ok')] : d.problems.map((p) => L('problem', { problem: p }));
    case 'content':
      return [
        L('packs', { n: d.packs.length }),
        d.audioMissing ? L('audioMissing', { n: d.audioMissing }) : L('audioOk'),
        ...(d.lastReload?.ok === false ? [L('reloadFailed', { error: d.lastReload.error.split('\n')[0] })] : []),
        ...(d.lockProblems?.length ? [L('lockProblems', { n: d.lockProblems.length })] : []),
        L('loaded', { when: ago(d.loadedAt) }),
      ];
    case 'backups':
      return [
        !d.db.file ? L('dbNone') : d.db.failed ? L('dbFailed', { line: d.db.lastLine }) : L('db', { when: ago(d.db.at), size: size(d.db.bytes), n: d.db.count }),
        !d.archive ? L('archiveNone') : !d.archive.ok ? L('archiveFailed', { error: d.archive.error }) : L('archive', { when: ago(d.archive.at), size: size(d.archive.bytes) }),
        ...(d.archive?.ok && d.archive.budget ? [
          L('archiveBudget', { n: d.archive.kept.length, size: size(d.archive.budget.keptBytes), limit: size(d.archive.budget.limitBytes), free: size(d.archive.budget.freeAfterBytes) }),
          ...(d.archive.note ? [L('archiveFewer', { n: d.archive.kept.length })] : []),
        ] : d.archive?.note ? [d.archive.note] : []),
      ];
    case 'disk':
      return d.freeBytes == null ? [L('unknown')] : [L('free', { free: size(d.freeBytes), total: size(d.totalBytes) })];
    case 'integrity':
      if (!d) return [L('none')];
      return [
        d.ok ? L('ok', { when: ago(d.at) }) : L('failed', { when: ago(d.at), n: d.errors.length }),
        ...d.errors.slice(0, 3),
        ...(d.warnings?.length ? [L('warnings', { n: d.warnings.length })] : []),
        ...(d.info?.length ? [L('info', { n: d.info.length })] : []),
      ];
    case 'jobs':
      return [
        d.stuck ? L('stuck') : d.queued ? L('queued', { n: d.queued }) : L('idle'),
        ...(d.job?.state === 'running' ? [L('running', { id: d.job.id, step: t(`ops.corrections.step.${d.job.step}`) })] : []),
        ...(d.last ? [L('last', { id: d.last.id, status: t(`ops.corrections.status.${d.last.status}`), when: ago(d.last.at) })] : []),
      ];
    case 'watchdog':
      if (!d) return [L('none')];
      return [
        d.stopped ? L('stopped') : L('checked', { when: ago(d.lastCheck) }),
        d.restarts7d ? L('restarts', { n: d.restarts7d }) : L('noRestarts'),
      ];
    case 'reports':
      return [d.open ? L('open', { n: d.open }) : L('none')];
    case 'audiocheck':
      if (!d) return [L('none')];
      return [
        d.flagged ? L('flagged', { n: d.flagged, when: ago(d.at) }) : L('ok', { n: d.clips, when: ago(d.at) }),
        ...(d.heardBad ? [L('heardBad', { n: d.heardBad })] : []),
        ...(d.explained ? [L('explained', { n: d.explained })] : []),
        ...(d.unchecked ? [L('unchecked', { n: d.unchecked })] : []),
        ...(d.failed ? [L('failed', { n: d.failed })] : []),
        ...d.worst.map((w) => L('worst', { text: w.text, language: t(`languages.${w.track}`), flags: w.flags.join(', ') })),
      ];
    default:
      return [];
  }
}

const LINKS = { reports: '/admin/inbox', jobs: '/admin/corrections?tab=history' };

// Admin → System: green / amber / red tiles in plain English, the newest problems from every log, and one button
// that copies everything a developer needs to look into a problem (with a short header; secrets removed).
export default function System() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [copy, setCopy] = useState(null);
  const [acking, setAcking] = useState(false);
  // Acknowledge: hidden until the same problem is logged again (the logs themselves are never changed)
  const ack = async (body) => {
    setAcking(true);
    try {
      const r = await acknowledgeProblems(body);
      setData((d) => ({ ...d, problems: r.problems, acknowledged: r.acknowledged }));
    } catch {
      load();
    } finally {
      setAcking(false);
    }
  };
  const load = useCallback(() => getSystem().then((r) => (setData(r), setFailed(false))).catch(() => setFailed(true)), []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  if (failed && !data) return <LoadError onRetry={load} />;
  if (!data) return <Loading />;

  const diagnostics = async (how) => {
    setCopy({ state: 'busy' });
    try {
      const d = await getDiagnostics();
      if (how === 'download') {
        downloadText(d.text, d.filename);
        setCopy({ state: 'downloaded', size: kb(d.bytes), file: d.filename });
      } else {
        setCopy({ state: (await copyText(d.text)) ? 'copied' : 'failed', size: kb(d.bytes) });
      }
    } catch {
      setCopy({ state: 'failed' });
    }
  };

  return (
    <main className="page page--wide" data-testid="system" data-level={data.level}>
      <TopBar title={t('ops.system.title')} backTo="/admin">
        <Button size="small" variant="secondary" onClick={load} data-testid="system-refresh">{t('ops.system.refresh')}</Button>
      </TopBar>
      <p className={`notice notice--${data.level}`} data-testid="system-summary">{t(`ops.system.summary.${data.level}`)}</p>

      <section className="tiles" data-testid="system-tiles">
        {data.tiles.map((tile) => {
          const body = (
            <>
              <h2><span className={`dot dot--${tile.level}`} aria-hidden="true" />{t(`ops.system.${tile.id}.title`)}</h2>
              <span className="sr-only">{t(`ops.system.level.${tile.level}`)}</span>
              {tileLines(tile).map((line, i) => <p key={i} className="tile-line">{line}</p>)}
            </>
          );
          return LINKS[tile.id] ? (
            <Link key={tile.id} to={LINKS[tile.id]} className={`tile tile--${tile.level}`} data-testid={`tile-${tile.id}`} data-level={tile.level}>{body}</Link>
          ) : (
            <article key={tile.id} className={`tile tile--${tile.level}`} data-testid={`tile-${tile.id}`} data-level={tile.level}>{body}</article>
          );
        })}
      </section>

      <section className="card stack" data-testid="system-diagnostics">
        <h2>{t('ops.system.helpTitle')}</h2>
        <p className="muted">{t('ops.system.helpText')}</p>
        <div className="row wrap">
          <Button onClick={() => diagnostics('copy')} disabled={copy?.state === 'busy'} data-testid="copy-diagnostics"><IconCopy width="20" height="20" />{t('ops.system.copy')}</Button>
          <Button variant="secondary" onClick={() => diagnostics('download')} disabled={copy?.state === 'busy'} data-testid="download-diagnostics">{t('ops.system.download')}</Button>
        </div>
        {copy?.state === 'copied' && <p className="form-ok" role="status" data-testid="diagnostics-copied">{t('ops.system.copied', { size: copy.size })}</p>}
        {copy?.state === 'downloaded' && <p className="form-ok" role="status">{t('ops.system.downloaded', { file: copy.file, size: copy.size })}</p>}
        {copy?.state === 'failed' && <p className="form-error" role="alert">{t('ops.copyFailed')}</p>}
      </section>

      <section className="card stack" data-testid="system-problems">
        <div className="section-head">
          <h2>{t('ops.system.problemsTitle')}</h2>
          {data.problems.length > 1 && (
            <Button size="small" variant="secondary" onClick={() => ack({ all: true })} disabled={acking} data-testid="ack-all">{t('ops.system.ackAll')}</Button>
          )}
        </div>
        <p className="muted small" data-testid="problems-help">
          {t('ops.system.problemsHelp')}{data.acknowledged ? ` ${t('ops.system.acknowledged', { n: data.acknowledged })}` : ''}
        </p>
        {!data.problems.length && <p className="muted" data-testid="no-problems">{t('ops.system.noProblems')}</p>}
        <ul className="problem-list">
          {data.problems.map((p, i) => (
            <li key={`${p.time}-${i}`} className={`problem problem--${p.level}`} data-testid="problem">
              <span className="problem-time">{dateTime(p.time)}</span>
              <span className="pill pill--muted">{t(`ops.system.source.${p.source}`, {})}</span>
              <span className="problem-message">{p.message}</span>
              <button type="button" className="link-btn problem-ack" onClick={() => ack({ key: p.key })} disabled={acking} data-testid="ack-problem">{t('ops.system.ack')}</button>
              <details><summary>{t('ops.details')}</summary><pre className="raw">{p.raw}</pre></details>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
