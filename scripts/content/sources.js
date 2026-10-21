// Unit source files: content/src/<track>/<level>/pack.yaml (pack id, cefr, source) and NN-<topic>.yaml (one unit each).
// Hand-written vocabulary, sentences and unit structure; scripts/generate-pack.js turns them into a pack.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { clozeProblems, gappedProblems, textProblems, transformProblems } from '../../server/src/content/texts.js';
import { NATIVE_LANGS } from '../../server/src/lib/langs.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SRC_DIR = path.join(ROOT, 'content/src');

/** Fine part of speech in sources (for distractor choice) -> the pack schema's pos. */
export const POS_MAP = {
  noun: 'noun', verb: 'verb', adjective: 'adjective', adverb: 'other', preposition: 'other', conjunction: 'other',
  pronoun: 'pronoun', determiner: 'article', article: 'article', number: 'number', phrase: 'phrase', question: 'other',
  exclamation: 'other', other: 'other',
};

const MANIFEST_FILE = path.join(ROOT, 'content/packs/manifest.json');
/** The manifest's tracks (content/packs/manifest.json); none when it cannot be read. */
export function manifestTracks(file = MANIFEST_FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).tracks ?? [];
  } catch {
    return [];
  }
}

/**
 * The course an id prefix belongs to: { track, target, native, prefix }. A variant course (fr-en, prefix fe:
 * French for English speakers) is built from the unit sources of its target language (content/src/fr) with its own native
 * meaning layer; every other track's prefix is its id and its target. Unknown prefix: the prefix is track and target.
 */
export function courseOfPrefix(prefix, tracks = manifestTracks()) {
  const t = tracks.find((x) => (x.idPrefix ?? x.id) === prefix);
  return t ? { track: t.id, target: t.target ?? t.id, native: t.native, prefix } : { track: prefix, target: prefix, native: null, prefix };
}

/**
 * "en-pre-a1" -> { track: "en", target: "en", level: "pre-a1", dir, variant: null }; "fe-a1-1" -> { track: "fr-en",
 * target: "fr", level: "a1-1", dir: content/src/fr/a1-1, variant: { track, target, native, prefix } }.
 */
export function packSourceDir(packId, srcDir = SRC_DIR, tracks = manifestTracks()) {
  const m = packId.match(/^([a-z]{2})-(.+)$/);
  if (!m) throw new Error(`not a pack id: ${packId}`);
  const course = courseOfPrefix(m[1], tracks);
  return { track: course.track, target: course.target, level: m[2], dir: path.join(srcDir, course.target, m[2]),
    variant: course.track !== course.target ? course : null };
}

const ID_VALUE = /^[a-z]{2}\.[a-z0-9-]+$/;
/**
 * A localized object of a source or pack: only native-language keys (lib/langs.js NATIVE_LANGS) with text values — a
 * meaning, title, hint or native option. (An id-valued map such as a text's `forms` is not one.)
 */
export const isLocalized = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0
  && Object.entries(v).every(([k, x]) => NATIVE_LANGS.includes(k) && typeof x === 'string' && !ID_VALUE.test(x));

/** `x` with every localized object reduced to its `native` key ({ nl: "hallo", en: "hello" } -> { nl: "hallo" }). */
export function projectNative(x, native) {
  if (Array.isArray(x)) return x.map((y) => projectNative(y, native));
  if (!x || typeof x !== 'object') return x;
  if (isLocalized(x)) return native in x ? { [native]: x[native] } : x;
  return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, projectNative(v, native)]));
}

/** The paths of the localized objects in `x` without a `native` key (a unit is in a variant course only when there are none). */
export function missingNative(x, native, at = '', out = []) {
  if (Array.isArray(x)) x.forEach((y, i) => missingNative(y, native, `${at}/${i}`, out));
  else if (x && typeof x === 'object') {
    if (isLocalized(x)) {
      if (!(native in x)) out.push(at || '/');
    } else for (const [k, v] of Object.entries(x)) missingNative(v, native, `${at}/${k}`, out);
  }
  return out;
}

