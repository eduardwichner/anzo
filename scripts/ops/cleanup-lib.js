// The weekly cleanup's patterns (scripts/ops/cleanup.js). Only entries directly in /tmp that match one of these, and are
// older than 2 days, are removed — nothing else, ever (server/test/ops.test.js checks names that must never match).
export const TMP_PATTERNS = [
  // workbox's staging folder from every `npm run build`: /tmp/<32 hex>/ holding sw.js
  { id: 'workbox', name: /^[0-9a-f]{32}$/, dir: true, contains: 'sw.js' },
  // Vitest's SSR cache: /tmp/<random>/ssr
  { id: 'vitest', name: /^[A-Za-z0-9_-]{6,}$/, dir: true, contains: 'ssr', only: true },
  { id: 'playwright-cache', name: /^playwright-transform-cache-\d+$/, dir: true },
  { id: 'node-compile-cache', name: /^node-compile-cache$/, dir: true },
  { id: 'mat-debug', name: /^mat-debug-\d+\.log$/, dir: false },
  { id: 'pulse', name: /^pulse-[A-Za-z0-9]+$/, dir: true },
  { id: 'ses', name: /^\.ses$/, dir: false },
  // Chromium's shared-memory leftovers of the e2e runs
  { id: 'chromium', name: /^\.org\.chromium\.Chromium\.[A-Za-z0-9]+$/, dir: null },
  // Anzo's own scratch dirs: tests, the content job's render temp, archives, restores
  // (every prefix the unit tests use: ops.test.js finds them in server/test and scripts —)
  { id: 'anzo-scratch', name: /^anzo-(api|reload|job|jobint|lock|mig|audio|render|integrity|full|restore-test|restore-work|e2e|backup|compl|courses|fr|gen|hardening|preview|sec|strength|trace-nl|users|validate|family|lab|listen|rerecord|compare|target|theme|robust|deploy|fetch)(-[A-Za-z0-9]+)*$/, dir: null },
  { id: 'anzo-integrity-copy', name: /^anzo-integrity-\d+-\d+\.sqlite(-wal|-shm)?$/, dir: false },
];

export const MAX_AGE_MS = 2 * 86_400_000;
export const SPOOL_MAX_AGE_MS = 90 * 86_400_000;

/**
 * The pattern an entry of /tmp matches, or null.
 * @param entry { name, isDir, children?: string[] (for directories) }
 */
export function matchTmp(entry) {
  for (const p of TMP_PATTERNS) {
    if (!p.name.test(entry.name)) continue;
    if (p.dir === true && !entry.isDir) continue;
    if (p.dir === false && entry.isDir) continue;
    if (p.contains) {
      const kids = entry.children ?? [];
      if (!kids.includes(p.contains)) continue;
      if (p.only && kids.length !== 1) continue;
    }
    return p.id;
  }
  return null;
}
