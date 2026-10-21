#!/usr/bin/env node
// npm run content:trace -- en|fr|nl [--src <dir>] [--wordlist <file>] [--coverage]
// Checks every vocabulary target and every word of every sentence (and acceptAlso) in content/src/en/<level>/
// against the Cambridge YLE word list (content/reference/extracted/wordlist-en.json, made by
// npm run content:wordlist). Rules: scripts/content/trace-lib.js. Exit 1 on any untraceable word.
// It also reports coverage: list words of the level not taught in any unit nor omitted (pack.yaml `omit`);
// --coverage makes missing words an error (used once a level is complete).
// French (fr): content/src/fr/<level>/ against the derived DELF Prim word list (wordlist-fr.json, made by
// npm run content:wordlist -- fr; rules: scripts/content/trace-fr-lib.js). Coverage is track-wide: every lemma of
// the list is taught in a pack at or above its level, or listed in some pack.yaml `omit` with a reason.
// Dutch (nl): content/src/nl/<level>/ against the derived Dutch word list (wordlist-nl.json, made by
// npm run content:wordlist -- nl; rules: scripts/content/trace-nl-lib.js). Coverage is track-wide, as for French;
// compounds of two list words pass and are listed for review, and so do homographs of a form above the level (was).
// The word lists are derived from gitignored reference documents: without them, this says so and exits 0.
import fs from 'node:fs';
import path from 'node:path';
import { manifestTracks, readPackSources, SRC_DIR, withAppended } from './sources.js';
import { traceTexts } from './trace-texts.js';
import { WORDLIST_JSON } from './wordlist-en.js';
import { indexWordlist, PACK_LEVEL, traceSentence, traceVocab } from './trace-lib.js';
import { WORDLIST_FR_JSON } from './wordlist-fr.js';
import { indexWordlistFr, traceSentenceFr, traceTokenFr, traceVocabFr } from './trace-fr-lib.js';
import { norm as normFr } from './french.js';
import { PACK_LEVEL as PACK_LEVEL_FR, LEVELS as LEVELS_FR, rank as rankFr } from './french.js';
import { WORDLIST_NL_JSON } from './wordlist-nl.js';
import { indexWordlistNl, traceSentenceNl, traceVocabNl } from './trace-nl-lib.js';
import { PACK_LEVEL as PACK_LEVEL_NL, LEVELS as LEVELS_NL, rank as rankNl } from './dutch.js';

export { traceTexts };

/** A pack above the highest level of its word list (English and French B1: no B1 list on disk) — see docs/developer/content.md. */
// A B1/B2 pack whose course has no word list at that level yet (French B1 until its derived list has B1 lemmas): its own
// vocabulary is reported for the reviewer instead of failing. English B1 has the B1 Preliminary list; Dutch B1 its own.
const listLevels = { en: new Set(), fr: new Set() };
const aboveList = (packId) => /-(b1|b2)$/.test(packId) && !packId.startsWith('nl-')
  && !listLevels[packId.slice(0, 2)]?.has(packId.split('-').slice(1).join('-').toUpperCase());

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? path.resolve(args[args.indexOf(name) + 1]) : fallback);
const asked = args.find((a, i) => !a.startsWith('--') && !['--src', '--wordlist'].includes(args[i - 1])) || 'en';
// a course id is traced by the language it teaches: fr-en's words are fr's, from the same sources and word list
const askedTrack = manifestTracks().find((t) => t.id === asked);
const track = askedTrack?.target ?? asked;
if (track !== asked) console.log(`${asked} teaches ${track}: it is built from the ${track} unit sources and traced with the ${track} word list.`);
const srcDir = opt('--src', SRC_DIR);
const wordlistFile = opt('--wordlist', track === 'fr' ? WORDLIST_FR_JSON : track === 'nl' ? WORDLIST_NL_JSON : WORDLIST_JSON);

