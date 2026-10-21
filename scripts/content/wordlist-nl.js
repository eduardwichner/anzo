#!/usr/bin/env node
// npm run content:wordlist -- nl   (also: node scripts/content/wordlist-nl.js)
// Builds content/reference/extracted/wordlist-nl.json, the derived Dutch word list (Start, A1, A2, B1) for the Dutch course:
//   - the inventory: content/src/nl/wordlist-sources.yaml, one group per planned unit (level, theme, written reason);
//   - NT2Lex (content/reference/dutch/a1/NT2Lex-CGN-v01.tsv, CC BY-NC-SA 4.0): each lemma's level is NT2Lex's own
//     documented rule, the first CEFR level at which it is observed (F > 0); Start and A1 both correspond to NT2Lex A1;
//   - attestations: every form of every lemma (scripts/content/dutch.js) looked up in the extracted reference texts —
//     Naar Nederland (werkboek, handleiding word list: Start/A1), CNaVT Maatschappelijk Informeel (A2), CNaVT
//     Maatschappelijk Formeel and the Staatsexamen NT2 Programma I 2025 booklets (B1) — with refs.
// source: nt2lex (NT2Lex's level is the entry's), attested (lower than NT2Lex, attested at or below the level), topic
// (not in NT2Lex at or below the level and not attested: the group's reason). A lemma placed HIGHER than NT2Lex's level
// is moved and needs the group's `moved` reason (or one in `reasons`). Belgian forms carry alsoNL; Netherlands-only words
// from the references are listed as regional: nl. The JSON is gitignored; content/src/nl/WORDLIST.md holds the counts.
// Exit 1 on an inconsistent inventory (a lemma twice, a move without a reason, a malformed entry).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { formsOf, guessPlurals, LEVELS, norm, rank, tokenize } from './dutch.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const EXTRACTED = path.join(ROOT, 'content/reference/extracted');
export const WORDLIST_NL_JSON = path.join(EXTRACTED, 'wordlist-nl.json');
export const SOURCES_NL = path.join(ROOT, 'content/src/nl/wordlist-sources.yaml');
export const SUMMARY_NL = path.join(ROOT, 'content/src/nl/WORDLIST.md');
export const NT2LEX = path.join(ROOT, 'content/reference/dutch/a1/NT2Lex-CGN-v01.tsv');
const TEXTS = path.join(EXTRACTED, 'dutch');

const POS = {
  noun: 'noun', verb: 'verb', adj: 'adjective', adv: 'adverb', pron: 'pronoun', det: 'determiner', num: 'number', prep: 'preposition',
  conj: 'conjunction', inter: 'exclamation', phrase: 'phrase', day: 'noun', month: 'noun', holiday: 'noun',
};
// NT2Lex (simplified CGN) tags that may stand for each part of speech
const TAGS = {
  noun: ['N', 'SPEC'], verb: ['WW'], adjective: ['ADJ', 'BW'], adverb: ['BW', 'ADJ', 'VNW', 'TW', 'VZ'], pronoun: ['VNW'], determiner: ['VNW', 'LID'],
  number: ['TW', 'ADJ'], preposition: ['VZ', 'BW'], conjunction: ['VG', 'BW'], exclamation: ['TSW', 'N', 'BW', 'ADJ', 'WW'], phrase: null,
};
const NT_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
/** NT2Lex has no Start: Start and A1 both read NT2Lex A1; A2, B1 and B2 read their own level. */
export const bucket = (level) => (['A2', 'B1', 'B2'].includes(level) ? level : 'A1');

