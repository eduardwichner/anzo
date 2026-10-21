#!/usr/bin/env node
// npm run content:wordlist  — parse the Cambridge YLE word list (extracted text of 149681-yle-flyers-word-list.pdf)
// and the B1 Preliminary vocabulary list (506887-b1-preliminary-vocabulary-list.pdf, wordlist-en-b1.js) into
// content/reference/extracted/wordlist-en.json: [{ word, level: S|M|F|B1, pos, source, us?, head?, topics?, examples? }]
// (us: American form; head, topics, examples: B1 entries).
// Derived from a copyrighted document, so the output is gitignored like the rest of extracted/.
// Sources inside the text:
//   - the combined "Pre A1 Starters, A1 Movers and A2 Flyers alphabetic vocabulary list" (each entry ends in S|M|F)
//   - the "Letters & numbers" notes per level (numbers 1–20 S; 21–100 and ordinals 1st–20th M; 101–1,000 and
//     ordinals 21st–31st F), expanded into number words
//   - the handbook's "Names" lists per level (153612-yle-handbook-for-teachers.txt)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { buildB1Entries, columnTextFromPdf } from './wordlist-en-b1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const EXTRACTED = path.join(ROOT, 'content/reference/extracted');
export const WORDLIST_TXT = path.join(EXTRACTED, '149681-yle-flyers-word-list.txt');
export const HANDBOOK_TXT = path.join(EXTRACTED, '153612-yle-handbook-for-teachers.txt');
export const WORDLIST_JSON = path.join(EXTRACTED, 'wordlist-en.json');
export const B1_PDF = path.join(ROOT, 'content/reference/english/b1/506887-b1-preliminary-vocabulary-list.pdf');
export const B1_COLUMNS_TXT = path.join(EXTRACTED, 'english/b1/506887-b1-preliminary-vocabulary-list.columns.txt');
export const B1_NAMES_YAML = path.join(ROOT, 'content/src/en/wordlist-b1-names.yaml');
// B2: Cambridge publishes no B2 list, so English B2 is a derived list like French: the YLE + B1 lists as the
// base, plus the groups of content/src/en/wordlist-b2-sources.yaml (each with a theme and a justification). A word the B2
// First for Schools sample paper 1 uses is marked `attested` (with the paper as its ref), the others `topic`.
export const B2_SOURCES_YAML = path.join(ROOT, 'content/src/en/wordlist-b2-sources.yaml');
export const B2_PAPER_DIR = path.join(EXTRACTED, 'english/b2');
const B2_PAPER_FILES = ['B2 First for Schools sample paper 1 RUE 2022.txt', 'B2 First for Schools sample paper 1 Listening 2022.txt',
  'B2 First for Schools sample paper 1 Writing 2022.txt', 'cambridge-english-first-for-schools-sample-paper-1-answer-keys.txt',
  'cambridge-english-first-for-schools-sample-paper-1-speaking.txt'];
const B2_POS = { noun: 'n', verb: 'v', adj: 'adj', adv: 'adv', prep: 'prep', conj: 'conj', phrase: 'phrase' };

/** The text of the B2 sample paper (lower case, apostrophes normalised), or null when it is not there. */
export function b2PaperText(dir = B2_PAPER_DIR) {
  const parts = B2_PAPER_FILES.map((f) => path.join(dir, f)).filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8'));
  return parts.length ? parts.join('\n').replace(/[‘’]/g, "'").toLowerCase() : null;
}

/** Is `word` (or a simple inflection of its last word) in the paper text? */
export function attestedIn(text, word) {
  if (!text) return false;
  const w = word.toLowerCase();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stem = esc(w).replace(/e$/, '');
  return new RegExp(`(^|[^a-z])${stem}(e|es|s|d|ed|ing|er|ers|ly|ies)?([^a-z]|$)`).test(text)
    || (/y$/.test(w) && new RegExp(`(^|[^a-z])${esc(w.slice(0, -1))}(ies|ied)([^a-z]|$)`).test(text));
}

