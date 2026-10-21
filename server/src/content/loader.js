// Reads content/packs, validates it, and builds the in-memory index the API serves from.
// Invalid content throws ContentError; the server refuses to start.
import path from 'node:path';
import { validateContent, formatErrors, PLAYABLE_TYPES, DEFAULT_SCHEMA_PATH } from './validate.js';
import { collectPackTexts, mcQuestionIsTarget, tokenKey } from '../audio/clips.js';
import { instructionKey } from './instructions.js';
import { DEFAULT_NATIVE_LANG, nativeText } from './localized.js';
import { orderToken, stripDiacritics, words } from './grading.js';
import { clozeParts, gappedParts, textSegments } from './texts.js';

export class ContentError extends Error {
  constructor(errors) {
    super(`Content validation failed with ${errors.length} error(s):\n${formatErrors(errors)}`);
    this.errors = errors;
  }
}

export function loadContent({ contentDir, schemaPath = DEFAULT_SCHEMA_PATH }) {
  const packsDir = path.join(contentDir, 'packs');
  const { errors, manifest, packs } = validateContent({ packsDir, schemaPath });
  if (errors.length) throw new ContentError(errors);

  const index = {
    manifest,
    // trackId: the course (progress, ids, lock); target: the language it teaches (grading, clips, word list)
    packs: new Map(), // packId -> { entry, trackId, target, pack, preview, lessonIds, requiredLessonIds (without extra lessons), textById }
    lessons: new Map(), // lessonId -> { lesson, packId, unitId, trackId, target, playableCount }
    exercises: new Map(), // exerciseId -> { exercise, lessonId, packId, trackId, target }
  };

  for (const { entry, track, pack } of packs) {
    const target = track.target ?? track.id;
    const lessonIds = [];
    const requiredLessonIds = []; // what level progress counts: extra lessons (Extra oefening) are optional
    const vocabById = new Map();
    const sentenceById = new Map();
    const textById = new Map();
    for (const unit of pack.units) {
      unit.vocabulary.forEach((v) => vocabById.set(v.id, v));
      (unit.sentences || []).forEach((s) => sentenceById.set(s.id, s));
      (unit.texts || []).forEach((t) => textById.set(t.id, t));
    }
    for (const unit of pack.units) {
      for (const lesson of unit.lessons) {
        lessonIds.push(lesson.id);
        if (!lesson.extra) requiredLessonIds.push(lesson.id);
        const playableCount = lesson.exercises.filter((e) => PLAYABLE_TYPES.includes(e.type)).length;
        index.lessons.set(lesson.id, { lesson, packId: pack.id, unitId: unit.id, trackId: track.id, target, playableCount });
        for (const exercise of lesson.exercises) {
          index.exercises.set(exercise.id, { exercise, lessonId: lesson.id, packId: pack.id, trackId: track.id, target });
        }
      }
    }
    // preview (manifest status): played in Admin → Levels → Preview only; learners never see it (routes check `preview`)
    index.packs.set(pack.id, { entry, trackId: track.id, target, pack, preview: entry.status === 'preview', lessonIds, requiredLessonIds, vocabById, sentenceById, textById });
  }
  return index;
}

