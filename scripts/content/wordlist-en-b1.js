// The Cambridge B1 Preliminary (and Preliminary for Schools) vocabulary list, 2025 edition
// (content/reference/english/b1/506887-b1-preliminary-vocabulary-list.pdf), parsed into level `B1` entries of
// wordlist-en.json by wordlist-en.js. Derived from a copyrighted document: the output is gitignored like the rest of
// content/reference/extracted/.
//
// The PDF sets the alphabetical list in two columns and the topic lists (Appendix 2) in four, so `pdftotext -layout`
// interleaves them. `columnText()` rebuilds the text column by column from `pdftotext -bbox` word boxes and writes
// `extracted/english/b1/506887-b1-preliminary-vocabulary-list.columns.txt` (one `== page N column K ==` block per column,
// each line with its indent); `parseB1List()` reads that text:
//   - the alphabetical list (pages 4–40): `headword (pos)` lines, `• example` lines (kept as `examples`; they restrict
//     a word's meaning: *heel* "I can't walk in high heels"), section letters, running headers and footers
//   - Appendix 1 (word sets: numbers, days, months, seasons, countries/nationalities, continents)
//   - Appendix 2 (topic lists): every cell is matched to a headword of the alphabetical list (all topic words are on it,
//     2025 update) and recorded as that entry's `topics`
// Headword forms: `all right/alright` → both; `yog(h)urt` → yogurt, yoghurt; `wrap (up)` → wrap, wrap up; `among
// (amongst)` → among, amongst; `ad (advertisement)` → ad; Br/Am pairs: `(Am Eng)` entries are marked `us: true`.
import { execFileSync } from 'node:child_process';

export const B1_LEVEL = 'B1';
const LIST_LAST_PAGE = 40;

const decode = (s) => s.replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** `pdftotext -bbox` HTML → pages of words { x, y, x2, text }. */
export function bboxPages(html) {
  const pages = [];
  for (const m of html.matchAll(/<page[^>]*>([\s\S]*?)<\/page>/g)) {
    const words = [];
    for (const w of m[1].matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)) {
      words.push({ x: Number(w[1]), y: Number(w[2]), x2: Number(w[3]), text: decode(w[5]) });
    }
    pages.push(words);
  }
  return pages;
}

/** Column start positions of a topic-list page: x values where many words start, at least `gap` apart. */
export function columnStarts(words, { min = 5, gap = 70 } = {}) {
  const counts = new Map();
  for (const w of words) {
    const x = Math.round(w.x / 4) * 4;
    counts.set(x, (counts.get(x) ?? 0) + 1);
  }
  const starts = [];
  for (const x of [...counts.keys()].sort((a, b) => a - b)) {
    if (counts.get(x) < min) continue;
    if (starts.length && x - starts.at(-1) < gap) continue;
    starts.push(x);
  }
  return starts;
}

/** Words of one column → text lines (same baseline within 2 pt), each with its indent and baseline in points. */
function linesOfWithY(words) {
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const w of sorted) {
    const line = lines.at(-1);
    if (line && Math.abs(line.y - w.y) <= 2) line.words.push(w);
    else lines.push({ y: w.y, words: [w] });
  }
  return lines.map((l) => {
    l.words.sort((a, b) => a.x - b.x);
    return { x: l.words[0].x, y: l.y, text: l.words.map((w) => w.text).join(' ') };
  });
}
const linesOf = linesOfWithY;

// The topic headings of Appendix 2, as printed (a heading's words share one baseline across the columns).
export const TOPICS = ['Clothes and Accessories', 'Colours', 'Communications and Technology', 'Education', 'Entertainment and Media',
  'Environment', 'Food and Drink', 'Health, Medicine and Exercise', 'Hobbies and Leisure', 'House and Home', 'Language',
  'Personal Feelings, Opinions', 'Places: Buildings', 'Places: Countryside', 'Places: Town and City', 'Services', 'Shopping', 'Sport',
  'The Natural World', 'Time', 'Travel and Transport', 'Weather', 'Work and Jobs'];
const TOPIC_PAGE = 42;