/** Level-B2 entries from the sources YAML: { words, names, errors, groups } (errors: a word already on a lower list). */
export function buildB2Entries(yamlText, lowerForms, paperText) {
  const doc = YAML.parse(yamlText) || {};
  const words = [];
  const errors = [];
  const seen = new Map();
  for (const g of doc.groups || []) {
    if (!g.id || !g.why) errors.push(`group ${g.id ?? '?'}: needs id and why`);
    for (const [key, pos] of Object.entries(B2_POS)) {
      for (const raw of g[key] || []) {
        const word = String(raw).trim();
        const lc = word.toLowerCase();
        const newSense = (g.newSense || []).map((x) => String(x).toLowerCase()).includes(lc); // same spelling, another word (make up / make-up)
        if (!newSense && (lowerForms.has(lc) || lowerForms.has(lc.replace(/ /g, '-')) || lowerForms.has(lc.replace(/-/g, ' ')))) { errors.push(`${g.id}: "${word}" is already on the YLE or B1 list (taught there; not a B2 word)`); continue; }
        if (seen.has(lc)) { errors.push(`${g.id}: "${word}" is also in ${seen.get(lc)}`); continue; }
        seen.set(lc, g.id);
        const attested = attestedIn(paperText, word);
        words.push({ word, level: 'B2', pos, source: attested ? 'B2 attested' : 'B2 topic', group: g.id,
          ...(attested ? { refs: ['B2 First for Schools sample paper 1'] } : {}) });
      }
    }
  }
  const names = (doc.names || []).map((n) => String(n)).filter((n) => !lowerForms.has(n.toLowerCase()))
    .map((word) => ({ word, level: 'B2', pos: 'name', source: 'B2 names (content/src/en/wordlist-b2-sources.yaml)' }));
  return { words, names, errors, groups: (doc.groups || []).length };
}

/** Names of the B1 texts (content/src/en/wordlist-b1-names.yaml): level-B1 names, never vocabulary. */
export function b1NameEntries(yamlText) {
  const doc = YAML.parse(yamlText);
  return Object.values(doc.names || {}).flat().map((word) => ({ word: String(word), level: 'B1', pos: 'name', source: 'B1 names (content/src/en/wordlist-b1-names.yaml)' }));
}

const POS = ['n', 'v', 'adj', 'adv', 'conj', 'det', 'dis', 'excl', 'int', 'poss', 'prep', 'pron', 'title'];
const POS_RE = new RegExp(`^(.*?)\\s+((?:${POS.join('|')})\\b.*)$`);
// "businessman/woman": the second form completes the first, it is not a separate word.
const SLASH_SPECIAL = {
  'businessman/woman': ['businessman', 'businesswoman'],
  'take a photo/picture': ['take a photo', 'take a picture'],
};
const POS_TOKEN = '(?:n|v|adj|adv|conj|det|dis|excl|int|poss|prep|pron|title|place|time)';

// The PDF glues "+ n" onto the level once: "left (as in direction) adj +nF".
const clean = (s) => s.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().replace(/\+n([SMF])$/, '+ n $1');

/**
 * Every spelling a headword stands for: slashes, (UK x)/(US x) variants, blond(e).
 * Returns [{ form, us }]: us = true for American forms ("apartment (UK flat)" is the US word; "(US favorite)" too).
 */
