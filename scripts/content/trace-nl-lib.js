// Pure traceability rules for Dutch content against the derived Dutch word list (wordlist-nl.json, built by
// scripts/content/wordlist-nl.js). Vocabulary must be a word-list lemma at or below the pack's level, a noun with ITS
// article (de/het as the list records it), a separable verb joined (opstaan), a reflexive verb with zich. Sentence words
// may be:
//   - forms of list lemmas at or below the level that the level's grammar allows (KIND_LEVEL): present tense, imperative,
//     plural and adjective -e from Start; diminutives, partitive -s and split separable verbs (ik sta op) from A1; past
//     tense, participles and comparatives from A2 — conjugation with 't kofschip and the irregular verbs of dutch.js;
//   - parts of multi-word list entries ('s morgens, tot ziens, laten we);
//   - numbers in the level's range (Start ≤ 20, A1 ≤ 1000) as digits or words, and names of the word list;
//   - a compound whose two parts both trace at the level (bushalte, fietsenstalling): allowed, but reported for review.
// A word the list tags regional: nl (OV-chipkaart, pinnen, patat) is never allowed.
import { LEVELS, NUMBER_VALUE, formsOf, norm, rank, tokenize } from './dutch.js';

export { LEVELS };
export const NUMBER_MAX = { Start: 20, A1: 1000, A2: 1_000_000, B1: 1_000_000, B2: 1_000_000 };
/** Lowest level whose grammar allows a kind of generated form (content/src/nl/PLAN.md, "Grammar per level"). */
export const KIND_LEVEL = {
  base: 'Start', plural: 'Start', present: 'Start', inflected: 'Start',
  partitive: 'A1', diminutive: 'A1', 'present-split': 'A1', 'infinitive-split': 'A1',
  past: 'A2', 'past-split': 'A2', participle: 'A2', comparative: 'A2',
};
const ARTICLE = /^(de|het)\s+/;
const atOrBelow = (l, level) => rank(l) <= rank(level);

/** Index of wordlist-nl.json: form -> hits, key -> entry, phrases, separable verbs, names, regional words. */
export function indexWordlistNl(json) {
  const forms = new Map();
  const byKey = new Map();
  const byLemma = new Map();
  const phrases = [];
  const separable = [];
  const add = (form, hit) => {
    const f = norm(form);
    if (!forms.has(f)) forms.set(f, []);
    forms.get(f).push(hit);
  };
  for (const e of json.entries) {
    byKey.set(e.key, e);
    const l = norm(e.lemma);
    if (!byLemma.has(l)) byLemma.set(l, []);
    byLemma.get(l).push(e);
    const toks = tokenize(e.lemma).map((t) => t.word);
    if (toks.length > 1) {
      phrases.push({ key: e.key, tokens: toks, level: e.level });
      continue;
    }
    const lemma = e.separable ? `${e.separable}|${e.lemma.slice(e.separable.length)}` : e.lemma;
    for (const [form, kind] of formsOf({ ...e, lemma })) add(form, { key: e.key, kind, level: e.level, pos: e.pos });
    if (e.separable) separable.push({ key: e.key, particle: e.separable, level: e.level, forms: formsOf({ ...e, lemma }) });
  }
  phrases.sort((a, b) => b.tokens.length - a.tokens.length);
  const names = new Map((json.names || []).map((n) => [norm(n), n]));
  const regional = new Map((json.regional || []).map((r) => [norm(r.word), r.ref]));
  return { forms, byKey, byLemma, phrases, separable, names, regional };
}

const kindOk = (h, level) => atOrBelow(h.level, level) && KIND_LEVEL[h.kind] && atOrBelow(KIND_LEVEL[h.kind], level);