// transforms (B2): [{ id: x01, from, key, gapped (one ___), answers, items, native? }] — key word transformations in the review
// lesson (exercise `transform`, typed)
const UNIT_KEYS = ['id', 'title', 'icon', 'topic', 'vocabulary', 'sentences', 'lessons', 'overrides', 'hidden', 'append', 'texts', 'transforms'];
const TRANSFORM_KEYS = ['id', 'from', 'key', 'gapped', 'answers', 'items', 'native'];
// texts: [text id, …] — reading texts and dialogues in <level>/texts/NN-<slug>.yaml (TEXT_KEYS); a unit with texts gets one
// lesson per text (questions, cloze, ordering) and a review lesson with listening exercises (generator.js).
// B2: gapped { gaps: [sentence ids], extra: [{ id, target, native }] } (a gapped text, first exercise of the lesson);
// openCloze / wordForm: gaps like cloze ({ sentence, word, acceptAlso? } / { sentence, word, stem, acceptAlso? })
const TEXT_KEYS = ['id', 'kind', 'title', 'topic', 'level', 'paragraphs', 'turns', 'speakers', 'glossary', 'items', 'questions',
  'listeningQuestions', 'cloze', 'orderable', 'gapped', 'openCloze', 'wordForm'];
// append: [{ lesson: { id: lNN, title }, vocabulary: […], sentences: […] }] — content added after the unit's exercises were
// locked: its words and sentences get a lesson of their own (before the review); nothing generated before them changes.
const APPEND_KEYS = ['lesson', 'vocabulary', 'sentences', 'why'];
// hidden: [{ exercise: <exercise id>, reason }] — generated exercises an admin correction hid (Admin → Corrections);
// the generator still numbers them (no other id moves) and then leaves them out; the id lock lists them as retired.
// category: true = a word for a whole group (animal, fruit); avoid: ids never to offer against this one (jeans/trousers);
// avoidInChoices: the same, except in matching pairs
// gender: French nouns, m | f (the noun's gender, also when the article is elided or plural: l'école f, les yeux m)
// plural: Dutch nouns, the plural form (katten, auto's); alsoNL: Dutch, the Netherlands form where Belgian standard usage
// differs (gsm → mobiel), shown to the learner as a small note; noBlank: true = never a typed fill-in (a common word of a
// lower level fits its sentences too: elder/older); typedAlso: { <native>: [words] } = other words a typed fill-in of the item
// accepts, in the course of that native language only (mail: { en: [email, e-mail] }; the other courses' packs never see it)
const VOCAB_KEYS = ['id', 'target', 'native', 'pos', 'category', 'avoid', 'avoidInChoices', 'gender', 'acceptAlso', 'plural', 'alsoNL', 'noBlank', 'typedAlso'];
// finite: { word, hint } — a conjugated verb of the sentence for a typed finite-verb fill-in (pack.yaml finiteVerbFill)
// build: true — the review lesson always builds this sentence (a grammar point the learner must assemble)
// form: { word, stem } — B2 word formation: a typed fill-in of `word` with its stem in capitals (review lesson)
const SENTENCE_KEYS = ['id', 'target', 'native', 'items', 'acceptAlso', 'finite', 'build', 'form'];
const LESSON_KEYS = ['id', 'title', 'vocab'];

/**
 * Vocabulary id derived from the target when a source omits it: "ice cream" -> "en.ice-cream", "T-shirt" -> "en.t-shirt".
 * French nouns drop their article: "le chat" -> "fr.chat", "l'école" -> "fr.ecole", "les yeux" -> "fr.yeux" ("un peu" keeps its "un");
 * Dutch nouns too: "de kat" -> "nl.kat", "het huis" -> "nl.huis".
 */
