// Pure traceability rules for English content against the Cambridge YLE word list (wordlist-en.json).
// Vocabulary must be a word-list entry at or below the pack's level. Sentence tokens may be entries at or
// below the level, inflections of them, contractions of them, numbers in the level's range, or names.
// Which inflections count depends on the level's grammar (handbook "Grammar and structures"):
//   Starters: plural -s/-es/-ies, 3rd person -s, -ing, possessive 's, contractions
//   Movers:   + past simple (-ed and irregular), comparative/superlative (-er/-est), adverbs in -ly
//   Flyers:   + past participles (present perfect), will/'ll/won't
//   B1:       the B1 Preliminary list (level B1 of wordlist-en.json) on top of the YLE list; the B1 grammar (passive,
//             past perfect, conditionals, reported speech) uses the same forms, so no new inflection kinds
//   B2:       the derived B2 list (level B2 of wordlist-en.json: content/src/en/wordlist-b2-sources.yaml) on top; same forms
export const LEVELS = ['S', 'M', 'F', 'B1', 'B2'];
export const PACK_LEVEL = { 'en-pre-a1': 'S', 'en-a1': 'M', 'en-a2': 'F', 'en-b1': 'B1', 'en-b2': 'B2' };
const rank = (l) => LEVELS.indexOf(l);
const NUMBER_MAX = { S: 20, M: 100, F: 1000, B1: Infinity, B2: Infinity };

// Irregular verb forms: form -> [base, kind] (kind: past = Movers, pp = Flyers past participle).
const IRREGULAR = `be was/were been; have had had; do did done; go went gone; see saw seen; eat ate eaten; drink drank drunk;
come came come; get got got; give gave given; make made made; take took taken; say said said; sing sang sung;
swim swam swum; run ran run; sit sat sat; stand stood stood; write wrote written; read read read; ride rode ridden;
draw drew drawn; fly flew flown; find found found; buy bought bought; bring brought brought; catch caught caught;
think thought thought; teach taught taught; fall fell fallen; feel felt felt; hear heard heard; know knew known;
lose lost lost; put put put; let let let; hit hit hit; cut cut cut; hurt hurt hurt; sleep slept slept; tell told told;
throw threw thrown; wear wore worn; win won won; leave left left; meet met met; send sent sent; spend spent spent;
build built built; break broke broken; choose chose chosen; forget forgot forgotten; begin began begun; hold held held;
keep kept kept; light lit lit; mean meant meant; pay paid paid; sell sold sold; shake shook shaken; shine shone shone;
shoot shot shot; steal stole stolen; stick stuck stuck; understand understood understood; wake woke woken;
become became become; can could could; will would would; hide hid hidden; drive drove driven; grow grew grown;
blow blew blown; dig dug dug; lend lent lent; ring rang rung; burn burnt burnt; learn learnt learnt; dream dreamt dreamt;
smell smelt smelt; spell spelt spelt; bite bit bitten; feed fed fed; lie lay lain; find found found;
speak spoke spoken; show showed shown; beat beat beaten; bleed bled bled; deal dealt dealt; fight fought fought;
forgive forgave forgiven; freeze froze frozen; hang hung hung; lay laid laid; lead led led; rise rose risen; sew sewed sewn;
shut shut shut; sink sank sunk; slide slid slid; spill spilt spilt; spoil spoilt spoilt; strike struck struck; tear tore torn;
cost cost cost; set set set; split split split; quit quit quit; upset upset upset; rebuild rebuilt rebuilt; bend bent bent;
forbid forbade forbidden; babysit babysat babysat; overtake overtook overtaken; sweep swept swept; swing swung swung;
forecast forecast forecast; prove proved proven; seek sought sought; shrink shrank shrunk; sting stung stung; swear swore sworn;
withdraw withdrew withdrawn; bet bet bet; spread spread spread; undo undid undone; mislead misled misled; misunderstand
misunderstood misunderstood; overhear overheard overheard; rewrite rewrote rewritten; bear bore born;
overcome overcame overcome; panic panicked panicked; foresee foresaw foreseen`;
export const IRREGULAR_FORMS = new Map();
for (const entry of IRREGULAR.split(';')) {
  const [base, past, pp] = entry.trim().split(/\s+/);
  for (const p of past.split('/')) if (!IRREGULAR_FORMS.has(p)) IRREGULAR_FORMS.set(p, [base, 'past']);
  if (!IRREGULAR_FORMS.has(pp)) IRREGULAR_FORMS.set(pp, [base, 'pp']);
}
// Irregular plurals of B1 nouns (the YLE ones — children, men, women, teeth, feet, mice — are list entries themselves).
for (const [plural, base] of [['grandchildren', 'grandchild'], ['schoolchildren', 'schoolchild'], ['policemen', 'policeman'], ['policewomen', 'policewoman'],
  ['businessmen', 'businessman'], ['salesmen', 'salesman'], ['postmen', 'postman'], ['firemen', 'fireman'], ['cameramen', 'cameraman'],
  ['housewives', 'housewife'], ['knives', 'knife'], ['loaves', 'loaf'], ['lives', 'life'], ['thieves', 'thief'], ['shelves', 'shelf']]) {
  IRREGULAR_FORMS.set(plural, [base, 'plural']);
}
// be/have/do present forms are Starters grammar.
for (const [f, b] of [['am', 'be'], ['is', 'be'], ['are', 'be'], ['being', 'be'], ['has', 'have'], ['does', 'do']]) IRREGULAR_FORMS.set(f, [b, 'present']);

