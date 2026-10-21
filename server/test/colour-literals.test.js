// Every colour of the client is a token in client/src/styles/tokens.css, which has a light and a
// dark value. This test fails on a colour literal anywhere else in client/src — a hex colour, rgb()/hsl(), or a named
// colour in a colour property or SVG paint attribute — except in the files of client/colour-literals.allow.json.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../..', import.meta.url).pathname;
const SRC = join(ROOT, 'client/src');
const TOKENS = 'client/src/styles/tokens.css';
const allow = JSON.parse(readFileSync(join(ROOT, 'client/colour-literals.allow.json'), 'utf8'));

const NAMED = 'white|black|red|green|blue|gray|grey|orange|yellow|purple|pink|silver|navy|maroon|teal|olive|lime|aqua|fuchsia|brown|gold';
const RULES = [
  { name: 'hex colour', re: /#[0-9a-fA-F]{3,8}\b/g },
  { name: 'rgb()/hsl()', re: /\b(?:rgba?|hsla?)\(/g },
  // a named colour as a CSS colour value, or as an SVG paint / colour attribute or style value
  { name: 'named colour', re: new RegExp(`(?:color|background|fill|stroke|border(?:-[a-z]+)?|outline|shadow)(?:-color)?\\s*[:=]\\s*\\{?\\s*['"]?(?:${NAMED})\\b`, 'gi') },
];

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(css|jsx?|svg)$/.test(e.name) ? [p] : [];
  });
}

/** Comments are no colours: strip block and line comments (keeping line numbers). */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

export function colourLiterals() {
  const found = [];
  for (const file of files(SRC)) {
    const rel = relative(ROOT, file);
    if (rel === TOKENS || allow.files[rel]) continue;
    const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      for (const { name, re } of RULES) {
        for (const m of line.matchAll(re)) found.push(`${rel}:${i + 1}: ${name} ${m[0]}`);
      }
    });
  }
  return found;
}

describe('colour literals', () => {
  it('every colour outside the allow-list is a token of tokens.css', () => {
    expect(colourLiterals()).toEqual([]);
  });

  it('the allow-list names files that exist and gives a reason for each', () => {
    for (const [file, why] of Object.entries(allow.files)) {
      expect(() => readFileSync(join(ROOT, file))).not.toThrow();
      expect(why.length).toBeGreaterThan(20);
    }
  });

  it('the check finds a literal (a planted one in a temporary copy of the rules)', () => {
    const sample = '.x { color: #fff; background: rgba(0, 0, 0, 0.1); border-color: white; }\n<path fill="red" />';
    const hits = RULES.flatMap(({ re }) => [...stripComments(sample).matchAll(re)]);
    expect(hits.length).toBe(4);
    expect([...stripComments('/* #fff */ // #000').matchAll(RULES[0].re)].length).toBe(0);
  });

  it('every dark-theme token overrides a token the light theme defines', () => {
    const css = readFileSync(join(ROOT, TOKENS), 'utf8');
    const block = (sel) => css.slice(css.indexOf(sel)).split('}')[0];
    const names = (text) => [...text.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
    const light = new Set(names(block(':root {')));
    const dark = names(block(":root[data-theme='dark'] {"));
    expect(dark.length).toBeGreaterThan(30);
    expect(dark.filter((n) => !light.has(n))).toEqual([]);
  });
});