// Deterministic Fisher-Yates so the same exercise always shows the same bank order
// (a reload doesn't reshuffle mid-exercise) while the order still differs from the answer.
function seededShuffle(list, seedText) {
  let seed = 0;
  for (const ch of seedText) seed = (seed * 31 + ch.codePointAt(0)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function shuffledAwayFrom(list, seedText, original = list) {
  for (let k = 0; k < 5; k++) {
    const s = seededShuffle(list, `${seedText}:${k}`);
    if (s.length < 2 || s.some((x, i) => x !== original[i])) return s;
  }
  return [...list].reverse();
}

const NO_AUDIO = { url: () => null, both: () => ({ audio: null, audioSlow: null }) };

/**
 * The pack as the client sees it: answers removed (grading is server-side), build_sentence tokens
 * shuffled into a word bank, and audio URLs from the pre-rendered manifest (null when a clip is missing).
 * Listening exercises carry only their clip URLs, never the listened text.
 * Native-side text ({ nl: … }) is resolved to the user's native language; `instruction` is an i18n key
 * that the client translates into the user's interface language.
 */
/** A comprehension question as the client sees it: no answer; options in a stable shuffled order. */
function publicQuestion(q, seed) {
  if (q.type === 'true_false_notgiven') return { id: q.id, type: q.type, statement: q.statement };
  // B2: the statements without their paragraph; a completion without its answers
  if (q.type === 'match_texts') return { id: q.id, type: q.type, labels: q.labels, statements: q.statements.map((x) => ({ id: x.id, statement: x.statement })) };
  if (q.type === 'complete') return { id: q.id, type: q.type, statement: q.statement };
  return { id: q.id, type: q.type, ...(q.question ? { question: q.question } : {}), ...(q.paragraph ? { paragraph: q.paragraph } : {}), options: seededShuffle(q.options, `${seed}:${q.id}`) };
}

/** The pieces of an order_paragraphs exercise: { id, text } per segment id (a paragraph by its first sentence id). */
function orderSegments(text, ex) {
  if (!text) return [];
  if ((ex.unit ?? 'sentence') === 'paragraph') {
    const byFirst = new Map((text.paragraphs ?? []).map((par) => [par[0].id, par.map((x) => x.target).join(' ')]));
    return ex.segments.map((id) => ({ id, text: byFirst.get(id) ?? '' }));
  }
  const byId = new Map(textSegments(text).map((x) => [x.id, x]));
  return ex.segments.map((id) => ({ id, text: byId.get(id)?.target ?? '', ...(byId.get(id)?.speaker ? { speaker: byId.get(id).speaker } : {}) }));
}

/**
 * A text as the client sees it: every sentence (or turn) with its meaning and clips — turns of speaker B in the
 * dialogue voice — the glossary, and the meanings of the course words it uses (tap a word: its meaning in a popover).
 * Known limitation: a listening exercise's transcript can be read off the pack, like a listening clip's URL.
 */
function publicText(p, text, { audio, nativeLang }) {
  const track = p.target;
  const nat = (v) => nativeText(v, nativeLang);
  const seg = (x) => ({ id: x.id, target: x.target, native: nat(x.native), ...audio.both(track, x.target, x.speaker === 'B' ? 'dialogue' : undefined) });
  // tap a word: its meaning, keyed like tap-to-hear (tokenKey); a noun also under its bare form (de huurprijs → huurprijs)
  const meanings = {};
  for (const id of text.items || []) {
    const v = p.vocabById.get(id);
    if (!v) continue;
    meanings[tokenKey(v.target)] = nat(v.native);
    const bare = String(v.target).replace(/^(de|het|le|la|les|the|a|an)\s+|^l'/i, '');
    if (!/\s/.test(bare)) {
      meanings[tokenKey(bare)] = nat(v.native);
      // a noun in the plural (coins, vrijwilligers, sujets): the Dutch plural as listed, else the regular -s
      if (v.pos === 'noun') meanings[tokenKey(v.plural && v.plural !== '-' ? v.plural : `${bare}s`)] = nat(v.native);
    }
  }
  // an inflected form of an item (generated for Dutch: begeleid, ontbrak, andere) shows the item's meaning
  for (const [form, id] of Object.entries(text.forms || {})) {
    const v = p.vocabById.get(id);
    if (v && !(tokenKey(form) in meanings)) meanings[tokenKey(form)] = nat(v.native);
  }
  // a glossary phrase (head teacher): each of its words shows the phrase's meaning
  for (const g of text.glossary || []) for (const w of [g.word, ...String(g.word).split(/\s+/)]) meanings[tokenKey(w)] = nat(g.native);
  return {
    id: text.id,
    kind: text.kind,
    title: nat(text.title),
    level: text.level,
    ...(text.speakers ? { speakers: text.speakers } : {}),
    ...(text.kind === 'dialogue' ? { turns: text.turns.map((t) => ({ ...seg(t), speaker: t.speaker })) } : { paragraphs: text.paragraphs.map((par) => par.map(seg)) }),
    glossary: (text.glossary || []).flatMap((g) => String(g.word).split(/\s+/)),
    meanings,
  };
}

/** One exercise as the client sees it (see publicPack): no answers, native text resolved, clip URLs. */
export function publicExercise(index, packId, ex, { audio = NO_AUDIO, nativeLang = DEFAULT_NATIVE_LANG } = {}) {
  const p = index.packs.get(packId);
  if (!p) return null;
  const track = p.target;
  const heard = (id) => (p.vocabById.get(id) ?? p.sentenceById.get(id))?.target;
  const nat = (v) => nativeText(v, nativeLang);
  const isSentence = (id) => p.sentenceById.has(id);
  const base = { type: ex.type, id: ex.id, instruction: instructionKey(ex, isSentence) };
  switch (ex.type) {
    case 'multiple_choice': {
      const fromTarget = mcQuestionIsTarget(ex);
      return {
        ...base,
        question: nat(ex.question),
        questionLang: fromTarget ? track : nativeLang,
        optionLang: fromTarget ? nativeLang : track,
        options: seededShuffle(ex.options.map((o) => nat(o.text)), ex.id),
        ...(fromTarget ? audio.both(track, ex.question) : { audio: null, audioSlow: null }),
      };
    }
    case 'match_pairs':
      return { ...base, pairs: ex.pairs.map((pair) => ({ left: pair.left, right: nat(pair.right) })) };
    case 'build_sentence':
      return {
        ...base,
        native: nat(p.sentenceById.get(ex.sentenceId)?.native),
        bank: shuffledAwayFrom([...ex.tokens, ...(ex.distractors || [])], ex.id, ex.tokens),
        // the sentence's final mark (. ? ! …): the tiles carry none, the client shows it
        // (none after an abbreviation that ends the sentence: "at ten a.m." — its tile keeps the dot)
        end: /(?:^|\s)(?:\p{L}\.){2,}$/u.test(ex.answer) ? null : ex.answer.match(/\s*[.!?…]+$/)?.[0] ?? null,
      };
    case 'fill_blank':
      return {
        ...base,
        sentence: ex.sentence,
        hint: nat(ex.hint),
        options: ex.options ? seededShuffle(ex.options, ex.id) : null,
        ...(ex.kind ? { kind: ex.kind } : {}),
        ...(ex.stem ? { stem: ex.stem } : {}),
      };
    case 'listen_choose':
      return {
        ...base,
        answerSide: ex.answerSide,
        optionLang: ex.answerSide === 'target' ? track : nativeLang,
        options: seededShuffle(ex.options.map((o) => nat(o.text)), ex.id),
        ...audio.both(track, heard(ex.listen)),
      };
    case 'listen_type':
      return { ...base, ...audio.both(track, heard(ex.listen)) };
    case 'reading':
    case 'dialogue':
    case 'listening':
      return { ...base, textId: ex.textId, question: publicQuestion(ex.question, ex.id) };
    case 'order_paragraphs': {
      const text = p.textById.get(ex.textId);
      const segs = orderSegments(text, ex);
      return { ...base, textId: ex.textId, unit: ex.unit ?? 'sentence', bank: shuffledAwayFrom(segs, ex.id, segs).map((x) => ({ id: orderToken(ex.id, x.id), text: x.text })) };
    }
    case 'cloze':
    case 'open_cloze':
    case 'word_form': {
      const text = p.textById.get(ex.textId);
      return {
        ...base,
        textId: ex.textId,
        parts: clozeParts(text, ex.gaps),
        gaps: ex.gaps.map((g) => ({ kind: g.kind ?? 'word', ...(g.hint ? { hint: nat(g.hint) } : {}), ...(g.stem ? { stem: g.stem } : {}) })),
        options: ex.options ? seededShuffle(ex.options, ex.id) : null,
      };
    }
    case 'gap_sentence': {
      // the text with its gaps, and the sentences to place (the removed ones and the extra ones) behind opaque tokens
      const text = p.textById.get(ex.textId);
      const byId = new Map(textSegments(text).map((x) => [x.id, x.target]));
      const bank = [...ex.gaps.map((id) => ({ id, text: byId.get(id) ?? '' })), ...ex.extra.map((x) => ({ id: x.id, text: x.target }))];
      return {
        ...base,
        textId: ex.textId,
        parts: gappedParts(text, ex.gaps),
        bank: shuffledAwayFrom(bank, ex.id, bank).map((x) => ({ id: orderToken(ex.id, x.id), text: x.text })),
      };
    }
    case 'transform': {
      const [before, after] = ex.gapped.split('___');
      return { ...base, from: ex.from, key: ex.key, before, after, ...(ex.native ? { native: nat(ex.native) } : {}) };
    }
    default:
      return { ...base, reserved: true };
  }
  }

/** The path of a pack (Home): { id, track, cefr, title, units: [{ id, title, icon, lessons: [{ id, title, extra? }] }] }. */
export function packPath(index, packId, { nativeLang = DEFAULT_NATIVE_LANG } = {}) {
  const p = index.packs.get(packId);
  if (!p) return null;
  const nat = (v) => nativeText(v, nativeLang);
  return {
    id: p.pack.id,
    track: p.pack.track,
    language: p.target,
    cefr: p.pack.cefr,
    title: p.entry.title,
    ...(p.entry.branch ? { branch: true, after: p.entry.after } : {}),
    units: p.pack.units.map((unit) => ({
      id: unit.id,
      title: nat(unit.title),
      icon: unit.icon,
      lessons: unit.lessons.map((lesson) => ({ id: lesson.id, title: nat(lesson.title), ...(lesson.extra ? { extra: true } : {}) })),
    })),
  };
}

export function publicPack(index, packId, { audio = NO_AUDIO, nativeLang = DEFAULT_NATIVE_LANG } = {}) {
  const p = index.packs.get(packId);
  if (!p) return null;
  const track = p.target; // clips and lang attributes: the language taught (a variant course plays its target's clips)
  const { words } = collectPackTexts(p.pack);
  const nat = (v) => nativeText(v, nativeLang);

  const publicExerciseOf = (ex) => publicExercise(index, packId, ex, { audio, nativeLang });

  // Tap-to-hear: every visible word, plus whole vocabulary phrases ("je m'appelle") for match-pair cards.
  const wordAudio = {};
  for (const w of [...words].sort()) {
  const u = audio.url(track, 'normal', w);
  if (u) wordAudio[w] = u;
  }
  for (const v of p.vocabById.values()) {
  const key = tokenKey(v.target);
  const u = audio.url(track, 'normal', v.target);
  if (u && !wordAudio[key]) wordAudio[key] = u;
  }

  return {
  id: p.pack.id,
  track: p.pack.track,
  language: track, // the language taught (lang attributes): `target` would read as an answer (the API never sends those)
  cefr: p.pack.cefr,
  title: p.entry.title,
  ...(p.entry.branch ? { branch: true, after: p.entry.after } : {}),
  nativeLang,
  wordAudio,
  units: p.pack.units.map((unit) => ({
    id: unit.id,
    title: nat(unit.title),
    icon: unit.icon,
    // Ids and clip URLs only: the texts stay server-side so listening exercises can't be read off the pack.
    vocabulary: unit.vocabulary.map((v) => ({ id: v.id, ...audio.both(track, v.target) })),
    sentences: (unit.sentences || []).map((s) => ({ id: s.id, ...audio.both(track, s.target) })),
    ...(unit.texts?.length ? { texts: unit.texts.map((t) => publicText(p, t, { audio, nativeLang })) } : {}),
    lessons: unit.lessons.map((lesson) => ({
      id: lesson.id,
      title: nat(lesson.title),
      ...(lesson.extra ? { extra: true } : {}),
      exercises: lesson.exercises.map(publicExerciseOf),
    })),
  })),
  };
}

/**
 * Audio for the correct answer, returned with the graded attempt (so nothing is audible before the
 * child answers): the target-language sentence or word that the exercise is about.
 */
/**
 * Notes shown with the graded answer: Dutch words whose Netherlands form differs from the Belgian one taught
 * (`alsoNL` on a vocabulary item) → { alsoNL: [{ target: 'de gsm', nl: 'de mobiel' }] }; {} when there are none.
 */
export function answerNotes(index, packId, exercise) {
  const p = index.packs.get(packId);
  if (!p) return {};
  const alsoNL = [...new Set(exercise.items || [])].map((id) => p.vocabById.get(id)).filter((v) => v?.alsoNL)
    .map((v) => ({ target: v.target, nl: v.alsoNL }));
  return alsoNL.length ? { alsoNL } : {};
}

export function answerAudio(index, packId, exercise, audio = NO_AUDIO) {
  const p = index.packs.get(packId);
  if (!p) return {};
  const track = p.target;
  const targetOf = (id) => (p.vocabById.get(id) ?? p.sentenceById.get(id))?.target;
  let text = null;
  switch (exercise.type) {
    case 'multiple_choice':
      text = mcQuestionIsTarget(exercise) ? exercise.question : exercise.options.find((o) => o.correct).text;
      break;
    case 'build_sentence':
      text = exercise.sentenceId ? targetOf(exercise.sentenceId) : exercise.answer;
      break;
    case 'fill_blank':
      text = exercise.sentenceId ? targetOf(exercise.sentenceId) : exercise.sentence.replace('___', exercise.answer);
      break;
    case 'listen_choose':
    case 'listen_type':
      text = targetOf(exercise.listen);
      break;
    default:
      return {};
  }
  const out = audio.both(track, text);
  return out.audio ? out : {};
}

/** Item ids an attempt exercises: the exercise's vocabulary items plus its sentence / listened item, if any. */
export function attemptItemIds(exercise) {
  const ids = [...exercise.items];
  for (const extra of [exercise.sentenceId, exercise.listen]) if (extra && !ids.includes(extra)) ids.push(extra);
  return ids;
}

const knownWordsCache = new WeakMap();
/**
 * Every target-language word of a course (vocabulary, sentences, exercise answers and options), normalized and without
 * accents, as the dictation grader compares them. A typed word in this set is a real word of the course, so the grader
 * never treats it as a one-letter slip of another word. Cached per loaded content (a reload builds a new one).
 */
export function knownWordsOf(index, target) {
  if (!knownWordsCache.has(index)) knownWordsCache.set(index, new Map());
  const byTrack = knownWordsCache.get(index);
  if (!byTrack.has(target)) {
    const set = new Set();
    const add = (text) => {
      if (typeof text !== 'string') return;
      for (const w of words(text)) set.add(stripDiacritics(w));
    };
    for (const p of index.packs.values()) {
      if (p.target !== target) continue; // every course of the language: a word of fr is a word of fr-en
      for (const unit of p.pack.units) {
        for (const v of unit.vocabulary) add(v.target);
        for (const x of unit.sentences || []) add(x.target);
        for (const t of unit.texts || []) for (const x of textSegments(t)) add(x.target);
        for (const lesson of unit.lessons) {
          for (const ex of lesson.exercises) {
            add(ex.answer);
            for (const o of ex.options || []) add(typeof o === 'string' ? o : o.text);
          }
        }
      }
    }
    byTrack.set(target, set);
  }
  return byTrack.get(target);
}
