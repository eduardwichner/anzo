// Deterministic exercise generator: unit sources (vocabulary, sentences, lesson split) -> schemaVersion 2 pack.
// Every random choice is seeded by the id of the exercise it belongs to, so unchanged sources give a
// byte-identical pack. Rules (content/README.md, "Generated packs"):
//   - per unit: 3–5 lessons of 6–8 new words (+ the sentences they complete), 12–14 exercises each, then a
//     review lesson ("Herhaling", id <unit>-review) over the whole unit
//   - introduce before test: a word's first appearance is a multiple_choice target→native; match, fill_blank,
//     build_sentence and listen exercises come after the words they use were introduced
//   - distractors: same pack, same part of speech, same unit first; never the same Dutch meaning as the answer;
//     no duplicate option texts
//   - match_pairs 4–6 pairs with distinct meanings; fill_blank blanks a unit word, hint = its Dutch meaning,
//     word bank at Pre-A1, typed above; build_sentence ≤ 7 words (Pre-A1) / ≤ 10, 2 distractor tokens from the
//     unit; listen_type ≤ 5 words (Pre-A1) / ≤ 8; one listen_choose per answer side per lesson
import { CLOZE_GAPS, containsWord, LISTENING_QUESTION_TYPES } from '../../server/src/content/texts.js';
import { POS_MAP } from './sources.js';
import { formsOf as dutchFormsOf, tokenize as dutchTokenize } from './dutch.js';
import { formsOf as frenchFormsOf } from './french.js';
import { inflectionCandidates } from './trace-lib.js';

export const LEVEL_RULES = {
  'Pre-A1': { buildMax: 7, listenMax: 5, fillBank: true },
  'A1.1': { buildMax: 7, listenMax: 5, fillBank: true },
  A1: { buildMax: 10, listenMax: 8, fillBank: false },
  A2: { buildMax: 10, listenMax: 8, fillBank: false },
  B1: { buildMax: 12, listenMax: 10, fillBank: false, noCognateBlank: true, textForms: true, orderAlternatives: true },
  B2: { buildMax: 14, listenMax: 12, fillBank: false, noCognateBlank: true, textForms: true, orderAlternatives: true, gapsReach: true, hintCheck: true },
};
export const LESSON_MIN_WORDS = 6;
export const LESSON_MAX_WORDS = 8;
/** Title of a unit's review lesson, in the course's native language. */
export const REVIEW_TITLES = { nl: 'Herhaling', en: 'Review' };
export const REVIEW_TITLE = { nl: REVIEW_TITLES.nl };
/** Extra lessons (pack.yaml extraLessons): optional, at most this many exercises each, titled in the native language. */
export const EXTRA_MAX = 14;
export const EXTRA_MIN = 4;
export const EXTRA_TITLES = { nl: 'Extra oefening', en: 'Extra practice' };
/** The listening review of a B1 unit with vocabulary lessons (`<unit>-listening`). */
export const LISTENING_TITLES = { nl: 'Luisteren', en: 'Listening' };