/** One token at a level. Returns { ok, how, review? }. */
export function traceTokenNl(index, word, level, original = word, { compounds = true } = {}) {
  const w = norm(word);
  if (index.regional.has(w)) return { ok: false, how: `regional: nl (Netherlands-only: ${index.regional.get(w)})` };
  if (/^\d+([.,]\d+)?$/.test(w)) return Number(w.replace(',', '.')) <= NUMBER_MAX[level] ? { ok: true, how: 'number' } : { ok: false, how: 'number above level' };
  if (index.names.has(w) && /^\p{Lu}/u.test(original)) return { ok: true, how: 'name' };
  const hits = index.forms.get(w) || [];
  const good = hits.find((h) => kindOk(h, level) && !h.kind.endsWith('-split'));
  if (good) {
    // a homograph of a form above the level's grammar (was: ik was, or the past of zijn) is allowed but listed for review
    const above = hits.find((h) => atOrBelow(h.level, level) && !kindOk(h, level) && !h.kind.endsWith('-split') && h.key !== good.key);
    return above
      ? { ok: true, how: `${good.kind} of ${good.key}`, review: `"${original}" = ${good.kind} of ${good.key}, or ${above.kind} of ${above.key} (${KIND_LEVEL[above.kind]}): check the meaning` }
      : { ok: true, how: `${good.kind} of ${good.key}` };
  }
  if (NUMBER_VALUE.has(w) && NUMBER_VALUE.get(w) <= NUMBER_MAX[level] && rank(level) >= rank('A1')) return { ok: true, how: 'number word' };
  if (!hits.length) {
    const p = pronominalAdverb(index, w, level);
    if (p) return p;
  }
  if (compounds && !hits.length) {
    const c = splitCompound(index, w, level);
    if (c) return { ok: true, how: `compound ${c.join(' + ')}`, review: `compound "${original}" = ${c.join(' + ')}` };
  }
  if (hits.length) {
    const h = hits.find((x) => !x.kind.endsWith('-split')) ?? hits[0];
    if (!atOrBelow(h.level, level)) return { ok: false, how: `${h.key} is ${h.level}, above ${level}` };
    if (h.kind.endsWith('-split')) return { ok: false, how: `form of the separable verb ${h.key} without its particle` };
    return { ok: false, how: `${h.kind} form of ${h.key} is not ${level} grammar (${KIND_LEVEL[h.kind]})` };
  }
  return { ok: false, how: 'not in the Dutch word list' };
}

/**
 * Pronominal adverbs: er / daar / hier + a listed preposition (ermee, daarover, hierin; met → mee, tot → toe) from A2
 * (split er + preposition is A2 grammar: klik er niet op), and the relative waar + preposition (de stad waarin ik woon,
 * waarover, waarmee) from B1 (PLAN.md: relative clauses with waar + preposition). null when the word is none of these.
 */
export const PRONOMINAL = [['waar', 'B1'], ['daar', 'A2'], ['hier', 'A2'], ['er', 'A2']];
const PREP_OF = { mee: 'met', toe: 'tot' };
export function pronominalAdverb(index, w, level) {
  for (const [head, from] of PRONOMINAL) {
    if (!w.startsWith(head) || w.length <= head.length + 1) continue;
    const rest = w.slice(head.length);
    if (rest === 'met' || rest === 'tot') continue; // only ermee, waartoe
    const prep = PREP_OF[rest] ?? rest;
    const entry = (index.byLemma.get(prep) || []).find((e) => e.pos === 'preposition');
    if (!entry) continue;
    if (!atOrBelow(from, level)) return { ok: false, how: `${head} + preposition (${w}) is ${from} grammar` };
    if (!atOrBelow(entry.level, level)) return { ok: false, how: `the preposition ${prep} is ${entry.level}, above ${level}` };
    return { ok: true, how: `${head} + ${prep} (pronominal adverb)` };
  }
  return null;
}

/** A compound of two list words (with a linking s / e / en): bushalte = bus + halte; null when none. */
const FUNCTION_POS = new Set(['pronoun', 'determiner', 'conjunction', 'exclamation']);
/** A part of a compound is never a pronoun, determiner or conjunction (me + geven, dank + zij). */
const contentWord = (index, part) => (index.forms.get(part) || []).some((h) => !FUNCTION_POS.has(h.pos));
export function splitCompound(index, w, level) {
  for (let i = 3; i <= w.length - 3; i++) {
    const right = w.slice(i);
    if (!traceTokenNl(index, right, level, right, { compounds: false }).ok) continue;
    if (index.forms.has(right) && !contentWord(index, right)) continue;
    const left = w.slice(0, i);
    for (const l of [left, left.replace(/s$/, ''), left.replace(/e$/, ''), left.replace(/en$/, '')]) {
      // the left part: a noun or adjective (base, plural) or a verb stem (slaapkamer = slaap + kamer)
      if (l.length >= 2 && (index.forms.get(l) || []).some((h) => kindOk(h, level) && ['base', 'plural', 'present'].includes(h.kind) && !FUNCTION_POS.has(h.pos))) {
        return [l, right];
      }
    }
  }
  return null;
}