const CONTRACTIONS = {
  "n't": ['not'], "'m": ['be'], "'re": ['be'], "'ve": ['have'], "'d": ['would', 'had', 'would like'], "'ll": ['will'], "'s": ['be', 'have', 'POSSESSIVE', 'us'],
};
const SPECIAL_CONTRACTIONS = { "can't": ['can', 'not'], cannot: ['can', 'not'], "won't": ['will', 'not'], "shan't": ['shall', 'not'], "let's": ["let's"] };
const KIND_LEVEL = { present: 'S', plural: 'S', s3: 'S', ing: 'S', possessive: 'S', past: 'M', ed: 'M', er: 'M', est: 'M', ly: 'M', pp: 'F' };

/** Index of the word list: lower-case form -> lowest level; names keep their capital. */
export function indexWordlist(entries, { includeUs = true } = {}) {
  const words = new Map();
  const multi = []; // multi-word entries as token arrays
  for (const e of entries) {
    if (e.us && !includeUs) continue;
    const key = e.pos === 'name' || /^[A-Z][a-z]/.test(e.word) ? e.word : e.word.toLowerCase();
    const prev = words.get(key);
    if (!prev || rank(e.level) < rank(prev.level)) words.set(key, { level: e.level, pos: e.pos, word: e.word });
    if (/\s/.test(e.word)) multi.push({ tokens: e.word.toLowerCase().split(/\s+/), level: e.level });
  }
  multi.sort((a, b) => b.tokens.length - a.tokens.length);
  return { words, multi };
}

const allowed = (index, word, level) => {
  const hit = index.words.get(word) ?? index.words.get(word.toLowerCase());
  return hit && rank(hit.level) <= rank(level) ? hit : null;
};

/** Candidate bases of an inflected (lower-case) form, with the inflection kind. */
export function inflectionCandidates(w) {
  const out = [];
  const add = (base, kind) => base && base.length > 1 && out.push({ base, kind });
  if (IRREGULAR_FORMS.has(w)) add(...IRREGULAR_FORMS.get(w));
  if (w.endsWith('ies')) add(`${w.slice(0, -3)}y`, 'plural');
  if (w.endsWith('es')) add(w.slice(0, -2), 'plural');
  if (w.endsWith('s')) add(w.slice(0, -1), 'plural');
  if (w.endsWith('ves')) {
    add(`${w.slice(0, -3)}f`, 'plural');
    add(`${w.slice(0, -3)}fe`, 'plural');
  }
  if (w.endsWith('ing')) {
    const stem = w.slice(0, -3);
    add(stem, 'ing');
    add(`${stem}e`, 'ing');
    if (/(.)\1$/.test(stem)) add(stem.slice(0, -1), 'ing');
    if (stem.endsWith('y')) add(`${stem.slice(0, -1)}ie`, 'ing');
  }
  if (w.endsWith('ed')) {
    const stem = w.slice(0, -2);
    add(stem, 'ed');
    add(`${stem}e`, 'ed');
    if (/(.)\1$/.test(stem)) add(stem.slice(0, -1), 'ed');
    if (stem.endsWith('i')) add(`${stem.slice(0, -1)}y`, 'ed');
  }
  for (const [suf, kind] of [['er', 'er'], ['est', 'est']]) {
    if (!w.endsWith(suf)) continue;
    const stem = w.slice(0, -suf.length);
    add(stem, kind);
    add(`${stem}e`, kind);
    if (/(.)\1$/.test(stem)) add(stem.slice(0, -1), kind);
    if (stem.endsWith('i')) add(`${stem.slice(0, -1)}y`, kind);
  }
  if (w.endsWith('ly')) {
    const stem = w.slice(0, -2);
    add(stem, 'ly');
    if (stem.endsWith('i')) add(`${stem.slice(0, -1)}y`, 'ly');
    add(`${stem}le`, 'ly');
  }
  return out;
}

/**
 * Is one (punctuation-stripped) token traceable at `level`? Returns { ok, how } — how explains the match.
 */