// ---- seeded randomness ------------------------------------------------------------------------------
function hash(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return h >>> 0;
}
export function rng(seedText) {
  let a = hash(seedText);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(list, seedText) {
  const rand = rng(seedText);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---- text helpers ------------------------------------------------------------------------------------
/**
 * Word tiles of a sentence: split on spaces; a piece without letters or digits (French "!" "?" ":" after a space)
 * stays with the word before it ("Salut !"), so tiles joined with single spaces give the sentence back.
 */
export const words = (text) => {
  const out = [];
  for (const w of text.trim().split(/\s+/)) {
    if (out.length && !/[\p{L}\p{N}]/u.test(w)) out[out.length - 1] += ` ${w}`;
    else out.push(w);
  }
  return out;
};
/** Noun targets carry their article: French "le chat", "l'école", "les yeux"; Dutch "de kat", "het huis". */
// French determiners: a word right after one is a noun (text forms: *la maîtrise* the noun, *je les maîtrise* the verb)
// short words that never carry a phrase's meaning on their own
const FRENCH_FUNCTION_WORDS = new Set(['par', 'pour', 'sans', 'avec', 'dans', 'sur', 'sous', 'est', 'sont', 'que', 'qui', 'il', 'elle', 'ils', 'elles', 'en', 'et', 'ou', 'ne', 'pas']);
const FRENCH_SUBJECTS = new Set(['je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'ne', "n'"]);
const FRENCH_DETERMINERS = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux', 'ce', 'cet', 'cette', 'ces', 'mon', 'ton',
  'son', 'ma', 'ta', 'sa', 'mes', 'tes', 'ses', 'notre', 'votre', 'leur', 'nos', 'vos', 'leurs', 'quelque', 'quelques', 'chaque']);
const ARTICLES = { fr: /^(le|la|les|un|une|des)\s+|^l['’]/i, nl: /^(de|het)\s+/i };
// English targets have no article form here; the French pattern never matched one and stays, so packs are unchanged.
const articleRe = (track) => ARTICLES[track] ?? ARTICLES.fr;
export const articleOfFor = (target, track = 'fr') => (target.match(articleRe(track))?.[0].trim().toLowerCase().replace('’', "'") ?? null);
export const stripArticleFor = (target, track = 'fr') => target.replace(articleRe(track), '');
const BARE = new Map(); // memoised: the distractor filter calls it for every word of the pack per exercise
const unaccent = (w) => w.normalize('NFD').replace(/\p{M}/gu, '');
const bare = (w) => {
  let b = BARE.get(w);
  if (b === undefined) BARE.set(w, (b = w.toLowerCase().replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')));
  return b;
};
/** Meaning parts: "groot, lang" / "de/het" alternatives count as separate meanings; an article does not count. */
const MEANING_ARTICLE = { nl: /^\s*(de|het|een)\s+/, en: /^\s*(the|a|an|to)\s+/ };
// English meanings (the Dutch course) also count a part without its bracket: "floor (storey)" overlaps "floor",
// "to be (in)" overlaps "to be"; Dutch meanings (the English and French packs) compare whole parts.
const computeMeaningParts = (text, native) => text.toLowerCase().split(/[,;/]/).map((s) => s.replace(MEANING_ARTICLE[native] ?? MEANING_ARTICLE.nl, '').trim())
  .flatMap((s) => (native === 'en' ? [s, s.replace(/\s*\([^)]*\)/g, '').trim()] : [s])).filter(Boolean);
// Memoised (a large pack compares every pair of meanings many times: about half the time of en-b1).
const MEANING_PARTS = new Map(); // native -> text -> parts (no key strings built per call)
const meaningParts = (text, native = 'nl') => {
  let byText = MEANING_PARTS.get(native);
  if (!byText) MEANING_PARTS.set(native, (byText = new Map()));
  let parts = byText.get(text);
  if (!parts) byText.set(text, (parts = computeMeaningParts(text, native)));
  return parts;
};
export const sameMeaningFor = (a, b, native = 'nl') => {
  const pa = meaningParts(a, native);
  return meaningParts(b, native).some((p) => pa.includes(p));
};
/**
 * Two vocabulary items that must never be offered against each other: same meaning, or listed in `avoid` — or, except in
 * matching pairs (`pairs: true`), in `avoidInChoices` (s'il te plaît / s'il vous plaît as two options of one
 * question, "alsjeblieft" / "alstublieft", are both "please" to a child; side by side in a matching pair they are a fair contrast).
 */
export const clashFor = (a, b, native = 'nl', { pairs = false } = {}) => sameMeaningFor(a.native[native], b.native[native], native)
  || (a.avoid || []).includes(b.id) || (b.avoid || []).includes(a.id)
  || (!pairs && ((a.avoidInChoices || []).includes(b.id) || (b.avoidInChoices || []).includes(a.id)));

/**
 * Homophones: a single-word listen_type cannot be fair for a word that sounds like another word of the
 * course (Dutch ijs / eis, hart / hard). `groups` comes from content/src/<track>/homophones.yaml; the rule applies to
 * packs whose pack.yaml does not set `legacyListenType: true` (the six English and French packs of Pre-A1 to A2 keep
 * their locked exercises).
 */
export function homophoneSet(groups = []) {
  const set = new Set();
  for (const g of groups) for (const w of g) set.add(String(w).toLowerCase());
  return set;
}

/** Where vocabulary `v` appears as a whole word/phrase in `sentence` (case-insensitive), not at the very start. */
export function blankPosition(sentence, target) {
  const esc = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[\\s"(])(${esc})(?=$|[\\s.,!?;:")])`, 'gi');
  let m;
  const hits = [];
  while ((m = re.exec(sentence))) hits.push({ index: m.index + m[1].length, text: m[2] });
  const usable = hits.filter((h) => h.index > 0);
  return usable.length === 1 ? usable[0] : null;
}

/**
 * Build the pack.
 * @param meta  { id, track, cefr, source }
 * @param units unit sources in order (see sources.js)
 * @returns pack object (schemaVersion 2)
 */
/**
 * @param lowerVocab vocabulary of the track's lower levels (a typed fill-in of A1 must not have an A1.1 twin either)
 */
export function generatePack(meta, units, { lowerVocab = [], homophones = [] } = {}) {
  const rules = LEVEL_RULES[meta.cefr];
  if (!rules) throw new Error(`no generator rules for cefr "${meta.cefr}"`);
  const nk = meta.native ?? 'nl'; // the course's native language: every meaning, option and title is { [nk]: … }
  const loc = (text) => ({ [nk]: text });
  const nlOf = (x) => x.native[nk];
  // memoised per pair of items (pure: meanings and avoid lists)
  const clashMemo = new Map();
  const clash = (a, b) => {
    let row = clashMemo.get(a);
    if (!row) clashMemo.set(a, (row = new Map()));
    let r = row.get(b);
    if (r === undefined) row.set(b, (r = clashFor(a, b, nk)));
    return r;
  };
  const sameMeaning = (a, b) => sameMeaningFor(a, b, nk);
  const articleOf = (target) => articleOfFor(target, meta.track);
  const stripArticle = (target) => stripArticleFor(target, meta.track);
  const soundsAlike = meta.legacyListenType ? new Set() : homophoneSet(homophones);
  /** A single word (after its article) that sounds like another word of the course. */
  const isHomophone = (text) => {
    const w = words(stripArticle(text)).map(bare);
    return w.length === 1 && soundsAlike.has(w[0]);
  };
  const fail = (msg) => {
    throw new Error(msg);
  };

  // Pack-wide indexes
  const vocabById = new Map();
  const unitOfVocab = new Map();
  for (const unit of units) {
    for (const v of unit.vocabulary) {
      if (vocabById.has(v.id)) fail(`${unit.file}: vocabulary id ${v.id} is used twice`);
      vocabById.set(v.id, v);
      unitOfVocab.set(v.id, unit.id);
    }
  }
  const allVocab = [...vocabById.values()];
  const appendedPackVocab = units.flatMap((u) => (u.append || []).flatMap((b) => b.vocabulary || []));
  // Appended content (unit `append:`, added after a unit's exercises were locked) is known by id, but stays out of every
  // pool the existing exercises draw from, so nothing generated before it changes.
  for (const unit of units) {
    for (const block of unit.append || []) {
      for (const v of block.vocabulary || []) {
        if (vocabById.has(v.id)) fail(`${unit.file}: vocabulary id ${v.id} is used twice`);
        vocabById.set(v.id, v);
        unitOfVocab.set(v.id, unit.id);
      }
    }
  }

  /**
   * Distractor candidates for `answer` (a vocab item): same pos, same unit first, then the pack; never the same Dutch
   * meaning, never the same target text, never in `exclude` (ids or bare target texts).
   */
  // sameArticle: the exercise shows target texts, so a noun's options share its article (le/la/l'/les): the article
  // never gives the answer away.
  // agree: a bare French noun is blanked after a determiner the child sees (ma ___, mes ___), so its options share
  // its gender and number.
  const distractors = (answer, n, seed, { exclude = new Set(), avoidMeanings = [], samePos = true, sameArticle = false, agree = false } = {}) => {
    const unitId = unitOfVocab.get(answer.id);
    // A category word ("animal") is never a wrong option for a word of the same part of speech anywhere in the pack
    // (it might be a member: bee is an animal), nor the reverse.
    // Dutch: only within the unit (de kamer and de keuken are taught together); other units' nouns are fair options.
    const member = (v) => (v.category || answer.category) && v.pos === answer.pos
      && (meta.track !== 'nl' || unitOfVocab.get(v.id) === unitOfVocab.get(answer.id));
    // (no article is a form too: maman, lundi, internet get options without one)
    const article = sameArticle ? articleOf(answer.target) : undefined;
    const ok = (v) => v.id !== answer.id && !exclude.has(v.id) && !exclude.has(bare(v.target)) && !member(v)
      && bare(v.target) !== bare(answer.target) && !clash(v, answer)
      && !avoidMeanings.some((m) => sameMeaning(nlOf(v), m))
      && (article === undefined || articleOf(v.target) === article)
      && (!agree || (v.pos === answer.pos && v.gender === answer.gender && (articleOf(v.target) === 'les') === (articleOf(answer.target) === 'les')));
    // `ok` once per word, then the tiers (filter keeps the order, so the shuffles see the same lists)
    const good = allVocab.filter(ok);
    const tiers = [
      good.filter((v) => v.pos === answer.pos && unitOfVocab.get(v.id) === unitId),
      good.filter((v) => v.pos === answer.pos && unitOfVocab.get(v.id) !== unitId),
      ...(samePos ? [] : [good.filter((v) => v.pos !== answer.pos && unitOfVocab.get(v.id) === unitId)]),
      good.filter((v) => POS_MAP[v.pos] === POS_MAP[answer.pos] && v.pos !== answer.pos),
      good.filter((v) => POS_MAP[v.pos] !== POS_MAP[answer.pos]), // last resort: any word of the pack
    ];
    const out = [];
    const seenTargets = new Set([bare(answer.target)]);
    const seenMeanings = [answer];
    tiers.forEach((tier, k) => {
      for (const v of shuffle(tier, `${seed}:${k}`)) {
        if (out.length >= n) return;
        if (seenTargets.has(bare(v.target)) || seenMeanings.some((m) => clash(m, v))) continue;
        out.push(v);
        seenTargets.add(bare(v.target));
        seenMeanings.push(v);
      }
    });
    return out;
  };

  // names and languages: words capitalised inside a sentence (not as its first word), or a capitalised vocabulary target
  const clean = (w) => w.replace(/^[("]+|[.,!?;:")]+$/g, '');
  const properWords = new Set([
    ...units.flatMap((u) => (u.sentences || []).flatMap((x) => [x.target, ...(x.acceptAlso || [])]))
      .flatMap((t) => t.split(/\s+/).filter((w, k, all) => k > 0 && !/[.!?]$/.test(all[k - 1]) && !(k === 1 && all[0] === "'s"))).map(clean).filter((w) => /^\p{Lu}/u.test(w)),
    ...[...units.flatMap((u) => u.vocabulary), ...lowerVocab].map((v) => v.target).filter((t) => /^\p{Lu}/u.test(t)).flatMap((t) => t.split(/\s+/)),
  ]);
  // names in appended sentences: known to their own build tiles only (existing tiles stay as they were)
  const appendedProper = new Set(units.flatMap((u) => (u.append || []).flatMap((b) => b.sentences || []))
    .flatMap((x) => x.target.split(/\s+/).filter((w, k, all) => k > 0 && !/[.!?]$/.test(all[k - 1]))).map(clean).filter((w) => /^\p{Lu}/u.test(w)));
  const introduced = new Set(); // vocab ids introduced so far in the pack (earlier units and lessons)
  // B2 (rules.gapsReach): a (sentence, word) fill-in that a lesson of this unit already asked is not asked again (level review #3)
  const filledBefore = new Set();

  // ---- text units (B1 groundwork): one lesson per text, then a review lesson that listens to the unit's texts --------
  // Per text, in order: the reading or dialogue exercise (one exercise per question), a cloze on the same text, and
  // order_paragraphs when the author marked the text orderable. Ids are positional per lesson, like every lesson.
  const CEFR_RANK = ['Pre-A1', 'A1.1', 'A1', 'A2', 'B1', 'B2'];
  const typedCloze = CEFR_RANK.indexOf(meta.cefr) >= CEFR_RANK.indexOf('B1'); // below B1 a cloze has a word bank
  const bareOf = (v) => stripArticle(v.target);
  /**
   * The lessons of a unit's texts: one lesson per text (numbered from `first`), and the listening review (`reviewId`:
   * every text heard, its listening questions). Shared by text-only units (the pilot units) and B1 units that
   * also have vocabulary lessons.
   */
  const textLessons = (unit, { first = 1, reviewId = `${unit.id}-review` } = {}) => {
    const lessons = [];
    unit.texts.forEach((text, ti) => {
      const lid = `${unit.id}-l${String(ti + first).padStart(2, '0')}`;
      let n = 0;
      const id = () => `${lid}-e${String(++n).padStart(2, '0')}`;
      const exs = [];
      // B2: a gapped text comes first, before the text is shown whole by its questions
      if (text.gapped) {
        exs.push({ type: 'gap_sentence', id: id(), items: text.items, textId: text.id, gaps: [...text.gapped.gaps],
          extra: text.gapped.extra.map((x) => ({ id: x.id, target: x.target, native: { ...x.native } })) });
      }
      exs.push(...text.questions.map((q) => ({ type: text.kind, id: id(), items: text.items, textId: text.id, question: q })));
      // cloze: authored gaps, or the text's own course words (items) where they occur (a B2 text with an open cloze or a
      // word-formation text may leave it out: cloze: [] none)
      const segs = text.kind === 'dialogue' ? text.turns : text.paragraphs.flat();
      let gaps = text.cloze;
      const b2Gaps = Boolean(text.openCloze || text.wordForm);
      if (!gaps && !b2Gaps) {
        gaps = [];
        for (const itemId of text.items) {
          const v = vocabById.get(itemId);
          if (!v || gaps.length >= CLOZE_GAPS[1]) continue;
          const word = bareOf(v);
          const s = segs.find((x) => containsWord(x.target, word) && !gaps.some((g) => g.sentence === x.id));
          if (s) gaps.push({ sentence: s.id, word });
        }
        if (gaps.length < CLOZE_GAPS[0]) fail(`${text.file ?? unit.file}: ${text.id} needs a cloze: list 3–6 gaps (cloze: [{ sentence, word, kind?, hint? }]); its items give only ${gaps.length}`);
      }
      const itemsOf = (list) => {
        const found = [...new Set(list.map((g) => text.items.find((it) => vocabById.get(it) && bareOf(vocabById.get(it)).toLowerCase() === g.word.toLowerCase())).filter(Boolean))];
        return found.length ? found : text.items;
      };
      if (gaps?.length) {
        const cloze = { type: 'cloze', id: id(), items: itemsOf(gaps), textId: text.id, gaps: gaps.map((g) => ({ ...g })) };
        if (!typedCloze) {
          const gapWords = new Set(gaps.map((g) => g.word.toLowerCase()));
          const extra = shuffle(unit.vocabulary.map(bareOf).filter((w) => !gapWords.has(w.toLowerCase()) && !/\s/.test(w)), `${cloze.id}:bank`).slice(0, 2);
          cloze.options = shuffle([...gaps.map((g) => g.word), ...extra], cloze.id);
        }
        if (typedCloze) for (const g of cloze.gaps) if (!g.hint) fail(`${text.file ?? unit.file}: ${text.id} cloze gap "${g.word}" needs a hint (a typed cloze: its meaning, or the infinitive and tense)`);
        exs.push(cloze);
      }
      // B2: an open cloze (no hints; acceptAlso per gap) and a word-formation text (a stem per gap, in capitals)
      if (text.openCloze) {
        exs.push({ type: 'open_cloze', id: id(), items: itemsOf(text.openCloze), textId: text.id,
          gaps: text.openCloze.map((g) => ({ sentence: g.sentence, word: g.word, kind: 'open', ...(g.acceptAlso ? { acceptAlso: [...g.acceptAlso] } : {}) })) });
      }
      if (text.wordForm) {
        exs.push({ type: 'word_form', id: id(), items: itemsOf(text.wordForm), textId: text.id,
          gaps: text.wordForm.map((g) => ({ sentence: g.sentence, word: g.word, kind: 'word_form', stem: String(g.stem).toUpperCase(), ...(g.acceptAlso ? { acceptAlso: [...g.acceptAlso] } : {}) })) });
      }
      if (text.orderable) {
        let unitKind;
        let segments;
        if (text.kind === 'dialogue') { unitKind = 'turn'; segments = text.turns.slice(0, 8).map((x) => x.id); }
        else if (text.paragraphs.length >= 3) { unitKind = 'paragraph'; segments = text.paragraphs.slice(0, 8).map((par) => par[0].id); }
        else { unitKind = 'sentence'; segments = text.paragraphs.flat().slice(0, 8).map((x) => x.id); }
        if (segments.length < 3) fail(`${text.file ?? unit.file}: ${text.id} is orderable but has fewer than 3 parts`);
        exs.push({ type: 'order_paragraphs', id: id(), items: text.items, textId: text.id, unit: unitKind, segments });
      }
      lessons.push({ id: lid, title: { ...text.title }, exercises: exs });
    });
    // review: listen to every text of the unit (its listening questions, else its multiple-choice and true/false ones)
    let rn = 0;
    const rv = [];
    for (const text of unit.texts) {
      const qs = text.listeningQuestions ?? text.questions.filter((q) => LISTENING_QUESTION_TYPES.includes(q.type));
      for (const q of qs) rv.push({ type: 'listening', id: `${reviewId}-e${String(++rn).padStart(2, '0')}`, items: text.items, textId: text.id, question: q });
    }
    const review = rv.length ? { id: reviewId, title: { [nk]: first === 1 ? REVIEW_TITLES[nk] : LISTENING_TITLES[nk] }, exercises: rv } : null;
    return { lessons, review };
  };
  // the cloze lives in its exercise; file is the source. `forms` maps an inflected form in the text (begeleid, ontbrak,
  // postponed, soutient) to the course word it belongs to, so a tap shows that word's meaning (the loader keys meanings by it)
  const courseWords = new Set([...allVocab, ...lowerVocab].map((v) => stripArticle(v.target).toLowerCase()));
  const otherForms = (t, segs) => {
    const forms = {};
    // the words as the client splits them (whitespace, tokenKey); French: the form after an elision (l'amitié, s'est)
    const tokens = [...new Set(segs.flatMap((x) => String(x.target).split(/\s+/)).map((w) => w.normalize('NFC')
      .replace(/[‘’ʼ]/g, "'").toLowerCase().replace(/^[\s.,!?;:"«»()…¿¡-]+|[\s.,!?;:"«»()…¿¡-]+$/gu, '')).filter(Boolean))];
    const items = (t.items || []).map((id) => vocabById.get(id)).filter(Boolean);
    if (meta.track === 'en') {
      const byLemma = new Map(items.filter((v) => !/\s/.test(stripArticle(v.target))).map((v) => [stripArticle(v.target).toLowerCase(), v.id]));
      for (const w of tokens) {
        if (courseWords.has(w) || !/^[a-z]+$/.test(w)) continue;
        // verb forms and plurals only (not -er/-est/-ly: teacher, happily are other words)
        const hit = inflectionCandidates(w).find((c) => ['past', 'pp', 'ed', 'ing', 'plural', 'present'].includes(c.kind) && byLemma.has(c.base));
        if (hit) forms[w] = byLemma.get(hit.base);
      }
    } else if (meta.track === 'fr') {
      const byForm = new Map();
      for (const v of items) {
        const lemma = stripArticle(v.target);
        if (/\s/.test(lemma.replace(/^se /, ''))) continue;
        for (const [f] of frenchFormsOf({ lemma, pos: v.pos, gender: v.gender })) {
          const k = f.toLowerCase();
          if (k !== lemma.toLowerCase() && !byForm.has(k)) byForm.set(k, v.id);
        }
      }
      // A plural of another course noun (*produits*, B1 *le produit*) is that noun, not a form of a text item (*produire*), in both
      // French courses (the text forms are display only: the lock does not cover them)
      const nounForms = new Set([...allVocab, ...lowerVocab].filter((v) => v.pos === 'noun' && !items.includes(v))
        .flatMap((v) => frenchFormsOf({ lemma: stripArticle(v.target), pos: v.pos, gender: v.gender }).map(([f]) => f.toLowerCase())));
      // a word the text uses as a verb although a course noun is spelt the same (*je les maîtrise*, *la maîtrise*), when that
      // noun is not a text item and no determiner stands before it (fe-b2-u18 review)
      const itemTargets = new Set(items.map((v) => stripArticle(v.target).toLowerCase()));
      // every form of every single-word course word (built once per pack, on first use)
      let allForms = null;
      const courseForms = () => (allForms ??= new Set([...allVocab, ...lowerVocab].filter((v) => !/\s/.test(stripArticle(v.target)))
        .flatMap((v) => frenchFormsOf({ lemma: stripArticle(v.target), pos: v.pos, gender: v.gender }).map(([f]) => f.toLowerCase()))));
      const verbForms = new Map();
      for (const v of items.filter((x) => x.pos === 'verb')) {
        const lemma = stripArticle(v.target).replace(/^se /, '').replace(/^s'/, '');
        if (/\s/.test(lemma)) continue;
        for (const [f] of frenchFormsOf({ lemma, pos: v.pos })) if (!verbForms.has(f.toLowerCase())) verbForms.set(f.toLowerCase(), v.id);
      }
      const words = (x) => String(x.target).split(/\s+/).map((w) => w.normalize('NFC').replace(/[‘’ʼ]/g, "'").toLowerCase()
        .replace(/^[\s.,!?;:"«»()…¿¡-]+|[\s.,!?;:"«»()…¿¡-]+$/gu, '')).filter(Boolean);
      const core = (w) => w.replace(/^(?:[a-z]|qu|jusqu|lorsqu|puisqu)'/, '');
      const afterDeterminer = new Set();
      for (const x of segs) {
        const ws = words(x);
        ws.forEach((w, i) => {
          const prev = i ? ws[i - 1] : '';
          // le / la / les after a subject pronoun or *ne* is an object pronoun (*je les maîtrise*), not a determiner
          const pronoun = ['le', 'la', 'les'].includes(prev) && FRENCH_SUBJECTS.has(i > 1 ? ws[i - 2] : '');
          if (/^(?:l'|d')/.test(w) || (FRENCH_DETERMINERS.has(prev) && !pronoun)) afterDeterminer.add(core(w));
        });
      }
      for (const w of tokens) {
        const c = core(w);
        if (courseWords.has(w) || courseWords.has(c)) {
          if (!itemTargets.has(c) && verbForms.has(c) && !afterDeterminer.has(c)) forms[w] = verbForms.get(c);
          continue;
        }
        if (nounForms.has(c) && !items.some((v) => v.pos === 'noun' && byForm.get(c) === v.id)) continue;
        if (byForm.has(c)) forms[w] = byForm.get(c);
      }
      // the words of a multi-word item (*tenir compagnie*: *tient*, *compagnie*; *en moyenne*: *moyenne*) show its meaning where
      // the phrase stands, as a glossary phrase's words do — only a word that is not a course word, not mapped yet, and whose
      // every use in the text is inside the phrase (fe-b2-u14, fe-b2-u16)
      for (const v of items) {
        const parts = stripArticle(v.target).toLowerCase().replace(/^se /, '').split(/\s+/).map(core);
        if (parts.length < 2) continue;
        const partForms = parts.map((part, i) => new Set(i === 0 && v.pos === 'verb' ? frenchFormsOf({ lemma: part, pos: 'verb' }).map(([f]) => f.toLowerCase()) : [part]));
        const inPhrase = new Set();
        const outside = new Set();
        for (const x of segs) {
          const ws = words(x).map(core);
          const hit = partForms.every((set) => ws.some((w) => set.has(w)));
          for (const w of ws) (hit && partForms.some((set) => set.has(w)) ? inPhrase : outside).add(w);
        }
        for (const w of inPhrase) {
          // not a form of another course word (*est* of *être* in *il est temps que*), unless it is the phrase's own verb
          if (outside.has(w) || courseWords.has(w) || FRENCH_DETERMINERS.has(w) || FRENCH_FUNCTION_WORDS.has(w) || w.length < 3) continue;
          if (courseForms().has(w) && !(v.pos === 'verb' && partForms[0].has(w))) continue;
          const token = tokens.find((tk) => core(tk) === w);
          if (token && !(token in forms)) forms[token] = v.id;
        }
      }
    }
    return forms;
  };
  const stripText = ({ cloze, file, gapped, openCloze, wordForm, ...t }) => {
    if (meta.track !== 'nl') {
      if (!rules.textForms) return t;
      const forms = otherForms(t, t.kind === 'dialogue' ? t.turns : t.paragraphs.flat());
      return Object.keys(forms).length ? { ...t, forms } : t;
    }
    const forms = {};
    const segs = t.kind === 'dialogue' ? t.turns : t.paragraphs.flat();
    const tokens = new Set(segs.flatMap((x) => dutchTokenize(x.target).map((k) => k.word.toLowerCase())));
    for (const id of t.items || []) {
      const v = vocabById.get(id);
      if (!v) continue;
      const lemma = stripArticle(v.target).replace(/^zich\s+/, '');
      if (/\s/.test(lemma)) continue;
      for (const [f] of dutchFormsOf({ lemma, pos: v.pos, plural: v.plural ? String(v.plural) : undefined })) {
        const w = f.toLowerCase();
        if (w !== lemma.toLowerCase() && tokens.has(w) && !(w in forms)) forms[w] = id;
      }
    }
    return Object.keys(forms).length ? { ...t, forms } : t;
  };
  const textUnit = (unit) => {
    const { lessons, review } = textLessons(unit);
    if (review) lessons.push(review);
    const strip = stripText;
    return {
      id: unit.id,
      title: unit.title,
      icon: unit.icon,
      vocabulary: unit.vocabulary.map((v) => ({
        id: v.id, target: v.target, native: { ...v.native }, pos: POS_MAP[v.pos], ...(v.gender ? { gender: v.gender } : {}),
        ...(v.plural ? { plural: String(v.plural) } : {}), ...(v.alsoNL ? { alsoNL: v.alsoNL } : {}),
      })),
      sentences: (unit.sentences || []).map((x) => ({ id: x.id, target: x.target, native: { ...x.native }, items: x.items })),
      texts: unit.texts.map(strip),
      lessons,
    };
  };

  const packTwinMemo = new Map();
  const outUnits = units.map((unit) => {
    // a unit of texts only (the pilot units); a B1 unit with sentences has vocabulary lessons and text lessons
    if (unit.texts?.length && !unit.sentences?.length) return textUnit(unit);
    const unitVocab = unit.vocabulary;
    const sentences = (unit.sentences || []).map((s) => {
      for (const it of s.items) if (!vocabById.has(it)) fail(`${unit.file}: sentence ${s.id} item "${it}" is not a vocabulary id in this pack`);
      if (meta.track === 'nl') {
        // a Dutch alternative is another order of the same words; anything else would be dropped from build exercises
        const key = (t) => t.toLowerCase().replace(/[.,!?;:]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
        for (const a of s.acceptAlso || []) if (key(a) !== key(s.target)) fail(`${unit.file}: sentence ${s.id} acceptAlso "${a}" does not use the same words as the target`);
      }
      return s;
    });

    // ---- lesson split ------------------------------------------------------------------------------
    const pinned = unit.lessons || [];
    const assigned = new Set();
    const lessonPlans = pinned.map((l) => {
      for (const id of l.vocab) {
        if (!unitVocab.some((v) => v.id === id)) fail(`${unit.file}: lesson ${l.id} names "${id}", which is not vocabulary of this unit`);
        if (assigned.has(id)) fail(`${unit.file}: "${id}" is in two lessons`);
        assigned.add(id);
      }
      return { id: l.id, title: l.title, vocab: l.vocab.map((id) => vocabById.get(id)) };
    });
    const rest = unitVocab.filter((v) => !assigned.has(v.id));
    if (rest.length) {
      // Balanced: 25 words -> 7, 6, 6, 6 (never 7, 7, 7, 4).
      const k = Math.max(Math.ceil(rest.length / LESSON_MAX_WORDS), 1);
      let from = 0;
      for (let i = 0; i < k; i++) {
        const n = lessonPlans.length + 1;
        const size = Math.floor(rest.length / k) + (i < rest.length % k ? 1 : 0);
        lessonPlans.push({
          id: `${unit.id}-l${String(n).padStart(2, '0')}`,
          title: loc(`${unit.title[nk]} ${n}`),
          vocab: rest.slice(from, from + size),
        });
        from += size;
      }
    }

    // Sentences belong to the lesson in which their last item is introduced.
    const lessonOfItem = new Map();
    lessonPlans.forEach((lp, i) => lp.vocab.forEach((v) => lessonOfItem.set(v.id, i)));
    for (const lp of lessonPlans) lp.sentences = [];
    for (const s of sentences) {
      const idx = Math.max(0, ...s.items.map((it) => lessonOfItem.get(it) ?? (introduced.has(it) ? 0 : Infinity)));
      if (!Number.isFinite(idx)) fail(`${unit.file}: sentence ${s.id} uses ${s.items.join(', ')}, not all taught in this unit or an earlier one`);
      lessonPlans[idx].sentences.push(s);
    }

    // Typed fill-ins (A1 and up) never blank a word that has a twin with the same Dutch meaning in the pack
    // (ill/sick): the hint could not tell which one to type. A word bank (Pre-A1) never offers both.
    // (appended words count too: ziekenfonds and mutualiteit are twins; no older word shares their meanings)
    const twinMemo = packTwinMemo; // pack-wide: a word's twins do not depend on the unit
    const hasOwnTwin = (v) => {
      if (!twinMemo.has(v.id)) twinMemo.set(v.id, [...allVocab, ...lowerVocab, ...appendedPackVocab].some((w) => w.id !== v.id && sameMeaning(nlOf(w), nlOf(v))));
      return twinMemo.get(v.id);
    };
    // Dutch: a phrase that contains a word with a twin has one too (elke week / iedere week: elk and ieder are twins)
    const hasTwin = (v) => hasOwnTwin(v) || (meta.track === 'nl' && /\s/.test(v.target)
      && v.target.split(/\s+/).some((w) => [...allVocab, ...lowerVocab].some((x) => x.id !== v.id && bare(x.target) === w.toLowerCase() && hasOwnTwin(x))));
    // French for English speakers ignores accents here (fe-b2-u02 review): "evaluation" gives away *évaluation*,
    // which the French grader accepts unaccented. Only that course: every other pack's locked exercises keep the exact test.
    const fold = nk === 'en' && meta.track === 'fr' ? unaccent : (w) => w;
    const cognate = (v) => String(nlOf(v)).toLowerCase().split(/[,;(]/)
      .some((m) => fold(m.trim().replace(/^(to|a|an|the)\s+/, '')) === fold(stripArticle(v.target).toLowerCase()));
    const blankable = (s, pool) => s.items.map((id) => vocabById.get(id))
      .filter((v) => pool.some((p) => p.id === v.id) && (rules.fillBank || !hasTwin(v)) && !v.noBlank)
      // a French group noun (le fruit) has no same-gender options that are not its members: not in a word bank
      .filter((v) => !(rules.fillBank && v.category && v.gender))
      // B1: never blank a word whose hint is the answer itself (laptop, festival, camera: an international word)
      .filter((v) => !(rules.noCognateBlank && cognate(v)))
      .map((v) => ({ v, at: blankPosition(s.target, v.target) ?? (articleOf(v.target) ? blankPosition(s.target, stripArticle(v.target)) : null) }))
      .filter((x) => x.at);

    // ---- exercise builders ---------------------------------------------------------------------------
    const mcFromTarget = (id, v) => ({
      type: 'multiple_choice', id, items: [v.id], question: v.target,
      options: shuffle([{ text: loc(nlOf(v)), correct: true }, ...distractors(v, 3, id).map((d) => ({ text: loc(nlOf(d)) }))], id),
    });
    const mcToTarget = (id, v) => ({
      type: 'multiple_choice', id, items: [v.id], question: loc(nlOf(v)),
      options: shuffle([{ text: v.target, correct: true }, ...distractors(v, 3, id, { sameArticle: true }).map((d) => ({ text: d.target }))], id),
    });
    const mcSentence = (id, s, pool) => {
      const others = shuffle(pool.filter((o) => o.id !== s.id && nlOf(o) !== nlOf(s)), id).slice(0, 3);
      if (others.length < 2) return null;
      return {
        type: 'multiple_choice', id, items: s.items, question: s.target,
        options: shuffle([{ text: loc(nlOf(s)), correct: true }, ...others.map((o) => ({ text: loc(nlOf(o)) }))], id),
      };
    };
    const matchPairs = (id, list) => {
      const chosen = [];
      for (const v of list) {
        if (chosen.length >= 6) break;
        if (chosen.some((c) => clashFor(c, v, nk, { pairs: true }) || bare(c.target) === bare(v.target))) continue;
        chosen.push(v);
      }
      if (chosen.length < 4) return null;
      return { type: 'match_pairs', id, items: chosen.map((v) => v.id), pairs: chosen.map((v) => ({ left: v.target, right: loc(nlOf(v)) })) };
    };
    const listenWordTarget = (id, v) => ({
      type: 'listen_choose', id, items: [v.id], listen: v.id, answerSide: 'target',
      options: shuffle([{ text: v.target, correct: true }, ...distractors(v, 3, id, { sameArticle: true }).map((d) => ({ text: d.target }))], id),
    });
    const listenNative = (id, item, pool) => {
      if (item.items) { // sentence: other sentences' meanings
        const others = shuffle(pool.filter((o) => o.id !== item.id && nlOf(o) !== nlOf(item)), id).slice(0, 3);
        if (others.length < 2) return null;
        return {
          type: 'listen_choose', id, items: item.items, listen: item.id, answerSide: 'native',
          options: shuffle([{ text: loc(nlOf(item)), correct: true }, ...others.map((o) => ({ text: loc(nlOf(o)) }))], id),
        };
      }
      return {
        type: 'listen_choose', id, items: [item.id], listen: item.id, answerSide: 'native',
        options: shuffle([{ text: loc(nlOf(item)), correct: true }, ...distractors(item, 3, id).map((d) => ({ text: loc(nlOf(d)) }))], id),
      };
    };
    const fillBlank = (id, s, { v, at }) => {
      const ex = {
        type: 'fill_blank', id, items: s.items.includes(v.id) ? s.items : [v.id, ...s.items], sentenceId: s.id,
        sentence: `${s.target.slice(0, at.index)}___${s.target.slice(at.index + at.text.length)}`,
        answer: at.text, hint: loc(nlOf(v)),
      };
      // B2 (rules.hintCheck): the hint is the English meaning; one that spells out the answer (a meaning with a Dutch phrase
      // in it) gives the gap away
      if (rules.hintCheck) {
        const answer = fold(bare(stripArticle(at.text)).toLowerCase());
        if (Object.values(ex.hint).some((h) => words(String(h)).map((w) => fold(bare(w).toLowerCase())).includes(answer))) {
          fail(`${s.id}: the hint of the fill-in for "${at.text}" contains the answer; write the meaning without Dutch ("as in: …")`);
        }
      }
      if (rules.fillBank) {
        const inSentence = new Set(words(s.target).map(bare));
        // The bank shows the blanked form: with its article (same article for every option) or the bare noun.
        const withArticle = articleOf(at.text) !== null;
        const agree = !withArticle && Boolean(v.gender);
        let opts;
        if (meta.track === 'nl') {
          // Dutch: a bare noun (het ___ is wit) gets nouns of its own article (de / het), so the article in the sentence
          // never rules options out; a capitalised answer inside the sentence (a language: Frans) gets capitalised words first.
          const bareNoun = !withArticle && Boolean(articleOf(v.target));
          let pool = distractors(v, 6, id, { exclude: inSentence, sameArticle: withArticle || bareNoun });
          if (pool.length < 2) pool = [...pool, ...distractors(v, 6, id, { exclude: inSentence, sameArticle: withArticle }).filter((d) => !pool.includes(d))];
          const capital = /^\p{Lu}/u.test(at.text);
          const ranked = capital ? [...pool.filter((d) => /^\p{Lu}/u.test(stripArticle(d.target))), ...pool.filter((d) => !/^\p{Lu}/u.test(stripArticle(d.target)))] : pool;
          opts = ranked.slice(0, 2).map((d) => (withArticle ? d.target : stripArticle(d.target)));
        } else {
          opts = distractors(v, 2, id, { exclude: inSentence, sameArticle: withArticle, agree }).map((d) => (withArticle ? d.target : stripArticle(d.target)));
        }
        // Same capitals as the answer (a blank after "?" or "!" starts with one): the case never gives it away.
        const cap = /^\p{Lu}/u.test(at.text) ? (w) => w.charAt(0).toUpperCase() + w.slice(1) : (w) => w;
        ex.options = shuffle([at.text, ...opts.map(cap)], id);
      }
      // typedAlso: other words a learner of this native language may type (an English speaker types email for mail); only
      // for a bare blank, so no article has to agree with them
      const also = !ex.options && stripArticle(at.text) === at.text ? v.typedAlso?.[nk] : null;
      if (also?.length) ex.acceptAlso = [...also];
      return ex;
    };
    const buildSentence = (id, s) => {
      const tokens = words(s.target);
      // Tiles never give the order away: no punctuation
      // on any tile (French "maman !" → "maman"), and a sentence's first word loses its capital unless it is a name or a
      // language (capitalised inside a sentence somewhere) or English I (I, I'm, I've …). Grading compares word order only;
      // the client shows the sentence's final mark after the built sentence.
      // a sentence start: the first word, a word after . ! ?, and the word after a sentence-initial 's ('s Morgens)
      const starts = new Set([0]);
      tokens.forEach((tok, k) => { if (/[.!?]$/.test(tok) && k + 1 < tokens.length) starts.add(k + 1); });
      for (const k of [...starts]) if (tokens[k] === "'s" && k + 1 < tokens.length) starts.add(k + 1);
      // (an abbreviation keeps its dots: a.m., p.m.)
      const abbr = /^(?:\p{L}\.){2,}$/u;
      for (let k = 0; k < tokens.length; k++) if (!abbr.test(tokens[k])) tokens[k] = tokens[k].replace(/\s*[.,!?;:]+$/, '');
      const keepCapital = (w) => properWords.has(w) || appendedProper.has(w) || (meta.track === 'en' && /^I(?:'|’|$)/.test(w));
      for (const k of starts) if (!keepCapital(tokens[k])) tokens[k] = tokens[k].charAt(0).toLowerCase() + tokens[k].slice(1);
      const inSentence = new Set(tokens.map(bare));
      const itemVocab = s.items.map((it) => vocabById.get(it));
      // Dutch: a noun's tile is the bare noun (neus, not de neus), so noun-heavy units get distractor tiles too
      const tile = (v) => (meta.track === 'nl' && v.pos === 'noun' ? stripArticle(v.target) : v.target);
      const pool = unitVocab.filter((v) => !v.category && !/\s/.test(tile(v)) && !inSentence.has(bare(tile(v))) && !itemVocab.some((it) => clash(it, v)));
      const posWanted = new Set(itemVocab.map((v) => v.pos));
      const ranked = [...shuffle(pool.filter((v) => posWanted.has(v.pos)), id), ...shuffle(pool.filter((v) => !posWanted.has(v.pos)), `${id}:b`)];
      const dis = [];
      for (const v of ranked) if (dis.length < 2 && !dis.includes(tile(v))) dis.push(tile(v));
      const ex = { type: 'build_sentence', id, items: s.items, sentenceId: s.id, answer: s.target, tokens, distractors: dis };
      // An alternative order moves the capital and the full stop (Om negen uur begint de les. / Last week I …): compare
      // the words without them, in every track; the grader compares word order the same way (orderKey).
      const key = (ws) => ws.map((w) => w.toLowerCase().replace(/[.!?,;:]/g, '')).sort().join(' ');
      const alts = (s.acceptAlso || []).filter((a) => a !== s.target && key([...words(a)]) === key([...tokens]));
      if (alts.length) ex.acceptAlso = alts;
      return ex;
    };
    const listenType = (id, item) => {
      const ex = { type: 'listen_type', id, items: item.items ?? [item.id], listen: item.id, answer: item.target };
      // Dutch and B1 sentence alternatives that are other word orders: a dictation accepts only what was said; other
      // alternatives (spellings: It's / It is) stay accepted
      const sameWords = (a) => [...words(a)].map((w) => w.toLowerCase().replace(/[.!?,;:]/g, '')).sort().join(' ')
        === [...words(item.target)].map((w) => w.toLowerCase().replace(/[.!?,;:]/g, '')).sort().join(' ');
      const orders = (meta.track === 'nl' || rules.orderAlternatives) && item.items;
      if (item.acceptAlso?.length) ex.acceptAlso = item.acceptAlso.filter((a) => a !== item.target && !(orders && sameWords(a)));
      if (ex.acceptAlso && !ex.acceptAlso.length) delete ex.acceptAlso;
      return ex;
    };

    /** The first candidate exercise with at least three options (candidates are thunks, tried in order). */
    const firstValid = (makers) => {
      let first = null;
      for (const make of makers) {
        const ex = make();
        first ??= ex;
        if (ex && (!ex.options || ex.options.length >= 3)) return ex;
      }
      return first;
    };

    // ---- lessons -----------------------------------------------------------------------------------
    const unitSentencesSoFar = [];
    const makeLesson = (lp, { fillFrom = unitVocab } = {}) => {
      const exs = [];
      let n = 0;
      const nextId = () => `${lp.id}-e${String(++n).padStart(2, '0')}`;
      const known = (s) => s.items.every((it) => introduced.has(it));
      const newWords = lp.vocab;
      if (!newWords.length) fail(`${unit.file}: lesson ${lp.id} has no vocabulary`);
      const lessonIntro = [];
      const introduce = (v) => {
        exs.push(mcFromTarget(nextId(), v));
        introduced.add(v.id);
        lessonIntro.push(v);
      };
      const earlier = shuffle(allVocab.filter((v) => introduced.has(v.id) && unitOfVocab.get(v.id) === unit.id), `${lp.id}:earlier`);
      const earlierPack = shuffle(allVocab.filter((v) => introduced.has(v.id) && unitOfVocab.get(v.id) !== unit.id), `${lp.id}:earlierPack`);
      const used = new Set();

      const queue = [...newWords];
      const step = (k) => queue.splice(0, k).forEach(introduce);
      step(2);
      // 1. hear a word just introduced, choose its spelling
      // a word that cannot get three options (a French group noun: every same-article noun might be a member) gives
      // way to the word introduced before it
      const lcId = nextId();
      exs.push(firstValid([...lessonIntro].reverse().map((v) => () => listenWordTarget(lcId, v))));
      step(2);
      // 2. match: the lesson's words so far (+ earlier words up to 5 pairs)
      const match = matchPairs(nextId(), [...lessonIntro, ...earlier, ...earlierPack].slice(0, 6).slice(0, Math.max(5, lessonIntro.length)));
      if (match) exs.push(match);
      else n--;
      step(2);
      // Too few words that may stand side by side yet (the first lesson, avoid pairs): try again two words later.
      if (!match) {
        const late = matchPairs(nextId(), [...lessonIntro, ...earlier, ...earlierPack].slice(0, 6));
        if (late) exs.push(late);
        else n--;
      }
      // 3. hear a sentence (or word), choose its meaning
      const sentencePool = () => [...unitSentencesSoFar, ...lp.sentences].filter(known);
      const lessonSentences = () => lp.sentences.filter(known);
      const pickSentence = (pred, seed) => {
        const fresh = shuffle(lessonSentences().filter((s) => !used.has(s.id) && pred(s)), seed);
        const any = shuffle(sentencePool().filter((s) => !used.has(s.id) && pred(s)), `${seed}:any`);
        const s = fresh[0] ?? any[0] ?? shuffle(sentencePool().filter(pred), `${seed}:reuse`)[0];
        if (s) used.add(s.id);
        return s;
      };
      const lcnId = nextId();
      const lcnSentence = pickSentence(() => true, `${lp.id}:lcn`);
      let lcn = lcnSentence ? listenNative(lcnId, lcnSentence, sentences) : null;
      if (!lcn) {
        if (lcnSentence) used.delete(lcnSentence.id);
        lcn = listenNative(lcnId, lessonIntro[0]);
      }
      exs.push(lcn);
      step(queue.length);
      if (newWords.length < LESSON_MIN_WORDS) {
        const mcId = nextId();
        exs.push(firstValid([...newWords].reverse().map((v) => () => mcToTarget(mcId, v))));
      }
      // 4. fill in a word of a sentence (a unit word that this or an earlier lesson introduced)
      const fillPool = fillFrom.filter((v) => introduced.has(v.id));
      const fresh = (s) => blankable(s, fillPool).filter((c) => !(rules.gapsReach && filledBefore.has(`${s.id}|${c.v.id}`)));
      const fillS = (rules.gapsReach ? pickSentence((s) => fresh(s).length > 0, `${lp.id}:fill`) : null)
        ?? pickSentence((s) => blankable(s, fillPool).length > 0, `${lp.id}:fill`);
      if (!fillS) fail(`${unit.file}: lesson ${lp.id} has no sentence in which a taught word can be blanked`);
      const fid = nextId();
      const candidates = rules.gapsReach && fresh(fillS).length ? fresh(fillS) : blankable(fillS, fillPool);
      const preferNew = candidates.filter((c) => lessonIntro.includes(c.v));
      const fillPick = shuffle(preferNew.length ? preferNew : candidates, fid)[0];
      filledBefore.add(`${fillS.id}|${fillPick.v.id}`);
      exs.push(fillBlank(fid, fillS, fillPick));
      // 5. build a sentence
      const buildS = pickSentence((s) => words(s.target).length <= rules.buildMax && words(s.target).length >= 2, `${lp.id}:build`);
      if (!buildS) fail(`${unit.file}: lesson ${lp.id} has no sentence of 2–${rules.buildMax} words for build_sentence`);
      exs.push(buildSentence(nextId(), buildS));
      // 6. type what you hear: a short sentence, else a word
      const ltS = pickSentence((s) => words(s.target).length <= rules.listenMax && !isHomophone(s.target), `${lp.id}:lt`);
      const ltWord = [...lessonIntro].reverse().find((v) => !isHomophone(v.target));
      if (!ltS && !ltWord) fail(`${unit.file}: lesson ${lp.id} has only homophones for listen_type; add a short sentence`);
      exs.push(listenType(nextId(), ltS ?? ltWord));

      unitSentencesSoFar.push(...lp.sentences);
      return { id: lp.id, title: lp.title, exercises: exs };
    };
    const lessons = lessonPlans.map((lp) => makeLesson(lp));

    // ---- review lesson ("Herhaling"): the whole unit, nothing new ------------------------------------
    const reviewId = `${unit.id}-review`;
    const rv = [];
    let rn = 0;
    const rid = () => `${reviewId}-e${String(++rn).padStart(2, '0')}`;
    const vocabOrder = shuffle(unitVocab, `${reviewId}:vocab`);
    let vi = 0;
    const nextWord = () => vocabOrder[vi++ % vocabOrder.length];
    // Dutch: sentences no lesson used come first, so every sentence reaches the learner (and practice) somewhere.
    const usedInLessons = new Set(lessons.flatMap((l) => l.exercises.map((e) => e.sentenceId ?? e.listen)).filter(Boolean));
    // B2 (rules.gapsReach): a sentence with a `form` or `finite` gap reaches the learner through that fill-in at the end of
    // this review, so no other review exercise shows it first (that would show the answer)
    const gapLater = (x) => rules.gapsReach && (x.form || (meta.finiteVerbFill && x.finite));
    const reviewSentences = sentences.filter((x) => !gapLater(x));
    const sentOrder = meta.track === 'nl'
      ? [...shuffle(reviewSentences.filter((x) => !usedInLessons.has(x.id)), `${reviewId}:sent`), ...shuffle(reviewSentences.filter((x) => usedInLessons.has(x.id)), `${reviewId}:sent2`)]
      : shuffle(reviewSentences, `${reviewId}:sent`);
    let si = 0;
    const taken = new Set();
    const nextSentence = (pred) => {
      if (meta.track === 'nl') {
        // Dutch: the first sentence not yet taken that fits (a sentence that does not fit this slot stays available)
        const s = sentOrder.find((x) => !taken.has(x.id) && pred(x)) ?? sentOrder.find((x) => pred(x));
        if (s) taken.add(s.id);
        return s ?? null;
      }
      for (let k = 0; k < sentOrder.length; k++) {
        const s = sentOrder[(si + k) % sentOrder.length];
        if (pred(s)) {
          si += k + 1;
          return s;
        }
      }
      return null;
    };
    const takeWords = (k) => Array.from({ length: Math.min(k, vocabOrder.length) }, nextWord);
    const add = (make) => {
      const id = rid();
      const ex = make(id);
      if (ex) rv.push(ex);
      else rn--;
    };
    const someWord = (make) => (id) => firstValid(Array.from({ length: 5 }, () => () => make(id, nextWord())));
    // pack.yaml `transformsFirst` (en-b2, fr-b2): the key word transformations open the review, so no
    // build, dictation or fill-in of this review shows a transformation's answer sentence before it is asked
    const transformEx = (t) => ({ type: 'transform', id: rid(), items: t.items, from: t.from, key: t.key.toUpperCase(), gapped: t.gapped,
      answers: [...t.answers], ...(t.native?.[nk] ? { native: { [nk]: t.native[nk] } } : {}) });
    // (a French transform's line is English only — French for English speakers — so the course for Dutch
    // speakers, whose transforms have none, keeps none)
    if (meta.transformsFirst) for (const t of unit.transforms || []) rv.push(transformEx(t));
    add(someWord(mcToTarget));
    add((id) => matchPairs(id, takeWords(6)));
    add(someWord(listenWordTarget));
    const fillRev = (id) => {
      const s = nextSentence((x) => blankable(x, unitVocab).length > 0);
      return s ? fillBlank(id, s, shuffle(blankable(s, unitVocab), id)[0]) : null;
    };
    add(fillRev);
    add((id) => {
      const s = nextSentence(() => true);
      return s ? mcSentence(id, s, sentences) : null;
    });
    add((id) => {
      const s = nextSentence((x) => words(x.target).length <= rules.buildMax);
      return s ? buildSentence(id, s) : null;
    });
    add((id) => {
      const s = nextSentence(() => true);
      return s ? listenNative(id, s, sentences) : listenNative(id, nextWord());
    });
    add((id) => matchPairs(id, takeWords(6)));
    add(fillRev);
    // A word that sounds like another word of the course is skipped (homophone rule; never for legacy packs).
    const listenWord = () => {
      let w = nextWord();
      for (let k = 0; k < vocabOrder.length && isHomophone(w.target); k++) w = nextWord();
      return isHomophone(w.target) ? null : w;
    };
    add((id) => {
      const w = listenWord();
      return w ? listenType(id, w) : null;
    });
    add((id) => {
      const s = nextSentence((x) => words(x.target).length <= rules.buildMax);
      return s ? buildSentence(id, s) : null;
    });
    add(someWord(mcToTarget));
    add((id) => {
      const s = nextSentence((x) => words(x.target).length <= rules.listenMax && !isHomophone(x.target));
      const w = s ? null : listenWord();
      return s || w ? listenType(id, s ?? w) : null;
    });
    if (meta.track === 'nl') {
      // Dutch: every sentence reaches the learner; the review lesson builds or dictates the ones nothing used yet
      // (sentOrder holds no gap sentence at B2: their fill-in follows)
      const used = new Set([...lessons, { exercises: rv }].flatMap((l) => l.exercises.map((e) => e.sentenceId ?? e.listen)));
      sentOrder.filter((x) => !used.has(x.id)).forEach((x, k) => add((id) => {
        const n = words(x.target).length;
        if (k % 2 === 0 && n <= rules.buildMax) return buildSentence(id, x);
        if (n <= rules.listenMax && !isHomophone(x.target)) return listenType(id, x);
        return n <= rules.buildMax ? buildSentence(id, x) : mcSentence(id, x, sentences);
      }));
    }
    // A sentence marked `build: true` is built in the review lesson unless a lesson or the review already builds it
    const built = new Set([...lessons, { exercises: rv }].flatMap((l) => l.exercises.filter((e) => e.type === 'build_sentence').map((e) => e.sentenceId)));
    for (const x of sentences.filter((y) => y.build && !built.has(y.id))) {
      if (words(x.target).length > rules.buildMax) fail(`${unit.file}: sentence ${x.id} is marked build but has more than ${rules.buildMax} words`);
      add((id) => buildSentence(id, x));
    }
    // Finite-verb fill-ins (pack.yaml finiteVerbFill, new content only): a sentence annotated `finite: { word, hint }`
    // gets a typed fill-in that blanks that conjugated verb, its infinitive (and tense) as the hint.
    if (meta.finiteVerbFill) {
      for (const x of sentences.filter((y) => y.finite)) {
        const at = blankPosition(x.target, x.finite.word);
        if (!at) fail(`${unit.file}: sentence ${x.id}: finite word "${x.finite.word}" is not a word of it`);
        if (Object.values(x.finite.hint || {}).some((h) => String(h).split(/\s*\(/)[0].trim().split(/\s+/).pop().toLowerCase() === x.finite.word.toLowerCase())) {
          fail(`${unit.file}: sentence ${x.id}: finite word "${x.finite.word}" is the infinitive of its hint: choose another form or sentence`);
        }
        rv.push({
          type: 'fill_blank', id: rid(), items: x.items, sentenceId: x.id, kind: 'finite_verb',
          sentence: `${x.target.slice(0, at.index)}___${x.target.slice(at.index + at.text.length)}`, answer: at.text, hint: { ...x.finite.hint },
        });
      }
    }
    // B2: word formation on a sentence (`form: { word, stem }`) — a typed fill-in with the stem in capitals —
    // and the unit's key word transformations (`transforms`), after the finite-verb fill-ins
    for (const x of sentences.filter((y) => y.form)) {
      const at = blankPosition(x.target, x.form.word);
      if (!at) fail(`${unit.file}: sentence ${x.id}: form word "${x.form.word}" is not a word of it (and not its first word)`);
      rv.push({
        type: 'fill_blank', id: rid(), items: x.items, sentenceId: x.id, kind: 'word_form',
        sentence: `${x.target.slice(0, at.index)}___${x.target.slice(at.index + at.text.length)}`, answer: at.text, stem: x.form.stem.toUpperCase(),
      });
    }
    if (!meta.transformsFirst) for (const t of unit.transforms || []) rv.push(transformEx(t));
    lessons.push({ id: reviewId, title: { [nk]: REVIEW_TITLES[nk] }, exercises: rv });

    // ---- texts of a unit that also has vocabulary lessons (B1): one lesson per text after the vocabulary lessons,
    // before the review; then a listening review after it (`<unit>-listening`: every text heard, its questions)
    let unitTexts = null;
    if (unit.texts?.length) {
      const t = textLessons(unit, { first: lessonPlans.length + 1, reviewId: `${unit.id}-listening` });
      lessons.splice(lessons.length - 1, 0, ...t.lessons);
      if (t.review) lessons.push(t.review);
      unitTexts = unit.texts.map(stripText);
    }

    // ---- appended blocks (unit `append:`): new words and sentences in a lesson of their own, before the review --------
    const appendedVocab = [];
    const appendedSentences = [];
    for (const block of unit.append || []) {
      const vocab = block.vocabulary || [];
      const blockSentences = block.sentences || [];
      for (const x of blockSentences) {
        for (const it of x.items) if (!vocabById.has(it)) fail(`${unit.file}: sentence ${x.id} item "${it}" is not a vocabulary id in this pack`);
        if (!x.items.every((it) => introduced.has(it) || vocab.some((v) => v.id === it))) fail(`${unit.file}: appended sentence ${x.id} uses a word not taught before it`);
      }
      if (lessons.some((l) => l.id === block.lesson.id)) fail(`${unit.file}: appended lesson ${block.lesson.id} already exists`);
      const lesson = makeLesson({ id: block.lesson.id, title: block.lesson.title, vocab, sentences: blockSentences }, { fillFrom: [...unitVocab, ...vocab] });
      if (meta.track === 'nl') {
        // Dutch: every appended sentence reaches the learner (as in the review lesson)
        const usedHere = new Set(lesson.exercises.map((e) => e.sentenceId ?? e.listen));
        let n = lesson.exercises.length;
        for (const [k, x] of blockSentences.filter((y) => !usedHere.has(y.id)).entries()) {
          const id = `${block.lesson.id}-e${String(++n).padStart(2, '0')}`;
          const w = words(x.target).length;
          lesson.exercises.push(k % 2 === 0 && w <= rules.buildMax ? buildSentence(id, x)
            : w <= rules.listenMax && !isHomophone(x.target) ? listenType(id, x) : buildSentence(id, x));
        }
      }
      // before the review lesson (a unit with texts ends review, listening — not before the last lesson)
      const reviewAt = lessons.findIndex((l) => l.id === `${unit.id}-review`);
      lessons.splice(reviewAt >= 0 ? reviewAt : lessons.length - 1, 0, lesson);
      appendedVocab.push(...vocab);
      appendedSentences.push(...blockSentences);
    }

    // ---- extra lessons (pack.yaml extraLessons: true): every sentence no exercise uses reaches one -----------------
    // Optional on the path ("Extra oefening", lesson.extra), at most 14 exercises each, after the review lesson.
    if (meta.extraLessons) {
      // used: built, filled in or listened to (sentenceId / listen), or asked about as a multiple-choice question
      const usedAll = new Set(lessons.flatMap((l) => l.exercises.flatMap((e) => [e.sentenceId, e.listen])).filter(Boolean));
      const asked = new Set(lessons.flatMap((l) => l.exercises.filter((e) => e.type === 'multiple_choice' && typeof e.question === 'string').map((e) => e.question)));
      const unused = sentences.filter((x) => !usedAll.has(x.id) && !asked.has(x.target));
      if (unused.length) {
        const parts = Math.ceil(unused.length / EXTRA_MAX);
        let from = 0;
        for (let p = 0; p < parts; p++) {
          const size = Math.floor(unused.length / parts) + (p < unused.length % parts ? 1 : 0);
          const lessonId = `${unit.id}-extra${p ? p + 1 : ''}`;
          const exs = [];
          // a lesson of one or two exercises would feel broken: other sentences of the unit fill it up to EXTRA_MIN
          const own = unused.slice(from, from + size);
          const padding = shuffle(sentences.filter((x) => !unused.includes(x)), `${lessonId}:pad`).slice(0, Math.max(0, EXTRA_MIN - own.length));
          [...own, ...padding].forEach((x, k) => {
            const id = `${lessonId}-e${String(exs.length + 1).padStart(2, '0')}`;
            const w = words(x.target).length;
            const kinds = [
              () => (w >= 2 && w <= rules.buildMax ? buildSentence(id, x) : null),
              () => (w <= rules.listenMax && !isHomophone(x.target) ? listenType(id, x) : null),
              () => listenNative(id, x, sentences),
              // never a group word (animal): its word bank could only offer other parts of speech
              () => { const b = blankable(x, unitVocab).filter((c) => !c.v.category); return b.length ? fillBlank(id, x, shuffle(b, id)[0]) : null; },
            ];
            // rotate the kinds so an extra lesson mixes them; the first that fits this sentence is taken
            const order = [0, 1, 2, 3].map((i) => kinds[(i + (from + k)) % kinds.length]);
            const ex = firstValid(order) ?? mcSentence(id, x, sentences);
            if (!ex) fail(`${unit.file}: no extra exercise fits sentence ${x.id}`);
            exs.push(ex);
          });
          lessons.push({ id: lessonId, title: { [nk]: EXTRA_TITLES[nk] }, extra: true, exercises: exs });
          from += size;
        }
      }
    }

    // ---- hand-written overrides ----------------------------------------------------------------------
    for (const o of unit.overrides || []) {
      const lesson = lessons.find((l) => l.id === o.lesson);
      if (!lesson) fail(`${unit.file}: override names lesson "${o.lesson}", which this unit does not have`);
      (o.exercises || []).forEach((ex, i) => lesson.exercises.push({ ...ex, id: ex.id ?? `${lesson.id}-x${String(i + 1).padStart(2, '0')}` }));
    }

    // ---- exercises hidden by an admin correction: numbered like the others, then left out ----------------
    for (const h of unit.hidden || []) {
      const lesson = lessons.find((l) => l.exercises.some((ex) => ex.id === h.exercise));
      if (!lesson) fail(`${unit.file}: hidden exercise "${h.exercise}" is not an exercise of this unit`);
      lesson.exercises = lesson.exercises.filter((ex) => ex.id !== h.exercise);
      if (!lesson.exercises.length) fail(`${unit.file}: hiding "${h.exercise}" would leave lesson ${lesson.id} without exercises`);
    }

    return {
      id: unit.id,
      title: unit.title,
      icon: unit.icon,
      vocabulary: [...unitVocab, ...appendedVocab].map((v) => ({
        id: v.id, target: v.target, native: { ...v.native }, pos: POS_MAP[v.pos], ...(v.gender ? { gender: v.gender } : {}),
        ...(v.plural ? { plural: String(v.plural) } : {}), ...(v.alsoNL ? { alsoNL: v.alsoNL } : {}),
      })),
      sentences: [...sentences, ...appendedSentences].map((s) => ({ id: s.id, target: s.target, native: { ...s.native }, items: s.items })),
      ...(unitTexts ? { texts: unitTexts } : {}),
      lessons,
    };
  });

  return { schemaVersion: 2, id: meta.id, track: meta.track, cefr: meta.cefr, source: meta.source, units: outUnits };
}

// Defaults kept for the tests and tools that used these names (Dutch meanings, French articles).
export const sameMeaning = (a, b) => sameMeaningFor(a, b, 'nl');
export const clash = (a, b) => clashFor(a, b, 'nl');
export const articleOf = (target) => articleOfFor(target, 'fr');
export const stripArticle = (target) => stripArticleFor(target, 'fr');
