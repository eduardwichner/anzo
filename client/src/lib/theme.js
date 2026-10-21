// Settings → Theme (users.theme: system | light | dark). public/theme.js sets <html data-theme> before the first paint
// from the choice remembered on this device; this module keeps it current: after login the account's choice (also
// remembered for the next cold start), after logout the device's own setting (the login screen follows the device).
export const THEMES = ['system', 'light', 'dark'];
const STORAGE_KEY = 'anzo.theme';

let current = 'system';
let media = null;

function systemDark() {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function paint() {
  if (typeof document === 'undefined') return;
  const dark = current === 'dark' || (current === 'system' && systemDark());
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', dark ? 'dark' : 'light');
  // The toolbar colour: with a fixed choice both media-specific tags take the chosen theme's colour.
  const colour = getComputedStyle(root).getPropertyValue('--theme-color').trim();
  if (colour) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', colour));
}

function remember(choice) {
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* storage blocked: the next cold start follows the device until the account is loaded */
  }
}

/** Apply a theme choice (an account's, or 'system' for the device); a 'system' choice follows device changes live. */
export function applyTheme(choice, { persist = true } = {}) {
  current = THEMES.includes(choice) ? choice : 'system';
  if (persist) remember(current);
  if (typeof window !== 'undefined' && !media) {
    // another tab of this device chose a theme (or logged out): this one follows
    window.addEventListener?.('storage', (e) => {
      if (e.key === STORAGE_KEY) applyTheme(THEMES.includes(e.newValue) ? e.newValue : 'system', { persist: false });
    });
  }
  if (typeof window !== 'undefined' && window.matchMedia && !media) {
    media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener?.('change', () => {
      if (current === 'system') paint();
    });
  }
  paint();
}

/** At startup: the choice remembered on this device (as public/theme.js painted it), followed live until an account loads. */
export function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage blocked: the device's setting */
  }
  applyTheme(THEMES.includes(saved) ? saved : 'system', { persist: false });
}

export function currentTheme() {
  return current;
}