export function traceToken(index, token, level) {
  if (/^\d+$/.test(token)) return Number(token) <= NUMBER_MAX[level] ? { ok: true, how: 'number' } : { ok: false, how: 'number above level' };
  if (/^[A-Z]$/.test(token)) return { ok: true, how: 'letter' }; // "letters of the alphabet" (Starters note): spelling B, double O, K
  const direct = allowed(index, token, level) ?? allowed(index, `${token}.`, level); // "a.m." loses its final dot
  if (direct) return { ok: true, how: 'list' };
  const lower = token.toLowerCase();
  // Contractions: it's, don't, I'm, can't, Tom's (possessive)
  if (SPECIAL_CONTRACTIONS[lower]) {
    const parts = SPECIAL_CONTRACTIONS[lower];
    return parts.every((p) => allowed(index, p, level)) ? { ok: true, how: 'contraction' } : { ok: false, how: 'contraction part above level' };
  }
  const apos = lower.match(/^(.+?)(n't|'m|'re|'ve|'d|'ll|'s|s')$/);
  if (apos) {
    const [, head, tail] = apos;
    const headToken = token.slice(0, head.length);
    if (tail === "s'") return traceToken(index, `${headToken}s`, level).ok ? { ok: true, how: 'possessive' } : { ok: false, how: 'possessive of unknown word' };
    const headOk = traceToken(index, headToken, level).ok;
    if (tail === "'ll" && rank(level) < rank('F')) return { ok: false, how: "'ll (will) is Flyers grammar" };
    const tailOk = tail === "'s" || CONTRACTIONS[tail].some((p) => allowed(index, p, level));
    return headOk && tailOk ? { ok: true, how: 'contraction' } : { ok: false, how: 'contraction part not traceable' };
  }
  for (const { base, kind } of inflectionCandidates(lower)) {
    if (rank(KIND_LEVEL[kind]) > rank(level)) continue;
    const hit = allowed(index, base, level) ?? allowed(index, base[0].toUpperCase() + base.slice(1), level); // Saturdays
    if (!hit) continue;
    if (kind === 'ly' && !/adj/.test(hit.pos)) continue;
    if ((kind === 'er' || kind === 'est') && !/adj|adv/.test(hit.pos)) continue;
    return { ok: true, how: `${kind} of "${base}"` };
  }
  return { ok: false, how: 'not in the word list at this level' };
}

const EDGE = /^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu;
/** Words of a sentence: split on spaces, edge punctuation removed; hyphenated words that aren't list entries split. */
export function sentenceTokens(text) {
  return text.replace(/[‘’]/g, "'").split(/\s+/).map((w) => w.replace(EDGE, '').replace(/^'+|'+$/g, (m, off, s) => (s.endsWith("s'") ? m : ''))).filter(Boolean);
}

/** Problems (untraceable tokens) in one sentence. Multi-word entries ("ice cream", "next to") are matched first. */
export function traceSentence(index, text, level) {
  const tokens = sentenceTokens(text);
  const covered = new Array(tokens.length).fill(false);
  const lower = tokens.map((t) => t.toLowerCase());
  for (const m of index.multi) {
    if (rank(m.level) > rank(level)) continue;
    for (let i = 0; i + m.tokens.length <= lower.length; i++) {
      // The last word may be a plural: "fire fighters". The first word of a phrase of the B1 list may be inflected like
      // a verb at this level: "based on", "got rid of", "splits up" (YLE phrases keep their exact form).
      const last = m.tokens.length - 1;
      const inflectedFirst = (t, w) => rank(m.level) >= rank('B1') && inflectionCandidates(w)
        .some((c) => c.base === t && ['s3', 'plural', 'ing', 'ed', 'past', 'pp'].includes(c.kind) && rank(KIND_LEVEL[c.kind] ?? 'S') <= rank(level));
      const match = (t, k) => lower[i + k] === t || (k === last && [`${t}s`, `${t}es`].includes(lower[i + k]))
        || (k === 0 && m.tokens.length > 1 && inflectedFirst(t, lower[i]));
      if (m.tokens.every(match)) for (let k = 0; k < m.tokens.length; k++) covered[i + k] = true;
    }
  }
  const problems = [];
  // "have got" is Starters grammar in every form: has got, 've got, hasn't got.
  const HAVE = /^(have|has|haven't|hasn't|i've|you've|we've|they've|he's|she's|it's)$/;
  tokens.forEach((tok, i) => {
    if (covered[i]) return;
    if (lower[i] === 'got' && (HAVE.test(lower[i - 1] ?? '') || HAVE.test(lower[i - 2] ?? ''))) return;
    // "Would you like …?" is the Starters structure "would like" with the subject in between.
    if (lower[i] === 'would' && lower.slice(i + 1, i + 3).includes('like') && index.words.has('would like')) return;
    let r = traceToken(index, tok, level);
    if (!r.ok && tok.includes('-')) {
      const parts = tok.split('-');
      if (parts.every((p) => traceToken(index, p, level).ok)) r = { ok: true };
    }
    if (!r.ok) problems.push({ word: tok, reason: r.how });
  });
  return problems;
}

/** Vocabulary targets must be list entries themselves (not inflections) at or below the level. */
export function traceVocab(index, target, level) {
  const hit = index.words.get(target) ?? index.words.get(target.toLowerCase());
  if (!hit) return { ok: false, reason: 'not a word-list entry' };
  if (rank(hit.level) > rank(level)) return { ok: false, reason: `word-list level ${hit.level}, above ${level}` };
  return { ok: true, level: hit.level };
}
