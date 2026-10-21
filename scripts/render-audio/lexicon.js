#!/usr/bin/env node
// npm run audio:lexicon [-- --check]
// Compiles the pronunciation lexicons content/src/<track>/pronunciations.yaml into content/pronunciations.json (committed),
// which the renderer, audio:check and the server's health check read (the server has no YAML parser in production).
// `npm run audio:render` compiles first; --check exits 1 when the JSON is out of date. Format and rules: docs/developer/audio.md.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { ROOT } from './collect.js';

export const SECTIONS = ['words', 'alone', 'beforeVowel', 'hiatus', 'initial'];
/** How the voice is given a colon in a sentence: `sentence` = a full stop and the next word capitalised. */
export const COLON_RULES = ['sentence'];

/** The lexicon of every track that has a pronunciations.yaml: { tracks: { nl: { words: { job: 'dʒˈɔp' } } } }. */
export function compileLexicon(contentDir = path.join(ROOT, 'content')) {
  const srcDir = path.join(contentDir, 'src');
  const tracks = {};
  const problems = [];
  for (const track of fs.existsSync(srcDir) ? fs.readdirSync(srcDir).sort() : []) {
    const file = path.join(srcDir, track, 'pronunciations.yaml');
    if (!fs.existsSync(file)) continue;
    const doc = YAML.parse(fs.readFileSync(file, 'utf8')) ?? {};
    const out = {};
    for (const [section, entries] of Object.entries(doc)) {
      if (section === 'colon') {
        if (!COLON_RULES.includes(entries)) problems.push(`${track}: colon must be one of ${COLON_RULES.join(', ')}`);
        else out.colon = entries;
        continue;
      }
      if (!SECTIONS.includes(section)) {
        problems.push(`${track}: unknown section "${section}" (allowed: ${SECTIONS.join(', ')})`);
        continue;
      }
      out[section] = {};
      for (const [form, phonemes] of Object.entries(entries ?? {})) {
        if (form !== form.toLowerCase()) problems.push(`${track}.${section}: "${form}" must be lower case (forms match any case)`);
        if (typeof phonemes !== 'string' || !phonemes.trim() || /[[\]]/.test(phonemes)) problems.push(`${track}.${section}.${form}: phonemes must be a plain non-empty string`);
        else out[section][form] = phonemes.trim();
      }
      out[section] = Object.fromEntries(Object.entries(out[section]).sort(([a], [b]) => a.localeCompare(b)));
    }
    tracks[track] = out;
  }
  if (problems.length) throw new Error(`pronunciation lexicon:\n  ${problems.join('\n  ')}`);
  return {
    about: 'Compiled from content/src/<track>/pronunciations.yaml by npm run audio:lexicon (also run by audio:render). Do not edit by hand. docs/developer/audio.md',
    tracks,
  };
}

/** Phoneme symbols a voice cannot say: [{ track, form, symbols }] (the voice's phoneme_id_map, models/piper/<voice>.onnx.json). */
export function unknownSymbols(lexicon, voices, piperDir = path.join(ROOT, 'models', 'piper')) {
  const out = [];
  for (const [track, sections] of Object.entries(lexicon.tracks)) {
    const cfg = path.join(piperDir, `${voices[track]?.voice}.onnx.json`);
    if (!fs.existsSync(cfg)) continue;
    const map = JSON.parse(fs.readFileSync(cfg, 'utf8')).phoneme_id_map;
    for (const entries of Object.values(sections)) {
      if (typeof entries !== 'object') continue; // the colon rule
      for (const [form, ph] of Object.entries(entries)) {
        const bad = [...ph].filter((ch) => !(ch in map));
        if (bad.length) out.push({ track, form, symbols: [...new Set(bad)] });
      }
    }
  }
  return out;
}

export function lexiconText(contentDir) {
  return `${JSON.stringify(compileLexicon(contentDir), null, 1)}\n`;
}

/** Write content/pronunciations.json when it differs; returns true when it changed. */
export function writeLexicon(contentDir = path.join(ROOT, 'content')) {
  const file = path.join(contentDir, 'pronunciations.json');
  const text = lexiconText(contentDir);
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return false;
  fs.writeFileSync(file, text);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const contentDir = path.join(ROOT, 'content');
  const file = path.join(contentDir, 'pronunciations.json');
  if (process.argv.includes('--check')) {
    const ok = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === lexiconText(contentDir);
    console.log(ok ? 'content/pronunciations.json is up to date' : 'content/pronunciations.json is out of date: npm run audio:lexicon');
    process.exit(ok ? 0 : 1);
  }
  console.log(writeLexicon(contentDir) ? 'wrote content/pronunciations.json' : 'content/pronunciations.json unchanged');
}
