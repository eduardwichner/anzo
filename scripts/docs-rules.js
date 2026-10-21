#!/usr/bin/env node
// npm run docs:rules [-- --check]
// Admin → What counts as correct: the page's content comes from one source, section 8 of
// docs/grading-rules.md (a table per section, each rule in English and Dutch with one example). This compiles it into
// client/src/data/grading-rules.json (committed; the client bundles it). --check exits 1 when the JSON is out of date.
// server/test/rules-page.test.js also grades every example.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DOC = path.join(ROOT, 'docs', 'grading-rules.md');
export const OUT = path.join(ROOT, 'client', 'src', 'data', 'grading-rules.json');
const LANGS = ['en', 'fr', 'nl'];
const KINDS = ['typed', 'dictation', 'build', 'pairs'];
const RESULTS = ['right', 'accents', 'spelling', 'wrong'];
const COLUMNS = ['id', 'lang', 'track', 'en', 'nl', 'kind', 'expected', 'typed', 'result'];

/** { sections: [{ id, title: { en, nl }, rules: [{ id, langs, text: { en, nl }, example: { track, kind, expected, typed, result } }] }] } */
export function parseRules(markdown) {
  const start = markdown.indexOf('\n## 8. ');
  if (start < 0) throw new Error('docs/grading-rules.md has no section "## 8." (the rules page)');
  const end = markdown.indexOf('\n## ', start + 5);
  const lines = markdown.slice(start, end < 0 ? undefined : end).split('\n');
  const sections = [];
  const problems = [];
  const ids = new Set();
  for (const line of lines) {
    const head = line.match(/^### (.+)$/);
    if (head) {
      const [id, en, nl] = head[1].split('|').map((x) => x.trim());
      if (!/^[a-z][a-z0-9-]*$/.test(id ?? '') || !en || !nl) problems.push(`section heading "${line}": write "### id | English | Dutch"`);
      sections.push({ id, title: { en, nl }, rules: [] });
      continue;
    }
    if (!line.startsWith('|') || /^\|\s*-/.test(line) || /^\|\s*id\s*\|/.test(line)) continue;
    const cells = line.slice(1, -1).split('|').map((x) => x.trim());
    const row = Object.fromEntries(COLUMNS.map((c, i) => [c, cells[i] ?? '']));
    const where = `rule "${row.id}"`;
    if (!sections.length) { problems.push(`${where}: before any ### section`); continue; }
    if (cells.length !== COLUMNS.length) problems.push(`${where}: ${cells.length} cells, expected ${COLUMNS.length}`);
    if (!/^[a-z][a-z0-9-]*$/.test(row.id) || ids.has(row.id)) problems.push(`${where}: the id must be unique, lower case`);
    ids.add(row.id);
    const langs = row.lang === 'all' ? ['all'] : row.lang.split(/\s+/);
    if (!langs.every((l) => l === 'all' || LANGS.includes(l))) problems.push(`${where}: lang "${row.lang}"`);
    if (!LANGS.includes(row.track)) problems.push(`${where}: track "${row.track}"`);
    if (!KINDS.includes(row.kind)) problems.push(`${where}: kind "${row.kind}"`);
    if (!RESULTS.includes(row.result)) problems.push(`${where}: result "${row.result}"`);
    for (const c of ['en', 'nl', 'expected', 'typed']) if (!row[c]) problems.push(`${where}: ${c} is empty`);
    sections.at(-1).rules.push({ id: row.id, langs, text: { en: row.en, nl: row.nl },
      example: { track: row.track, kind: row.kind, expected: row.expected, typed: row.typed, result: row.result } });
  }
  for (const s of sections) if (!s.rules.length) problems.push(`section "${s.id}" has no rules`);
  if (problems.length) throw new Error(`docs/grading-rules.md section 8:\n  ${problems.join('\n  ')}`);
  return { about: 'Compiled from docs/grading-rules.md section 8 by npm run docs:rules. Do not edit by hand.', sections };
}

export const rulesJson = (markdown = fs.readFileSync(DOC, 'utf8')) => `${JSON.stringify(parseRules(markdown), null, 1)}\n`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = rulesJson();
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  if (process.argv.includes('--check')) {
    console.log(current === text ? 'client/src/data/grading-rules.json is up to date' : 'client/src/data/grading-rules.json is out of date: npm run docs:rules');
    process.exit(current === text ? 0 : 1);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  if (current !== text) fs.writeFileSync(OUT, text);
  const n = JSON.parse(text).sections;
  console.log(`${current === text ? 'unchanged' : 'wrote'} client/src/data/grading-rules.json: ${n.length} sections, ${n.reduce((s, x) => s + x.rules.length, 0)} rules`);
}
