// Pure grading functions. No I/O. Every exercise answer the client submits is graded here.
//
// grade(exercise, answer, { track, nativeLang, knownWords }) -> { correct, correctAnswer?, note? }
//   nativeLang: native-side option texts; knownWords: the course's words (knownWordsOf in loader.js) — a typed word that is
//   itself another word of the course is never "a spelling slip" of the expected one (three ≠ tree, pomme ≠ homme)
//   multiple_choice  answer: string (the option text the child tapped)
//   match_pairs      answer: { mistakes: number }  (pairs are matched client-side)
//   build_sentence   answer: string[] (tokens in the order tapped)
//   fill_blank       answer: string (word-bank choice or typed text)
//   listen_choose    answer: string (the option text the child tapped)
//   listen_type      answer: string (typed)
//   reading, dialogue, listening  answer: option text, or "true" | "false" | "not_given"
//   order_paragraphs answer: string[] (segment ids in order)
//   cloze            answer: string[] (one per gap); also open_cloze, word_form (B2)
//   gap_sentence     answer: string[] (a bank token per gap)        transform  answer: string (the words in the gap)
//   match_texts (a reading question)  answer: number[] (a paragraph per statement); complete: string (typed)

import { nativeText } from './localized.js';

export class UnsupportedExerciseError extends Error {}

/** Answer size limits: what any exercise can need, so a crafted answer never reaches the grader. */
export const ANSWER_LIMITS = { chars: 400, entries: 24 };
/** true when `answer` has a shape and size some exercise accepts: a string, a list of strings, or { mistakes }. */
export function answerFits(answer) {
  const str = (x) => typeof x === 'string' && x.length <= ANSWER_LIMITS.chars;
  if (typeof answer === 'string') return str(answer);
  if (Array.isArray(answer)) return answer.length <= ANSWER_LIMITS.entries && answer.every((x) => str(x) || (Number.isInteger(x) && Math.abs(x) < 1000));
  if (answer && typeof answer === 'object') return Object.keys(answer).length <= 4 && Object.values(answer).every((x) => Number.isInteger(x) || str(x));
  return false;
}

