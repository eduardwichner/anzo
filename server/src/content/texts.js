// Texts (B1 groundwork): reading texts and dialogues with authored comprehension questions. Pure rules shared by the pack
// validator (validate.js), the unit-source reader and the generator (scripts/content), and the tests.
//
// text = { id, kind: reading | dialogue, title {native}, level, paragraphs: [[{id, target, native}]] | turns: [{id, speaker,
//          target, native}], speakers {A: {name}, B: {name}}, glossary [{word, native}], items [vocab ids],
//          questions [question], listeningQuestions? [question], orderable? }
// question = { id, type: mc, question, options, correct } | { id, type: true_false_notgiven, statement, answer }
//          | { id, type: match_heading, paragraph (1-based), options, correct }
//          | B2: { id, type: summary, options, correct } (which summary fits the whole text)
//          | { id, type: match_texts, labels [a name per paragraph], statements [{ id, statement, paragraph }] } (multiple matching)
//          | { id, type: complete, statement (with ___), answers [1–3 words each] } (listening: sentence completion, typed)

export const QUESTION_TYPES = ['mc', 'true_false_notgiven', 'match_heading', 'summary', 'match_texts', 'complete'];
/** Question types a listening exercise may ask (a heading or a matching needs the text on screen). */
export const LISTENING_QUESTION_TYPES = ['mc', 'true_false_notgiven', 'complete'];
export const GAPPED_GAPS = [3, 6];
export const TRANSFORM_WORDS = [2, 6];
export const TFNG_ANSWERS = [true, false, 'not_given'];
export const GLOSSARY_SHARE = 0.05; // glossary words: at most ~5 % of the text's tokens
export const CLOZE_GAPS = [3, 6];

/** The text's sentences (reading) or turns (dialogue), in order. */
export const textSegments = (text) => (text.kind === 'dialogue' ? text.turns ?? [] : (text.paragraphs ?? []).flat());

/** Words of a text: letters and digits, apostrophes and hyphens inside a word kept ("aujourd'hui", "e-mail"). */
export const textWords = (s) => String(s).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];

const norm = (w) => String(w).normalize('NFC').replace(/’/g, "'").toLowerCase();

/** Does `word` (one or more words) occur as whole word(s) in `sentence`? Case-insensitive. */
export function containsWord(sentence, word) {
  const s = textWords(sentence).map(norm);
  const w = textWords(word).map(norm);
  if (!w.length) return false;
  for (let i = 0; i + w.length <= s.length; i++) if (w.every((x, k) => s[i + k] === x)) return true;
  return false;
}

/** Glossary limit for a text: 5 % of its tokens, at least 1. */
export const glossaryLimit = (text) => Math.max(1, Math.ceil(GLOSSARY_SHARE * textSegments(text).reduce((n, x) => n + textWords(x.target).length, 0)));

export function questionProblems(q, text, where, native) {
  const out = [];
  const p = (m) => out.push(`${where}: ${m}`);
  if (!QUESTION_TYPES.includes(q.type)) return [`${where}: type "${q.type}" is not one of ${QUESTION_TYPES.join(', ')}`];
  if (q.type === 'mc' || q.type === 'match_heading' || q.type === 'summary') {
    if (!Array.isArray(q.options) || q.options.length < 3) p('needs at least 3 options');
    else {
      const keys = q.options.map(norm);
      if (new Set(keys).size !== keys.length) p('options must be unique');
      if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.options.length) p(`correct must be the index of one option (0–${q.options.length - 1})`);
    }
    if ('answer' in q) p('"answer" (true / false / not_given) is only for true_false_notgiven');
  }
  if (q.type === 'mc' && !q.question) p('needs a question');
  if (q.type === 'true_false_notgiven') {
    if (!q.statement) p('needs a statement');
    if (!TFNG_ANSWERS.includes(q.answer)) p('answer must be true, false or not_given');
    if (q.options || 'correct' in q) p('true_false_notgiven has no options');
  }
  if (q.type === 'match_heading') {
    if (text.kind !== 'reading') p('match_heading is for reading texts (paragraphs)');
    else if (!Number.isInteger(q.paragraph) || q.paragraph < 1 || q.paragraph > (text.paragraphs ?? []).length) {
      p(`paragraph ${q.paragraph} does not exist (the text has ${(text.paragraphs ?? []).length})`);
    }
  }
  if (q.type !== 'match_heading' && 'paragraph' in q) p('"paragraph" is only for match_heading');
  if (q.type === 'summary' && q.options?.some((o) => textWords(o).length < 6)) p('summary options are summaries of the whole text (6 words or more each)');
  if (q.type === 'match_texts') {
    const paras = (text.paragraphs ?? []).length;
    if (text.kind !== 'reading') p('match_texts is for reading texts (one short text per paragraph)');
    if (!Array.isArray(q.labels) || q.labels.length !== paras) p(`match_texts needs one label per paragraph (${paras})`);
    else if (new Set(q.labels.map(norm)).size !== q.labels.length) p('match_texts labels must be unique');
    const st = q.statements ?? [];
    if (st.length < 4 || st.length > 8) p('match_texts needs 4–8 statements');
    const sids = new Set();
    for (const x of st) {
      if (sids.has(x.id)) p(`statement id ${x.id} is used twice`);
      sids.add(x.id);
      if (!Number.isInteger(x.paragraph) || x.paragraph < 1 || x.paragraph > paras) p(`statement ${x.id}: paragraph ${x.paragraph} does not exist`);
    }
    // every short text is the answer at least once, and no single one is the answer to more than half
    const used = new Set(st.map((x) => x.paragraph));
    if (paras && used.size < Math.min(paras, st.length)) p('match_texts: every text should be the answer to at least one statement');
    if ('options' in q || 'correct' in q) p('match_texts has statements and labels, no options');
  }
  if (q.type === 'complete') {
    if (!q.statement || (q.statement.match(/___/g) ?? []).length !== 1) p('complete needs a statement with exactly one ___');
    if (!Array.isArray(q.answers) || !q.answers.length) p('complete needs answers');
    else if (q.answers.some((a) => textWords(a).length < 1 || textWords(a).length > 3)) p('complete answers are 1–3 words');
    if (q.options || 'correct' in q) p('complete has answers, no options');
  }
  if (native && q.native) p('questions are in the target language (no native text)');
  return out;
}