export function vocabId(track, target, pos = 'noun') {
  const bareTarget = track === 'fr' && pos === 'noun' ? target.replace(/^(le|la|les|un|une|des)\s+|^l['’]/i, '')
    : track === 'nl' && pos === 'noun' ? target.replace(/^(de|het)\s+/i, '') : target;
  const ascii = bareTarget.replace(/œ/g, 'oe').replace(/Œ/g, 'Oe').replace(/æ/g, 'ae').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${track}.${ascii}`;
}

/**
 * Shorthands: a vocabulary item without `id` gets vocabId(track, target); a sentence id "s07" means
 * "<unit id>-s07"; lesson ids "l02" mean "<unit id>-l02". Returns the unit with full ids.
 */
export function expandIds(unit, track) {
  const full = (id, kind) => (typeof id === 'string' && /^[sl]\d{2}$/.test(id) && id[0] === kind ? `${unit.id}-${id}` : id);
  return {
    ...unit,
    vocabulary: (unit.vocabulary || []).map((v) => ({ id: v.id ?? vocabId(track, String(v.target), v.pos), ...v })),
    sentences: (unit.sentences || []).map((x) => ({ ...x, id: full(x.id, 's') })),
    ...(unit.lessons ? { lessons: unit.lessons.map((l) => ({ ...l, id: full(l.id, 'l') })) } : {}),
    ...(unit.append ? {
      append: unit.append.map((b) => ({
        ...b,
        lesson: b.lesson ? { ...b.lesson, id: full(b.lesson.id, 'l') } : b.lesson,
        vocabulary: (b.vocabulary || []).map((v) => ({ id: v.id ?? vocabId(track, String(v.target), v.pos), ...v })),
        sentences: (b.sentences || []).map((x) => ({ ...x, id: full(x.id, 's') })),
      })),
    } : {}),
  };
}

/** A unit with the vocabulary and sentences of its `append:` blocks added (trace, status, lower-level vocabulary). */
export const withAppended = (unit) => ({
  ...unit,
  vocabulary: [...(unit.vocabulary || []), ...(unit.append || []).flatMap((b) => b.vocabulary || [])],
  sentences: [...(unit.sentences || []), ...(unit.append || []).flatMap((b) => b.sentences || [])],
});

/** Level directories of a track, lowest first. */
export const LEVEL_ORDER = { en: ['pre-a1', 'a1', 'a2', 'b1', 'b2'], fr: ['a1-1', 'a1', 'a2', 'b1', 'b2'], nl: ['pre-a1', 'a1', 'a2', 'b1', 'b2'] };

/** The native language of a pack's meanings: pack.yaml `native` (the course's manifest `native`), default nl. */
export const nativeOf = (meta) => meta?.native ?? 'nl';

/** Vocabulary of the levels below a pack in its track (for the generator's same-meaning check). */
export function lowerLevelVocab(packId, srcDir = SRC_DIR) {
  const { target, level, variant } = packSourceDir(packId, srcDir);
  const order = LEVEL_ORDER[target] ?? [];
  // a branch (b2-work) sits after its core level (b2): the core and everything below it are its lower levels
  const branchOf = order.find((l) => level.startsWith(`${l}-`) && !order.includes(level));
  const below = branchOf ? order.indexOf(branchOf) + 1 : Math.max(0, order.indexOf(level));
  return order.slice(0, below)
    .filter((l) => fs.existsSync(path.join(srcDir, target, l, 'pack.yaml')))
    .flatMap((l) => readPackSources(`${variant?.prefix ?? target}-${l}`, srcDir).units.flatMap((u) => withAppended(u).vocabulary));
}

/** The track's homophone groups (content/src/<track>/homophones.yaml, `groups: [[ijs, eis], …]`; none = []). */
export function homophoneGroups(track, srcDir = SRC_DIR) {
  const file = path.join(srcDir, track, 'homophones.yaml');
  if (!fs.existsSync(file)) return [];
  const doc = YAML.parse(fs.readFileSync(file, 'utf8'));
  return (doc?.groups ?? []).map((g) => g.map(String));
}

/** Everything the generator needs besides the pack's own units: lower levels' vocabulary, the homophone groups. */
export function generatorOptions(packId, srcDir = SRC_DIR) {
  return { lowerVocab: lowerLevelVocab(packId, srcDir), homophones: homophoneGroups(packSourceDir(packId, srcDir).target, srcDir) };
}

/**
 * Read pack.yaml + every NN-*.yaml of a pack, in file order, with every meaning and title reduced to the course's native
 * language (projectNative). A variant course's pack (fe-a1-1) is read from its target's sources (fr-a1-1): only the units
 * whose every native-side text has the variant's native key (the `en` meaning layer: native: { nl, en }) — the others are
 * listed in `skipped` — with `meta.id` the variant's pack id and `meta.native` its native language. Ids stay those of the
 * sources (fr.…); buildPack (build-pack.js) gives the generated pack the variant's prefix. Throws with file names on
 * structural errors.
 */
export function readPackSources(packId, srcDir = SRC_DIR) {
  const { target, level, variant } = packSourceDir(packId, srcDir);
  if (variant) {
    const src = readSourceFiles(`${target}-${level}`, srcDir);
    const complete = src.units.filter((u) => !missingNative(u, variant.native).length);
    return {
      meta: { ...src.meta, id: packId, native: variant.native },
      units: projectNative(complete.map((u) => hiddenFor(u, target, variant.prefix)), variant.native),
      dir: src.dir,
      skipped: src.units.filter((u) => !complete.includes(u)).map((u) => u.id),
    };
  }
  const src = readSourceFiles(packId, srcDir);
  return { ...src, units: projectNative(src.units.map((u) => hiddenFor(u, target, target)), nativeOf(src.meta)), skipped: [] };
}

/**
 * A unit's `hidden` exercises for one course: an admin hides an exercise of one course — fr-a1-1-u01-l01-e03 in the
 * course for Dutch speakers, fe-a1-1-u01-l01-e03 in French for English speakers — and the generator, which numbers the
 * target's ids (fr-…) before a variant gets its prefix, drops it from that course only.
 */
function hiddenFor(unit, target, prefix) {
  if (!unit.hidden) return unit;
  const mine = unit.hidden.filter((h) => String(h.exercise).startsWith(`${prefix}-`))
    .map((h) => ({ ...h, exercise: `${target}-${String(h.exercise).slice(prefix.length + 1)}` }));
  return { ...unit, hidden: mine.length ? mine : undefined };
}

/** The unit sources of a pack as written (every native key kept), checked. */
function readSourceFiles(packId, srcDir) {
  const { dir, target: track } = packSourceDir(packId, srcDir);
  if (!fs.existsSync(path.join(dir, 'pack.yaml'))) throw new Error(`${path.relative(ROOT, dir)}/pack.yaml does not exist`);
  const meta = YAML.parse(fs.readFileSync(path.join(dir, 'pack.yaml'), 'utf8'));
  const files = fs.readdirSync(dir).filter((f) => /^\d{2}-[a-z0-9-]+\.yaml$/.test(f)).sort();
  const errors = [];
  const nk = nativeOf(meta); // every meaning and title is { <nk>: "…" }
  // texts/NN-<slug>.yaml: one text each, by id
  const textsDir = path.join(dir, 'texts');
  const texts = new Map();
  if (fs.existsSync(textsDir)) {
    for (const f of fs.readdirSync(textsDir).filter((x) => /^\d{2}-[a-z0-9-]+\.yaml$/.test(x)).sort()) {
      const rel = path.relative(ROOT, path.join(textsDir, f));
      let text;
      try {
        text = YAML.parse(fs.readFileSync(path.join(textsDir, f), 'utf8'));
      } catch (err) {
        errors.push(`${rel}: invalid YAML: ${err.message}`);
        continue;
      }
      for (const k of Object.keys(text || {})) if (!TEXT_KEYS.includes(k)) errors.push(`${rel}: unknown key "${k}"`);
      for (const m of textProblems(text, { native: nk })) errors.push(`${rel}: ${m}`);
      if (text.cloze) for (const m of clozeProblems(text.cloze, text)) errors.push(`${rel}: ${m}`);
      if (text.openCloze) for (const m of clozeProblems(text.openCloze.map((g) => ({ ...g, kind: 'open' })), text)) errors.push(`${rel} openCloze: ${m}`);
      if (text.wordForm) for (const m of clozeProblems(text.wordForm.map((g) => ({ ...g, kind: 'word_form' })), text)) errors.push(`${rel} wordForm: ${m}`);
      if (text.gapped) for (const m of gappedProblems(text.gapped, text, { native: nk })) errors.push(`${rel}: ${m}`);
      if (texts.has(text.id)) errors.push(`${rel}: text id ${text.id} is used twice`);
      texts.set(text.id, { ...text, file: rel });
    }
  }
  // a localized text: the pack's native key, plus any other native languages' meanings (a variant course's layer)
  const one = (obj) => typeof obj?.[nk] === 'string' && Boolean(obj[nk]) && isLocalized(obj) && Object.values(obj).every(Boolean);
  const units = files.map((file) => {
    const rel = path.relative(ROOT, path.join(dir, file));
    let unit;
    try {
      unit = expandIds(YAML.parse(fs.readFileSync(path.join(dir, file), 'utf8')), track);
    } catch (err) {
      errors.push(`${rel}: invalid YAML: ${err.message}`);
      return null;
    }
    const extra = (obj, keys, where) => Object.keys(obj || {}).filter((k) => !keys.includes(k)).forEach((k) => errors.push(`${rel} ${where}: unknown key "${k}"`));
    extra(unit, UNIT_KEYS, 'unit');
    for (const k of ['id', 'title', 'icon', 'vocabulary']) if (!unit?.[k]) errors.push(`${rel}: missing "${k}"`);
    const checkVocab = (v, i, where = 'vocabulary') => {
      extra(v, VOCAB_KEYS, `${where}[${i}]`);
      if (!POS_MAP[v.pos]) errors.push(`${rel} vocabulary[${i}] (${v.id}): pos "${v.pos}" is not one of ${Object.keys(POS_MAP).join(', ')}`);
      if (typeof v.target !== 'string' || !v.native?.[nk]) errors.push(`${rel} vocabulary[${i}] (${v.id}): needs target (string) and native.${nk}`);
      // An unquoted comma in a flow mapping splits the meaning: { nl: jas, vest } — quote it.
      if (v.native && !one(v.native)) errors.push(`${rel} vocabulary[${i}] (${v.id}): native must be { ${nk}: "…" } (quote meanings with commas)`);
      // Dutch: nouns carry their article (de / het) and record their plural; alsoNL only in Dutch.
      if (track === 'nl' && v.pos === 'noun' && typeof v.target === 'string' && !/^(de|het) \S/.test(v.target)) errors.push(`${rel} vocabulary[${i}] (${v.id}): a Dutch noun's target starts with its article: de … | het …`);
      if (track === 'nl' && v.pos === 'noun' && typeof v.plural !== 'string') errors.push(`${rel} vocabulary[${i}] (${v.id}): a Dutch noun records its plural (plural: "…"; "-" for none)`);
      if ((v.plural !== undefined || v.alsoNL !== undefined) && track !== 'nl') errors.push(`${rel} vocabulary[${i}] (${v.id}): plural and alsoNL are for Dutch only`);
      if (v.alsoNL !== undefined && (typeof v.alsoNL !== 'string' || !v.alsoNL.trim())) errors.push(`${rel} vocabulary[${i}] (${v.id}): alsoNL must be the Netherlands form (a string)`);
      if (track === 'fr' && v.pos === 'noun' && !['m', 'f'].includes(v.gender)) errors.push(`${rel} vocabulary[${i}] (${v.id}): a French noun needs gender: m | f`);
      if (v.gender && !(track === 'fr' && v.pos === 'noun')) errors.push(`${rel} vocabulary[${i}] (${v.id}): gender is for French nouns only`);
    };
    const checkSentence = (s, i, where = 'sentences') => {
      extra(s, SENTENCE_KEYS, `${where}[${i}]`);
      if (typeof s.target !== 'string' || !s.native?.[nk] || !Array.isArray(s.items) || !s.items.length) {
        errors.push(`${rel} ${where}[${i}] (${s.id}): needs target, native.${nk} and items`);
      }
    };
    (unit.vocabulary || []).forEach((v, i) => checkVocab(v, i));
    (unit.sentences || []).forEach((s, i) => checkSentence(s, i));
    (unit.append || []).forEach((b, k) => {
      extra(b, APPEND_KEYS, `append[${k}]`);
      if (!b.lesson?.id || !/-l\d{2}$/.test(b.lesson.id) || !one(b.lesson.title)) errors.push(`${rel} append[${k}]: needs lesson: { id: lNN, title: { ${nk}: "…" } }`);
      if (!(b.vocabulary || []).length) errors.push(`${rel} append[${k}]: needs vocabulary`);
      (b.vocabulary || []).forEach((v, i) => checkVocab(v, i, `append[${k}].vocabulary`));
      (b.sentences || []).forEach((s, i) => checkSentence(s, i, `append[${k}].sentences`));
    });
    (unit.lessons || []).forEach((l, i) => {
      extra(l, LESSON_KEYS, `lessons[${i}]`);
      // An unquoted comma in a flow mapping splits the title: { nl: Au, mijn knie! } — quote it.
      if (!one(l.title)) errors.push(`${rel} lessons[${i}] (${l.id}): title must be { ${nk}: "…" } (quote titles with commas)`);
    });
    if (!one(unit.title)) errors.push(`${rel}: unit title must be { ${nk}: "…" }`);
    if (unit.texts !== undefined) {
      if (!Array.isArray(unit.texts) || !unit.texts.length) errors.push(`${rel}: texts must list text ids`);
      else unit.texts = unit.texts.map((id) => texts.get(id) ?? (errors.push(`${rel}: text "${id}" is not in ${path.relative(ROOT, textsDir)}/`), null)).filter(Boolean);
    }
    (unit.sentences || []).forEach((s, i) => {
      if (s.finite && (typeof s.finite.word !== 'string' || !s.finite.hint?.[nk] || !String(s.target).includes(s.finite.word))) {
        errors.push(`${rel} sentences[${i}] (${s.id}): finite needs word (a verb of the sentence) and hint { ${nk}: "…" }`);
      }
      if (s.form && (typeof s.form.word !== 'string' || typeof s.form.stem !== 'string' || !String(s.target).includes(s.form.word)
        || s.form.stem.toLowerCase() === s.form.word.toLowerCase())) {
        errors.push(`${rel} sentences[${i}] (${s.id}): form needs word (a word of the sentence) and stem (another word it is made from)`);
      }
      // both gaps are emitted in the review, one after the other: the first shows the other's answer
      if (s.form && s.finite) errors.push(`${rel} sentences[${i}] (${s.id}): a sentence has either form or finite, not both`);
    });
    (unit.transforms || []).forEach((t, i) => {
      extra(t, TRANSFORM_KEYS, `transforms[${i}]`);
      if (!/^x\d{2}$/.test(String(t.id))) errors.push(`${rel} transforms[${i}]: id is x01, x02 …`);
      if (!Array.isArray(t.items) || !t.items.length) errors.push(`${rel} transforms[${i}] (${t.id}): needs items`);
      // the line is optional per course: a French transform may carry only the English one (French for English speakers,
      // French for English speakers); the course for Dutch speakers then shows none
      const otherOnly = isLocalized(t.native) && !(nk in t.native) && Object.values(t.native).every((m) => typeof m === 'string' && m);
      if (t.native !== undefined && !one(t.native) && !otherOnly) errors.push(`${rel} transforms[${i}] (${t.id}): native must be { ${nk}: "…" }`);
      for (const m of transformProblems(t, `${rel} transforms[${i}] (${t.id})`)) errors.push(m);
    });
    // a hide names the exercise of the course that hid it: fr-a1-1-u01-… or, in a variant course built from these sources, fe-a1-1-u01-…
    (unit.hidden || []).forEach((h, i) => {
      const local = typeof h?.exercise === 'string' ? h.exercise.replace(/^[a-z]{2}-/, `${track}-`) : '';
      if (!local.startsWith(`${unit.id}-`)) errors.push(`${rel} hidden[${i}]: needs exercise: <an exercise id of this unit>`);
    });
    return { ...unit, file: rel };
  });
  if (errors.length) throw new Error(`source errors:\n  ${errors.join('\n  ')}`);
  return { meta, units, dir };
}