/** Parse one inventory item of a part of speech: "de kat/katten", "op|staan", "zich voelen", "'s morgens". */
export function parseItem(raw, posKey) {
  const s = String(raw).trim();
  const pos = POS[posKey];
  if (!pos) return { error: `unknown part of speech "${posKey}"` };
  if (posKey === 'noun') {
    const m = s.match(/^(de|het) (.+?)\/(.+)$/) || s.match(/^(de|het) (.+)$/);
    if (!m) return { error: `noun "${s}" needs "de|het lemma/plural"` };
    return { lemma: m[2], pos, article: m[1], plural: m[3] ?? null };
  }
  if (posKey === 'day' || posKey === 'month' || posKey === 'holiday') return { lemma: s, pos, article: null, plural: posKey === 'day' ? `${s}en` : '-', calendar: posKey };
  if (posKey === 'verb') {
    const reflexive = /^zich /.test(s);
    const lemma = s.replace(/^zich /, '');
    return { lemma, pos, ...(reflexive ? { reflexive: true } : {}), ...(lemma.includes('|') ? { separable: lemma.split('|')[0] } : {}) };
  }
  return { lemma: s, pos };
}

export function readSources(file = SOURCES_NL) {
  const src = YAML.parse(fs.readFileSync(file, 'utf8'));
  const errors = [];
  const entries = [];
  const meta = new Set(['id', 'level', 'theme', 'why', 'moved', 'reasons']);
  for (const g of src.groups || []) {
    if (!LEVELS.includes(g.level)) errors.push(`${g.id}: level "${g.level}"`);
    if (!g.id || !g.theme || !g.why) errors.push(`group ${g.id ?? '?'}: needs id, theme and why`);
    for (const [posKey, items] of Object.entries(g)) {
      if (meta.has(posKey)) continue;
      for (const raw of items || []) {
        const it = parseItem(raw, posKey);
        if (it.error) errors.push(`${g.id}: ${it.error}`);
        else entries.push({ ...it, level: g.level, group: g.id, theme: g.theme });
      }
    }
  }
  // keys: the lemma (lower-case, bar removed); a spelling shared by two parts of speech gets "~pos"
  const plain = (e) => norm(e.lemma.replace('|', ''));
  const byPlain = new Map();
  for (const e of entries) {
    const k = plain(e);
    if (!byPlain.has(k)) byPlain.set(k, []);
    byPlain.get(k).push(e);
  }
  for (const [k, list] of byPlain) {
    const poses = list.map((e) => e.pos);
    if (new Set(poses).size !== poses.length) errors.push(`"${k}" is listed twice as ${poses.join(', ')} (${list.map((e) => e.group).join(', ')})`);
    for (const e of list) e.key = list.length > 1 ? `${k}~${e.pos}` : k;
  }
  const alsoNL = new Map(Object.entries(src.alsoNL || {}).map(([k, v]) => [norm(k), String(v)]));
  for (const k of alsoNL.keys()) if (!byPlain.has(k)) errors.push(`alsoNL: "${k}" is not a lemma of the list`);
  const regional = (src.regional || []).map((r) => ({ word: norm(r.word), ref: r.ref }));
  for (const r of regional) if (byPlain.has(r.word)) errors.push(`regional: "${r.word}" is also a lemma of the list (regional words are never core vocabulary)`);
  const names = (src.names || []).map(String);
  return { entries, alsoNL, regional, names, errors, groups: src.groups || [] };
}

/** NT2Lex: lower-case word -> [{ tag, level (first observed), F: {A1…C1} }]. */
export function readNt2lex(file = NT2LEX) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const head = lines[0].split('\t');
  const col = (name) => head.indexOf(name);
  const map = new Map();
  for (const line of lines.slice(1)) {
    const c = line.split('\t');
    const F = Object.fromEntries(NT_LEVELS.map((l) => [l, c[col(`F@${l}`)] === '-' ? 0 : Number(c[col(`F@${l}`)])]));
    const level = NT_LEVELS.find((l) => F[l] > 0) ?? null;
    const word = norm(c[col('word')]);
    if (!map.has(word)) map.set(word, []);
    map.get(word).push({ tag: c[col('tag')].split('(')[0], level, F });
  }
  return map;
}

