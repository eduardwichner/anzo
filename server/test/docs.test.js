// The docs: every Markdown link in a tracked file resolves to a tracked file (so no public file links to a local-only one),
// and no local-only document is tracked. (The installation that develops Anzo checks its own notes in a local test.)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LOCAL_DOCS } from '../../scripts/ops/archive-lib.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tracked = (() => {
  try {
    return execFileSync('git', ['-c', `safe.directory=${root}`, '-C', root, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  } catch {
    return null; // not a git checkout
  }
})();

/** Every [text](target) of a Markdown text, outside code blocks and inline code: { target, line }. */
export function markdownLinks(text) {
  const links = [];
  let fenced = false;
  text.split('\n').forEach((raw, i) => {
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const line = raw.replace(/`[^`]*`/g, '');
    for (const m of line.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) links.push({ target: m[1], line: i + 1 });
  });
  return links;
}

/** A link to a file in the repository (not a web address, a mail link or an anchor in the same page): its path, else null. */
export function repoTarget(from, target) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#') || target.startsWith('//')) return null;
  const file = decodeURI(target.split('#')[0].split('?')[0]);
  if (!file) return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(from), file)).replace(/\/$/, '');
}

describe('Markdown links', () => {
  it('finds links, ignores code, web addresses and anchors', () => {
    const md = '[a](docs/x.md) ![img](images/p.png "t") `[no](code.md)`\n```\n[no](fenced.md)\n```\n[w](https://x.org) [h](#top) [b](../y.md#part)';
    expect(markdownLinks(md).map((l) => l.target)).toEqual(['docs/x.md', 'images/p.png', 'https://x.org', '#top', '../y.md#part']);
    expect(repoTarget('docs/guide.md', '../y.md#part')).toBe('y.md');
    expect(repoTarget('docs/guide.md', 'developer/')).toBe('docs/developer');
    expect(repoTarget('README.md', 'https://x.org')).toBeNull();
    expect(repoTarget('README.md', '#top')).toBeNull();
  });

  it.skipIf(!tracked)('every link in a tracked Markdown file resolves to a tracked file or folder', () => {
    const files = new Set(tracked);
    const folders = new Set(tracked.flatMap((f) => f.split('/').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('/'))));
    const broken = [];
    for (const f of tracked.filter((x) => x.endsWith('.md'))) {
      for (const { target, line } of markdownLinks(fs.readFileSync(path.join(root, f), 'utf8'))) {
        const to = repoTarget(f, target);
        if (to !== null && !files.has(to) && !folders.has(to)) broken.push(`${f}:${line} → ${target}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it.skipIf(!tracked)('no local-only document is tracked', () => {
    const local = tracked.filter((f) => LOCAL_DOCS.some((p) => f === p || f.startsWith(`${p}/`)) || f.startsWith('content/reference/'));
    expect(local).toEqual([]);
  });
});
