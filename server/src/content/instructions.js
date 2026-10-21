// Packs contain no UI text. The instruction above an exercise is an i18n key (client/src/i18n/<lang>.json),
// chosen here by exercise type unless the exercise names its own `instruction` key.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_LOCALES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src/i18n');

/** Every key defaultInstruction() can return; each must exist in every locale file. */
export const DEFAULT_INSTRUCTION_KEYS = [
  'exercise.multiple_choice.fromTarget',
  'exercise.multiple_choice.toTarget',
  'exercise.match_pairs',
  'exercise.build_sentence',
  'exercise.fill_blank.choose',
  'exercise.fill_blank.type',
  'exercise.listen_choose.target',
  'exercise.listen_choose.native',
  'exercise.listen_choose.nativeSentence',
  'exercise.listen_type',
  'exercise.speak',
  'exercise.fill_blank.finiteVerb',
  'exercise.reading.mc',
  'exercise.reading.true_false_notgiven',
  'exercise.reading.match_heading',
  'exercise.dialogue.mc',
  'exercise.dialogue.true_false_notgiven',
  'exercise.listening.mc',
  'exercise.listening.true_false_notgiven',
  'exercise.listening.match_heading',
  'exercise.order_paragraphs',
  'exercise.cloze.choose',
  'exercise.cloze.type',
  // B2
  'exercise.fill_blank.wordForm',
  'exercise.reading.summary',
  'exercise.reading.match_texts',
  'exercise.dialogue.summary',
  'exercise.listening.complete',
  'exercise.open_cloze',
  'exercise.word_form',
  'exercise.gap_sentence',
  'exercise.transform',
];

/**
 * The i18n key of an exercise's instruction.
 * @param exercise  the authored exercise (schemaVersion 2)
 * @param isSentence  (id) => true when `id` is a sentence id (listen_choose on a sentence asks about "the sentence")
 */
export function instructionKey(exercise, isSentence = () => false) {
  if (exercise.instruction) return exercise.instruction;
  switch (exercise.type) {
    case 'multiple_choice':
      return typeof exercise.question === 'string' ? 'exercise.multiple_choice.fromTarget' : 'exercise.multiple_choice.toTarget';
    case 'fill_blank':
      if (exercise.kind === 'finite_verb' && !exercise.options) return 'exercise.fill_blank.finiteVerb';
      if (exercise.kind === 'word_form') return 'exercise.fill_blank.wordForm';
      return exercise.options ? 'exercise.fill_blank.choose' : 'exercise.fill_blank.type';
    case 'reading':
    case 'dialogue':
    case 'listening':
      // by question kind; a dialogue has no paragraphs, so no match_heading
      return `exercise.${exercise.type}.${exercise.question?.type ?? 'mc'}`;
    case 'cloze':
      return exercise.options ? 'exercise.cloze.choose' : 'exercise.cloze.type';
    case 'listen_choose':
      if (exercise.answerSide === 'target') return 'exercise.listen_choose.target';
      return isSentence(exercise.listen) ? 'exercise.listen_choose.nativeSentence' : 'exercise.listen_choose.native';
    default:
      return `exercise.${exercise.type}`;
  }
}

/** { nl: {...}, en: {...} } from <dir>/*.json. */
export function readLocales(dir = DEFAULT_LOCALES_DIR) {
  const out = {};
  for (const file of fs.readdirSync(dir).filter((f) => /^[a-z]{2}\.json$/.test(f)).sort()) {
    out[file.slice(0, 2)] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  return out;
}

export function lookupKey(catalog, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), catalog);
}

/** Locales in which `key` is missing or not a non-empty string. */
export function localesMissing(locales, key) {
  return Object.entries(locales)
    .filter(([, catalog]) => {
      const v = lookupKey(catalog, key);
      return typeof v !== 'string' || !v.trim();
    })
    .map(([lang]) => lang);
}