/**
 * Every rule a text must satisfy. `native` = the course's meaning language (every sentence/turn and glossary entry needs
 * it). Returns a list of plain messages ("<text id>: …"); [] = fine.
 */
export function textProblems(text, { native = 'nl' } = {}) {
  const out = [];
  const p = (m) => out.push(`${text?.id ?? '(text)'}: ${m}`);
  if (!text || typeof text !== 'object') return ['(text): not an object'];
  if (!['reading', 'dialogue'].includes(text.kind)) p('kind must be reading or dialogue');
  if (!text.title?.[native]) p(`title needs { ${native}: … }`);
  if (text.kind === 'reading') {
    if (!Array.isArray(text.paragraphs) || !text.paragraphs.length) p('a reading text needs paragraphs (each a list of sentences)');
    if (text.turns) p('a reading text has no turns');
  }
  if (text.kind === 'dialogue') {
    if (!Array.isArray(text.turns) || text.turns.length < 2) p('a dialogue needs at least two turns');
    if (text.paragraphs) p('a dialogue has no paragraphs');
    for (const s of ['A', 'B']) if (!text.speakers?.[s]?.name) p(`speaker ${s} is not defined (speakers: { ${s}: { name } })`);
    (text.turns ?? []).forEach((t, i) => {
      if (!['A', 'B'].includes(t.speaker)) p(`turn ${t.id ?? i + 1}: speaker must be A or B`);
      // alternating sensibly: the same speaker twice in a row is a monologue split in two (one turn is enough)
      if (i > 0 && t.speaker === text.turns[i - 1].speaker) p(`turn ${t.id}: speaker ${t.speaker} speaks twice in a row`);
    });
    const used = new Set((text.turns ?? []).map((t) => t.speaker));
    if (text.turns?.length >= 2 && used.size < 2) p('both speakers must speak');
  }
  const segs = textSegments(text);
  const ids = new Set();
  segs.forEach((s, i) => {
    if (!s.id) p(`sentence ${i + 1} has no id`);
    else if (ids.has(s.id)) p(`sentence id ${s.id} is used twice`);
    ids.add(s.id);
    if (typeof s.target !== 'string' || !s.target.trim()) p(`${s.id}: needs target`);
    if (!s.native?.[native]) p(`${s.id}: needs its meaning { ${native}: … }`);
  });
  const allTargets = segs.map((s) => s.target).join(' ');
  (text.glossary ?? []).forEach((g, i) => {
    if (!g.native?.[native]) p(`glossary ${g.word ?? i + 1}: needs a meaning { ${native}: … }`);
    if (!containsWord(allTargets, g.word)) p(`glossary word "${g.word}" does not occur in the text`);
  });
  const limit = glossaryLimit(text);
  if ((text.glossary ?? []).length > limit) p(`glossary has ${text.glossary.length} words; at most ${limit} (~5 % of the text's tokens)`);
  if (!Array.isArray(text.items) || !text.items.length) p('needs items (the vocabulary ids it practises)');
  if (!Array.isArray(text.questions) || !text.questions.length) p('needs questions');
  const qids = new Set();
  for (const [list, name] of [[text.questions ?? [], 'questions'], [text.listeningQuestions ?? [], 'listeningQuestions']]) {
    list.forEach((q, i) => {
      if (name === 'listeningQuestions' && !LISTENING_QUESTION_TYPES.includes(q.type)) p(`${q.id ?? `${name}[${i}]`}: a listening question is ${LISTENING_QUESTION_TYPES.join(', ')}`);
      if (name === 'questions' && q.type === 'complete') p(`${q.id}: complete is a listening question (listeningQuestions)`);
      if (!q.id) p(`${name}[${i}] has no id`);
      else if (qids.has(q.id)) p(`question id ${q.id} is used twice`);
      qids.add(q.id);
      out.push(...questionProblems(q, text, `${text.id} ${q.id ?? `${name}[${i}]`}`, native));
    });
  }
  if (text.orderable && segs.length < 3 && (text.paragraphs ?? []).length < 3) p('orderable needs at least 3 paragraphs, turns or sentences');
  return out;
}

