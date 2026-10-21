// Settings → Theme: System | Light | Dark (users.theme; lib/theme.js applies it).
import { t } from '../i18n/index.js';
import { THEMES } from '../lib/theme.js';

const LABEL = { system: 'settings.themeSystem', light: 'settings.themeLight', dark: 'settings.themeDark' };

export default function ThemeToggle({ value, onChange, testId = 'settings-theme' }) {
  return (
    <div className="segmented" role="group" aria-labelledby="settings-theme-label" data-testid={testId}>
      {THEMES.map((theme) => (
        <button key={theme} type="button" className="segmented-btn" aria-pressed={value === theme} data-testid={`${testId}-${theme}`}
          onClick={() => value !== theme && onChange(theme)}>
          {t(LABEL[theme])}
        </button>
      ))}
    </div>
  );
}
