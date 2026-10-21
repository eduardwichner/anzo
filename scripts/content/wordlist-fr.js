#!/usr/bin/env node
// npm run content:wordlist -- fr   (also: node scripts/content/wordlist-fr.js [--check])
// Builds content/reference/extracted/wordlist-fr.json, the derived DELF Prim word list (DELF Prim publishes none):
//   1. attested — every word of the child-facing text of the nine DELF Prim sample papers
//      (content/reference/extracted/delf-prim-*.txt), lemmatized with scripts/content/french.js and the lexicon in
//      content/src/fr/wordlist-sources.yaml, at the lowest level it occurs (A1.1 < A1 < A2), with file:line refs and
//      the surface forms seen. Examiner-facing text (level descriptors, examiner instructions, exam summaries, the
//      recording's stage directions) is not child text; words found only there are listed as excluded. Exam
//      instruction words in the child-facing text (cochez, entoure …) are excluded by the sources' `exclude` list.
//   2. topic / parity — additions from wordlist-sources.yaml, by theme with a justification.
// The JSON is gitignored (derived from copyrighted documents); content/src/fr/WORDLIST.md holds the counts.
// Exit 1 when a child-facing word is neither in the lexicon nor a name, number or exclusion (add it), or when the
// sources are inconsistent.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { CONTRACTIONS, ELISIONS, formsOf, LEVELS, norm, rank, tokenize } from './french.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const EXTRACTED = path.join(ROOT, 'content/reference/extracted');
export const WORDLIST_FR_JSON = path.join(EXTRACTED, 'wordlist-fr.json');
export const SOURCES_FR = path.join(ROOT, 'content/src/fr/wordlist-sources.yaml');
export const SUMMARY_FR = path.join(ROOT, 'content/src/fr/WORDLIST.md');
const FILES = [
  ['A1.1', 'delf-prim-a1-1-livret-candidat.txt'], ['A1.1', 'delf-prim-a1-1-transcription.txt'], ['A1.1', 'delf-prim-a1-1-livret-examinateur.txt'],
  ['A1', 'delf-prim-a1-livret-candidat.txt'], ['A1', 'delf-prim-a1-transcription.txt'], ['A1', 'delf-prim-a1-livret-examinateur.txt'],
  ['A2', 'delf-prim-a2-livret-candidat.txt'], ['A2', 'delf-prim-a2-transcription.txt'], ['A2', 'delf-prim-a2-livret-examinateur.txt'],
  // DELF B1 junior / scolaire: the candidate booklets (documents, questions, writing subjects), the listening
  // transcriptions and the oral subjects of the examiner booklet. The answer keys repeat the options; the "conseils"
  // sheets and the individual candidate sheet only describe the exam.
  ['B1', 'french/b1/delf-sj-b1-exemple1-coll-candidat.txt'], ['B1', 'french/b1/delf-sj-b1-exemple2-coll-candidat.txt'],
  ['B1', 'french/b1/delf-sj-b1-exemple1-coll-surveillant.txt'], ['B1', 'french/b1/delf-sj-b1-exemple2-coll-surveillant.txt'],
  ['B1', 'french/b1/delf-sj-b1-indiv-examinateur.txt'],
  // DELF B2 junior / scolaire: the same booklets. Attest-only: a word of these papers credits its lemma at B2
  // when the lemma is in the lexicon, but an unknown word is not an error (B2 entries come from the lexicon and the B2
  // groups; the papers say which of them are attested).
  ['B2', 'french/b2/delf-sj-b2-exemple1-coll-candidat.txt'], ['B2', 'french/b2/delf-sj-b2-exemple2-coll-candidat.txt'],
  ['B2', 'french/b2/delf-sj-b2-exemple1-coll-surveillant.txt'], ['B2', 'french/b2/delf-sj-b2-exemple2-coll-surveillant.txt'],
  ['B2', 'french/b2/delf-sj-b2-indiv-examinateur.txt'],
];
const ATTEST_ONLY = new Set(['B2']);
const POS = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb', prep: 'preposition', conj: 'conjunction', pron: 'pronoun', det: 'determiner', num: 'number', ord: 'number-ordinal', phrase: 'phrase', interj: 'exclamation', q: 'question' };