/** Untraceable words of a sentence at a level: [{ word, reason }]; review notes (compounds) in `review` (optional array). */
export function traceSentenceNl(index, text, level, review = []) {
  const toks = tokenize(text);
  const words = toks.map((t) => norm(t.word));
  const covered = new Array(words.length).fill(false);
  for (const p of index.phrases) {
    if (!atOrBelow(p.level, level)) continue;
    for (let i = 0; i + p.tokens.length <= words.length; i++) {
      if (p.tokens.every((t, k) => words[i + k] === t)) for (let k = 0; k < p.tokens.length; k++) covered[i + k] = true;
    }
  }
  // split separable verbs: a finite base form, its particle later in the clause (ik sta om zeven uur op); "op te staan".
  // Of several separable verbs sharing the form, the one whose particle comes first wins (neem je paspoort mee … aan de
  // grens: meenemen, not aannemen).
  const seps = index.separable.filter((s) => atOrBelow(s.level, level))
    .map((s) => ({ s, allowed: s.forms.filter(([, k]) => k.endsWith('-split') && atOrBelow(KIND_LEVEL[k], level)).map(([f]) => norm(f)) }));
  words.forEach((w, i) => {
    if (covered[i]) return;
    let best = null;
    for (const { s, allowed } of seps) {
      if (!allowed.includes(w)) continue;
      if (i >= 2 && words[i - 1] === 'te' && words[i - 2] === s.particle) { best = { a: i - 2 }; break; }
      const j = words.findIndex((x, k) => k > i && x === s.particle && !covered[k]);
      if (j > -1 && (!best || (best.j !== undefined && j < best.j))) best = { j };
    }
    if (best) covered[i] = covered[best.j ?? best.a] = true;
  });
  const problems = [];
  toks.forEach(({ word, original }, i) => {
    if (covered[i]) return;
    if (word === "'s") return void problems.push({ word: original, reason: "'s only in a listed expression ('s morgens, 's avonds)" });
    const r = traceTokenNl(index, word, level, original);
    if (!r.ok) problems.push({ word: original, reason: r.how });
    else if (r.review) review.push(r.review);
  });
  return problems;
}

/**
 * A vocabulary target at a level: a list lemma at or below it. Nouns carry the list's article (de kat; het huis),
 * separable verbs are written joined (opstaan), reflexive ones with zich (zich vervelen). Returns { ok, reason?, key? }.
 * `item` (optional): the unit's vocabulary item, to check its plural and alsoNL against the list.
 */
export function traceVocabNl(index, target, level, item = null) {
  const t = norm(target).trim().replace(/[.!?]+$/, '');
  const m = t.match(ARTICLE);
  const article = m ? m[1] : null;
  const bare = t.replace(ARTICLE, '').replace(/^zich\s+/, '');
  // a listed phrase that starts with an article (het voorbije weekend, het eens zijn) is its own lemma
  const entries = index.byLemma.get(t)?.length && ARTICLE.test(t) ? index.byLemma.get(t) : (index.byLemma.get(bare) || []);
  const pick = entries.find((e) => item?.pos && e.pos === item.pos)
    ?? entries.find((e) => (article ? e.pos === 'noun' : e.pos !== 'noun' || !e.article)) ?? entries[0];
  if (pick) {
    if (!atOrBelow(pick.level, level)) return { ok: false, reason: `${pick.key} is ${pick.level}, above ${level}` };
    if (pick.pos === 'noun' && pick.article && article !== pick.article) {
      return { ok: false, reason: article ? `the word list has ${pick.article} ${pick.lemma}, not ${article} ${pick.lemma}` : `a noun needs its article: ${pick.article} ${pick.lemma}` };
    }
    if (/^zich\s/.test(t) && !pick.reflexive) return { ok: false, reason: `${pick.lemma} is not a reflexive verb in the word list` };
    if (item?.plural !== undefined && pick.plural && norm(item.plural) !== norm(pick.plural)) {
      return { ok: false, reason: `plural "${item.plural}" differs from the word list's "${pick.plural}"` };
    }
    if (pick.alsoNL && !item?.alsoNL && item) return { ok: false, reason: `the word list records the Netherlands form "${pick.alsoNL}": add alsoNL` };
    return { ok: true, key: pick.key, level: pick.level };
  }
  const problems = traceSentenceNl(index, t, level);
  if (/\s/.test(t) && !problems.length) return { ok: true, key: null };
  return { ok: false, reason: problems.length ? problems.map((p) => `"${p.word}": ${p.reason}`).join('; ') : 'not a word-list lemma' };
}
