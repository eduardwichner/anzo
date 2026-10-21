// Native-side ("known language") content text is a localized object keyed by native language: { nl: "kat" } in the
// English and French courses, { en: "cat" } in the Dutch one (the validator requires the course's manifest `native`).
// Target-language text is a plain string. The list of native languages is server/src/lib/langs.js.

export const DEFAULT_NATIVE_LANG = 'nl';

export const isLocalized = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The text of a localized object in `lang`, else Dutch, else its only language. Strings (target language) pass through. */
export function nativeText(value, lang = DEFAULT_NATIVE_LANG) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return value[lang] ?? value[DEFAULT_NATIVE_LANG] ?? Object.values(value)[0] ?? null;
}