/**
 * Column-ordered text of the whole list. Pages before 42: columns (`== page N column K ==`, lines with their indent);
 * the alphabetical list (≤ 40) has two, split just before the right column's start (the leftmost x between 300 and 360
 * where at least 3 words start: 323.6 or 330.7, both on some pages). Pages from 42 (Appendix 2): `== page N topics ==`
 * and one `<topic>\t<cell line>` per line, column by column; a line belongs to the nearest heading above it on the page
 * (a heading is a line, across all columns, that starts with a name in TOPICS), else to the previous page's last topic.
 */
export function columnText(pages) {
  const out = [];
  let topic = null;
  pages.forEach((words, i) => {
    const page = i + 1;
    if (page >= TOPIC_PAGE) {
      const headings = [];
      // headings: whole-page lines (all columns) whose text starts with a topic name
      const rows = [];
      for (const w of [...words].sort((a, b) => a.y - b.y || a.x - b.x)) {
        const row = rows.at(-1);
        if (row && Math.abs(row.y - w.y) <= 2) row.words.push(w);
        else rows.push({ y: w.y, words: [w] });
      }
      for (const r of rows) {
        const text = r.words.sort((a, b) => a.x - b.x).map((w) => w.text).join(' ');
        const name = TOPICS.find((t) => text === t || text.startsWith(`${t} `) || text.startsWith(t.replace(/, Opinions$/, ',')) && t.startsWith('Personal'));
        if (name) headings.push({ y: r.y, name, words: new Set(r.words) });
      }
      const body = words.filter((w) => !headings.some((h) => h.words.has(w)));
      const starts = [0, ...columnStarts(body).slice(1).map((x) => x - 6)];
      const cols = starts.map(() => []);
      for (const w of body) {
        let k = 0;
        while (k + 1 < starts.length && w.x >= starts[k + 1]) k++;
        cols[k].push(w);
      }
      out.push(`== page ${page} topics ==`);
      const startTopic = topic;
      cols.forEach((cw) => {
        for (const l of linesOfWithY(cw)) {
          const above = headings.filter((h) => h.y < l.y).at(-1);
          out.push(`${above ? above.name : startTopic ?? '?'}\t${l.text}`);
        }
      });
      if (headings.length) topic = headings.at(-1).name;
      return;
    }
    let starts;
    if (page <= LIST_LAST_PAGE) {
      // the right column's start: the leftmost x in 300–360 where ≥ 3 words start (323.6 or 330.7, both on some pages)
      const counts = new Map();
      for (const w of words) if (w.x >= 300 && w.x <= 360) counts.set(w.x.toFixed(1), (counts.get(w.x.toFixed(1)) ?? 0) + 1);
      const right = [...counts].filter(([, n]) => n >= 3).map(([x]) => Number(x)).sort((a, b) => a - b)[0];
      starts = [0, right ? right - 2 : 325];
    } else starts = [0];
    const cols = starts.map(() => []);
    for (const w of words) {
      let k = 0;
      while (k + 1 < starts.length && w.x >= starts[k + 1]) k++;
      cols[k].push(w);
    }
    cols.forEach((cw, k) => {
      out.push(`== page ${page} column ${k + 1} ==`);
      const base = Math.min(...cw.map((w) => w.x));
      for (const l of linesOf(cw)) out.push(`${' '.repeat(Math.max(0, Math.round((l.x - base) / 4)))}${l.text}`);
    });
  });
  return `${out.join('\n')}\n`;
}

/** Run pdftotext on the PDF and return its column text (needs poppler-utils). */
export function columnTextFromPdf(pdfPath) {
  return columnText(bboxPages(execFileSync('pdftotext', ['-bbox', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 ** 2 })));
}

const POS_NAMES = ['ad', 'n', 'v', 'adj', 'adv', 'prep', 'conj', 'det', 'pron', 'mv', 'av', 'exclam', 'abbrev', 'phr v', 'prep phr', 'pl', 'sing', 'n pl', 'phr'];
const POS_PART = `(?:${POS_NAMES.map((p) => p.replace(' ', '\\s')).sort((a, b) => b.length - a.length).join('|')})`;
// "(adj, adv & exclam)", "(n pl)", "(v & phr v)", "(prep, conj)"
const POS_GROUP = new RegExp(`\\((${POS_PART}(?:\\s*(?:,|&)\\s*${POS_PART})*)\\)`);
const PARTICLES = new Set(['up', 'out', 'off', 'on', 'down', 'away', 'over', 'back', 'in', 'round', 'around', 'through', 'together', 'with', 'about', 'along', 'for', 'into', 'by']);