if (track === 'fr') {
  if (!fs.existsSync(wordlistFile)) {
    console.log(`${path.relative(process.cwd(), wordlistFile)} is missing (it is derived from the gitignored DELF Prim papers).`);
    console.log('Get the reference files (docs/developer/content.md → "Reference files"), then run npm run content:wordlist -- fr. Skipping the trace.');
    process.exit(0);
  }
  process.exit(traceFrench(JSON.parse(fs.readFileSync(wordlistFile, 'utf8'))) ? 1 : 0);
}
if (track === 'nl') {
  if (!fs.existsSync(wordlistFile)) {
    console.log(`${path.relative(process.cwd(), wordlistFile)} is missing (it is derived from the gitignored NT2Lex and Dutch references).`);
    console.log('Get the reference files (content/src/nl/SOURCES.md), then run npm run content:wordlist -- nl. Skipping the trace.');
    process.exit(0);
  }
  process.exit(traceDutch(JSON.parse(fs.readFileSync(wordlistFile, 'utf8'))) ? 1 : 0);
}
if (track !== 'en') {
  console.log(`content:trace knows the tracks en, fr and nl, not "${track}".`);
  process.exit(2);
}
if (!fs.existsSync(wordlistFile)) {
  console.log(`${path.relative(process.cwd(), wordlistFile)} is missing (it is derived from the gitignored reference PDF).`);
  console.log('Get the reference files (docs/developer/content.md → "Reference files"), then run npm run content:wordlist. Skipping the trace.');
  process.exit(0);
}
const wordlist = JSON.parse(fs.readFileSync(wordlistFile, 'utf8'));
const index = indexWordlist(wordlist);
const LEVEL_ORDER = ['S', 'M', 'F', 'B1', 'B2'];
if (wordlist.some((e) => e.level === 'B1')) listLevels.en.add('B1');
if (wordlist.some((e) => e.level === 'B2')) listLevels.en.add('B2');
else console.log('wordlist-en.json has no B1 entries (the B1 Preliminary list is missing): en-b1 is traced against the A2 list');
const levels = fs.existsSync(path.join(srcDir, track)) ? fs.readdirSync(path.join(srcDir, track)).filter((d) => fs.existsSync(path.join(srcDir, track, d, 'pack.yaml'))) : [];