/** NT2Lex's level of an entry: the lowest first-observed level among the rows of its lemma with a fitting tag. */
export function nt2lexOf(nt, e) {
  let tags = TAGS[e.pos];
  const base = norm(e.lemma.replace('|', ''));
  const tries = [base];
  // NT2Lex (Frog) lemmatises some of Anzo's lemmas to another one: inflected -e (vorige → vorig, elke → elk), ordinals
  // under the cardinal (tweede → twee), comparatives under the positive (meer → veel), language names as adjectives.
  const ALIAS = { eerste: 'eerst', tweede: 'twee', derde: 'drie', vierde: 'vier', vijfde: 'vijf', laatste: 'laatst', meer: 'veel', minder: 'weinig', beter: 'goed', liever: 'graag' };
  if (ALIAS[base]) tries.push(ALIAS[base]);
  if (/[^e]e$/.test(base) && ['adjective', 'determiner', 'adverb', 'number'].includes(e.pos)) tries.push(base.slice(0, -1));
  if (e.pos === 'noun' && /^[A-Z]/.test(e.lemma)) tags = [...tags, 'ADJ'];
  if (ALIAS[base]) tags = null;
  if (e.pos === 'noun') {
    const dim = e.lemma.match(/^(.+?)(etje|tje|pje|je)$/);
    if (dim) tries.push(dim[1], dim[1].replace(/(.)\1$/, '$1')); // broodje → brood, balletje → bal
    if (e.plural === '-' && /s$/.test(e.lemma)) tries.push(e.lemma.replace(/(je)?s$/, '')); // frietjes → friet
    if (e.plural === '-' && /en$/.test(e.lemma)) tries.push(e.lemma.replace(/en$/, '')); // kleren, overuren
  }
  for (const w of tries) {
    const rows = (nt.get(w) || []).filter((r) => r.level && (!tags || tags.includes(r.tag)));
    if (rows.length) {
      const best = rows.sort((a, b) => NT_LEVELS.indexOf(a.level) - NT_LEVELS.indexOf(b.level))[0];
      return { level: best.level, tag: best.tag, word: w, F: best.F };
    }
  }
  return null;
}

// ---- attestations -----------------------------------------------------------------------------------------------
/** The reference texts scanned for attestations: [{ name, level, lines }]. */
export function readCorpora(dir = TEXTS) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).sort()) {
    if (fs.statSync(path.join(dir, f)).isDirectory()) continue; // b2/: below
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
    if (/^a1__nn-werkboek|^a1__engels_handleiding/.test(f)) {
      // the handleiding: only its Dutch–English word list (from the first "Les 21"); the werkboek: all of it
      const start = /handleiding/.test(f) ? Math.max(0, lines.findIndex((l) => /^\s*Les 21\s/.test(l))) : 0;
      out.push({ name: f.replace(/^a1__/, '').replace(/\.txt$/, ''), level: 'A1', lines, start });
    } else if (/^a2__(Info_|INFO_Beoordelingsmodellen)/i.test(f)) {
      out.push({ name: f.replace(/^a2__/, '').replace(/\.txt$/, ''), level: 'A2', lines, start: 0 });
    } else if (/^a2__INFO_Instructies/i.test(f)) {
      // only what the examiner says to the candidate: "U zegt: …" lines and the numbered examiner questions
      const kept = lines.map((l) => (/U zegt:|^\s*\d\.\s|Hulpvraag/.test(l) ? l : ''));
      out.push({ name: f.replace(/^a2__/, '').replace(/\.txt$/, ''), level: 'A2', lines: kept, start: 0 });
    } else if (/^b1__(FORM_Deel|FORM_Beoordelingsmodellen|2025_(Lezen|Luisteren|Schrijven|Spreken)_I_openbaar_examen_(tekst|opgaven))/i.test(f)) {
      // B1: CNaVT Maatschappelijk Formeel and the Staatsexamen NT2 Programma I 2025 booklets
      out.push({ name: f.replace(/^b1__/, '').replace(/\.txt$/, ''), level: 'B1', lines, start: 0 });
    } else if (/^b1__FORM_Instructies/i.test(f)) {
      const kept = lines.map((l) => (/U zegt:|^\s*\d\.\s|Hulpvraag/.test(l) ? l : ''));
      out.push({ name: f.replace(/^b1__/, '').replace(/\.txt$/, ''), level: 'B1', lines: kept, start: 0 });
    }
  }
  // B2: the Staatsexamen NT2 Programma II 2025 booklets and the CNaVT B2 profiles PROF and STRT (tasks, the
  // answer keys that carry the recordings' content, and what the examiner says to the candidate); not Richtgraad 3 (syllabus)
  const b2 = path.join(dir, 'b2');
  for (const f of fs.existsSync(b2) ? fs.readdirSync(b2).sort() : []) {
    const lines = fs.readFileSync(path.join(b2, f), 'utf8').split('\n');
    const name = `b2/${f.replace(/\.txt$/, '')}`;
    if (/^2025 (Lezen|Luisteren|Schrijven|Spreken) II .*(tekst|opgaven)|^(Prof|STRT)_Deel_|_Beoordelingsmodellen_/i.test(f)) out.push({ name, level: 'B2', lines, start: 0 });
    else if (/_Instructies_voor_examinator_/i.test(f)) {
      out.push({ name, level: 'B2', lines: lines.map((l) => (/U zegt:|^\s*\d\.\s|Hulpvraag/.test(l) ? l : '')), start: 0 });
    }
  }
  return out;
}

