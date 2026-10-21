#!/usr/bin/env node
// npm run content:format [-- file.json ...] — rewrites pack files in the house layout:
// one line per vocabulary item and sentence, exercises on up to three lines
// (identity / text / choices). Content is unchanged; only whitespace moves.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Single-line JSON with spaces: { "a": 1, "b": [ { "c": 2 } ] }. Strings go through JSON.stringify untouched.
function j(v) {
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    const inner = v.map(j).join(', ');
    return v.some((x) => x && typeof x === 'object') ? `[ ${inner} ]` : `[${inner}]`;
  }
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    return keys.length ? `{ ${keys.map((k) => `${JSON.stringify(k)}: ${j(v[k])}`).join(', ')} }` : '{}';
  }
  return JSON.stringify(v);
}
const inline = j;

const LINES = [
  ['type', 'id', 'items', 'sentenceId', 'listen', 'answerSide'],
  ['instruction', 'question', 'sentence', 'answer', 'hint', 'phrase'],
];

function exercise(ex, pad) {
  const used = new Set();
  const lines = LINES.map((keys) => keys.filter((k) => k in ex).map((k) => (used.add(k), `"${k}": ${inline(ex[k])}`)));
  lines.push(Object.keys(ex).filter((k) => !used.has(k)).map((k) => `"${k}": ${inline(ex[k])}`));
  const parts = lines.filter((l) => l.length).map((l) => l.join(', '));
  return `${pad}{ ${parts.join(`,\n${pad}  `)} }`;
}

export function formatPack(pack) {
  const out = [];
  out.push('{');
  const head = Object.keys(pack).filter((k) => k !== 'units');
  for (const k of head) out.push(`  "${k}": ${JSON.stringify(pack[k])},`);
  out.push('  "units": [');
  pack.units.forEach((unit, ui) => {
    out.push('    {');
    for (const k of Object.keys(unit).filter((x) => !['vocabulary', 'sentences', 'texts', 'lessons'].includes(x))) {
      out.push(`      "${k}": ${inline(unit[k])},`);
    }
    for (const list of ['vocabulary', 'sentences', 'texts']) {
      if (!unit[list]) continue;
      out.push(`      "${list}": [`);
      unit[list].forEach((item, i) => out.push(`        ${j(item)}${i < unit[list].length - 1 ? ',' : ''}`));
      out.push('      ],');
    }
    out.push('      "lessons": [');
    unit.lessons.forEach((lesson, li) => {
      out.push('        {');
      out.push(`          "id": ${JSON.stringify(lesson.id)},`);
      out.push(`          "title": ${j(lesson.title)},`);
      if (lesson.extra) out.push('          "extra": true,');
      out.push('          "exercises": [');
      lesson.exercises.forEach((ex, ei) => out.push(`${exercise(ex, '            ')}${ei < lesson.exercises.length - 1 ? ',' : ''}`));
      out.push('          ]');
      out.push(`        }${li < unit.lessons.length - 1 ? ',' : ''}`);
    });
    out.push('      ]');
    out.push(`    }${ui < pack.units.length - 1 ? ',' : ''}`);
  });
  out.push('  ]');
  out.push('}');
  return `${out.join('\n')}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2).length
    ? process.argv.slice(2)
    : JSON.parse(fs.readFileSync(path.join(root, 'content/packs/manifest.json'), 'utf8'))
      .tracks.flatMap((t) => t.packs).filter((p) => p.file && fs.existsSync(path.join(root, 'content/packs', p.file)))
      .map((p) => path.join(root, 'content/packs', p.file));
  for (const file of files) {
    const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
    const text = formatPack(pack);
    if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(pack)) throw new Error(`formatter changed content of ${file}`);
    fs.writeFileSync(file, text);
    console.log(`formatted ${path.relative(process.cwd(), file)}`);
  }
}
