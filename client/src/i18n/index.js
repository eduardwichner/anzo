// t('lesson.check') / t('home.greeting', { name }) — every user-facing string lives in <lang>.json, and every
// key exists in every locale (a unit test checks). The interface language is per user (users.ui_lang); before
// login it is the last language used on this device, else the browser's. Changing it re-renders at once.
import { useSyncExternalStore } from 'react';
import nl from './nl.json';
import en from './en.json';

const catalogs = { nl, en };
export const UI_LANGS = Object.keys(catalogs);
const STORAGE_KEY = 'anzo.uiLang';

let lang = 'nl';
const listeners = new Set();

export function getLang() {
  return lang;
}

/** Switch the interface language; <html lang> follows. */
export function setLang(next) {
  const value = catalogs[next] ? next : 'nl';
  if (typeof document !== 'undefined') document.documentElement.lang = value;
  if (value === lang) return;
  lang = value;
  listeners.forEach((fn) => fn());
}

/** React hook: the current interface language; components using it re-render when it changes. */
export function useLang() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getLang,
  );
}

/** Language for the login screen: last used on this device, else English browsers get English, else Dutch. */
export function deviceLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (catalogs[saved]) return saved;
  } catch {
    /* storage blocked: fall through */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.toLowerCase().startsWith('en') ? 'en' : 'nl';
}

export function rememberDeviceLang(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* private mode or blocked storage: the choice just isn't remembered */
  }
}

export function t(key, params) {
  return tIn(lang, key, params);
}

/**
 * The same, in a given language rather than the interface language: the inbox prefills a message in the child's language,
 * and "Copy question" questions are always in English.
 */
export function tIn(language, key, params) {
  const lookup = (catalog) => key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), catalog);
  let value = lookup(catalogs[language] ?? catalogs.nl);
  if (typeof value !== 'string') {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key ${key} (${language})`);
    value = lookup(catalogs.nl);
    if (typeof value !== 'string') return key;
  }
  return params ? value.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : value;
}

/** Manifest labels such as level titles ({ nl: "Starters" }) in the interface language, falling back to Dutch. */
export function loc(text) {
  if (!text) return '';
  if (typeof text === 'string') return text;
  return text[lang] ?? text.nl ?? '';
}