let problems = 0;
for (const level of levels.sort((a, b) => Object.keys(PACK_LEVEL).indexOf(`en-${a}`) - Object.keys(PACK_LEVEL).indexOf(`en-${b}`))) {
  const packId = `${track}-${level}`;
  const lvl = aboveList(packId) ? 'F' : PACK_LEVEL[packId];
  if (!lvl) {
    console.error(`${packId}: no word-list level for this pack`);
    problems++;
    continue;
  }
  const { meta, units: sourceUnits } = readPackSources(packId, srcDir);
  const units = sourceUnits.map(withAppended);
  let vocab = 0;
  let sentences = 0;
  for (const unit of units) {
    for (const v of unit.vocabulary) {
      vocab++;
      const r = traceVocab(index, v.target, lvl);
      const off = (meta.offList || []).find((o) => o.word.toLowerCase() === v.target.toLowerCase());
      if (!r.ok && off) console.log(`  ${unit.file}: vocabulary ${v.id} "${v.target}" is off the list: ${off.reason}`);
      else if (!r.ok && aboveList(packId)) console.log(`  ${unit.file}: B1 vocabulary ${v.id} "${v.target}" (beyond the A2 list: the reviewer checks it)`);
      else if (!r.ok) {
        problems++;
        console.error(`${unit.file}: vocabulary ${v.id} "${v.target}": ${r.reason}`);
      }
    }
    for (const s of unit.sentences || []) {
      sentences++;
      for (const text of [s.target, ...(s.acceptAlso || [])]) {
        for (const p of traceSentence(index, text, lvl)) {
          problems++;
          console.error(`${unit.file}: sentence ${s.id} "${text}": "${p.word}" — ${p.reason}`);
        }
      }
    }
    sentences += traceTexts(unit, (text) => traceSentence(index, text, lvl), (m) => { problems++; console.error(m); });
  }
  console.log(`${packId} (level ${lvl}): ${units.length} units, ${vocab} vocabulary, ${sentences} sentences checked`);
  if (aboveList(packId)) continue; // coverage is about the list's own levels

  // Coverage: every word-list entry of exactly this level is taught in one unit, or listed in pack.yaml `omit`
  // with a reason. Names and American forms are never vocabulary (names are used in sentences).
  const taught = new Map();
  for (const unit of units) {
    for (const v of unit.vocabulary) {
      const key = v.target.toLowerCase();
      if (taught.has(key)) {
        problems++;
        console.error(`${unit.file}: "${v.target}" is also taught in ${taught.get(key)} (every word in exactly one unit)`);
      }
      taught.set(key, unit.file);
    }
  }
  const omitted = new Map((meta.omit || []).map((o) => [o.word.toLowerCase(), o.reason]));
  const lower = new Set(wordlist.filter((e) => LEVEL_ORDER.indexOf(e.level) < LEVEL_ORDER.indexOf(lvl)).map((e) => e.word.toLowerCase()));
  if (lvl === 'B1') {
    // B1: coverage per headword of the B1 list (a headword may stand for several forms: yoghurt/yogurt, cm): taught when
    // one of its forms is a vocabulary target, omitted when one is in `omit`, already taught when one is on the YLE list.
    const heads = new Map();
    for (const e of wordlist.filter((x) => x.level === 'B1' && !x.us && x.pos !== 'name' && x.source !== 'B1 word set')) {
      const key = e.head ?? e.word;
      if (!heads.has(key)) heads.set(key, []);
      heads.get(key).push(e.word.toLowerCase());
    }
    const state = (forms) => (forms.some((f) => taught.has(f)) ? 'taught' : forms.some((f) => lower.has(f)) ? 'lower'
      : forms.some((f) => omitted.has(f)) ? 'omitted' : 'missing');
    for (const [head, forms] of heads) {
      const taughtForms = forms.filter((f) => taught.has(f));
      if (taughtForms.length && forms.some((f) => omitted.has(f))) {
        problems++;
        console.error(`  "${head}" is taught (${taughtForms.join(', ')}) and also listed in ${packId} omit: remove the omit entry`);
      }
    }
    const counts = { taught: 0, lower: 0, omitted: 0, missing: 0 };
    const missing = [];
    for (const [head, forms] of heads) {
      const st = state(forms);
      counts[st]++;
      if (st === 'missing') missing.push(head);
    }
    console.log(`  coverage: ${counts.taught} of ${heads.size} B1 headwords taught, ${counts.omitted} omitted with a reason, `
      + `${counts.lower} already taught at a lower level, ${counts.missing} missing`);
    if (args.includes('--coverage') && missing.length) {
      problems += missing.length;
      console.error(`  not taught and not omitted: ${missing.join(', ')}`);
    } else if (missing.length) console.log(`  not yet taught (${missing.length}): ${missing.slice(0, 40).join(', ')}${missing.length > 40 ? ' …' : ''}`);
    continue;
  }
  const levelWords = [...new Set(wordlist.filter((e) => e.level === lvl && !e.us && e.pos !== 'name' && !/^[A-Z][a-z]/.test(e.word)
    && !(e.source === 'numbers note' && /-/.test(e.word))).map((e) => e.word.toLowerCase()))];
  // A word already taught at a lower level (a new sense at this level) counts as covered there.
  // An omit entry for a word that is taught is stale: it would be counted twice.
  for (const w of levelWords.filter((x) => taught.has(x) && omitted.has(x))) {
    problems++;
    console.error(`  "${w}" is taught in ${taught.get(w)} and also listed in ${packId} omit: remove the omit entry`);
  }
  const missing = levelWords.filter((w) => !taught.has(w) && !omitted.has(w) && !lower.has(w));
  const covered = levelWords.filter((w) => taught.has(w)).length;
  console.log(`  coverage: ${covered} of ${levelWords.length} level-${lvl} words taught, ${levelWords.filter((w) => !taught.has(w) && omitted.has(w)).length} omitted with a reason, `
    + `${levelWords.filter((w) => !taught.has(w) && !omitted.has(w) && lower.has(w)).length} already taught at a lower level, ${missing.length} missing`);
  if (args.includes('--coverage') && missing.length) {
    problems += missing.length;
    console.error(`  not taught and not omitted: ${missing.join(', ')}`);
  } else if (missing.length) console.log(`  not yet taught: ${missing.slice(0, 40).join(', ')}${missing.length > 40 ? ' …' : ''}`);
}
if (problems) {
  console.error(`\ncontent:trace FAILED: ${problems} untraceable word(s)`);
  process.exit(1);
}
console.log('content:trace OK: every word is on the word list at or below its level');

