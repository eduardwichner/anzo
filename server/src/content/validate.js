// Content validation: JSON Schema (ajv, draft 2020-12) plus the cross-field rules
// the schema cannot express. Used by the server loader, scripts/validate-content.js
// and the unit tests. Never throws on bad content; returns { errors, packs, manifest }.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { DEFAULT_INSTRUCTION_KEYS, DEFAULT_LOCALES_DIR, instructionKey, localesMissing, readLocales } from './instructions.js';
import { isLocalized } from './localized.js';
import { orderKey } from './grading.js';
import { NATIVE_LANGS, TARGET_LANGS } from '../lib/langs.js';
import { clozeProblems, gappedProblems, questionProblems, textProblems, textSegments, transformProblems } from './texts.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SCHEMA_PATH = path.resolve(here, '../../../content/schema/pack.schema.json');

// Exercise types the client can play. The reserved ones validate but show "Binnenkort".
export const PLAYABLE_TYPES = ['multiple_choice', 'match_pairs', 'build_sentence', 'fill_blank', 'listen_choose', 'listen_type',
  'reading', 'dialogue', 'listening', 'order_paragraphs', 'cloze', 'open_cloze', 'word_form', 'gap_sentence', 'transform'];
/** Manifest statuses whose packs are loaded and validated: preview packs are played in Admin → Levels → Preview only. */
export const LOADED_STATUSES = ['available', 'preview'];
export const RESERVED_TYPES = ['speak'];

const validatorCache = new Map();

function compileValidators(schemaPath) {
  if (validatorCache.has(schemaPath)) return validatorCache.get(schemaPath);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  ajv.addSchema(schema);
  const validators = {
    manifest: ajv.getSchema(`${schema.$id}#/$defs/manifest`),
    pack: ajv.getSchema(schema.$id),
  };
  validatorCache.set(schemaPath, validators);
  return validators;
}

// Collapse ajv's if/then noise: when a "then" branch failed, the useful errors are the nested ones.
function ajvErrors(file, errors) {
  return errors
    .filter((e) => e.keyword !== 'if')
    .map((e) => ({
      file,
      path: e.instancePath || '/',
      message:
        e.keyword === 'additionalProperties' && e.params.additionalProperty === 'prompt'
          ? 'unexpected property "prompt": packs contain no UI text since schemaVersion 2; the instruction comes from the i18n files (see content/README.md)'
          : e.keyword === 'additionalProperties'
          ? `unexpected property "${e.params.additionalProperty}"`
          : e.keyword === 'const' && e.instancePath === '/schemaVersion'
            ? 'schemaVersion must be 2 (see content/README.md)'
          : e.keyword === 'required' && e.params.missingProperty === 'schemaVersion'
            ? 'missing "schemaVersion": 2 (packs without it are schema v1, which is no longer accepted)'
          : e.keyword === 'enum'
            ? `${e.message}: ${e.params.allowedValues.join(', ')}`
            : e.message,
    }));
}

function readJson(filePath, displayName, errors) {
  if (!fs.existsSync(filePath)) {
    errors.push({ file: displayName, path: '/', message: 'file does not exist' });
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    errors.push({ file: displayName, path: '/', message: `invalid JSON: ${err.message}` });
    return null;
  }
}

// Two option/question texts are "the same" when they are equal in every native language both define.
const sameText = (a, b) => (isLocalized(a) && isLocalized(b)
  ? Object.keys(a).filter((k) => k in b).every((k) => a[k] === b[k])
  : a === b);
const textKey = (t, native = 'nl') => (isLocalized(t) ? t[native] ?? Object.values(t)[0] : t).trim().toLowerCase();
const side = (t) => (isLocalized(t) ? 'native' : 'target');