/** Parse the sources: lexicon lines "lemma = pos [gender]" (gender m | f | mpl | fpl | mf). */
export function readSources(file = SOURCES_FR) {
  const src = YAML.parse(fs.readFileSync(file, 'utf8'));
  const lexicon = new Map();
  const errors = [];
  for (const raw of String(src.lexicon).split('\n').flatMap((l) => l.replace(/#.*$/, '').split(';'))) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.+?)\s*=\s*(\S+)(?:\s+(\S+))?$/);
    if (!m || !POS[m[2]]) {
      errors.push(`lexicon: cannot read "${line}"`);
      continue;
    }
    const key = norm(m[1]);
    if (lexicon.has(key)) errors.push(`lexicon: "${key}" twice`);
    lexicon.set(key, { key, lemma: key.replace(/~.*$/, ''), pos: POS[m[2]], ...(m[3] ? { gender: m[3] } : {}) });
  }
  const additions = [];
  for (const [source, groups] of [['topic', src.topic || []], ['parity', src.parity || []]]) {
    for (const g of groups) {
      if (!LEVELS.includes(g.level)) errors.push(`${source} "${g.theme}": level "${g.level}"`);
      if (!g.theme || !g.justification) errors.push(`${source} group without theme/justification: ${JSON.stringify(g).slice(0, 80)}`);
      for (const w of String(g.words).split(',').map((s) => norm(s.trim())).filter(Boolean)) {
        if (!lexicon.has(w)) errors.push(`${source} "${g.theme}": "${w}" is not in the lexicon`);
        additions.push({ lemma: w, level: g.level, source, theme: g.theme, justification: g.justification });
      }
    }
  }
  const exclude = new Map(Object.entries(src.exclude || {}).flatMap(([reason, words]) => String(words).split(',').map((w) => [norm(w.trim()), reason])));
  const names = new Set(String(src.names || '').split(',').map((s) => s.trim()).filter(Boolean));
  return { lexicon, additions, exclude, names, errors };
}

/** form -> [lemma] for every lexicon entry (all generated forms). */
export function formIndex(lexicon) {
  const index = new Map();
  for (const entry of lexicon.values()) {
    for (const [form, kind] of formsOf(entry)) {
      if (!index.has(form)) index.set(form, []);
      index.get(form).push({ lemma: entry.key, kind });
    }
  }
  return index;
}

// ---- child-facing vs examiner-facing text -----------------------------------------------------------------
const META_LINE = [
  /^(COMPRÉHENSION|PRODUCTION|DIPLÔME|TRANSCRIPTION|ATTENTION|S’ASSURER|S'ASSURER|MISE EN ROUTE|PIST ?E|Ministère|DOCUMENT RÉSERVÉ|PAUSE|LAISSER|Pour la compréhension|indications présentes)/,
  /^((Instruction|Message|Dialogue) n°\s*\.?\s*)+$/, /^[A-F] Message n°/,
  /^(Exercice \d|Dessin [A-F]|Code du candidat|CO |CE |PE |PO |TOTAL|Niveau A|DELF Prim|Livret d|PMA|Épreuve|Cette épreuve|Activité \d|Histoire \d|Situation \d|Sujet \d|Objectif|Remarques|L’examinateur joue|L'examinateur joue|Total|Seuil|Note minimale|©|Mise en page|Illustrations|France Éducation|Département|1, avenue|delfprim|france-education|\(Seconde écoute|Écoute encore|Images à découper|Une planche|La partie .* est terminée|Attention, nous commençons|Tu entends le son|Exemple : Tu entends)/,
  /^[A-F](\s+[A-F])*$/, /^— Ou toute autre question/, /^Niveau A[\d.]* du Cadre/, /^(EXEMP|LE|P LE|M|EXE)\b/, /^n°/, /^Dialogue \d+$/, /^\d+ ?\/ ?\d+$/,
];

/**
 * Classify the lines of one extracted paper: child-facing lines are what the child reads or hears (messages,
 * dialogues, questions, tasks, instructions to the candidate); the rest is about the exam.
 * Returns [{ line (1-based), text, child }].
 */
export function classifyLines(fileText, fileName) {
  const lines = fileText.split('\n');
  const out = [];
  const examiner = /examinateur/.test(fileName);
  const candidat = /candidat/.test(fileName);
  let mode = candidat ? 'cover' : 'meta';
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].replace(/\s+/g, ' ').trim();
    if (!text) continue;
    // Block switches
    if (/^Consignes pour faire les exercices/.test(text)) mode = 'child';
    if (/^(DIPLÔME D|Épreuves collectives)/.test(text)) mode = 'summary';
    if (examiner) {
      if (/Échelle globale|^Épreuve de production|^Remarques|Consigne pour l.examinateur|^Niveau A/.test(text)) mode = 'meta';
      if (/Consigne à donner au candidat|Exemples de questions|^Sujets$/.test(text)) mode = 'child';
    } else if (/^(COMPRÉHENSION|PRODUCTION)/.test(text) && mode !== 'cover' && mode !== 'summary') mode = 'child';
    if (!examiner && !candidat && /^(Tu écoutes plusieurs documents|Exercice \d)/.test(text)) mode = 'child';
    let child = mode === 'child' && !META_LINE.some((re) => re.test(text));
    // Examiner instructions quote the questions to ask the child as dash lines (not in the level descriptors).
    if (examiner && mode === 'meta' && /^[–—-]\s/.test(text) && !/candidat|capable|utiliser|répondre à des|comprendre, accepter|demander à quelqu|demander des objets|présenter quelqu|se débrouiller|parler du temps|produire des|se décrire|raconter un événement/.test(text)) child = true;
    if (/^Quand tu vois/.test(text)) child = true; // instructions to the candidate (exam words are excluded by the list)
    out.push({ line: i + 1, text, child });
  }
  return out;
}

// DELF B1 junior / scolaire papers: page furniture, scores, exam procedure and stage directions are not learner text.
const META_B1 = [
  /SUJET_DÉMO|^DELF B[12] junior|^DOCUMENT RÉSERVÉ|Page \d+ sur \d+|^Ministère|^DIPLÔME|^Niveau B[12] du Cadre|^ÉPREUVE|^Épreuve|^Durée|^Seuil|^Note minimale|^NOTE|^Photocopier|^CODE CANDIDAT|^Volet|^Nom :|^Prénom :/,
  /^\d \((CO|CE|PE|PO)\)|^EXERCICE \d|^Exercice \d|^>|^Pause de|^S.ASSURER|^TRANSCRIPTION|^L.enregistrement comporte|^donc pas intervenir|^Fin de l.épreuve|^pour les langues, version|^Le genre masculin|^L.examinateur joue|^D.après www|^Source :|^\* /,
  /^(Vous allez écouter|Avant chaque écoute|Pour répondre aux questions|Lisez les questions|Lisez le document|Vous écoutez|écoutez|Vous lisez|Répondez|Cochez|Vous avez \d|Vous entendez|Vous écoutez une seconde|Vous écrivez|Vous avez lu|Nombre de mots)/i,
  /^[A-F]$|^\d+( ?points?)?$|^\d+,\d+ points?$|^(VRAI|FAUX)$|^Vrai Faux$|^Justification/,
];
const stripScore = (t) => t.replace(/\s+\d+(,\d+)?\s+points?$/, '').replace(/\[\s*\]/g, ' ').replace(/^[A-F]\s+(?=\S)/, '').replace(/^\d+\s+(?=\S)/, '').trim();

/** Classify the lines of a DELF B1 junior/scolaire paper (see FILES): [{ line, text, child }]. */
export function classifyB1Lines(fileText, fileName) {
  const out = [];
  const examiner = /examinateur/.test(fileName);
  const candidat = /candidat/.test(fileName);
  let mode = candidat ? 'cover' : examiner ? 'meta' : 'child';
  fileText.split('\n').forEach((raw, i) => {
    let text = raw.replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (candidat && mode === 'cover' && /^DOCUMENT RÉSERVÉ AU CANDIDAT/.test(text)) mode = 'child';
    if (examiner) {
      if (/^Ex\. [23] SUJET \d/i.test(text)) mode = 'child';
      else if (/^(GRILLE|Grille|ÉVALUATION|Échelle|Partie \d)|^\d Entretien|^\d Exercice|^\d Expression|OBJECTIF/.test(text)) mode = 'meta';
      if (/^« .* »$/.test(text)) { out.push({ line: i + 1, text, child: true }); return; } // the examiner's questions
      if (/^Ex\. [23] SUJET \d/i.test(text)) text = text.replace(/^Ex\. [23] SUJET \d\s*/i, ''); // a title may follow
    }
    text = stripScore(text);
    const child = mode === 'child' && text.length > 0 && !META_B1.some((re) => re.test(raw.trim()) || re.test(text));
    out.push({ line: i + 1, text, child });
  });
  return out;
}

/** Multi-word lexicon entries as token arrays (longest first): "salle de bain", "il y a", "s'il te plaît". */
function multiEntries(lexicon) {
  return [...lexicon.values()]
    .map((e) => ({ entry: e, tokens: tokenize(e.lemma).map((t) => t.word) }))
    .filter((m) => m.tokens.length > 1)
    .sort((a, b) => b.tokens.length - a.tokens.length);
}

/**
 * Resolve one token to lemmas. Hyphenated words: a lexicon entry (grand-mère, week-end, est-ce) or else split
 * (inversions: fais-tu, présente-toi, a-t-il).
 */
export function resolveToken(word, index) {
  if (ELISIONS[word]) return [ELISIONS[word]];
  if (CONTRACTIONS[word]) return word === 'des' ? ['de', 'le', 'un'] : CONTRACTIONS[word];
  if (index.has(word)) return index.get(word).map((h) => h.lemma);
  if (word.includes('-')) {
    const parts = word.split('-').filter((p) => p !== 't');
    const res = parts.map((p) => (index.has(p) ? index.get(p).map((h) => h.lemma) : null));
    if (res.every(Boolean)) return res.flat();
  }
  return null;
}

const DETERMINERS = new Set(["l'", 'le', 'la', 'les', 'un', 'une', 'des', 'du', 'au', 'aux', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'leur', 'leurs', 'ce', 'cet', 'cette', 'ces', 'quel', 'quelle', "d'", 'de']);
const SUBJECTS = new Set(["j'", 'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'ne', "n'", 'me', "m'", 'te', "t'", 'se', "s'"]);

/**
 * One form, several lemmas (porte: door / il porte; montre: watch / je montre; été: summer / participle): after a
 * determiner the noun, after a subject or object pronoun the verb; otherwise the lemma spelled like the form, else all.
 */
export function disambiguate(word, lemmas, prev, lexicon) {
  const pos = (k) => lexicon.get(k)?.pos;
  let uniq = [...new Set(lemmas)];
  if (uniq.length < 2) return uniq;
  // plain or reflexive verb (lave / se laver): reflexive only after a reflexive pronoun
  const reflexive = (k) => /^(se |s')/.test(k);
  if (uniq.some(reflexive) && uniq.some((k) => !reflexive(k) && pos(k) === 'verb')) {
    const refl = prev && /^(me|m'|te|t'|se|s')$/.test(prev); // nous/vous: subject more often (nous appelons)
    uniq = uniq.filter((k) => pos(k) !== 'verb' || reflexive(k) === refl);
    if (uniq.length < 2) return uniq;
  }
  // je suis / tu es: être before suivre
  if (uniq.includes('être')) uniq = uniq.filter((k) => k !== 'suivre');
  if (prev && DETERMINERS.has(prev)) {
    const nouns = uniq.filter((k) => pos(k) === 'noun');
    if (nouns.length) return nouns;
  }
  if (prev && SUBJECTS.has(prev)) {
    const verbs = uniq.filter((k) => pos(k) === 'verb');
    if (verbs.length) return verbs;
  }
  const exact = uniq.filter((k) => k.replace(/~.*$/, '') === word);
  return exact.length ? exact : uniq;
}

export function buildWordlist({ extractedDir = EXTRACTED, sourcesFile = SOURCES_FR } = {}) {
  const { lexicon, additions, exclude, names, errors } = readSources(sourcesFile);
  const index = formIndex(lexicon);
  const multi = multiEntries(lexicon);
  const attested = new Map(); // lemma -> { level, refs: [], forms: Set }
  const metaOnly = new Map(); // word -> first ref
  const excludedSeen = new Map(); // word -> { reason, refs }
  const unknown = new Map(); // word -> refs
  const namesSeen = new Map();
  const credit = (lemma, level, ref, form) => {
    const a = attested.get(lemma) ?? { level, refs: [], forms: {} };
    if (rank(level) < rank(a.level)) a.level = level;
    if (a.refs.length < 3 && !a.refs.includes(ref)) a.refs.push(ref);
    if (!a.forms[form] || rank(level) < rank(a.forms[form])) a.forms[form] = level;
    attested.set(lemma, a);
  };

  for (const [level, file] of FILES) {
    const full = path.join(extractedDir, file);
    if (!fs.existsSync(full)) {
      errors.push(`${file} is missing`);
      continue;
    }
    const classify = level === 'B1' || level === 'B2' ? classifyB1Lines : classifyLines;
    for (const { line, text, child } of classify(fs.readFileSync(full, 'utf8'), file)) {
      const ref = `${path.basename(file).replace(/^delf-prim-|^delf-sj-|\.txt$/g, '')}:${line}`;
      const toks = tokenize(text);
      const words = toks.map((t) => t.word);
      const used = new Array(words.length).fill(false);
      if (child) {
        for (const m of multi) {
          for (let i = 0; i + m.tokens.length <= words.length; i++) {
            if (m.tokens.every((t, k) => words[i + k] === t || ELISIONS[words[i + k]] === t)) {
              credit(m.entry.key, level, ref, m.tokens.join(' '));
              // the parts are words in their own right too (credited below if they are lemmas themselves)
              for (let k = 0; k < m.tokens.length; k++) used[i + k] = true;
            }
          }
        }
      }
      toks.forEach(({ word, original }, i) => {
        // digits, layout codes (PMA11DEMO01) and stray letters of the PDF layout are not words
        if (/^\d/.test(word) || /^pma\d/.test(word) || (word.length === 1 && !['a', 'à', 'y'].includes(word))) return;
        if (!child) {
          if (!metaOnly.has(word)) metaOnly.set(word, ref);
          return;
        }
        if (names.has(original) || names.has(original.replace(/'$/, ''))) {
          if (!namesSeen.has(original)) namesSeen.set(original, { level, ref });
          return;
        }
        if (exclude.has(word)) {
          const e = excludedSeen.get(word) ?? { reason: exclude.get(word), refs: [] };
          if (e.refs.length < 2) e.refs.push(ref);
          excludedSeen.set(word, e);
          return;
        }
        const lemmas = resolveToken(word, index);
        if (!lemmas && used[i]) return; // part of a multi-word lemma (plaît in s'il te plaît)
        if (!lemmas && ATTEST_ONLY.has(level)) return; // B2 papers attest; they do not have to be fully in the lexicon
        if (!lemmas) {
          if (!unknown.has(word)) unknown.set(word, []);
          if (unknown.get(word).length < 2) unknown.get(word).push(ref);
          return;
        }
        for (const l of disambiguate(word, lemmas, words[i - 1], lexicon)) credit(l, level, ref, word);
      });
    }
  }
  const entries = new Map();
  for (const [lemma, a] of attested) {
    const lex = lexicon.get(lemma);
    if (!lex) { // an elision or contraction whose full word is not in the lexicon yet (puisqu' → puisque)
      unknown.set(lemma, a.refs);
      continue;
    }
    entries.set(lemma, { lemma: lex.lemma, ...(lex.key !== lex.lemma ? { key: lex.key } : {}), level: a.level, pos: lex.pos, ...(lex.gender ? { gender: lex.gender } : {}), source: 'attested', refs: a.refs, forms: Object.fromEntries(Object.entries(a.forms).sort()) });
  }
  const redundant = [];
  for (const add of additions) {
    const lex = lexicon.get(add.lemma);
    if (!lex) continue;
    const prev = entries.get(add.lemma);
    if (prev && rank(prev.level) <= rank(add.level)) {
      redundant.push(`${add.lemma} (${add.source} ${add.level}; ${prev.source} ${prev.level})`);
      continue;
    }
    entries.set(add.lemma, {
      lemma: lex.lemma, ...(lex.key !== lex.lemma ? { key: lex.key } : {}), level: add.level, pos: lex.pos, ...(lex.gender ? { gender: lex.gender } : {}), source: add.source,
      theme: add.theme, justification: add.justification,
      ...(prev?.source === 'attested' ? { attestedAt: prev.level, refs: prev.refs, forms: prev.forms } : {}),
    });
  }
  const list = [...entries.values()].sort((a, b) => rank(a.level) - rank(b.level) || a.lemma.localeCompare(b.lemma, 'fr'));
  const unused = [...lexicon.keys()].filter((l) => !entries.has(l));
  return {
    entries: list,
    names: [...namesSeen.entries()].map(([name, v]) => ({ name, ...v })).concat([...names].filter((n) => !namesSeen.has(n)).map((name) => ({ name, level: 'A1.1', ref: 'added' }))),
    excluded: [...excludedSeen.entries()].map(([word, v]) => ({ word, reason: v.reason, refs: v.refs })).sort((a, b) => a.word.localeCompare(b.word, 'fr')),
    examinerOnly: [...metaOnly.keys()].filter((w) => !attested.has(w) && !resolveToken(w, index)?.some((l) => attested.has(l))).sort(),
    unknown: [...unknown.entries()].map(([word, refs]) => ({ word, refs })),
    redundant,
    unused,
    errors,
  };
}

/** The generated counts section of WORDLIST.md (unit-tested against the JSON). */
export function countsTable(counts, r) {
  const rows = LEVELS.map((l) => `| ${l} | ${counts[l].attested} | ${counts[l].topic} | ${counts[l].parity} | ${counts[l].total} |`);
  const sum = (k) => LEVELS.reduce((n, l) => n + counts[l][k], 0);
  return ['| Level | attested | topic | parity | total (new at this level) |', '|---|---|---|---|---|', ...rows,
    `| all | ${sum('attested')} | ${sum('topic')} | ${sum('parity')} | ${sum('total')} |`, '',
    `Names: ${r.names.length}. Excluded exam-instruction words: ${r.excluded.length}. Words found only in examiner-facing text: ${r.examinerOnly.length}.`].join('\n');
}

/** Counts per level × source (cumulative level = lemmas new at that level). */
export function summarize(entries) {
  const counts = {};
  for (const l of LEVELS) counts[l] = { attested: 0, topic: 0, parity: 0, total: 0 };
  for (const e of entries) {
    counts[e.level][e.source]++;
    counts[e.level].total++;
  }
  return counts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!fs.existsSync(path.join(EXTRACTED, FILES[0][1]))) {
    console.log('The DELF Prim reference texts are missing (docs/developer/content.md → "Reference files"). Skipping the French word list.');
    process.exit(0);
  }
  const r = buildWordlist();
  const counts = summarize(r.entries);
  for (const l of LEVELS) console.log(`${l.padEnd(5)} attested ${String(counts[l].attested).padStart(4)}  topic ${String(counts[l].topic).padStart(4)}  parity ${String(counts[l].parity).padStart(4)}  total ${String(counts[l].total).padStart(4)}`);
  console.log(`names ${r.names.length}, excluded exam words ${r.excluded.length}, examiner-only words ${r.examinerOnly.length}, lexicon entries not in the list ${r.unused.length}`);
  if (r.redundant.length) console.log(`additions already attested at that level or lower (ignored): ${r.redundant.join(', ')}`);
  if (r.unused.length && process.argv.includes('--verbose')) console.log(`unused lexicon: ${r.unused.join(', ')}`);
  let bad = r.errors.length + r.unknown.length;
  for (const e of r.errors) console.error(`error: ${e}`);
  if (r.unknown.length) console.error(`unknown child-facing words (add to the lexicon, names or exclude):\n  ${r.unknown.map((u) => `${u.word} [${u.refs.join(' ')}]`).join('\n  ')}`);
  if (bad) process.exit(1);
  if (!process.argv.includes('--check')) {
    fs.writeFileSync(WORDLIST_FR_JSON, `${JSON.stringify({ generatedBy: 'npm run content:wordlist -- fr', counts, entries: r.entries, names: r.names, excluded: r.excluded, examinerOnly: r.examinerOnly }, null, 1)}\n`);
    console.log(`wrote ${path.relative(process.cwd(), WORDLIST_FR_JSON)}: ${r.entries.length} lemmas`);
    if (fs.existsSync(SUMMARY_FR)) {
      const text = fs.readFileSync(SUMMARY_FR, 'utf8');
      const table = countsTable(counts, r);
      const next = text.replace(/<!-- counts:start -->[\s\S]*<!-- counts:end -->/, `<!-- counts:start -->\n${table}\n<!-- counts:end -->`);
      fs.writeFileSync(SUMMARY_FR, next);
      console.log(`updated the counts in ${path.relative(process.cwd(), SUMMARY_FR)}`);
    }
  }
}
