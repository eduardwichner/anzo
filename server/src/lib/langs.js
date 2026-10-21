// Languages of a learner, in one place. NATIVE_LANGS: what users.native_lang may be (the meanings in the exercises; a
// course is offered to a learner whose native language is the course's manifest `native`). Adding one (e.g. 'ro'):
// add it here — no migration — then give the packs of the courses for it that key and set the manifest's `native`.
export const NATIVE_LANGS = ['nl', 'en'];
/** Target languages: what a course teaches (manifest tracks[].target) — the languages with voices, grading rules and a word list. */
export const TARGET_LANGS = ['en', 'fr', 'nl'];
/** Interface languages (users.ui_lang; client/src/i18n/<lang>.json). */
export const UI_LANGS = ['nl', 'en'];
/** users.audience: the wording of the few texts that address the learner as a child ("… a grown-up will look at it"). */
export const AUDIENCES = ['child', 'adult'];