export function headwordForms(head) {
  const forms = new Map();
  const alternates = [];
  let headIsUs = false;
  head = head.replace(/\s+i\.e\.\s.*$/, ''); // "take off i.e. get undressed"
  let base = head.replace(/\(\s*(UK|US)\s+([^)]*\)?)\s*\)/g, (m, which, alt) => {
    const balanced = (alt.match(/\(/g) || []).length === (alt.match(/\)/g) || []).length;
    alternates.push({ text: balanced ? alt : alt.replace(/\)$/, ''), us: which === 'US' });
    if (which === 'UK') headIsUs = true;
    return ' ';
  });
  base = base.replace(/\([^)]*\)/g, (m, off, str) => (/\w$/.test(str.slice(0, off)) ? m : ' ')); // notes like "(for time)"
  for (const { text, us } of [{ text: base, us: headIsUs }, ...alternates]) {
    const raw = clean(text);
    if (!raw) continue;
    const parts = SLASH_SPECIAL[raw] ?? (raw.includes('/') ? raw.split('/').map(clean) : [raw]);
    for (const p of parts) {
      const opt = p.match(/^(.*?)\(([\w']+)\)(.*)$/); // blond(e), sweet(s), chemist('s)
      const add = (f) => f && !forms.has(f) && forms.set(f, us);
      if (opt) {
        add(clean(opt[1] + opt[3]));
        add(clean(opt[1] + opt[2] + opt[3]));
      } else add(p);
    }
  }
  return [...forms].map(([form, us]) => ({ form, us }));
}

/** One complete cell ("apartment (UK flat) n S") → entries, or null if it isn't an entry. */
export function parseEntry(cell) {
  const m = clean(cell).match(/^(.*\S)\s+([SMF])$/);
  if (!m) return null;
  const body = m[1];
  const posMatch = body.match(POS_RE);
  const head = posMatch ? posMatch[1] : body;
  const pos = posMatch ? posMatch[2] : '';
  return headwordForms(head).map(({ form, us }) => ({ word: form, level: m[2], pos, ...(us ? { us: true } : {}) }));
}

/**
 * Cells of a line with their column offset (cells are separated by 2+ spaces). The PDF text sometimes glues a
 * part of speech to the level ("vM") or two cells with one space ("kilometre n F Kim n S"); both are split.
 */
function cells(line) {
  const out = [];
  const re = /\S+(?: \S+)*/g;
  let x;
  while ((x = re.exec(line))) {
    const text = x[0].replace(new RegExp(`\\b(${POS_TOKEN})([SMF])\\b`, 'g'), '$1 $2');
    const parts = text.split(new RegExp(`(?<=\\b${POS_TOKEN} [SMF]) (?=\\S)`));
    let at = x.index;
    for (const part of parts) {
      out.push({ text: part, at });
      at += part.length + 1;
    }
  }
  return out;
}

export function parseCombinedList(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l, i) => l.trim() === 'alphabetic vocabulary list' && lines.slice(i, i + 12).some((x) => /F\s+First appears at A2 Flyers/.test(x)));
  const end = lines.findIndex((l, i) => i > start && l.trim() === 'grammatical vocabulary list');
  if (start < 0 || end < 0) throw new Error('combined S/M/F list not found in the word list text');
  const keyEnd = lines.findIndex((l, i) => i > start && /excl\s+exclamation/.test(l));
  const entries = [];
  const unparsed = [];
  let pending = []; // incomplete cells of the previous line: { text, at }
  for (let i = keyEnd + 1; i < end; i++) {
    const line = lines[i].replace(/\t/g, ' ');
    if (/^\s*Pre A1 Starters, A1 Movers and A2 Flyers\s*$/.test(line)) continue; // running header
    if (!line.trim() || /^[A-Z]$/.test(line.trim()) || /vocabulary list\s+\d+\s*$/.test(line)) {
      if (/vocabulary list\s+\d+\s*$/.test(line) || !line.trim()) {
        for (const p of pending) unparsed.push({ line: i, text: p.text });
        pending = [];
      }
      continue;
    }
    const next = [];
    for (const c of cells(line)) {
      const host = pending.findIndex((p) => c.at >= p.at - 1 && c.at <= p.at + 8);
      const text = host > -1 ? `${pending.splice(host, 1)[0].text} ${c.text}` : c.text;
      const at = host > -1 ? Math.min(c.at, c.at) : c.at;
      const parsed = parseEntry(text);
      if (parsed) entries.push(...parsed.map((e) => ({ ...e, source: 'combined list' })));
      else next.push({ text, at: host > -1 ? at - 2 : at });
    }
    for (const p of pending) unparsed.push({ line: i, text: p.text });
    pending = next;
  }
  for (const p of pending) unparsed.push({ line: end, text: p.text });
  return { entries, unparsed };
}

const UNITS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
  'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORD = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