// slashes between two spellings of the whole headword (the phrase rule would make "all alright")
const SLASH_WHOLE = new Set(['all right/alright']);

const norm = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

/** Every spelling a headword stands for (see the header). */
// Misprints of the 2025 PDF, corrected so content and trace use the real spelling.
export const MISPRINTS = { suprising: 'surprising' };

export function b1HeadwordForms(head) {
  if (MISPRINTS[head]) head = MISPRINTS[head];
  // placeholders are not part of the phrase: "focus (sth) on/upon sth/sb" → focus on, focus upon
  head = norm(head.replace(/\((?:sth|sb)(?:\/(?:sth|sb))?\)/g, ' ').replace(/\b(?:sth|sb)\b(?:\/(?:sth|sb)\b)?/g, ' '));
  // a capitalised common word ("Arithmetic") is lower-cased; acronyms, titles and names keep their capitals
  if (/^[A-Z][a-z]+$/.test(head) && !['Miss', 'Mr', 'Mrs', 'Ms', 'Dr'].includes(head)) head = head.toLowerCase();
  head = head.replace(/!$/, ''); // "cheers!", "congratulations!", "well done!": the exclamation mark is not part of the word
  const forms = new Set();
  const expand = (h) => {
    // glued optional letters: yog(h)urt, sleeve(less), program(me), wool(len), math(s)
    const glued = h.match(/^(.*?\w)\(([\w']+)\)(.*)$/);
    if (glued) return [...expand(glued[1] + glued[3]), ...expand(glued[1] + glued[2] + glued[3])];
    // spaced parenthetical: a particle is optional ("wrap (up)"), one other word is an alternate ("among (amongst)"),
    // anything longer is a note ("ad (advertisement)" keeps ad; "(the) …" articles are dropped)
    const spaced = h.match(/^(.*?)\s*\(([^)]*)\)\s*(.*)$/);
    if (spaced) {
      const [, before, inner, after] = spaced;
      const rest = norm(`${before} ${after}`);
      if (PARTICLES.has(inner) || inner === 'the' || inner === 'a') return [...expand(rest), ...expand(norm(`${before} ${inner} ${after}`))];
      // an alternate form of the last word ("among (amongst)", "laboratory (lab)", "kilometre (km)"); a gloss otherwise
      // ("background (experience)")
      const lastWord = before.split(' ').at(-1);
      const alternate = lastWord.startsWith(inner) || inner.startsWith(lastWord) || (inner.length <= 3 && inner[0] === lastWord[0]); // lab, km
      if (/^[a-z]+$/.test(inner) && !after && alternate) return [...expand(rest), inner];
      return expand(rest);
    }
    // "while, whilst", "wet suit, wetsuit": two spellings or synonyms side by side
    if (/^[\w' -]+, [\w' -]+$/.test(h)) return h.split(', ').map(norm).flatMap(expand);
    if (h.includes('/')) {
      // "doctor / Dr", "grey / gray": spaced slashes separate whole alternatives
      if (/\s\/\s/.test(h)) return h.split(/\s\/\s/).map(norm).flatMap(expand);
      // "all right/alright"; in a phrase the alternatives replace its last word: "made of/from/out of" → made of,
      // made from, made out of; "step forward/back(wards)/out" → step forward, step back(wards), step out
      if (SLASH_WHOLE.has(h)) return h.split('/').map(norm).flatMap(expand);
      const parts = h.split('/').map(norm);
      const words = parts[0].split(' ');
      const prefix = words.length > 1 ? `${words.slice(0, -1).join(' ')} ` : '';
      return [parts[0], ...parts.slice(1).map((p) => (prefix && !p.startsWith(prefix) ? prefix + p : p))].flatMap(expand);
    }
    return [h];
  };
  for (const f of expand(head)) if (f && !/^[^a-z]*$/i.test(f)) forms.add(f);
  return [...forms];
}

/** Drop the Br/Am notes of a line; returns { text, us } (us: the line names an American-only word, "(Am Eng)"). */
function dropEngNotes(text) {
  let us = false;
  text = text.replace(/\((Am|Br) Eng(?::\s*([^)]*))?\)/g, (m, which, alt) => {
    if (which === 'Am' && !alt) us = true; // "autumn (Am Eng: fall)": the head is British, fall is not taught
    return ' ';
  });
  return { text: norm(text), us };
}

const ENTRY_RE = new RegExp(`^(.*?\\S)\\s*${POS_GROUP.source}\\s*`);

/**
 * The entries of one line ("headword (pos)", sometimes two side by side: "dinner (n) dinosaur" + "(n) diploma (n)")
 * and the text after the last one (a headword whose part of speech is on the next line).
 */
export function splitB1Entries(line) {
  const { text, us } = dropEngNotes(line);
  const entries = [];
  let rest = text;
  let m;
  while ((m = rest.match(ENTRY_RE))) {
    const head = m[1];
    // "recently. (n)", "of the school. (prep)": the end of a wrapped example and its part of speech, not a headword
    if (/^[•©]/.test(head) || /^[^.]+\.$/.test(head)) break; // (a.m., O.K. keep their inner dots)
    const pos = m[2].replace(/\s+/g, ' ').split(/\s*(?:,|&)\s*/).map((p) => (p.trim() === 'ad' ? 'adv' : p.trim())); // "carefully (ad)"
    entries.push({ head, pos, ...(us ? { us: true } : {}) });
    rest = rest.slice(m[0].length);
  }
  // "truck (Am Eng) (Br Eng: lorry)": an American word with no part of speech
  if (!entries.length && us && /^[a-z][\w' -]*$/.test(rest)) return { entries: [{ head: rest, pos: ['n'], us: true }], rest: '' };
  return { entries, rest: norm(rest) };
}

/** One alphabetical-list line → { head, pos, us? } or null (the first entry of `splitB1Entries`). */
export function parseB1Line(line) {
  const { entries } = splitB1Entries(line);
  return entries[0] ?? null;
}

const isNoise = (t) => !t || /^[A-Z]$/.test(t) || /©\s*CUPA|Page \d+ of \d+|^of \d+ B1 Preliminary|^(\d+ )?B1 Preliminary( and Preliminary)?$|^for Schools( Vocabulary)?$|^and Preliminary( for)?$|^List$|^Preliminary and Preliminary for|^Schools Vocabulary List$|^Vocabulary( List)?$|^Page \d+ of$/.test(t);
const open = (t) => (t.match(/\(/g) || []).length > (t.match(/\)/g) || []).length;

/**
 * The alphabetical list: entries { head, forms, pos[], examples[], us? } and unparsed lines ({ page, text }: neither an
 * entry, an example, nor page furniture). A line is, in this order: page furniture; an example ("• …", or a sentence the
 * PDF set without its bullet: "Get down at once!"); one or more entries (a headword cut before its part of speech, or a
 * note cut at an open parenthesis, waits for the next line); the wrapped rest of the previous example.
 */
export function parseB1List(columns) {
  const entries = [];
  const unparsed = [];
  let page = 0;
  let last = null;
  let pending = null;
  let inExample = false; // false, or the indent of the current example's bullet
  const add = (e) => {
    last = { head: e.head, forms: b1HeadwordForms(e.head), pos: e.pos, examples: [], ...(e.us ? { us: true } : {}) };
    entries.push(last);
  };
  for (const raw of columns.split('\n')) {
    const head = raw.match(/^== page (\d+) (?:column \d+|topics) ==$/);
    if (head) {
      page = Number(head[1]);
      continue;
    }
    if (page < 4 || page > LIST_LAST_PAGE) continue;
    const text = norm(raw);
    if (isNoise(text)) continue;
    const indent = raw.match(/^ */)[0].length;
    if (text.startsWith('•')) {
      if (pending) unparsed.push({ page, text: pending });
      pending = null;
      // an entry the PDF set at the end of an example line: "• Go away! goal (n)", "• … below. common" + "(adj)"
      const tail = text.match(/^(•.*[.!?])\s+([a-z][\w' ()/-]*)$/);
      if (last) last.examples.push(norm((tail ? tail[1] : text).slice(1)));
      inExample = indent;
      if (tail) {
        const { entries: found, rest } = splitB1Entries(tail[2]);
        found.forEach(add);
        pending = found.length ? rest || null : tail[2];
        if (found.length) inExample = false;
      }
      continue;
    }
    // the wrapped rest of an example: indented deeper than its bullet, and either not an entry itself or following an
    // example cut short ("• to care (about/for) someone /" + "something (v)"; but "• have something in common" +
    // "communicate (v)" is an entry)
    const prevExample = last?.examples.at(-1) ?? '';
    const cutShort = /(\/|,|\bor|\band|\bof|\bthe|\ba)$/.test(prevExample);
    if (inExample !== false && !pending && indent >= inExample + 3 && last?.examples.length && (cutShort || !splitB1Entries(text).entries.length)) {
      last.examples[last.examples.length - 1] += ` ${text}`;
      continue;
    }
    // a capitalised fragment only takes a part of speech ("DJ (disc jockey)" + "(n)"), never a word ("Ten Green Bottles")
    if (pending && /^[A-Z]/.test(pending) && !text.startsWith('(')) {
      unparsed.push({ page, text: pending });
      pending = null;
    }
    // a phrase the PDF left without a part of speech ("film star", then "final (adj & n)"): a noun entry of its own; a
    // single word still joins the next line ("digital" + "camera (n)")
    if (pending && /\s/.test(pending) && !text.startsWith('(') && splitB1Entries(text).entries.length && !open(pending)) {
      add({ head: pending, pos: ['n'] });
      last.posMissing = true;
      pending = null;
    }
    const joined = pending ? `${pending} ${text}` : text;
    if (open(joined)) {
      pending = joined; // "kilometre (km) (n) (Br Eng) (Am Eng:" + "kilometer)"
      continue;
    }
    const { entries: found, rest } = splitB1Entries(joined);
    if (found.length) {
      found.forEach(add);
      pending = rest || null;
      inExample = false;
      continue;
    }
    if (!pending && last && /^[A-Z][^()]*[.!?]$/.test(text)) {
      last.examples.push(text); // "Get down at once!"
      inExample = true;
      continue;
    }
    if (!pending && inExample !== false && last?.examples.length && /^[a-z–-]/.test(text) && !/^[a-z][\w'-]*$/.test(text)) {
      last.examples[last.examples.length - 1] += ` ${text}`; // "… nowadays.", "– it was great."
      continue;
    }
    if (pending) unparsed.push({ page, text: pending });
    pending = /^[a-z][\w' ()/-]*$/i.test(text) ? text : null; // a headword whose part of speech is on the next line
    if (!pending) unparsed.push({ page, text });
  }
  if (pending) unparsed.push({ page, text: pending });
  return { entries, unparsed };
}

/**
 * Appendix 2 → [{ topic, text }] cells. A cell the PDF wrapped is joined again: a line with an open parenthesis takes the
 * next one ("barbecue (n &" + "v)"), and a line that starts with "(" belongs to the cell before ("go" + "(with/together)").
 */
export function parseTopicLists(columns) {
  const lines = [];
  let inTopics = false;
  for (const raw of columns.split('\n')) {
    if (/^== page \d+ topics ==$/.test(raw)) {
      inTopics = true;
      continue;
    }
    if (/^== page /.test(raw)) {
      inTopics = false;
      continue;
    }
    if (!inTopics || !raw.includes('\t')) continue;
    const [topic, text] = raw.split('\t');
    const t = norm(text);
    if (isNoise(t) || /^(Appendix 2|Topic Lists)$/.test(t)) continue;
    lines.push({ topic, text: t });
  }
  const cells = [];
  for (const l of lines) {
    const prev = cells.at(-1);
    const open = prev && (prev.text.match(/\(/g) || []).length > (prev.text.match(/\)/g) || []).length;
    // "(phr v)", "(computer)" complete the cell above; "(sports) facilities", "(shopping) mall" are cells of their own
    const completes = /^\([^)]*\)$/.test(l.text) || (l.text.startsWith('(') && !/^\([^)]*\)\s*\S/.test(l.text));
    if (prev && prev.topic === l.topic && (open || completes || /^\/|\/$/.test(l.text) || /\/$/.test(prev.text))) prev.text = norm(`${prev.text} ${l.text}`);
    else cells.push({ ...l });
  }
  return cells;
}

// Appendix 1 word sets beyond the YLE list (numbers, days, months and seasons are YLE words already): the continents and
// the countries, nationalities and languages the appendix names as examples. Further countries a text needs are names.
export const WORD_SETS = {
  continents: ['Africa', 'Antarctica', 'Asia', 'Australia', 'Europe', 'North America', 'South America'],
  countries: ['Brazil', 'Brazilian', 'Canada', 'Canadian', 'China', 'Chinese', 'France', 'French', 'Ireland', 'Irish', 'India', 'Indian',
    'Italy', 'Italian', 'Spain', 'Spanish'],
};

// "washing", "driving": an -ing/-ed form of a list word is not a word of its own
const inflectionOf = (f, isWord) => /^[a-z]+(ing|ed)$/.test(f) && [f.replace(/(ing|ed)$/, ''), f.replace(/(ing|ed)$/, 'e')].some(isWord);
const stripCellNotes = (t) => norm(t.replace(/\((?:Am|Br) Eng[^)]*\)/g, ' ').replace(POS_GROUP, ' ').replace(/\((?:e\.g\.|v|n|adj)[^)]*\)/g, ' '));

/**
 * The B1 entries of wordlist-en.json: one per headword form, `{ word, level: 'B1', pos, source, topics?, us?, examples? }`.
 * `known(form)` says whether a form is already a (lower-level) list word; it decides which topic cells that match no
 * headword are words of their own (`source: 'B1 topic list'`: *cellar, crazy, porter*) and which are plurals or
 * compounds of list words (*socks, film star*), recorded in `topicCompounds`.
 */
export function buildB1Entries(columns, known = () => false) {
  const { entries, unparsed } = parseB1List(columns);
  const byForm = new Map();
  for (const e of entries) for (const f of e.forms) if (!byForm.has(f.toLowerCase())) byForm.set(f.toLowerCase(), e);
  const cells = parseTopicLists(columns);
  const topicOnly = new Map(); // form -> topics
  const topicCompounds = [];
  const isWord = (w) => byForm.has(w) || known(w);
  for (const c of cells) {
    const forms = b1HeadwordForms(stripCellNotes(c.text)).map((f) => f.toLowerCase());
    const hit = forms.map((f) => byForm.get(f) ?? byForm.get(f.replace(/(?<=[^s])s$/, '')) ?? byForm.get(f.replace(/es$/, ''))).filter(Boolean);
    if (hit.length) {
      for (const e of hit) (e.topics ??= new Set()).add(c.topic);
      continue;
    }
    for (const f of forms) {
      const words = f.split(/[\s–-]+/).filter((w) => /[a-z]/.test(w));
      const singular = (w) => [w, w.replace(/(?<=[^s])s$/, ''), w.replace(/ies$/, 'y'), w.replace(/es$/, '')];
      if (words.length && words.every((w) => singular(w).some(isWord))) topicCompounds.push({ topic: c.topic, text: f });
      else if (/^[a-z][a-z -]*$/.test(f) && !known(f) && !isWord(f.replace(/-/g, ' ')) && !inflectionOf(f, isWord)) {
        if (!topicOnly.has(f)) topicOnly.set(f, new Set());
        topicOnly.get(f).add(c.topic);
      }
    }
  }
  const words = [];
  for (const e of entries) {
    for (const form of e.forms) {
      words.push({
        word: form, level: B1_LEVEL, pos: e.pos.join(' & '), source: 'B1 list', head: e.head,
        ...(e.topics ? { topics: [...e.topics].sort() } : {}), ...(e.us ? { us: true } : {}), ...(e.examples.length ? { examples: e.examples } : {}),
      });
    }
  }
  for (const [form, topics] of topicOnly) words.push({ word: form, level: B1_LEVEL, pos: '', source: 'B1 topic list', topics: [...topics].sort() });
  for (const [set, names] of Object.entries(WORD_SETS)) for (const n of names) words.push({ word: n, level: B1_LEVEL, pos: 'name', source: `B1 word set: ${set}` });
  return { words, entries, unparsed, topicCompounds };
}