/** Attestations of the entries in the corpora: key -> { A1: refs, A2: refs, forms: Set }. */
export function attest(entries, corpora) {
  const formIndex = new Map();
  const phrases = [];
  for (const e of entries) {
    const forms = new Set(formsOf({ ...e, lemma: e.lemma }).map(([f]) => norm(f)));
    if (e.pos === 'noun' && !e.plural) for (const p of guessPlurals(e.lemma)) forms.add(p);
    if (e.separable) forms.add(norm(e.lemma.replace('|', '')));
    const toks = tokenize(e.lemma.replace('|', '')).map((t) => t.word);
    if (toks.length > 1) {
      phrases.push({ key: e.key, toks });
      continue;
    }
    for (const f of forms) {
      if (!formIndex.has(f)) formIndex.set(f, []);
      formIndex.get(f).push(e.key);
    }
  }
  const out = new Map();
  const note = (key, level, ref, form) => {
    if (!out.has(key)) out.set(key, { A1: [], A2: [], B1: [], B2: [], forms: new Set() });
    const a = out.get(key);
    if (a[level].length < 3) a[level].push(ref);
    a.forms.add(form);
  };
  for (const c of corpora) {
    c.lines.forEach((line, i) => {
      if (i < c.start || !line.trim()) return;
      const words = tokenize(line).map((t) => t.word);
      const ref = `${c.name}:${i + 1}`;
      for (const w of words) for (const key of formIndex.get(w) || []) note(key, c.level, ref, w);
      for (const p of phrases) {
        for (let k = 0; k + p.toks.length <= words.length; k++) {
          if (p.toks.every((t, j) => words[k + j] === t)) note(p.key, c.level, ref, p.toks.join(' '));
        }
      }
    });
  }
  return out;
}