const numberWord = (n) => (n < 20 ? UNITS[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? `-${UNITS[n % 10]}` : '') : null);
const ordinal = (n) => {
  const w = numberWord(n);
  const parts = w.split('-');
  const last = parts.pop();
  const o = ORD[last] ?? (last.endsWith('y') ? `${last.slice(0, -1)}ieth` : `${last}th`);
  return [...parts, o].join('-');
};

/** Number words from the per-level "Letters & numbers" notes. */
export function numberEntries() {
  const out = [];
  const add = (word, level, pos) => out.push({ word, level, pos, source: 'numbers note' });
  for (let n = 1; n <= 20; n++) add(numberWord(n), 'S', 'number');
  for (let n = 21; n <= 99; n++) add(numberWord(n), 'M', 'number');
  add('hundred', 'M', 'number');
  for (let n = 1; n <= 20; n++) add(ordinal(n), 'M', 'ordinal');
  add('thousand', 'F', 'number');
  for (let n = 21; n <= 31; n++) add(ordinal(n), 'F', 'ordinal');
  return out;
}

/** Names candidates must recognise, from the handbook's three "Names" lists (Starters, Movers, Flyers in order). */
export function parseHandbookNames(text) {
  const lines = text.split('\n');
  const out = [];
  const levels = ['S', 'M', 'F'];
  let k = 0;
  for (let i = 0; i < lines.length && k < 3; i++) {
    if (!/recognise and write the following names/.test(lines[i])) continue;
    for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
      const l = lines[j].trim();
      if (!l) continue;
      if (/HANDBOOK|^\d+\s/.test(l)) break;
      for (const w of l.split(/\s+/)) if (/^[A-Z][a-z]+$/.test(w)) out.push({ word: w, level: levels[k], pos: 'name', source: 'handbook names' });
    }
    k++;
  }
  return out;
}