function checkPackRules(pack, file, seenIds, errors, locales, native = 'nl') {
  const err = (p, message) => errors.push({ file, path: p, message });
  const claim = (id, p) => {
    if (seenIds.has(id)) err(p, `duplicate id "${id}" (first used in ${seenIds.get(id)})`);
    else seenIds.set(id, `${file} ${p}`);
  };

  claim(pack.id, '/id');
  const vocabIds = new Set();
  const sentenceIds = new Set();
  const listenable = new Map(); // vocabulary and sentence ids -> { target, native }
  const texts = new Map(); // text id -> text

  pack.units.forEach((unit, u) => {
    claim(unit.id, `/units/${u}/id`);
    unit.vocabulary.forEach((v, i) => {
      claim(v.id, `/units/${u}/vocabulary/${i}/id`);
      vocabIds.add(v.id);
      listenable.set(v.id, v);
    });
    (unit.sentences || []).forEach((s, i) => {
      claim(s.id, `/units/${u}/sentences/${i}/id`);
      sentenceIds.add(s.id);
      listenable.set(s.id, s);
    });
    (unit.texts || []).forEach((text, i) => {
      const tp = `/units/${u}/texts/${i}`;
      claim(text.id, `${tp}/id`);
      texts.set(text.id, text);
      textSegments(text).forEach((seg) => claim(seg.id, `${tp} ${seg.id}`));
      [...(text.questions || []), ...(text.listeningQuestions || [])].forEach((q) => claim(q.id, `${tp} ${q.id}`));
      for (const m of textProblems(text, { native })) err(tp, m);
    });
  });

  const checkRefs = (items, p) => {
    items.forEach((ref, i) => {
      if (!vocabIds.has(ref)) err(`${p}/items/${i}`, `item "${ref}" is not a vocabulary id in this pack`);
    });
  };

  pack.units.forEach((unit, u) => {
    (unit.sentences || []).forEach((s, i) => checkRefs(s.items, `/units/${u}/sentences/${i}`));
    (unit.texts || []).forEach((t, i) => checkRefs(t.items, `/units/${u}/texts/${i}`));
    unit.lessons.forEach((lesson, l) => {
      const lp = `/units/${u}/lessons/${l}`;
      claim(lesson.id, `${lp}/id`);
      lesson.exercises.forEach((ex, e) => {
        const p = `${lp}/exercises/${e}`;
        claim(ex.id, `${p}/id`);
        checkRefs(ex.items, p);
        if (ex.sentenceId && !sentenceIds.has(ex.sentenceId)) {
          err(`${p}/sentenceId`, `sentence "${ex.sentenceId}" is not a sentence id in this pack`);
        }
        const key = instructionKey(ex, (id) => sentenceIds.has(id));
        const missingIn = localesMissing(locales, key);
        if (missingIn.length) {
          err(ex.instruction ? `${p}/instruction` : p, `instruction key "${key}" is missing in client/src/i18n/{${missingIn.join(',')}}.json`);
        }
        switch (ex.type) {
          case 'multiple_choice': {
            const n = ex.options.filter((o) => o.correct === true).length;
            if (n !== 1) err(`${p}/options`, `multiple_choice must have exactly one option with "correct": true (found ${n})`);
            const texts = ex.options.map((o) => textKey(o.text, native));
            if (new Set(texts).size !== texts.length) err(`${p}/options`, 'multiple_choice option texts must be unique');
            const q = side(ex.question);
            const wrongSide = ex.options.findIndex((o) => side(o.text) === q);
            if (wrongSide > -1) {
              err(`${p}/options/${wrongSide}/text`, `multiple_choice with a ${q}-language question needs ${q === 'target' ? 'native (localized { "<native>": … })' : 'target-language (string)'} options`);
            }
            break;
          }
          case 'match_pairs': {
            if (ex.pairs.length < 4 || ex.pairs.length > 6) {
              err(`${p}/pairs`, `match_pairs must have 4-6 pairs (found ${ex.pairs.length})`);
            }
            const lefts = ex.pairs.map((x) => x.left);
            const rights = ex.pairs.map((x) => textKey(x.right, native));
            if (new Set(lefts).size !== lefts.length || new Set(rights).size !== rights.length) {
              err(`${p}/pairs`, 'match_pairs left and right values must each be unique');
            }
            break;
          }
          case 'build_sentence': {
            // the words of the answer in order; case and punctuation may differ (Dutch tiles: no capital, no full stop)
            const joined = ex.tokens.join(' ');
            if (orderKey(joined) !== orderKey(ex.answer)) {
              err(`${p}/tokens`, `build_sentence tokens joined with spaces ("${joined}") must equal answer ("${ex.answer}")`);
            }
            const sorted = (text) => orderKey(text).split(' ').sort().join(' ');
            (ex.acceptAlso || []).forEach((alt, k) => {
              // tiles may hold a space ("Salut !": French punctuation stays with its word), so compare words
              if (sorted(alt) !== sorted(joined)) err(`${p}/acceptAlso/${k}`, `build_sentence acceptAlso "${alt}" must use exactly the tokens of the answer`);
              if (alt === ex.answer) err(`${p}/acceptAlso/${k}`, 'build_sentence acceptAlso repeats the answer');
            });
            const s = listenable.get(ex.sentenceId);
            if (s && sentenceIds.has(ex.sentenceId) && s.target !== ex.answer) {
              err(`${p}/answer`, `build_sentence answer ("${ex.answer}") must equal the target of sentence "${ex.sentenceId}" ("${s.target}")`);
            }
            break;
          }
          case 'reading':
          case 'dialogue':
          case 'listening': {
            const text = texts.get(ex.textId);
            if (!text) { err(`${p}/textId`, `text "${ex.textId}" is not a text of this pack`); break; }
            if (ex.type !== 'listening' && text.kind !== ex.type) err(`${p}/textId`, `a ${ex.type} exercise needs a ${ex.type} text ("${ex.textId}" is a ${text.kind})`);
            for (const m of questionProblems(ex.question, text, `${ex.id} question`, native)) err(`${p}/question`, m);
            break;
          }
          case 'order_paragraphs': {
            const text = texts.get(ex.textId);
            if (!text) { err(`${p}/textId`, `text "${ex.textId}" is not a text of this pack`); break; }
            if (!text.orderable) err(`${p}/textId`, `text "${ex.textId}" is not marked orderable: true (the author confirms its order is unambiguous)`);
            const known = new Set([...textSegments(text).map((x) => x.id)]);
            ex.segments.forEach((id, k) => { if (!known.has(id)) err(`${p}/segments/${k}`, `"${id}" is not a sentence or turn of ${ex.textId}`); });
            break;
          }
          case 'open_cloze':
          case 'word_form': {
            // B2: typed gaps; open = no hint (each gap's acceptAlso lists the other words that fit), word_form = a stem per gap
            const text = texts.get(ex.textId);
            if (!text) { err(`${p}/textId`, `text "${ex.textId}" is not a text of this pack`); break; }
            for (const m of clozeProblems(ex.gaps, text)) err(`${p}/gaps`, m);
            const want = ex.type === 'open_cloze' ? 'open' : 'word_form';
            ex.gaps.forEach((g, k) => { if (g.kind !== want) err(`${p}/gaps/${k}`, `every gap of ${ex.type} is kind ${want}`); });
            if (ex.options) err(`${p}/options`, `${ex.type} is typed (no word bank)`);
            break;
          }
          case 'gap_sentence': {
            const text = texts.get(ex.textId);
            if (!text) { err(`${p}/textId`, `text "${ex.textId}" is not a text of this pack`); break; }
            for (const m of gappedProblems({ gaps: ex.gaps, extra: ex.extra }, text, { native })) err(`${p}/gaps`, m);
            break;
          }
          case 'transform':
            for (const m of transformProblems(ex, ex.id)) err(p, m);
            break;
          case 'cloze': {
            const text = texts.get(ex.textId);
            if (!text) { err(`${p}/textId`, `text "${ex.textId}" is not a text of this pack`); break; }
            for (const m of clozeProblems(ex.gaps, text)) err(`${p}/gaps`, m);
            if (ex.options) {
              const opts = new Set(ex.options.map((o) => o.toLowerCase()));
              ex.gaps.forEach((g, k) => { if (!opts.has(g.word.toLowerCase())) err(`${p}/options`, `the word bank lacks gap ${k + 1}'s word "${g.word}"`); });
            }
            ex.gaps.forEach((g, k) => { if (g.kind === 'finite_verb' && !g.hint) err(`${p}/gaps/${k}`, 'a finite_verb gap needs a hint (the infinitive)'); });
            // typed (no word bank): without a hint another word of the text could fit the gap; the hint decides
            if (!ex.options) ex.gaps.forEach((g, k) => { if (!g.hint) err(`${p}/gaps/${k}`, 'every gap of a typed cloze needs a hint (its meaning, or the infinitive and tense)'); });
            break;
          }
          case 'fill_blank': {
            if (ex.kind === 'finite_verb' && !ex.hint) err(`${p}/hint`, 'a finite_verb fill-in needs a hint (the infinitive)');
            if (ex.kind === 'word_form' && (!ex.stem || ex.stem.toLowerCase() === ex.answer.toLowerCase())) err(`${p}/stem`, 'a word_form fill-in needs a stem other than its answer');
            if (ex.stem && ex.kind !== 'word_form') err(`${p}/stem`, 'a stem is only for kind word_form');
            if (ex.acceptAlso && ex.options) err(`${p}/acceptAlso`, 'acceptAlso is only for a typed fill-in (no word bank)');
            const blanks = ex.sentence.split('___').length - 1;
            if (blanks !== 1) err(`${p}/sentence`, `fill_blank sentence must contain exactly one "___" (found ${blanks})`);
            if (ex.options && !ex.options.includes(ex.answer)) {
              err(`${p}/options`, `fill_blank options must include the answer "${ex.answer}"`);
            }
            break;
          }
          case 'listen_choose':
          case 'listen_type': {
            const heard = listenable.get(ex.listen);
            if (!heard) {
              err(`${p}/listen`, `listen "${ex.listen}" is not a vocabulary or sentence id in this pack`);
              break;
            }
            if (ex.type === 'listen_type') {
              if (ex.answer !== heard.target) {
                err(`${p}/answer`, `listen_type answer ("${ex.answer}") must equal the target text of "${ex.listen}" ("${heard.target}")`);
              }
              break;
            }
            const correct = ex.options.filter((o) => o.correct === true);
            if (correct.length !== 1) {
              err(`${p}/options`, `listen_choose must have exactly one option with "correct": true (found ${correct.length})`);
              break;
            }
            const wrongSide = ex.options.findIndex((o) => side(o.text) !== ex.answerSide);
            if (wrongSide > -1) {
              err(`${p}/options/${wrongSide}/text`, `listen_choose answerSide ${ex.answerSide} needs ${ex.answerSide === 'target' ? 'target-language (string)' : 'native (localized { "<native>": … })'} options`);
              break;
            }
            const texts = ex.options.map((o) => textKey(o.text, native));
            if (new Set(texts).size !== texts.length) err(`${p}/options`, 'listen_choose option texts must be unique');
            const expected = ex.answerSide === 'target' ? heard.target : heard.native;
            if (!sameText(correct[0].text, expected)) {
              const show = (t) => JSON.stringify(t);
              err(`${p}/options`, `listen_choose (answerSide ${ex.answerSide}) correct option (${show(correct[0].text)}) must equal the ${ex.answerSide} text of "${ex.listen}" (${show(expected)})`);
            }
            break;
          }
          default:
            break;
        }
      });
    });
  });
}

