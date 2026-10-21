import { useMemo, useState } from 'react';
import { getLang, t } from '../i18n/index.js';
import TopBar from '../components/TopBar.jsx';
import RULES from '../data/grading-rules.json';

const LANGS = ['all', 'en', 'fr', 'nl'];
const fold = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** "You type “cafe” for “café” → right, with a tip about the accents" */
function exampleText(ex) {
  const you = ex.kind === 'pairs'
    ? t('rules.you.pairs', { n: ex.typed })
    : t(`rules.you.${ex.kind}`, { typed: ex.typed, expected: ex.expected });
  return `${you} → ${t(`rules.result.${ex.result}`)}`;
}

// Admin → What counts as correct: the grading rules in one line each with an example, read-only. The content is
// docs/grading-rules.md section 8 (compiled into data/grading-rules.json; a unit test grades every example), in the
// interface language. Phone-first: only the section headings until one is opened; a search opens what matches.
export default function GradingRules() {
  const [lang, setLang] = useState('all');
  const [query, setQuery] = useState('');
  const ui = getLang() === 'nl' ? 'nl' : 'en';
  const q = fold(query.trim());

  const sections = useMemo(() => RULES.sections.map((s) => ({
    ...s,
    rules: s.rules.filter((r) => (lang === 'all' || r.langs.includes('all') || r.langs.includes(lang))
      && (!q || fold(`${s.title[ui]} ${r.text[ui]} ${r.example.expected} ${r.example.typed}`).includes(q))),
  })).filter((s) => s.rules.length), [lang, q, ui]);

  return (
    <main className="page" data-testid="grading-rules">
      <TopBar title={t('rules.title')} backTo="/admin" />
      <p className="muted small">{t('rules.intro')}</p>
      <div className="lab-filters" role="group" aria-label={t('rules.languages')}>
        {LANGS.map((l) => (
          <button key={l} type="button" className="chip-btn" aria-pressed={lang === l} data-testid="rules-lang" data-lang={l} onClick={() => setLang(l)}>
            {l === 'all' ? t('rules.all') : t(`languages.${l}`)}
          </button>
        ))}
      </div>
      <label className="field rules-search">
        <span className="visually-hidden">{t('rules.search')}</span>
        <input type="search" className="input" value={query} placeholder={t('rules.search')} onChange={(e) => setQuery(e.target.value)} data-testid="rules-search" />
      </label>
      {!sections.length && <p className="notice" data-testid="rules-none">{t('rules.none')}</p>}
      <div className="rules-sections">
        {sections.map((s) => (
          // a search opens every section with a match; otherwise the reader opens what they need
          <details key={`${s.id}${q ? ':q' : ''}`} className="card rules-section" open={q ? true : undefined} data-testid="rules-section" data-section={s.id}>
            <summary>
              <span className="rules-section-title">{s.title[ui]}</span>
              <span className="muted small">{s.rules.length === 1 ? t('rules.countOne') : t('rules.count', { n: s.rules.length })}</span>
            </summary>
            <ul className="rules-list">
              {s.rules.map((r) => (
                <li key={r.id} className="rules-rule" data-testid="rules-rule" data-rule={r.id} data-langs={r.langs.join(' ')}>
                  <span className="rules-text">{r.text[ui]}</span>
                  <span className={`rules-example rules-example--${r.example.result === 'wrong' ? 'wrong' : 'right'}`} lang={r.example.track}>
                    {exampleText(r.example)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </main>
  );
}