// ---- build ---------------------------------------------------------------------------------------------------------
export function build({ sourcesFile = SOURCES_NL, nt2lexFile = NT2LEX, textsDir = TEXTS } = {}) {
  const src = readSources(sourcesFile);
  const nt = readNt2lex(nt2lexFile);
  const att = attest(src.entries, readCorpora(textsDir));
  const errors = [...src.errors];
  const groupOf = new Map(src.groups.map((g) => [g.id, g]));
  const entries = src.entries.map((e) => {
    const n = nt2lexOf(nt, e);
    const a = att.get(e.key);
    const b = bucket(e.level);
    const attestedAt = a && (a.A1.length ? 'A1' : a.A2.length ? 'A2' : a.B1.length ? 'B1' : a.B2.length ? 'B2' : null);
    const refs = a ? [...a.A1, ...a.A2, ...a.B1, ...a.B2].slice(0, 3) : [];
    let source;
    let moved;
    if (n && NT_LEVELS.indexOf(n.level) <= NT_LEVELS.indexOf(b)) source = 'nt2lex'; // at its NT2Lex level, or moved up
    else if (attestedAt && rank(attestedAt) <= rank(b)) source = 'attested';
    else source = 'topic';
    if (n && NT_LEVELS.indexOf(n.level) < NT_LEVELS.indexOf(b)) {
      const g = groupOf.get(e.group);
      moved = g?.reasons?.[e.lemma] ?? g?.moved;
      if (!moved) errors.push(`${e.group}: "${e.lemma}" is NT2Lex ${n.level} but placed at ${e.level}: give the group a "moved" reason (or one in "reasons")`);
    }
    const out = {
      key: e.key, lemma: e.lemma.replace('|', ''), pos: e.pos, level: e.level, group: e.group, theme: e.theme, source,
      ...(e.article !== undefined ? { article: e.article } : {}), ...(e.plural ? { plural: e.plural } : {}),
      ...(e.separable ? { separable: e.separable } : {}), ...(e.reflexive ? { reflexive: true } : {}), ...(e.calendar ? { calendar: e.calendar } : {}),
      ...(n ? { nt2lex: { level: n.level, F: n.F, ...(n.word !== norm(e.lemma.replace('|', '')) ? { via: n.word } : {}) } } : {}),
      ...(refs.length ? { refs, attestedAt } : {}),
      ...(a ? { forms: [...a.forms].sort() } : {}),
      ...(moved ? { moved } : {}),
      ...(src.alsoNL.has(norm(e.lemma)) ? { alsoNL: src.alsoNL.get(norm(e.lemma)) } : {}),
    };
    return out;
  });
  return { entries, errors, regional: src.regional, names: src.names };
}

export function countTable(entries) {
  const sources = ['nt2lex', 'attested', 'topic'];
  const rows = LEVELS.map((l) => {
    const at = entries.filter((e) => e.level === l);
    return `| ${l} | ${sources.map((s) => at.filter((e) => e.source === s).length).join(' | ')} | ${at.filter((e) => e.moved).length} | ${at.filter((e) => e.alsoNL).length} | ${at.length} |`;
  });
  const all = `| all | ${sources.map((s) => entries.filter((e) => e.source === s).length).join(' | ')} | ${entries.filter((e) => e.moved).length} | ${entries.filter((e) => e.alsoNL).length} | ${entries.length} |`;
  return ['| Level | nt2lex | attested | topic | of which moved up | alsoNL | total (new at this level) |', '|---|---|---|---|---|---|---|', ...rows, all].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!fs.existsSync(NT2LEX)) {
    console.log(`${path.relative(process.cwd(), NT2LEX)} is missing (a reference file, not in the repository: docs/developer/content.md → "Reference files"). Skipping the Dutch word list.`);
    process.exit(0);
  }
  const r = build();
  if (r.errors.length) {
    console.error(`content:wordlist nl: ${r.errors.length} problem(s)\n  ${r.errors.join('\n  ')}`);
    process.exit(1);
  }
  const table = countTable(r.entries);
  const counts = Object.fromEntries(LEVELS.map((l) => [l, r.entries.filter((e) => e.level === l).length]));
  fs.mkdirSync(EXTRACTED, { recursive: true });
  fs.writeFileSync(WORDLIST_NL_JSON, `${JSON.stringify({ generatedBy: 'npm run content:wordlist -- nl', counts, entries: r.entries, names: r.names, regional: r.regional }, null, 1)}\n`);
  console.log(`wrote ${path.relative(process.cwd(), WORDLIST_NL_JSON)}: ${r.entries.length} lemmas, ${r.names.length} names, ${r.regional.length} regional: nl`);
  console.log(table);
  if (fs.existsSync(SUMMARY_NL)) {
    const text = fs.readFileSync(SUMMARY_NL, 'utf8');
    const extra = `\nNames: ${r.names.length}. Regional (Netherlands-only, never core): ${r.regional.length}.`;
    const next = text.replace(/<!-- counts:start -->[\s\S]*<!-- counts:end -->/, `<!-- counts:start -->\n${table}\n${extra}\n<!-- counts:end -->`);
    if (next !== text) fs.writeFileSync(SUMMARY_NL, next);
  }
}