/** Cloze gaps against their text: each gap's word must occur in its sentence; 3–6 gaps; no sentence/word twice. */
export function clozeProblems(gaps, text) {
  const out = [];
  const byId = new Map(textSegments(text).map((s) => [s.id, s]));
  if (!Array.isArray(gaps) || gaps.length < CLOZE_GAPS[0] || gaps.length > CLOZE_GAPS[1]) out.push(`${text.id}: a cloze needs ${CLOZE_GAPS[0]}–${CLOZE_GAPS[1]} gaps (found ${gaps?.length ?? 0})`);
  const seen = new Set();
  for (const g of gaps ?? []) {
    const s = byId.get(g.sentence);
    if (!s) out.push(`${text.id}: cloze gap sentence ${g.sentence} is not a sentence of the text`);
    else if (!containsWord(s.target, g.word)) out.push(`${text.id}: cloze gap "${g.word}" does not occur in ${g.sentence}`);
    const key = `${g.sentence}|${norm(g.word)}`;
    if (seen.has(key)) out.push(`${text.id}: cloze gap "${g.word}" in ${g.sentence} twice`);
    seen.add(key);
    if (g.kind && !['word', 'finite_verb', 'open', 'word_form'].includes(g.kind)) out.push(`${text.id}: cloze gap kind "${g.kind}" is not word, finite_verb, open or word_form`);
    // B2 word formation: the stem (in capitals on screen) differs from the answer; an open gap has no hint at all
    if (g.kind === 'word_form') {
      if (!g.stem) out.push(`${text.id}: word_form gap "${g.word}" in ${g.sentence} needs a stem`);
      else if (norm(g.stem) === norm(g.word)) out.push(`${text.id}: word_form gap "${g.word}" in ${g.sentence}: the stem is the answer itself`);
    }
    if (g.kind === 'open' && g.hint) out.push(`${text.id}: open gap "${g.word}" in ${g.sentence} has no hint (open cloze)`);
    // a finite verb that is its own infinitive (we geven, hint "geven (present)") tests nothing
    if (g.kind === 'finite_verb' && g.hint && Object.values(g.hint).some((h) => norm(String(h).split(/\s*\(/)[0].trim().split(/\s+/).pop()) === norm(g.word))) {
      out.push(`${text.id}: cloze gap "${g.word}" in ${g.sentence} is the infinitive of its hint: choose another form or verb`);
    }
  }
  // every gap must appear in the text as the learner sees it (a gap left out could never be filled)
  if (!out.length && Array.isArray(gaps)) {
    const placed = new Set(clozeParts(text, gaps).flatMap((seg) => seg.parts.filter((x) => typeof x !== 'string').map((x) => x.gap)));
    gaps.forEach((g, n) => { if (!placed.has(n)) out.push(`${text.id}: cloze gap "${g.word}" in ${g.sentence} cannot be placed in the text`); });
  }
  return out;
}

/**
 * A gapped text (B2): `gapped.gaps` = 3–6 sentence ids of the reading text (in text order, never its first sentence),
 * `gapped.extra` = 1–2 sentences that fit none of the gaps (id, target, native).
 */
export function gappedProblems(gapped, text, { native = 'nl' } = {}) {
  const out = [];
  const p = (m) => out.push(`${text.id}: gapped text: ${m}`);
  if (text.kind !== 'reading') return [`${text.id}: gapped text is for reading texts`];
  const ids = (text.paragraphs ?? []).flat().map((x) => x.id);
  const gaps = gapped?.gaps ?? [];
  if (gaps.length < GAPPED_GAPS[0] || gaps.length > GAPPED_GAPS[1]) p(`needs ${GAPPED_GAPS[0]}–${GAPPED_GAPS[1]} gaps (found ${gaps.length})`);
  if (new Set(gaps).size !== gaps.length) p('a sentence is taken out twice');
  gaps.forEach((id, i) => {
    const at = ids.indexOf(id);
    if (at < 0) p(`${id} is not a sentence of the text`);
    else if (at === 0) p(`${id}: the first sentence stays (the reader needs a start)`);
    if (i > 0 && ids.indexOf(gaps[i - 1]) > at) p('gaps are listed in text order');
    if (i > 0 && ids.indexOf(gaps[i - 1]) === at - 1) p(`${gaps[i - 1]} and ${id} are next to each other: leave a sentence between two gaps`);
  });
  const extra = gapped?.extra ?? [];
  if (extra.length < 1 || extra.length > 2) p('needs 1–2 extra sentences (they fit none of the gaps)');
  for (const x of extra) {
    if (!x.id || ids.includes(x.id)) p(`extra sentence ${x.id ?? '?'} needs its own id`);
    if (!x.target) p(`extra sentence ${x.id} needs target`);
    if (!x.native?.[native]) p(`extra sentence ${x.id} needs its meaning { ${native}: … }`);
  }
  return out;
}

/** Problems of a key word transformation: one ___, the key word in every answer and not in `from`, 2–6 words each. */
export function transformProblems(t, where) {
  const out = [];
  const p = (m) => out.push(`${where}: ${m}`);
  if (!t.from || !t.key || !t.gapped) p('needs from, key and gapped');
  if ((String(t.gapped).match(/___/g) ?? []).length !== 1) p('gapped needs exactly one ___');
  if (t.from && t.key && containsWord(t.from, t.key)) p(`the key word "${t.key}" is already in the first sentence`);
  if (!Array.isArray(t.answers) || !t.answers.length) p('needs answers');
  for (const a of t.answers ?? []) {
    const n = textWords(a).length;
    if (n < TRANSFORM_WORDS[0] || n > TRANSFORM_WORDS[1]) p(`answer "${a}": ${TRANSFORM_WORDS[0]}–${TRANSFORM_WORDS[1]} words`);
    if (t.key && !containsWord(a, t.key)) p(`answer "${a}" does not use the key word "${t.key}"`);
  }
  if (new Set((t.answers ?? []).map(norm)).size !== (t.answers ?? []).length) p('answers are listed twice');
  return out;
}

/** The reading text with the gapped sentences taken out: segments as clozeParts, a removed sentence = [{ gap: n }]. */
export function gappedParts(text, gaps) {
  const paraOf = new Map();
  (text.paragraphs ?? []).forEach((par, i) => par.forEach((x) => paraOf.set(x.id, i)));
  return textSegments(text).map((x) => {
    const n = gaps.indexOf(x.id);
    return { id: x.id, paragraph: paraOf.get(x.id) ?? 0, parts: n >= 0 ? [{ gap: n }] : [x.target] };
  });
}

/**
 * A gap word as a whole word, with the word edges of `textWords` (one rule for the validator and the gaps):
 * an apostrophe or hyphen next to it is an edge only when no letter or digit follows (before) / precedes (after) it —
 * a quote ('Hello,') or a plural possessive (parents') is an edge, an elision (l'école) or a compound (well-made) is not.
 */
export const gapPattern = (word) => new RegExp(
  `(?<![\\p{L}\\p{N}])(?<![\\p{L}\\p{N}]['’-])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])(?!['’-][\\p{L}\\p{N}])`, 'iu');

/**
 * The text with gaps: [{ id, speaker?, paragraph, parts: [string | { gap: n }] }]. The n-th gap replaces the first whole-word
 * occurrence of its word in its sentence (gaps in one sentence in order).
 */
export function clozeParts(text, gaps) {
  const paraOf = new Map();
  if (text.kind === 'dialogue') (text.turns ?? []).forEach((t, i) => paraOf.set(t.id, i));
  else (text.paragraphs ?? []).forEach((par, i) => par.forEach((s) => paraOf.set(s.id, i)));
  return textSegments(text).map((s) => {
    let parts = [s.target];
    gaps.forEach((g, n) => {
      if (g.sentence !== s.id) return;
      const next = [];
      let done = false;
      for (const part of parts) {
        if (done || typeof part !== 'string') { next.push(part); continue; }
        const m = part.match(gapPattern(g.word));
        if (!m) { next.push(part); continue; }
        const at = m.index;
        next.push(part.slice(0, at), { gap: n }, part.slice(at + m[0].length));
        done = true;
      }
      parts = next.filter((x) => x !== '');
    });
    return { id: s.id, ...(s.speaker ? { speaker: s.speaker } : {}), paragraph: paraOf.get(s.id) ?? 0, parts };
  });
}