export function buildWordlist({ wordlistText, handbookText, b1Columns = null }) {
  const { entries, unparsed } = parseCombinedList(wordlistText);
  const yle = [...entries, ...numberEntries(), ...(handbookText ? parseHandbookNames(handbookText) : [])];
  const yleForms = new Set(yle.map((e) => e.word.toLowerCase()));
  const b1 = b1Columns ? buildB1Entries(b1Columns, (f) => yleForms.has(f)) : null;
  // A name that is also a list word (Brown, Green, OK) stays that word: the trace looks a capitalised token up as a
  // name first, so a B1 name would put a Starters word above Starters.
  const listForms = new Set([...yle, ...(b1 ? b1.words : [])].map((e) => e.word.toLowerCase()));
  const names = b1 && fs.existsSync(B1_NAMES_YAML)
    ? b1NameEntries(fs.readFileSync(B1_NAMES_YAML, 'utf8')).filter((n) => !listForms.has(n.word.toLowerCase())) : [];
  const lowerForms = new Set([...listForms, ...names.map((n) => n.word.toLowerCase())]);
  const b2 = fs.existsSync(B2_SOURCES_YAML) ? buildB2Entries(fs.readFileSync(B2_SOURCES_YAML, 'utf8'), lowerForms, b2PaperText()) : null;
  const all = [...yle, ...(b1 ? b1.words : []), ...names, ...(b2 ? [...b2.words, ...b2.names] : [])];
  const seen = new Set();
  const words = all.filter((e) => {
    const k = `${e.word}|${e.level}|${e.pos}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { words, unparsed, b1, b2 };
}

/** B1 counts for the report and WORDLIST.md: headwords, forms already on the YLE list, new forms, unparsed lines. */
export function b1Counts(words, b1) {
  const yle = new Set(words.filter((w) => w.level !== 'B1').map((w) => w.word.toLowerCase()));
  const listForms = [...new Set(words.filter((w) => w.source === 'B1 list' && !w.us).map((w) => w.word.toLowerCase()))];
  const heads = new Map();
  for (const w of words.filter((x) => x.source === 'B1 list' && !x.us)) {
    if (!heads.has(w.head)) heads.set(w.head, []);
    heads.get(w.head).push(w.word.toLowerCase());
  }
  const headsKnown = [...heads.values()].filter((forms) => forms.some((f) => yle.has(f))).length;
  return {
    entries: b1.entries.length,
    headwords: heads.size,
    forms: listForms.length,
    alreadyTaught: listForms.filter((f) => yle.has(f)).length,
    headwordsAlreadyTaught: headsKnown,
    newForms: listForms.filter((f) => !yle.has(f)).length,
    newHeadwords: heads.size - headsKnown,
    american: words.filter((w) => w.source === 'B1 list' && w.us).length,
    topicOnly: words.filter((w) => w.source === 'B1 topic list').length,
    wordSets: words.filter((w) => /^B1 word set/.test(w.source)).length,
    unparsed: b1.unparsed.length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!fs.existsSync(WORDLIST_TXT)) {
    console.log(`${path.relative(process.cwd(), WORDLIST_TXT)} is missing (reference texts are not in git; see docs/developer/content.md → "Reference files").`);
    process.exit(0);
  }
  // The B1 list: column text from the PDF (pdftotext -bbox), cached next to the other extracted texts.
  if (!fs.existsSync(B1_COLUMNS_TXT) && fs.existsSync(B1_PDF)) {
    fs.mkdirSync(path.dirname(B1_COLUMNS_TXT), { recursive: true });
    fs.writeFileSync(B1_COLUMNS_TXT, columnTextFromPdf(B1_PDF));
  }
  const { words, unparsed, b1, b2 } = buildWordlist({
    wordlistText: fs.readFileSync(WORDLIST_TXT, 'utf8'),
    handbookText: fs.existsSync(HANDBOOK_TXT) ? fs.readFileSync(HANDBOOK_TXT, 'utf8') : null,
    b1Columns: fs.existsSync(B1_COLUMNS_TXT) ? fs.readFileSync(B1_COLUMNS_TXT, 'utf8') : null,
  });
  fs.writeFileSync(WORDLIST_JSON, `${JSON.stringify(words, null, 1)}\n`);
  const count = (pred) => ['S', 'M', 'F'].map((l) => `${l} ${new Set(words.filter((w) => w.level === l && pred(w)).map((w) => w.word)).size}`).join(', ');
  console.log(`wrote ${path.relative(process.cwd(), WORDLIST_JSON)}: ${words.length} entries`);
  console.log(`  combined list (distinct words): ${count((w) => w.source === 'combined list')}`);
  console.log(`  numbers note: ${count((w) => w.source === 'numbers note')}; handbook names: ${count((w) => w.source === 'handbook names')}`);
  console.log(`  unparsed cells: ${unparsed.length}`);
  for (const u of unparsed) console.log(`    line ${u.line + 1}: "${u.text}"`);
  if (!b1) console.log('  B1: the B1 Preliminary vocabulary list is missing (content/reference/english/b1/), no B1 entries');
  else {
    const c = b1Counts(words, b1);
    console.log(`  B1 list: ${c.entries} entries (${c.headwords} headwords, ${c.forms} forms; ${c.american} American forms apart)`);
    console.log(`    already on the YLE list (Starters/Movers/Flyers): ${c.headwordsAlreadyTaught} headwords, ${c.alreadyTaught} forms`);
    console.log(`    new at B1: ${c.newHeadwords} headwords, ${c.newForms} forms; topic-list-only words: ${c.topicOnly}; word-set names: ${c.wordSets}`);
    console.log(`    unparsed lines: ${c.unparsed}; names for the B1 texts: ${words.filter((w) => /^B1 names/.test(w.source)).length}`);
    for (const u of b1.unparsed) console.log(`      page ${u.page}: "${u.text}"`);
  }
  if (b2) {
    const n = (src) => b2.words.filter((w) => w.source === src).length;
    console.log(`  B2 (derived, content/src/en/wordlist-b2-sources.yaml): ${b2.words.length} words in ${b2.groups} groups — ${n('B2 attested')} attested in the sample paper, ${n('B2 topic')} topic; ${b2.names.length} names`);
    for (const e of b2.errors) console.error(`    ${e}`);
    if (b2.errors.length) process.exitCode = 1;
  }
}