const APOSTROPHES = /[‘’ʼ`´]/g; // ‘ ’ ʼ ` ´ -> '

/**
 * trim, collapse whitespace, lower-case, unify apostrophes, strip terminal . ? !
 * French typing on a phone: the space before ? ! : ; is optional (also a no-break space U+00A0 / U+202F, which \s
 * covers), and the ligatures œ æ equal oe ae.
 * Spacing: `,; :` are word breaks — "oui,ça" is "oui, ça", "0,1,2,3" is "0, 1, 2, 3" — and
 * spaces around an apostrophe between letters close up: "j ' ai" is "j'ai". Both the answer and the expected text pass
 * through here, so a decimal comma (3,5 → 3, 5) changes on both sides alike.
 */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(APOSTROPHES, "'")
    .replace(/\s+/g, ' ')
    .replace(/(?<=\p{L}) ?' ?(?=\p{L})/gu, "'")
    .replace(/ ?([,;:]) ?/g, '$1 ')
    .replace(/ ([?!:;])/g, '$1')
    .trim()
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(TAIL, '')
    .trim();
}
// A linear tail strip: /[\s.?!]+$/ backtracks quadratically on "....x" (30,000 dots would take seconds)
const TAIL = { [Symbol.replace]: (str) => {
  let end = str.length;
  while (end > 0 && /[\s.?!]/u.test(str[end - 1])) end -= 1;
  return str.slice(0, end);
} };

/** Remove diacritics (é->e, ç->c, ...) and expand ligatures (œ->oe, æ->ae). */
export function stripDiacritics(text) {
  return text
    .replace(/œ/g, 'oe').replace(/Œ/g, 'OE')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .normalize('NFC');
}

/**
 * The ways a text with hyphenated words may be typed: each hyphen as typed, as a space, or left out
 * (bon week-end / bon week end / bon weekend). Only inside the hyphenated word: the other spaces stay.
 */
export function hyphenVariants(text) {
  let out = [''];
  for (const w of String(text).split(' ')) {
    const forms = /\p{L}-\p{L}/u.test(w) ? [w, w.replace(/-/g, ' '), w.replace(/-/g, '')] : [w];
    out = out.flatMap((head) => forms.map((f) => (head ? `${head} ${f}` : f))).slice(0, 81);
  }
  return out;
}

/** Tracks whose missing accents are "almost right" (note "accents"): French, and Dutch (één, café, ideeën, België). */
export const ACCENT_TRACKS = ['fr', 'nl'];

/**
 * `typed` is `expected` with accents left out — never with an accent added or changed (*à* for *a*, *où* for
 * *ou*, *sûr* for *sur* are other words, not a missing accent).
 */
export function missingAccentsOnly(typed, expected) {
  const g = [...typed];
  const e = [...expected];
  if (g.length !== e.length || stripDiacritics(typed) !== stripDiacritics(expected)) return false;
  return g.every((c, i) => c === e[i] || stripDiacritics(c) === c);
}

/**
 * Grade free text. A hyphen may be typed as a space or left out, and a space as a hyphen (well made / well-made). For
 * French and Dutch, an answer that differs only in accents is accepted with note "accents" so the UI can show the
 * accented form.
 */
export function gradeTyped(given, expected, { track, knownWords } = {}) {
  const typed = normalize(given);
  const g = /\p{L}-\p{L}/u.test(typed) && !/\p{L}-\p{L}/u.test(normalize(expected)) ? typed.replace(/(?<=\p{L})-(?=\p{L})/gu, ' ') : typed;
  const forms = hyphenVariants(normalize(expected));
  if (g.length > 0 && forms.includes(g)) return { correct: true };
  // English: a contraction written out (haven't / have not), the other past form (learnt / learned), -ize for -ise,
  // canceled for cancelled
  if (track === 'en' && g.length > 0 && forms.some((e) => englishKey(words(e)) === englishKey(words(g)))) return { correct: true };
  if (ACCENT_TRACKS.includes(track) && g.length > 0 && forms.some((e) => missingAccentsOnly(g, e))) {
    return { correct: true, note: 'accents', correctAnswer: expected };
  }
  // Dutch: a compound typed as two words of the course
  if (track === 'nl' && g.length > 0) {
    const e = words(expected);
    const joined = joinCompounds(words(g), e, knownWords);
    if (joined && forms.some((f) => missingAccentsOnly(joined.join(' '), f) || joined.join(' ') === f)) {
      return { correct: true, note: 'spelling', correctAnswer: expected };
    }
  }
  return { correct: false, correctAnswer: expected };
}

/** Option texts are target-language strings or native { nl: … } objects, compared in the user's native language. */
export function gradeMultipleChoice(exercise, answer, { nativeLang } = {}) {
  const right = nativeText(exercise.options.find((o) => o.correct === true).text, nativeLang);
  const correct = typeof answer === 'string' && normalize(answer) === normalize(right);
  return correct ? { correct } : { correct, correctAnswer: right };
}

/**
 * Exact token sequence; `acceptAlso` lists other correct orders of the same tokens ("Today I…" / "I … today").
 * Compared as text: a French tile may hold a space ("Salut !"), and identical tiles are interchangeable anyway.
 */
/**
 * Word order only: case and punctuation are ignored, because a fronted alternative (Om negen uur begint de les.) uses
 * the tiles of the target (De … uur.) with their capital and full stop where the target has them.
 */
export const orderKey = (s) => s.toLowerCase().replace(/[.!?,;:¿¡]/g, ' ').split(/\s+/).filter(Boolean).join(' ');

export function gradeBuildSentence(exercise, answer) {
  const sentences = [exercise.tokens.join(' '), ...(exercise.acceptAlso || [])].map(orderKey);
  const correct =
    Array.isArray(answer) &&
    answer.length === exercise.tokens.length &&
    answer.every((tok) => typeof tok === 'string') &&
    // exactly the given tiles, compared as words: a lesson opened on an older pack has tiles with the final
    // punctuation and the capital ("My", "big."), the new packs bare ones ("my", "big"); both are the same tiles
    [...answer].map(orderKey).sort().join('\u0000') === [...exercise.tokens].map(orderKey).sort().join('\u0000') &&
    sentences.includes(orderKey(answer.join(' ')));
  return correct ? { correct } : { correct, correctAnswer: exercise.answer };
}

export function gradeFillBlank(exercise, answer, { track, knownWords } = {}) {
  if (typeof answer !== 'string') return { correct: false, correctAnswer: exercise.answer };
  if (exercise.options) {
    // Word bank: the child picked a word; accents can't be "almost right".
    const correct = normalize(answer) === normalize(exercise.answer);
    return correct ? { correct } : { correct, correctAnswer: exercise.answer };
  }
  const r = gradeTyped(answer, exercise.answer, { track, knownWords });
  // acceptAlso (typed only): other words that fill the gap for this course's learners (email for mail, fr-en)
  if (!r.correct) {
    for (const alt of exercise.acceptAlso || []) {
      const a = gradeTyped(answer, alt, { track, knownWords });
      if (a.correct) return a;
    }
  }
  if (!r.correct && exercise.kind === 'word_form' && exercise.stem && sameStem(answer, exercise.stem)) return { ...r, note: 'form' };
  return r;
}

/** Damerau-Levenshtein distance (optimal string alignment: insert, delete, substitute, swap neighbours). */
export function editDistance(a, b) {
  const s = [...a];
  const t = [...b];
  const d = Array.from({ length: s.length + 1 }, (_, i) => [i, ...Array(t.length).fill(0)]);
  for (let j = 0; j <= t.length; j++) d[0][j] = j;
  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[s.length][t.length];
}

export const SPELLING_MIN_LETTERS = 5;
export const WORD_EDGE = /^[.,!?;:"«»()\u2026-]+|[.,!?;:"«»()\u2026-]+$/gu;
export const words = (text) => normalize(text).split(' ').map((w) => w.replace(WORD_EDGE, '')).filter(Boolean);

// English numbers typed as digits count as the number word ("I've got 2 brothers" = "two brothers"), 0–100.
const EN_UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export function englishNumber(n) {
  if (n < 20) return EN_UNITS[n];
  if (n < 100) return EN_TENS[Math.floor(n / 10)] + (n % 10 ? `-${EN_UNITS[n % 10]}` : '');
  return n === 100 ? 'hundred' : null;
}
const numberWord = (w, track) => (track === 'en' && /^\d{1,3}$/.test(w) && englishNumber(Number(w)) ? englishNumber(Number(w)) : w);

// French numbers 0–100 (digits typed for number words: "J'ai 21 ans" = "J'ai vingt et un ans").
const FR_UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize',
  'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const FR_TENS = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' };
