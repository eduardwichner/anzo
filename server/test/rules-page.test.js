// Admin → What counts as correct. The page's content comes from docs/grading-rules.md section 8 only:
// the committed JSON must be what `npm run docs:rules` compiles from it, every rule has both interface languages, and every
// example grades exactly as its `result` says — so the page can never promise what the grader does not do.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { grade } from '../src/content/grading.js';
import { loadContent, knownWordsOf } from '../src/content/loader.js';
import { OUT, parseRules, rulesJson } from '../../scripts/docs-rules.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const content = loadContent({ contentDir: path.join(ROOT, 'content') });
const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const rules = data.sections.flatMap((s) => s.rules.map((r) => ({ ...r, section: s.id })));

/** The example as an exercise the grader knows, and the grade it gets. */
function gradeExample({ track, kind, expected, typed }) {
  const opts = { track, nativeLang: 'nl', knownWords: knownWordsOf(content, track) };
  switch (kind) {
    case 'typed': return grade({ type: 'fill_blank', id: 'x', sentence: '___', answer: expected }, typed, opts);
    case 'dictation': return grade({ type: 'listen_type', id: 'x', answer: expected }, typed, opts);
    case 'build': {
      const tokens = expected.toLowerCase().replace(/[.!?,;:]/g, '').split(/\s+/).filter(Boolean);
      return grade({ type: 'build_sentence', id: 'x', answer: expected, tokens, distractors: [] }, typed.split(/\s+/), opts);
    }
    case 'pairs': return grade({ type: 'match_pairs', id: 'x', pairs: [] }, { mistakes: Number(typed) }, opts);
    default: throw new Error(kind);
  }
}
const resultOf = (g) => (!g.correct ? 'wrong' : g.note ?? 'right');

describe('the rules page and docs/grading-rules.md', () => {
  it('client/src/data/grading-rules.json is compiled from section 8 (npm run docs:rules)', () => {
    expect(fs.readFileSync(OUT, 'utf8')).toBe(rulesJson());
  });
  it('8–10 sections, each rule in English and Dutch, with an example', () => {
    expect(data.sections.length).toBeGreaterThanOrEqual(8);
    expect(data.sections.length).toBeLessThanOrEqual(10);
    for (const s of data.sections) expect(s.title.en && s.title.nl, s.id).toBeTruthy();
    for (const r of rules) {
      expect(r.text.en, r.id).toMatch(/\S/);
      expect(r.text.nl, r.id).toMatch(/\S/);
      expect(r.text.en, r.id).not.toBe(r.text.nl);
    }
    // every course language has rules of its own
    for (const l of ['en', 'fr', 'nl']) expect(rules.some((r) => r.langs.includes(l)), l).toBe(true);
  });
  for (const r of rules) {
    it(`${r.section}/${r.id}: "${r.example.typed}" for "${r.example.expected}" (${r.example.track}, ${r.example.kind}) is ${r.example.result}`, () => {
      expect(resultOf(gradeExample(r.example))).toBe(r.example.result);
    });
  }
  it('a malformed section 8 is refused', () => {
    expect(() => parseRules('# x\n')).toThrow(/no section/);
    expect(() => parseRules('# x\n\n## 8. Page\n\n### a | A | B\n\n| id | lang | track | en | nl | kind | expected | typed | result |\n|---|\n| r | xx | en | e | n | typed | a | b | right |\n'))
      .toThrow(/lang "xx"/);
  });
});