/** French: returns the number of problems. */
function traceFrench(json) {
  const index = indexWordlistFr(json);
  if (json.entries.some((e) => e.level === 'B1')) listLevels.fr.add('B1');
  if (json.entries.some((e) => e.level === 'B2')) listLevels.fr.add('B2');
  const dir = path.join(srcDir, 'fr');
  const levels = fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'pack.yaml'))) : [];
  levels.sort((a, b) => rankFr(PACK_LEVEL_FR[`fr-${a}`]) - rankFr(PACK_LEVEL_FR[`fr-${b}`]));
  let bad = 0;
  const taught = new Map(); // lemma key -> "unit file"
  const omitted = new Map();
  for (const level of levels) {
    const packId = `fr-${level}`;
    const lvl = PACK_LEVEL_FR[packId];
    if (!lvl) {
      console.error(`${packId}: no word-list level for this pack`);
      bad++;
      continue;
    }
    const { meta, units: sourceUnits } = readPackSources(packId, srcDir);
  const units = sourceUnits.map(withAppended);
    for (const o of meta.omit || []) omitted.set(o.word, packId);
    let vocab = 0;
    let sentences = 0;
    for (const unit of units) {
      for (const v of unit.vocabulary) {
        vocab++;
        const r = traceVocabFr(index, v.target, aboveList(packId) ? 'A2' : lvl);
        const off = (meta.offList || []).find((o) => o.word === v.target);
        if (!r.ok && off) console.log(`  ${unit.file}: vocabulary ${v.id} "${v.target}" is off the list: ${off.reason}`);
        else if (!r.ok && aboveList(packId)) console.log(`  ${unit.file}: B1 vocabulary ${v.id} "${v.target}" (beyond the A2 list: the reviewer checks it)`);
        else if (!r.ok) {
          bad++;
          console.error(`${unit.file}: vocabulary ${v.id} "${v.target}": ${r.reason}`);
        } else if (r.key) {
          if (taught.has(r.key) && !v.alsoTaught) {
            bad++;
            console.error(`${unit.file}: "${v.target}" (${r.key}) is also taught in ${taught.get(r.key)} (every lemma in one unit)`);
          }
          if (!taught.has(r.key)) taught.set(r.key, unit.file);
        }
      }
      for (const s of unit.sentences || []) {
        sentences++;
        for (const text of [s.target, ...(s.acceptAlso || [])]) {
          for (const p of traceSentenceFr(index, text, aboveList(packId) ? 'A2' : lvl, { allForms: aboveList(packId) })) {
            bad++;
            console.error(`${unit.file}: sentence ${s.id} "${text}": "${p.word}" — ${p.reason}`);
          }
        }
      }
      // a B1 pack (above the A2 list): every tense of a listed word; the unit's own words in every form too
      const above = aboveList(packId);
      const unitIndex = indexWordlistFr({ entries: unit.vocabulary.map((v) => ({ lemma: v.target.replace(/^(le|la|les)\s+|^l'/, ''), pos: v.pos, gender: v.gender, level: 'A1.1' })), names: [] });
      sentences += traceTexts(unit, (text) => traceSentenceFr(index, text, above ? 'A2' : lvl, { allForms: above })
        .filter((p) => !(above && traceTokenFr(unitIndex, normFr(p.word), 'A2', p.word, { allForms: true }).ok)), (m) => { bad++; console.error(m); });
    }
    console.log(`${packId} (level ${lvl}): ${units.length} units, ${vocab} vocabulary, ${sentences} sentences checked`);
  }
  // Coverage, track-wide
  for (const lvl of LEVELS_FR) {
    const words = json.entries.filter((e) => e.level === lvl).map((e) => e.key ?? e.lemma);
    // An omit entry for a lemma that is taught is stale: it would be counted twice (taught + omitted > lemmas).
    for (const w of words.filter((x) => taught.has(x) && omitted.has(x))) {
      bad++;
      console.error(`    "${w}" is taught in ${taught.get(w)} and also listed in ${omitted.get(w)} omit: remove the omit entry`);
    }
    const missing = words.filter((w) => !taught.has(w) && !omitted.has(w));
    console.log(`  coverage ${lvl}: ${words.filter((w) => taught.has(w)).length} of ${words.length} lemmas taught, ${words.filter((w) => !taught.has(w) && omitted.has(w)).length} omitted with a reason, ${missing.length} missing`);
    if (missing.length) {
      if (args.includes('--coverage')) {
        bad += missing.length;
        console.error(`    not taught and not omitted: ${missing.join(', ')}`);
      } else console.log(`    not yet taught: ${missing.slice(0, 60).join(', ')}${missing.length > 60 ? ' …' : ''}`);
    }
  }
  if (bad) console.error(`\ncontent:trace FAILED: ${bad} problem(s)`);
  else console.log('content:trace OK: every French word is in the derived word list (DELF Prim, DELF B1 and B2 junior) at or below its level');
  return bad;
}

/** Dutch: returns the number of problems. */
function traceDutch(json) {
  const index = indexWordlistNl(json);
  const dir = path.join(srcDir, 'nl');
  const levels = fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'pack.yaml'))) : [];
  levels.sort((a, b) => rankNl(PACK_LEVEL_NL[`nl-${a}`]) - rankNl(PACK_LEVEL_NL[`nl-${b}`]));
  let bad = 0;
  const taught = new Map(); // lemma key -> "unit file"
  const omitted = new Map();
  const review = [];
  for (const level of levels) {
    const packId = `nl-${level}`;
    const lvl = PACK_LEVEL_NL[packId];
    if (!lvl) {
      console.error(`${packId}: no word-list level for this pack`);
      bad++;
      continue;
    }
    const { meta, units: sourceUnits } = readPackSources(packId, srcDir);
  const units = sourceUnits.map(withAppended);
    for (const o of meta.omit || []) omitted.set(o.word, packId);
    let vocab = 0;
    let sentences = 0;
    for (const unit of units) {
      for (const v of unit.vocabulary) {
        vocab++;
        const r = traceVocabNl(index, v.target, lvl, v);
        if (!r.ok) {
          bad++;
          console.error(`${unit.file}: vocabulary ${v.id} "${v.target}": ${r.reason}`);
        } else if (r.key) {
          if (taught.has(r.key)) {
            bad++;
            console.error(`${unit.file}: "${v.target}" (${r.key}) is also taught in ${taught.get(r.key)} (every lemma in one unit)`);
          } else taught.set(r.key, unit.file);
        }
      }
      for (const s of unit.sentences || []) {
        sentences++;
        for (const text of [s.target, ...(s.acceptAlso || [])]) {
          const notes = [];
          for (const p of traceSentenceNl(index, text, lvl, notes)) {
            bad++;
            console.error(`${unit.file}: sentence ${s.id} "${text}": "${p.word}" — ${p.reason}`);
          }
          for (const n of notes) review.push(`${unit.file} ${s.id}: ${n}`);
        }
      }
      sentences += traceTexts(unit, (text) => traceSentenceNl(index, text, lvl, []), (m) => { bad++; console.error(m); });
    }
    console.log(`${packId} (level ${lvl}): ${units.length} units, ${vocab} vocabulary, ${sentences} sentences checked`);
  }
  const compounds = review.filter((r) => r.includes(': compound '));
  if (compounds.length) console.log(`  compounds for review (${compounds.length}): ${[...new Set(compounds.map((r) => r.replace(/^.*: compound /, '')))].slice(0, 40).join('; ')}`);
  const homographs = review.filter((r) => !r.includes(': compound '));
  if (homographs.length) console.log(`  homographs for review (${homographs.length}):\n${[...new Set(homographs)].map((r) => `    ${r}`).join('\n')}`);
  for (const lvl of LEVELS_NL) {
    const keys = json.entries.filter((e) => e.level === lvl).map((e) => e.key);
    for (const k of keys.filter((x) => taught.has(x) && omitted.has(x))) {
      bad++;
      console.error(`    "${k}" is taught in ${taught.get(k)} and also listed in ${omitted.get(k)} omit: remove the omit entry`);
    }
    const missing = keys.filter((k) => !taught.has(k) && !omitted.has(k));
    console.log(`  coverage ${lvl}: ${keys.filter((k) => taught.has(k)).length} of ${keys.length} lemmas taught, ${keys.filter((k) => !taught.has(k) && omitted.has(k)).length} omitted with a reason, ${missing.length} missing`);
    if (missing.length) {
      if (args.includes('--coverage')) {
        bad += missing.length;
        console.error(`    not taught and not omitted: ${missing.join(', ')}`);
      } else console.log(`    not yet taught: ${missing.slice(0, 60).join(', ')}${missing.length > 60 ? ' …' : ''}`);
    }
  }
  if (bad) console.error(`\ncontent:trace FAILED: ${bad} problem(s)`);
  else console.log('content:trace OK: every Dutch word is in the Dutch word list at or below its level');
  return bad;
}