export function frenchNumber(n) {
  if (n < 20) return FR_UNITS[n];
  if (n === 100) return 'cent';
  if (n > 100) return null;
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t >= 2 && t <= 6) return u === 0 ? FR_TENS[t] : u === 1 ? `${FR_TENS[t]} et un` : `${FR_TENS[t]}-${FR_UNITS[u]}`;
  if (t === 7) return n === 71 ? 'soixante et onze' : `soixante-${FR_UNITS[n - 60]}`;
  if (n === 80) return 'quatre-vingts';
  return `quatre-vingt-${FR_UNITS[n - 80]}`;
}
/** Number words (one to three words) -> value, with the common variants (une, vingt-et-un, quatre-vingt). */
const FR_NUMBER_WORDS = (() => {
  const m = new Map([['une', 1], ['quatre-vingt', 80]]);
  for (let n = 0; n <= 100; n++) {
    const w = frenchNumber(n);
    m.set(w, n);
    if (w.includes(' et ')) m.set(w.replace(/ et /, '-et-'), n);
  }
  return m;
})();
/** Replace French number words by digits in a word list (longest match first): ['vingt','et','un','ans'] -> ['21','ans']. */
export const frenchDigits = (words) => frenchDigitTokens(words).map((x) => x.w);
/** The same with the words each token came from ({ w: '21', src: 'vingt et un' }). */
export function frenchDigitTokens(words) {
  const out = [];
  for (let i = 0; i < words.length;) {
    let hit = null;
    for (const len of [3, 2, 1]) {
      const key = words.slice(i, i + len).join(' ');
      if (words.length - i >= len && FR_NUMBER_WORDS.has(key)) {
        hit = { len, value: String(FR_NUMBER_WORDS.get(key)), src: key };
        break;
      }
    }
    if (hit) {
      out.push({ w: hit.value, src: hit.src });
      i += hit.len;
    } else {
      out.push({ w: words[i].replace(/^0+(\d)/, '$1'), src: words[i] });
      i += 1;
    }
  }
  return out;
}

// Dutch numbers 0–1000 (digits typed for number words: "Ik ben 21" = "Ik ben eenentwintig"). Dutch writes them as one
// word: eenentwintig, tweeëntwintig, honderdvijf, tweehonderdvijfendertig, duizend.
const NL_UNITS = ['nul', 'één', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien', 'elf', 'twaalf', 'dertien',
  'veertien', 'vijftien', 'zestien', 'zeventien', 'achttien', 'negentien'];
const NL_TENS = ['', '', 'twintig', 'dertig', 'veertig', 'vijftig', 'zestig', 'zeventig', 'tachtig', 'negentig'];
export function dutchNumber(n) {
  if (!Number.isInteger(n) || n < 0 || n > 1000) return null;
  if (n === 1000) return 'duizend';
  if (n >= 100) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    const head = `${h === 1 ? '' : dutchNumber(h)}honderd`;
    return rest ? `${head}${rest === 1 ? 'een' : dutchNumber(rest)}` : head;
  }
  if (n < 20) return NL_UNITS[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (!u) return NL_TENS[t];
  const unit = u === 1 ? 'een' : NL_UNITS[u];
  return `${unit}${unit.endsWith('e') ? 'ën' : 'en'}${NL_TENS[t]}`; // tweeëntwintig, drieëntwintig, vijfentwintig
}
const NL_NUMBER_WORDS = (() => {
  const m = new Map([['een', 1]]);
  for (let n = 0; n <= 1000; n++) {
    const w = dutchNumber(n);
    m.set(w, n);
    m.set(stripDiacritics(w), n); // tweeentwintig, een
  }
  return m;
})();
/** Replace Dutch number words by digits: ['ik', 'ben', 'eenentwintig'] -> ['ik', 'ben', '21']. */
export const dutchDigits = (words) => dutchDigitTokens(words).map((x) => x.w);
// An expected "een" without accents is the article, never the number (één): "1 kat" is wrong for "een kat".
export const dutchDigitTokens = (words, { expected = false } = {}) => words.map((w) => ({
  w: NL_NUMBER_WORDS.has(w) && !(expected && w === 'een') ? String(NL_NUMBER_WORDS.get(w)) : w.replace(/^0+(\d)/, '$1'), src: w }));

// English hundreds for dictation: "a hundred", "one hundred", "two hundred and five" = 100, 100, 205.
const EN_NUMBER_WORDS = (() => {
  const m = new Map();
  for (let n = 0; n < 100; n++) m.set(englishNumber(n), n);
  return m;
})();
export function englishDigitTokens(words) {
  const out = [];
  for (let i = 0; i < words.length;) {
    const head = words[i];
    const mult = head === 'a' || head === 'one' ? 1 : EN_NUMBER_WORDS.get(head);
    if (mult >= 1 && mult <= 9 && words[i + 1] === 'hundred') {
      let value = mult * 100;
      let len = 2;
      if (words[i + 2] === 'and' && EN_NUMBER_WORDS.get(words[i + 3]) >= 1) { value += EN_NUMBER_WORDS.get(words[i + 3]); len = 4; }
      out.push({ w: String(value), src: words.slice(i, i + len).join(' ') });
      i += len;
    } else if (EN_NUMBER_WORDS.has(head) || head === 'hundred') {
      out.push({ w: head === 'hundred' ? '100' : String(EN_NUMBER_WORDS.get(head)), src: head });
      i += 1;
    } else {
      out.push({ w: head.replace(/^0+(\d)/, '$1'), src: head });
      i += 1;
    }
  }
  return out;
}

/**
 * Number words against digits, word by word: only a position where one side has digits compares as numbers; where both
 * sides wrote words (an article: un / une, een / één), the words themselves are compared — so "une grand défi" stays wrong
 * for "un grand défi" when a digit elsewhere in the sentence makes the numbers count.
 */
