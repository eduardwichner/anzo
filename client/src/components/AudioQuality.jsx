import { Link } from 'react-router-dom';
import { getLang, t } from '../i18n/index.js';
import { dateTime } from '../lib/dates.js';

const num = (n) => new Intl.NumberFormat(getLang()).format(n);
const share = (part, whole) => (whole ? `${(100 * part / whole).toFixed(part / whole < 0.1 ? 1 : 0)} %` : '–');
export const upperText = (x) => (x === null ? '–' : `< ${(100 * x).toFixed(x < 0.1 ? 1 : 0)} %`);

/**
 * Admin → Listen check → Audio quality (server lib/quality.js): per group (words and short phrases;
 * sentences) one row per language — clips, heard, bad now, the 95 % upper bound on the error rate, rendered again — then the
 * last machine check and the Bad clips being fixed. Every number is computed by the server when the page opens.
 */
export default function AudioQuality({ quality }) {
  const { groups, fixing, check } = quality;
  return (
    <section className="card stack" data-testid="audio-quality">
      <h2>{t('quality.title')}</h2>
      {groups.map((g) => (
        <div key={g.group} className="stack" data-testid="quality-group" data-group={g.group}>
          <h3>{t(`quality.group.${g.group}`)}</h3>
          <div className="table-wrap">
            <table className="table quality-table">
              <thead>
                <tr>
                  <th>{t('quality.col.language')}</th><th className="num">{t('quality.col.clips')}</th>
                  <th className="num">{t('quality.col.heard')}</th><th className="num">{t('quality.col.bad')}</th>
                  <th className="num">{t('quality.col.upper')}</th><th className="num">{t('quality.col.redone')}</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.track} data-testid="quality-row" data-track={r.track}>
                    <td data-label={t('quality.col.language')}>{t(`languages.${r.track}`)}</td>
                    <td className="num" data-label={t('quality.col.clips')}>{num(r.clips)}</td>
                    <td className="num" data-label={t('quality.col.heard')}><span>{num(r.heard)} <span className="muted small">({share(r.heard, r.clips)})</span></span></td>
                    <td className="num" data-label={t('quality.col.bad')} data-testid="quality-bad">{num(r.bad)}</td>
                    <td className="num" data-label={t('quality.col.upper')}>{upperText(r.upper)}</td>
                    <td className="num" data-label={t('quality.col.redone')}><span>{num(r.redone)} <span className="muted small">({share(r.redone, r.clips)})</span></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="small" data-testid="quality-check">
        {check ? t('quality.check', { at: check.at ? dateTime(check.at) : '–', clips: num(check.clips), flagged: num(check.flagged), explained: num(check.explained) })
          : t('quality.noCheck')}
      </p>
      <p className="small" data-testid="quality-fixing">{t('quality.fixing', fixing)}</p>
      <p className="muted small">{t('quality.footnote')}</p>
    </section>
  );
}

/** One line for Admin → Corrections: clips, heard, bad now, with a link to the Listen check. */
export function AudioQualityLine({ quality }) {
  const rows = quality.groups.flatMap((g) => g.rows);
  const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
  return (
    <p className="small" data-testid="quality-line">
      {t('quality.line', { clips: num(sum('clips')), heard: num(sum('heard')), bad: num(sum('bad')), again: num(quality.fixing.again) })}{' '}
      <Link to="/admin/listen" data-testid="quality-line-link">{t('quality.lineLink')}</Link>
    </p>
  );
}