export function summarizePack(pack) {
  let lessons = 0;
  let exercises = 0;
  let vocab = 0;
  let sentences = 0;
  for (const unit of pack.units) {
    lessons += unit.lessons.length;
    vocab += unit.vocabulary.length;
    sentences += (unit.sentences || []).length;
    for (const lesson of unit.lessons) exercises += lesson.exercises.length;
  }
  return { units: pack.units.length, lessons, exercises, vocab, sentences };
}

/**
 * Validate the manifest and every `available` pack under packsDir.
 * @returns {{ errors: {file,path,message}[], manifest: object|null, packs: {entry, track, pack, file}[] }}
 */
export function validateContent({ packsDir, schemaPath = DEFAULT_SCHEMA_PATH, localesDir = DEFAULT_LOCALES_DIR }) {
  const errors = [];
  const packs = [];
  const { manifest: validateManifest, pack: validatePack } = compileValidators(schemaPath);
  // Repo-relative when inside the working directory, absolute otherwise.
  const rel = (p) => {
    const r = path.relative(process.cwd(), p);
    return r && !r.startsWith('..') ? r : p;
  };

  // Instructions are i18n keys: every default key must exist in every locale file.
  let locales = {};
  try {
    locales = readLocales(localesDir);
  } catch (err) {
    errors.push({ file: rel(localesDir), path: '/', message: `cannot read the locale files: ${err.message}` });
  }
  for (const key of DEFAULT_INSTRUCTION_KEYS) {
    const missingIn = localesMissing(locales, key);
    if (missingIn.length) errors.push({ file: rel(localesDir), path: '/', message: `default instruction "${key}" is missing in {${missingIn.join(',')}}.json` });
  }

  const manifestPath = path.join(packsDir, 'manifest.json');
  const manifest = readJson(manifestPath, rel(manifestPath), errors);
  if (!manifest) return { errors, manifest: null, packs };
  if (!validateManifest(manifest)) {
    errors.push(...ajvErrors(rel(manifestPath), validateManifest.errors));
    return { errors, manifest: null, packs };
  }

  const seenIds = new Map();
  const trackIds = new Set();
  manifest.tracks.forEach((track, t) => {
    if (trackIds.has(track.id)) errors.push({ file: rel(manifestPath), path: `/tracks/${t}/id`, message: `duplicate track "${track.id}"` });
    trackIds.add(track.id);
    // A course = the track + its native language: the language its meanings are given in.
    if (!NATIVE_LANGS.includes(track.native)) {
      errors.push({ file: rel(manifestPath), path: `/tracks/${t}/native`, message: `native "${track.native}" is not a native language (${NATIVE_LANGS.join(', ')}; server/src/lib/langs.js)` });
    }
    // The target language (what the course teaches) is separate from the track id; a variant course (fr-en)
    // has an id prefix of its own, and its target is never its native language
    const target = track.target ?? track.id;
    if (!TARGET_LANGS.includes(target)) errors.push({ file: rel(manifestPath), path: `/tracks/${t}/target`, message: `track "${track.id}" needs a target: one of ${TARGET_LANGS.join(', ')} (server/src/lib/langs.js)` });
    if (target === track.native) errors.push({ file: rel(manifestPath), path: `/tracks/${t}/target`, message: `target "${target}" is the course's native language` });
    if (track.id !== target && !track.idPrefix) errors.push({ file: rel(manifestPath), path: `/tracks/${t}/idPrefix`, message: `track "${track.id}" teaches ${target}: it needs an idPrefix of its own` });
    const prefix = track.idPrefix ?? track.id;
    if (manifest.tracks.some((o, k) => k !== t && (o.idPrefix ?? o.id) === prefix)) errors.push({ file: rel(manifestPath), path: `/tracks/${t}`, message: `id prefix "${prefix}" is used by another track` });
    track.packs.forEach((entry, i) => {
      const p = `/tracks/${t}/packs/${i}`;
      if (seenIds.has(entry.id)) {
        errors.push({ file: rel(manifestPath), path: `${p}/id`, message: `duplicate pack id "${entry.id}"` });
      }
      seenIds.set(entry.id, `${rel(manifestPath)} ${p}`);
      // a branch follows a core level of its own track: an earlier pack that is not itself a branch
      if (entry.branch || entry.after) {
        const core = track.packs.slice(0, i).find((x) => x.id === entry.after);
        if (!entry.branch || !entry.after) errors.push({ file: rel(manifestPath), path: p, message: 'a branch pack needs both branch: true and after: <core pack id>' });
        else if (!core) errors.push({ file: rel(manifestPath), path: `${p}/after`, message: `after "${entry.after}" is not an earlier pack of ${track.id}` });
        else if (core.branch) errors.push({ file: rel(manifestPath), path: `${p}/after`, message: `after "${entry.after}" is itself a branch` });
        else if (core.cefr !== entry.cefr) errors.push({ file: rel(manifestPath), path: `${p}/cefr`, message: `a branch is the level of its core (${core.cefr})` });
      }
      if (!LOADED_STATUSES.includes(entry.status)) return;

      const filePath = path.join(packsDir, entry.file);
      const file = rel(filePath);
      const pack = readJson(filePath, file, errors);
      if (!pack) return;
      if (!validatePack(pack)) {
        errors.push(...ajvErrors(file, validatePack.errors));
        return;
      }
      if (pack.id !== entry.id) errors.push({ file, path: '/id', message: `pack id "${pack.id}" does not match manifest id "${entry.id}"` });
      if (!entry.id.startsWith(`${track.idPrefix ?? track.id}-`)) errors.push({ file, path: '/id', message: `pack id "${entry.id}" does not start with the track's id prefix "${track.idPrefix ?? track.id}-"` });
      if (pack.track !== track.id) errors.push({ file, path: '/track', message: `pack track "${pack.track}" does not match manifest track "${track.id}"` });
      if (pack.cefr !== entry.cefr) errors.push({ file, path: '/cefr', message: `pack cefr "${pack.cefr}" does not match manifest cefr "${entry.cefr}"` });

      // The pack id itself was claimed by the manifest entry; release it so the pack can claim it.
      seenIds.delete(entry.id);
      checkPackRules(pack, file, seenIds, errors, locales, track.native);
      checkNativeKey(pack, track.native, file, errors);
      packs.push({ entry, track, pack, file });
    });
  });

  return { errors, manifest, packs };
}

/**
 * Every native-side text of a pack (a localized object: only two-letter keys with string values — titles, meanings,
 * native options, match `right`, hints) provides the course's native language.
 */
export function checkNativeKey(pack, native, file, errors) {
  let reported = 0;
  const walk = (v, p) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${p}/${i}`));
    if (!v || typeof v !== 'object') return;
    const keys = Object.keys(v);
    if (keys.length && keys.every((k) => /^[a-z]{2}$/.test(k) && typeof v[k] === 'string')) {
      if (!(native in v) && reported++ < 20) errors.push({ file, path: p || '/', message: `native-side text has no "${native}" (the course's native language)` });
      return;
    }
    for (const k of keys) walk(v[k], `${p}/${k}`);
  };
  walk(pack, '');
}

export function formatErrors(errors) {
  return errors.map((e) => `  ${e.file} ${e.path}: ${e.message}`).join('\n');
}
