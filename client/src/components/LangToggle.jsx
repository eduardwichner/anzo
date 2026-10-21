// NL | EN segmented switch for the interface language.
import { t, UI_LANGS } from '../i18n/index.js';

export default function LangToggle({ value, onChange, label, testId = 'lang-toggle', size = 'normal', disabled = false }) {
  return (
    <div className={`segmented${size === 'small' ? ' segmented--small' : ''}`} role="group" aria-label={label} data-testid={testId}>
      {UI_LANGS.map((lang) => (
        <button
          key={lang}
          type="button"
          lang={lang}
          className="segmented-btn"
          aria-pressed={value === lang}
          aria-label={t(`uiLanguages.${lang}`)}
          data-testid={`${testId}-${lang}`}
          disabled={disabled}
          onClick={() => value !== lang && onChange(lang)}
        >
          {size === 'small' ? lang.toUpperCase() : t(`uiLanguages.${lang}`)}
        </button>
      ))}
    </div>
  );
}
