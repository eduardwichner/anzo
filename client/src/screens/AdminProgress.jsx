import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getUserReport } from '../api/admin.js';
import { getLang, loc, t } from '../i18n/index.js';
import TopBar from '../components/TopBar.jsx';
import { Loading, LoadError } from '../components/Loading.jsx';

// Admin → Users → <child> → Progress: read-only. Hand-drawn inline-SVG charts (no chart library).
const W = 360;
const PAD = { l: 30, r: 6, t: 10, b: 22 };
// validated pair (dataviz validator: CVD ΔE 29, normal 35); light and dark values in tokens.css
const SERIES = { lessons: 'var(--chart-lessons)', practice: 'var(--chart-practice)' };

const dayLabel = (day, opts = { day: 'numeric', month: 'short' }) => new Intl.DateTimeFormat(getLang(), { ...opts, timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
const dateTime = (iso) => new Intl.DateTimeFormat(getLang(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));

/** 1, 2, 5 × 10^n just above the maximum, for three gridlines. */
function niceMax(v) {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** A bar whose top corners are rounded (radius ≤ 4), standing on y = bottom. */
function barPath(x, w, top, bottom, round) {
  const h = bottom - top;
  if (h <= 0) return '';
  const r = round ? Math.min(4, w / 2, h) : 0;
  return `M${x} ${bottom}V${top + r}${r ? `Q${x} ${top} ${x + r} ${top}` : ''}H${x + w - r}${r ? `Q${x + w} ${top} ${x + w} ${top + r}` : ''}V${bottom}Z`;
}

function Axis({ max, h, unit }) {
  const ticks = [0, max / 2, max];
  const y = (v) => PAD.t + (h - PAD.t - PAD.b) * (1 - v / max);
  return (
    <g className="chart-axis">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'chart-baseline' : 'chart-grid'} />
          <text x={PAD.l - 4} y={y(v)} dy="0.32em" textAnchor="end">{`${Math.round(v)}${unit ?? ''}`}</text>
        </g>
      ))}
    </g>
  );
}

function XLabels({ days, step, h }) {
  return (
    <g className="chart-axis">
      {days.map((d, i) => (i % 7 === 2 || i === days.length - 1 ? (
        <text key={d.day} x={PAD.l + step * i + step / 2} y={h - 6} textAnchor="middle">{dayLabel(d.day)}</text>
      ) : null))}
    </g>
  );
}