function digitCompare(given, expected, tokens, track, knownWords) {
  const g = tokens(given);
  const e = tokens(expected, { expected: true });
  if (g.length !== e.length) return { correct: false };
  const gw = [];
  const ew = [];
  g.forEach((a, i) => {
    const b = e[i];
    if (/^\d+$/.test(a.w) && a.w === b.w && !/\d/.test(a.src) && !/\d/.test(b.src)) {
      gw.push(...a.src.split(' '));
      ew.push(...b.src.split(' '));
    } else {
      gw.push(a.w);
      ew.push(b.w);
    }
  });
  if (gw.length !== ew.length) return { correct: false };
  return compareWords(gw, ew, track, knownWords);
}

/**
 * Typed dictation. Same normalization as gradeTyped, then word by word:
 * exact -> ok; French or Dutch accent-only difference -> ok, note "accents";
 * expected word of >= 5 letters within edit distance 1 -> ok, note "spelling" (young spellers);
 * anything else -> wrong. Word count and order must match. "spelling" wins over "accents".
 */
export function gradeListenType(exercise, answer, { track, knownWords } = {}) {
  const wrong = { correct: false, correctAnswer: exercise.answer };
  if (typeof answer !== 'string') return wrong;
  // `acceptAlso`: other correct spellings of what is heard ("It's" / "It is"); the best match wins.
  // Hyphenated words may be typed as one word or two ("stomach-ache" = "stomachache" = "stomach ache"), with the same
  // accent and spelling tolerance as any other word.
  const expectedTexts = [exercise.answer, ...(exercise.acceptAlso || [])].flatMap((t) => hyphenVariants(normalize(t)));
  // and a space typed as a hyphen (well-made for well made), as in typed fill-ins
  const typed = /\p{L}-\p{L}/u.test(answer) ? [answer, answer.replace(/(?<=\p{L})-(?=\p{L})/gu, ' ')] : [answer];
  const results = expectedTexts.flatMap((expectedText) => typed.map((a) => gradeDictation(a, expectedText, { track, knownWords })));
  const best = results.find((r) => r.correct && !r.note) ?? results.find((r) => r.correct);
  if (!best) return wrong;
  return best.note ? { correct: true, note: best.note, correctAnswer: exercise.answer } : { correct: true };
}

/**
 * What the result strip shows after a dictation besides right or wrong, added to the
 * answer's response by the routes (grade() stays the grading alone): `words` — the sentence's words marked (wordMarks), when
 * the answer was wrong or only almost right (against the sentence, or the `acceptAlso` spelling it is closest to);
 * `capsNote` — the learner left out the capital or the final mark, which never count. {} for every other exercise.
 */
export function dictationFeedback(exercise, answer, result, { track, knownWords } = {}) {
  if (exercise?.type !== 'listen_type' || typeof answer !== 'string') return {};
  // marked against the sentence as written, or against the other accepted spelling (acceptAlso: "There is" for "There's")
  // the answer is closest to, as the grade is
  const off = (w) => (w ? w.marks.filter((m) => m.s !== 'ok').length + w.extra.length : Infinity);
  const words = !result.correct || result.note
    ? [exercise.answer, ...(exercise.acceptAlso || [])].map((text) => wordMarks(answer, text, { track, knownWords }))
      .reduce((best, w) => (off(w) < off(best) ? w : best))
    : null;
  return { ...(leftOutCapsOrStop(answer, exercise.answer) ? { capsNote: true } : {}), ...(words ? { words } : {}) };
}

/**
 * English contractions written out: "don't" = "do not", "can't" = "cannot" = "can not", "I'm" = "I am",
 * "we've" = "we have", "they'll" = "they will". 's and 'd are left alone (is/has/possessive, would/had cannot be told
 * apart from the text), so "it's" still needs an acceptAlso when "it is" should pass.
 */