/** XP per day, lessons and practice stacked (lessons at the bottom), 2 px gap between the segments. */
function XpChart({ days }) {
  const h = 170;
  const max = niceMax(Math.max(...days.map((d) => d.lessonXp + d.practiceXp)));
  const step = (W - PAD.l - PAD.r) / days.length;
  const bw = Math.max(4, step - 3);
  const y = (v) => PAD.t + (h - PAD.t - PAD.b) * (1 - v / max);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${h}`} className="chart-svg" role="img" aria-label={t('admin.chartLabel')} data-testid="xp-chart">
        <Axis max={max} h={h} />
        {days.map((d, i) => {
          const x = PAD.l + step * i + (step - bw) / 2;
          const base = y(0);
          const lessonTop = y(d.lessonXp);
          const practiceTop = y(d.lessonXp + d.practiceXp);
          const gap = d.lessonXp && d.practiceXp ? 2 : 0;
          return (
            <g key={d.day} className="chart-bar" data-testid="xp-bar" data-day={d.day} data-lessons={d.lessonXp} data-practice={d.practiceXp}>
              <title>{t('admin.dayXp', { day: dayLabel(d.day, { weekday: 'short', day: 'numeric', month: 'short' }), lessons: d.lessonXp, practice: d.practiceXp })}</title>
              <rect x={PAD.l + step * i} y={PAD.t} width={step} height={h - PAD.t - PAD.b} className="chart-hit" />
              {d.lessonXp > 0 && <path d={barPath(x, bw, lessonTop, base, !d.practiceXp)} fill={SERIES.lessons} />}
              {d.practiceXp > 0 && <path d={barPath(x, bw, practiceTop, lessonTop - gap, true)} fill={SERIES.practice} />}
            </g>
          );
        })}
        <XLabels days={days} step={step} h={h} />
      </svg>
      <figcaption className="chart-legend">
        <span><i className="legend-swatch legend-swatch--lessons" />{t('admin.legendLessons')}</span>
        <span><i className="legend-swatch legend-swatch--practice" />{t('admin.legendPractice')}</span>
      </figcaption>
    </figure>
  );
}

/** One dot per day: filled when the child did a lesson or practice that day. */
function ActiveDots({ days }) {
  return (
    <ol className="day-dots" data-testid="streak-dots" aria-label={t('admin.daysActive')}>
      {days.map((d) => (
        <li key={d.day} className="day-dot" data-active={String(d.active)} title={dayLabel(d.day)}
          aria-label={d.active ? t('admin.dayActive', { day: dayLabel(d.day) }) : t('admin.dayInactive', { day: dayLabel(d.day) })} />
      ))}
    </ol>
  );
}

/** Minutes per day; a day with activity of unknown duration (older completions) shows a hollow "?" marker. */
function MinutesChart({ days }) {
  const h = 130;
  const max = niceMax(Math.max(5, ...days.map((d) => d.minutes)));
  const step = (W - PAD.l - PAD.r) / days.length;
  const bw = Math.max(4, step - 3);
  const y = (v) => PAD.t + (h - PAD.t - PAD.b) * (1 - v / max);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${h}`} className="chart-svg" role="img" aria-label={t('admin.timeSpent')} data-testid="minutes-chart">
        <Axis max={max} h={h} unit="m" />
        {days.map((d, i) => {
          const x = PAD.l + step * i + (step - bw) / 2;
          const unknownOnly = d.unknown > 0 && d.minutes === 0;
          return (
            <g key={d.day} className="chart-bar" data-testid="minutes-bar" data-day={d.day} data-minutes={d.minutes} data-unknown={d.unknown}>
              <title>{unknownOnly ? t('admin.dayUnknown', { day: dayLabel(d.day) }) : t('admin.dayMinutes', { day: dayLabel(d.day), n: d.minutes })}</title>
              <rect x={PAD.l + step * i} y={PAD.t} width={step} height={h - PAD.t - PAD.b} className="chart-hit" />
              {d.minutes > 0 && <path d={barPath(x, bw, y(d.minutes), y(0), true)} fill={SERIES.lessons} />}
              {unknownOnly && (
                <g className="chart-unknown">
                  <circle cx={x + bw / 2} cy={y(0) - 8} r="5.5" />
                  <text x={x + bw / 2} y={y(0) - 8} dy="0.35em" textAnchor="middle">?</text>
                </g>
              )}
            </g>
          );
        })}
        <XLabels days={days} step={step} h={h} />
      </svg>
    </figure>
  );
}

const pct = (c) => (c.total ? t('admin.accuracyCell', { pct: Math.round((100 * c.correct) / c.total), correct: c.correct, total: c.total }) : t('admin.none'));