export function expandEnglish(list) {
  const out = [];
  for (const w of list) {
    const m = w.match(/^(can't|cannot|won't|shan't)$/);
    if (m) out.push(...{ "can't": ['can', 'not'], cannot: ['can', 'not'], "won't": ['will', 'not'], "shan't": ['shall', 'not'] }[m[1]]);
    else if (/^\p{L}+n't$/u.test(w)) out.push(w.slice(0, -3), 'not');
    else if (/^\p{L}+'(m|re|ve|ll)$/u.test(w)) {
      const [head, tail] = w.split("'");
      out.push(head, { m: 'am', re: 'are', ve: 'have', ll: 'will' }[tail]);
    } else out.push(w);
  }
  return out;
}

/** British verbs with a -t past besides the -ed one (both standard): either is right where the other is expected. */
export const ENGLISH_PAST_T = { learnt: 'learned', spelt: 'spelled', burnt: 'burned', dreamt: 'dreamed', spilt: 'spilled',
  smelt: 'smelled', spoilt: 'spoiled', leapt: 'leaped', knelt: 'kneeled' };
/**
 * British -ise and -ize spellings (realise / realize, organisation / organization) are both right — only for the stems
 * that really have both (*surprize*, *exercize*, *promize* are misspellings, not variants).
 */
export const ENGLISH_IZE_STEMS = new Set(['realis', 'recognis', 'organis', 'apologis', 'summaris', 'memoris', 'criticis',
  'emphasis', 'specialis', 'prioritis', 'minimis', 'maximis', 'categoris', 'symbolis', 'sympathis', 'standardis', 'modernis',
  'finalis', 'personalis', 'visualis', 'civilis', 'utilis', 'characteris', 'authoris', 'legalis', 'globalis', 'mobilis',
  'normalis', 'optimis', 'socialis', 'energis', 'hospitalis', 'familiaris', 'idealis', 'publicis', 'agonis', 'analys',
  'capitalis', 'centralis', 'colonis', 'customis', 'digitalis', 'economis', 'equalis', 'harmonis', 'hypnotis', 'immunis',
  'industrialis', 'localis', 'maximis', 'moralis', 'neutralis', 'patronis', 'penalis', 'polaris', 'popularis', 'privatis',
  'rationalis', 'revolutionis', 'scrutinis', 'stabilis', 'sterilis', 'subsidis', 'synthesis', 'theoris', 'tranquillis',
  'vandalis', 'vaporis', 'westernis', 'computeris', 'fertilis', 'galvanis', 'improvis', 'jeopardis', 'mechanis',
  'mesmeris', 'monopolis', 'motoris', 'naturalis', 'pasteuris', 'pressuris', 'regularis', 'sanitis', 'secularis', 'sensitis',
  'trivialis', 'urbanis', 'antagonis', 'italicis', 'itemis', 'marginalis', 'demonis', 'dramatis', 'romanticis', 'stigmatis']);
const ise = (w) => {
  const m = w.match(/^(\p{L}{3,}i)([sz])(e|ed|es|ing|ation|ations|er|ers)$/u);
  return m && ENGLISH_IZE_STEMS.has(`${m[1]}s`) ? `${m[1]}s${m[3]}` : w;
};
/**
 * American spellings of British words: color / colour, center / centre … are right where the British form
 * is expected, and the other way round. Plural and -ed/-ing forms of the listed words are covered by their own entries.
 */
export const ENGLISH_US = (() => {
  const pairs = { color: 'colour', favor: 'favour', favorite: 'favourite', humor: 'humour', neighbor: 'neighbour',
    neighborhood: 'neighbourhood', behavior: 'behaviour', honor: 'honour', labor: 'labour', flavor: 'flavour', rumor: 'rumour',
    harbor: 'harbour', center: 'centre', liter: 'litre', theater: 'theatre', fiber: 'fibre', gray: 'grey',
    jewelry: 'jewellery', defense: 'defence', offense: 'offence', math: 'maths', mom: 'mum', pajamas: 'pyjamas',
    catalog: 'catalogue', dialog: 'dialogue', program: 'programme', aluminum: 'aluminium', plow: 'plough', skeptical: 'sceptical',
    mold: 'mould', cozy: 'cosy', donut: 'doughnut', enroll: 'enrol', fulfill: 'fulfil', skillful: 'skilful', analyze: 'analyse',
    paralyze: 'paralyse', judgment: 'judgement', aging: 'ageing' };
  const out = {};
  for (const [us, gb] of Object.entries(pairs)) {
    out[us] = gb;
    // no plural of a word whose British form already ends in s (math/maths would make maths/mathss)
    if (!/[sy]$/.test(us) && !/s$/.test(gb)) out[`${us}s`] = `${gb}s`;
  }
  // license / licence and practice / practise: the US noun-verb spelling; colors etc. above, the -ed/-ing of the -or verbs
  Object.assign(out, { license: 'licence', licensed: 'licensed', practice: 'practise', practiced: 'practised',
    practicing: 'practising', favored: 'favoured', colored: 'coloured', honored: 'honoured', labored: 'laboured',
    analyzed: 'analysed', analyzing: 'analysing', enrolled: 'enrolled', fulfilled: 'fulfilled', centered: 'centred' });
  return out;
})();
/** American single -l- forms of British -ll- verbs (canceled / cancelled): either is right where the other is expected. */
export const ENGLISH_LL = { canceled: 'cancelled', canceling: 'cancelling', traveled: 'travelled', traveling: 'travelling',
  traveler: 'traveller', travelers: 'travellers', labeled: 'labelled', modeled: 'modelled' };
const englishKey = (list) => expandEnglish(list).map((w) => ise(ENGLISH_PAST_T[w] ?? ENGLISH_LL[w] ?? ENGLISH_US[w] ?? w)).join(' ');

function gradeDictation(answer, expectedText, { track, knownWords }) {
  const rawGiven = words(answer);
  const rawExpected = words(expectedText);
  const given = rawGiven.map((w) => numberWord(w, track));
  const expected = rawExpected.map((w) => numberWord(w, track));
  const result = compareWords(given, expected, track, knownWords);
  // English variants (contractions written out, learnt/learned, -ise/-ize, US/British spellings) before the one-letter-slip
  // rule: *color* for *colour* is plainly right, not "right (spelling)"
  if (track === 'en' && (!result.correct || result.note)) {
    const g = englishKey(given).split(' ');
    const e = englishKey(expected).split(' ');
    if (g.join(' ') !== given.join(' ') || e.join(' ') !== expected.join(' ')) {
      const keyed = compareWords(g, e, track, knownWords);
      if (!result.correct || (keyed.correct && !keyed.note)) return keyed;
    }
  }
  // Digits for number words (both sides to digits, so "21" = "vingt et un", "1 sœur" = "une sœur", "100" = "a hundred") —
  // only when a digit was typed or is expected, and only at the positions with a digit (digitCompare).
  const hasDigit = (list) => list.some((w) => /\d/.test(w));
  const tokens = { fr: frenchDigitTokens, nl: dutchDigitTokens, en: englishDigitTokens }[track];
  if (!result.correct && tokens && (hasDigit(rawGiven) || hasDigit(rawExpected))) {
    const r = digitCompare(rawGiven, rawExpected, tokens, track, knownWords);
    if (r.correct || track !== 'en') return r;
    return digitCompare(englishKey(rawGiven).split(' '), englishKey(rawExpected).split(' '), tokens, track, knownWords);
  }
  // Dutch: a compound typed as two words of the course ("thuis gekomen") — right, with the spelling note
  if (!result.correct && track === 'nl') {
    const joined = joinCompounds(given, expected, knownWords);
    if (joined) {
      const r = compareWords(joined, expected, track, knownWords);
      if (r.correct) return { correct: true, note: 'spelling' };
    }
  }
  return result;
}

/**
 * French agreement endings that are not heard: allé / allée / allés / allées, fini / finie, perdu / perdue. A typed
 * word that differs from the expected one only there was heard right (correct, with the spelling note).
 */
// Compared without accents (allee = allée); words of 4+ letters only (le / les, de / des are not homophones).
const SILENT_AGREEMENT = /(er|e|i|u)(e|s|es)?$/u; // also fier / fière, cher / chère
export const silentAgreementBase = (w) => (w.length >= 4 && SILENT_AGREEMENT.test(w) ? w.replace(SILENT_AGREEMENT, '$1') : null);

/**
 * How a typed word matches an expected word in a dictation: 'exact', 'accents' (French or Dutch accents left out),
 * 'spelling' (an unheard French ending, or a slip of one letter in a word of 5+ letters that is not itself another course
 * word), or null (wrong).
 */
export function wordMatch(g, e, track, knownWords) {
  if (g === e) return 'exact';
  const gs = stripDiacritics(g);
  const es = stripDiacritics(e);
  if (ACCENT_TRACKS.includes(track) && missingAccentsOnly(g, e)) return 'accents';
  if (track === 'fr' && silentAgreementBase(gs) && silentAgreementBase(gs) === silentAgreementBase(es)) return 'spelling';
  const letters = [...es].filter((c) => /\p{L}/u.test(c)).length;
  // A slip of one letter, unless what was typed is another word of the course: then the child heard another word.
  if (letters >= SPELLING_MIN_LETTERS && editDistance(gs, es) <= 1 && !knownWords?.has(gs)) return 'spelling';
  return null;
}

function compareWords(given, expected, track, knownWords) {
  const wrong = { correct: false };
  if (!given.length || given.length !== expected.length) return wrong;
  let accents = false;
  let spelling = false;
  for (let i = 0; i < expected.length; i++) {
    const m = wordMatch(given[i], expected[i], track, knownWords);
    if (!m) return wrong;
    if (m === 'accents') accents = true;
    if (m === 'spelling') spelling = true;
  }
  if (spelling) return { correct: true, note: 'spelling' };
  if (accents) return { correct: true, note: 'accents' };
  return { correct: true };
}

/**
 * Dutch compounds typed as two words: "thuis gekomen" for "thuisgekomen". Two neighbouring
 * typed words whose concatenation is an expected word are joined when both are words of the course (`knownWords`; a
 * part of one letter never counts). Returns the joined list, or null when nothing was joined.
 */
export function joinCompounds(given, expected, knownWords) {
  if (given.length <= expected.length) return null;
  const want = new Set(expected.map(stripDiacritics));
  // without the course's words nothing is joined: any split of a word would otherwise pass
  const known = (w) => w.length >= 2 && Boolean(knownWords) && (knownWords.has(w) || knownWords.has(stripDiacritics(w)));
  const out = [];
  out.joined = new Set(); // the positions of joined words
  for (let i = 0; i < given.length; i++) {
    const a = given[i];
    const b = given[i + 1];
    if (b !== undefined && want.has(stripDiacritics(a + b)) && !want.has(stripDiacritics(a)) && known(a) && known(b)) {
      out.joined.add(out.length);
      out.push(a + b);
      i += 1;
    } else out.push(a);
  }
  return out.joined.size ? out : null;
}

/**
 * Word-level alignment of a dictation (runs of words): d[i][j] = cost of expected[0..i) against
 * given[0..j). Besides one word for one word, a run of up to SPAN_MAX words on one side may stand for one word on the other
 * when the grader accepts them as the same (`spanMark`): "do not" for *don't*, "21" for *vingt et un*, "stomach ache" for
 * *stomach-ache*, a Dutch compound typed as two course words. Pairs are [i, l, j, k]: expected i..i+l against given j..j+k
 * (l or k 0 = missing or extra).
 */
const SPAN_MAX = 4;
const editAlign = (n, m, spanMark) => {
  const d = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  const step = (i, j) => {
    let best = [d[i - 1][j - 1] + (spanMark(i - 1, 1, j - 1, 1) ? 0 : 1), 1, 1];
    const take = (cost, l, k) => { if (cost < best[0]) best = [cost, l, k]; };
    for (let k = 2; k <= Math.min(SPAN_MAX, j); k++) if (spanMark(i - 1, 1, j - k, k)) take(d[i - 1][j - k], 1, k);
    for (let l = 2; l <= Math.min(SPAN_MAX, i); l++) if (spanMark(i - l, l, j - 1, 1)) take(d[i - l][j - 1], l, 1);
    take(d[i - 1][j] + 1, 1, 0);
    take(d[i][j - 1] + 1, 0, 1);
    return best;
  };
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) d[i][j] = step(i, j)[0];
  const pairs = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const [, l, k] = i === 0 ? [0, 0, 1] : j === 0 ? [0, 1, 0] : step(i, j);
    i -= l;
    j -= k;
    pairs.unshift([i, l, j, k]);
  }
  return pairs;
};

const MARK_OF = { accents: 'accents', spelling: 'spelling' };
const lettersOf = (w) => stripDiacritics(w).replace(/[^\p{L}]/gu, '');

/**
 * The words of a dictation's sentence with what the learner made of each: the result
 * strip shows the sentence with the wrong words marked and the missing ones shown. `expectedText` is shown as written
 * (capitals and marks kept); each of its words gets `s`: 'ok' (right), 'accents', 'spelling' (almost right), 'wrong' (another
 * word typed) or 'missing' (not typed). `extra`: typed words the sentence does not have. null when the sentence cannot be
 * split into words one to one. A word is marked by the grader's own rules (wordMatch, and gradeListenType on a word or on a
 * run of words against one word), so every leniency of the grade counts in the marks too: written-out English
 * contractions, digits for number words, a hyphen typed as a space or left out, US and British spellings, the other past form.
 */
export function wordMarks(answer, expectedText, { track, knownWords } = {}) {
  const shown = String(expectedText ?? '').trim().split(/\s+/).reduce((out, tok) => {
    // a mark standing alone ("nom ?", "Oui !") belongs to the word before it
    if (out.length && !/[\p{L}\p{N}]/u.test(tok)) out[out.length - 1] += ` ${tok}`;
    else out.push(tok);
    return out;
  }, []);
  const exp = shown.map((tok) => words(tok).join(' '));
  if (exp.some((w) => !w || w.includes(' '))) return null;
  const given = words(answer);
  const numberTokens = { fr: frenchDigitTokens, nl: dutchDigitTokens, en: englishDigitTokens }[track];
  const isNumber = (list) => {
    const t = numberTokens?.(list);
    return t?.length === 1 && /^\d+$/.test(t[0].w);
  };
  const facts = (list) => list.map((w) => ({ letters: lettersOf(w), digit: /\d/.test(w), apos: /'|^cannot$/.test(w) }));
  const gf = facts(given);
  const ef = facts(exp);
  // a pair is worth asking the grader about only where a leniency can apply: the same letters (stomach ache, thuis gekomen,
  // can not), a number on both sides with a digit (21 / vingt et un), an English contraction (don't / do not) or variant
  const worth = (i, l, j, k) => {
    const g = gf.slice(j, j + k);
    const e = ef.slice(i, i + l);
    if (g.map((x) => x.letters).join('') === e.map((x) => x.letters).join('')) return true;
    if ([...g, ...e].some((x) => x.digit) && isNumber(given.slice(j, j + k)) && isNumber(exp.slice(i, i + l))) return true;
    if (track !== 'en') return false;
    if (l + k <= 3 && [...g, ...e].some((x) => x.apos)) return true;
    return l + k === 2 && (englishKey([given[j]]) !== given[j] || englishKey([exp[i]]) !== exp[i]);
  };
  const memo = new Map();
  // the grade of given[j..j+k) against expected[i..i+l): 'ok', 'accents', 'spelling' or null (not the same)
  const spanMark = (i, l, j, k) => {
    const one = l === 1 && k === 1;
    if (one && given[j] === exp[i]) return 'ok';
    if (!one && !worth(i, l, j, k)) return null;
    const g = given.slice(j, j + k).join(' ');
    const e = exp.slice(i, i + l).join(' ');
    const key = `${e}|${g}`;
    if (!memo.has(key)) {
      // one word for one word: wordMatch is the grader's word rule; an English variant may still make a slip plainly right
      const m = one ? wordMatch(given[j], exp[i], track, knownWords) : null;
      let mark = m;
      if ((!m || (track === 'en' && m === 'spelling')) && (!one || worth(i, l, j, k))) {
        const r = gradeListenType({ answer: e }, g, { track, knownWords });
        mark = r.correct ? MARK_OF[r.note] ?? 'ok' : m;
      }
      memo.set(key, mark === 'exact' ? 'ok' : mark);
    }
    return memo.get(key);
  };
  const pairs = editAlign(exp.length, given.length, spanMark);
  const marks = shown.map((t) => ({ t, s: 'missing' }));
  const extra = [];
  for (const [i, l, j, k] of pairs) {
    if (!l) extra.push(...given.slice(j, j + k));
    else if (k) for (let x = i; x < i + l; x++) marks[x].s = spanMark(i, l, j, k) ?? 'wrong';
  }
  return { marks, extra };
}

/**
 * The learner left out the capital at the start or the mark at the end that the sentence has: the result
 * strip then says that capitals and full stops do not count.
 */
export function leftOutCapsOrStop(answer, expectedText) {
  const a = String(answer ?? '').trim();
  const e = String(expectedText ?? '').trim();
  if (!a || !e) return false;
  const firstA = a.match(/\p{L}/u)?.[0];
  const firstE = e.match(/\p{L}/u)?.[0];
  const capital = Boolean(firstE && firstA && firstE !== firstE.toLowerCase() && firstA === firstA.toLowerCase());
  const stop = /[.?!…]$/u.test(e) && !/[.?!…]$/u.test(a);
  return capital || stop;
}

export function gradeMatchPairs(exercise, answer) {
  const mistakes = answer && Number.isInteger(answer.mistakes) ? answer.mistakes : -1;
  return { correct: mistakes === 0 };
}

/**
 * A comprehension question (reading, dialogue, listening). answer: the option text tapped (mc, match_heading) or
 * "true" | "false" | "not_given" (true_false_notgiven). correctAnswer: the option text, or that code.
 */
export function gradeTextQuestion(exercise, answer, { track, knownWords } = {}) {
  const q = exercise.question;
  if (q.type === 'true_false_notgiven') {
    const right = String(q.answer);
    return { correct: String(answer) === right, correctAnswer: right };
  }
  // B2 multiple matching: one paragraph number per statement; each statement's result for the per-row feedback
  if (q.type === 'match_texts') {
    const given = Array.isArray(answer) ? answer : [];
    const statements = q.statements.map((st, i) => ({ correct: Number(given[i]) === st.paragraph, answer: q.labels[st.paragraph - 1] }));
    return { correct: statements.every((x) => x.correct), statements };
  }
  // B2 listening completion: typed, with the dictation's tolerance (a slip in a long word, accents, digits)
  if (q.type === 'complete') {
    const r = gradeListenType({ answer: q.answers[0], acceptAlso: q.answers.slice(1) }, answer, { track, knownWords });
    return r.correct ? r : { correct: false, correctAnswer: q.answers[0] };
  }
  const right = q.options[q.correct];
  return { correct: typeof answer === 'string' && normalize(answer) === normalize(right), correctAnswer: right };
}

/**
 * The id a part of an ordering exercise has on the client: opaque per exercise, so the order cannot be read off the ids
 * (the segment ids run in reading order). FNV-1a of exercise id + segment id, base 36.
 */
export function orderToken(exerciseId, segmentId) {
  let h = 2166136261;
  for (const ch of `${exerciseId}\u0000${segmentId}`) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return `p${h.toString(36)}`;
}

/**
 * gap_sentence (B2 gapped text). answer: one bank token (orderToken of the sentence id) per gap. Correct when every gap has
 * its own sentence; `gaps` gives each gap's result and the token of the right sentence (the client shows its text).
 */
export function gradeGapSentence(exercise, answer) {
  const given = Array.isArray(answer) ? answer : [];
  const gaps = exercise.gaps.map((id, i) => {
    const right = orderToken(exercise.id, id);
    return { correct: given[i] === right, answer: right };
  });
  return { correct: gaps.length > 0 && gaps.every((g) => g.correct), gaps };
}

/** A wrong word that starts like its stem (≥ 4 letters): the right word in another form (note "form", never correct). */
export function sameStem(typed, stem) {
  const a = stripDiacritics(normalize(typed));
  const b = stripDiacritics(normalize(stem));
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return n >= Math.min(4, b.length) && a.length > 0;
}

/**
 * transform (B2 key word transformation). answer: the words typed into the gap. Correct when they equal one of the
 * authored answers under the typed rules (case, accents note, English contractions …).
 */
export function gradeTransform(exercise, answer, { track, knownWords } = {}) {
  if (typeof answer !== 'string') return { correct: false, correctAnswer: exercise.answers[0] };
  for (const a of exercise.answers) {
    // the course's words: without them a Dutch "compound typed as two words" accepted any split
    const r = gradeTyped(answer, a, { track, knownWords });
    if (r.correct) return r.note ? { correct: true, note: r.note, correctAnswer: a } : { correct: true };
  }
  return { correct: false, correctAnswer: exercise.answers[0] };
}

/** order_paragraphs. answer: the parts' tokens (orderToken) in the order tapped; correctOrder the same tokens. */
export function gradeOrder(exercise, answer) {
  const right = exercise.segments.map((id) => orderToken(exercise.id, id));
  const ok = Array.isArray(answer) && answer.length === right.length && answer.every((id, i) => id === right[i]);
  return { correct: ok, correctOrder: right };
}

/**
 * cloze. answer: one string per gap. A word bank (options) compares case-insensitively; typed gaps follow the typed rules
 * (accents note for French and Dutch). Correct when every gap is; each gap's result comes back for the per-gap feedback.
 */
export function gradeCloze(exercise, answer, { track, knownWords } = {}) {
  const given = Array.isArray(answer) ? answer : [];
  const gaps = exercise.gaps.map((g, i) => {
    const a = typeof given[i] === 'string' ? given[i] : '';
    if (exercise.options) return { correct: normalize(a) === normalize(g.word), answer: g.word };
    // B2: an open gap may list other words that fit (acceptAlso); a word-formation gap notes the right word in another form
    for (const w of [g.word, ...(g.acceptAlso || [])]) {
      const r = gradeTyped(a, w, { track, knownWords });
      if (r.correct) return { correct: true, answer: g.word, ...(r.note ? { note: r.note } : {}) };
    }
    return { correct: false, answer: g.word, ...(g.kind === 'word_form' && g.stem && sameStem(a, g.stem) ? { note: 'form' } : {}) };
  });
  return { correct: gaps.every((g) => g.correct), gaps };
}

export function grade(exercise, answer, { track, nativeLang, knownWords } = {}) {
  switch (exercise.type) {
    case 'multiple_choice':
      return gradeMultipleChoice(exercise, answer, { nativeLang });
    case 'match_pairs':
      return gradeMatchPairs(exercise, answer);
    case 'build_sentence':
      return gradeBuildSentence(exercise, answer);
    case 'fill_blank':
      return gradeFillBlank(exercise, answer, { track, knownWords });
    case 'listen_choose':
      return gradeMultipleChoice(exercise, answer, { nativeLang });
    case 'listen_type':
      return gradeListenType(exercise, answer, { track, knownWords });
    case 'reading':
    case 'dialogue':
    case 'listening':
      return gradeTextQuestion(exercise, answer, { track, knownWords });
    case 'order_paragraphs':
      return gradeOrder(exercise, answer);
    case 'cloze':
    case 'open_cloze':
    case 'word_form':
      return gradeCloze(exercise, answer, { track, knownWords });
    case 'gap_sentence':
      return gradeGapSentence(exercise, answer);
    case 'transform':
      return gradeTransform(exercise, answer, { track, knownWords });
    default:
      throw new UnsupportedExerciseError(`exercise type "${exercise.type}" is not gradable yet`);
  }
}