export default function AdminProgress() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const track = params.get('track');
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  // One course's report (?track=, default the active course); XP, streak and activity are the learner's across courses.
  const load = useCallback(() => {
    setFailed(false);
    getUserReport(id, track).then(setData).catch(() => setFailed(true));
  }, [id, track]);
  useEffect(load, [load]);

  if (failed) return <LoadError onRetry={load} />;
  if (!data) return <Loading />;
  const { user, summary, days, accuracy, weakest } = data;
  const anyUnknown = days.some((d) => d.unknown > 0);

  return (
    <main className="page" data-testid="admin-progress-page">
      <TopBar title={t('admin.reportTitle', { name: user.displayName })} backTo={`/admin/users/${user.id}`} />
      {data.track && <p className="muted" data-testid="report-course" data-track={data.track}>{t('admin.reportCourse', { language: t(`languages.${data.track}`) })}</p>}

      <section className="card stack" data-testid="report-summary">
        <h2>{t('admin.summary')}</h2>
        <dl className="kv-grid">
          <div><dt>{t('admin.xpTotal')}</dt><dd data-testid="report-xp">{summary.xp}</dd></div>
          <div><dt>{t('admin.xpCourse')}</dt><dd data-testid="report-course-xp">{summary.courseXp}</dd></div>
          <div><dt>{t('admin.streakNow')}</dt><dd>{summary.streak}</dd></div>
          <div><dt>{t('admin.streakBestLabel')}</dt><dd>{summary.streakBest}</dd></div>
          <div><dt>{t('admin.wordsLearned')}</dt><dd data-testid="report-words">{summary.wordsLearned}</dd></div>
          <div><dt>{t('admin.practiceSessions')}</dt><dd data-testid="report-practice">{summary.practiceSessions}</dd></div>
          <div><dt>{t('admin.badgesEarned')}</dt><dd data-testid="report-badges">{summary.badges}</dd></div>
        </dl>
        <h3>{t('admin.levelsDone')}</h3>
        <ul className="report-levels">
          {summary.levels.map((l) => (
            <li key={l.id} data-testid="report-level" data-pack-id={l.id}>
              <span className="report-level-name">{`${l.cefr} · ${loc(l.title)}`}</span>
              <span className="report-level-bar" aria-hidden="true"><span style={{ width: `${l.percent}%` }} /></span>
              <span className="muted small">{t('admin.levelLine', { done: l.done, total: l.total, n: l.percent })}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack" data-testid="report-activity">
        <h2>{t('admin.activity')}</h2>
        <XpChart days={days} />
        <h3>{t('admin.daysActive')}</h3>
        <ActiveDots days={days} />
        <h3>{t('admin.timeSpent')}</h3>
        <MinutesChart days={days} />
        {anyUnknown && <p className="muted small">{t('admin.timeNote')}</p>}
        <details className="report-table-toggle">
          <summary>{t('admin.showTable')}</summary>
          <div className="table-wrap">
            <table className="table" data-testid="report-days-table">
              <thead><tr><th>{t('admin.dayCol')}</th><th>{t('admin.legendLessons')}</th><th>{t('admin.legendPractice')}</th><th>{t('admin.timeSpent')}</th></tr></thead>
              <tbody>
                {[...days].reverse().filter((d) => d.active).map((d) => (
                  <tr key={d.day}>
                    <td>{dayLabel(d.day, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                    <td>{d.lessonXp}</td>
                    <td>{d.practiceXp}</td>
                    <td>{d.unknown && !d.minutes ? t('admin.unknown') : t('admin.minutes', { n: d.minutes })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="card stack" data-testid="report-accuracy">
        <h2>{t('admin.accuracy')}</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('admin.typeCol')}</th><th>{t('admin.last30')}</th><th>{t('admin.allTime')}</th></tr></thead>
            <tbody>
              {accuracy.map((a) => (
                <tr key={a.type} data-testid="accuracy-row" data-type={a.type} data-total={a.allTime.total}>
                  <td>{t(`exerciseTypes.${a.type}`)}</td>
                  <td className="num">{pct(a.recent)}</td>
                  <td className="num">{pct(a.allTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack" data-testid="report-weakest">
        <h2>{t('admin.weakest')}</h2>
        {weakest.length === 0 ? <p className="muted">{t('admin.noWeakest')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('admin.itemCol')}</th><th>{t('admin.strengthCol')}</th><th>{t('admin.lastSeenCol')}</th><th className="num">{t('admin.wrongCol')}</th></tr></thead>
              <tbody>
                {weakest.map((w) => (
                  <tr key={w.id} data-testid="weak-item" data-item-id={w.id} data-strength={w.strength}>
                    <td>
                      <span className="weak-target" lang={data.track}>{w.target}</span>
                      <span className="weak-native" lang={user.nativeLang}>{w.native}</span>
                    </td>
                    <td><span className="strength-pips" aria-label={`${w.strength}/5`}>{[0, 1, 2, 3, 4].map((k) => <i key={k} data-on={String(k < w.strength)} />)}</span></td>
                    <td className="num" title={dateTime(w.lastSeen)}>{dayLabel(w.lastSeen.slice(0, 10))}</td>
                    <td className="num">{w.timesWrong}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
