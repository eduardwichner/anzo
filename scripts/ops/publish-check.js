#!/usr/bin/env node
// npm run publish:check — before this repository is pushed anywhere (a private remote, or one day a public one). Read-only.
// It checks the WORKING TREE — every tracked file and every untracked file that is not ignored (it would be added), as it is
// on disk — for: secrets (keys, tokens, a real SESSION_SECRET, password hashes, a committed .env), files that must never be
// published (the reference PDFs and their extracted text, the derived word lists, recordings, voices, databases, the local
// seed file), personal data (the names of this installation's real accounts — config/seed.local.json and the optional
// config/publish.local.json —, its domain, private LAN addresses, personal e-mail addresses). Exit 1 when one is found.
// Names inside the lesson content (characters such as "Anna" in the Cambridge material) are listed, not counted: changing a
// lesson is a content release (docs/operator-guide.md, "Version history (git)"). The git HISTORY is scanned too and reported: it still holds what the
// working tree no longer has, so a public repository is pushed from a fresh history (docs/operator-guide.md); `--history` makes
// those findings fail the check as well.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const SECRET_PATTERNS = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}/],
  ['GitLab token', /\bglpat-[A-Za-z0-9_-]{20,}\b/],
  ['API key (sk-…)', /\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}\b/],
  ['Slack token', /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
  ['bcrypt password hash', /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/],
  ['SESSION_SECRET value', /SESSION_SECRET\s*=\s*(?!change-me|\$|<|"?\$\(|$)[0-9a-f]{32,}/i],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['URL with a password', /https?:\/\/[^\s/:@]+:[^\s/@]{6,}@/],
];
export const EMAIL = /\b[A-Za-z0-9._%+-]+@(?:gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|proton|protonmail|ziggo|kpnmail|xs4all|planet|telenet|skynet|proximus)\.[a-z.]{2,6}\b/i;
/**
 * A private address: RFC 1918, carrier-grade NAT / VPN overlays (100.64/10), link-local (169.254/16), IPv6 unique-local (fc/fd) and
 * link-local (fe80) — the documentation uses 192.0.2.x, 198.51.100.x, 203.0.113.x (RFC 5737) instead.
 */
export const PRIVATE_IP = /\b(?:10\.(?:\d{1,3}\.){2}\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|f[cd][0-9a-f]{2}:[0-9a-f]{0,4}:[0-9a-f:]*|fe80::[0-9a-f:]+)\b/i;

/** Paths that must never be in a published tree, with the reason. */
export const NEVER = [
  [/^content\/reference\//, 'reference material (copyright of its publishers), text extracted from it, or its local guide'],
  [/^CLAUDE\.md$|^docs\/(gotchas|README-private|publishing)\.md$|^docs\/review\/|^content\/review\/|^content\/STATUS\.md$|^server\/test\/local-[^/]*\.test\.js$/,
    'a local-only document (the installation\'s notes, the development history, the working papers)'],
  [/^audio\//, 'recordings (made on the server from the lessons)'],
  [/^models\/(?!README\.md$|manifest\.json$)/, 'voices and speech models (downloaded by scripts/fetch-models.sh)'],
  [/^tools\/[^/]+-venv\//, 'Python environments'],
  [/(^|\/)\.env$|(^|\/)\.env\.(?!example$)/, 'an environment file (secrets)'],
  [/^data(-dev)?\//, 'the database'],
  [/\.sqlite(-wal|-shm)?$|\.sqlite\.gz$/, 'a database file'],
  [/^config\/seed\.local\.json$|^config\/publish\.local\.json$/, "this installation's own accounts or values"],
  [/^e2e\/screenshots\/|^e2e\/test-results\//, 'test output'],
];

/** The lesson content: names there are lesson characters (listed, not counted). */
export const isLessonContent = (file) => /^content\/(packs|src)\/|^content\/(pronunciations|audio-overrides|ids\.lock)\.json$/.test(file);

const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * What counts as personal for this installation: the usernames and display names of the learner accounts in
 * config/seed.local.json, the names, domains and hosts of config/publish.local.json, and the host of ANZO_PUBLIC_URL in
 * .env. Both files are gitignored; on a clone without them only the generic checks run (said in the report).
 */
export function personalTerms(root = ROOT, { useDb = false } = {}) {
  const names = new Set();
  const domains = new Set();
  const seed = readJson(path.join(root, 'config/seed.local.json'));
  for (const a of seed?.accounts ?? []) {
    if (a.role === 'admin') continue;
    names.add(String(a.username).toLowerCase());
    if (a.displayName) names.add(String(a.displayName).toLowerCase());
  }
  const local = readJson(path.join(root, 'config/publish.local.json'));
  for (const n of local?.names ?? []) names.add(String(n).toLowerCase());
  for (const d of local?.domains ?? []) domains.add(String(d).toLowerCase());
  try {
    const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
    for (const m of env.matchAll(/^ANZO_(?:PUBLIC|LAN)_URL\s*=\s*\S*?:\/\/([^/:\s]+)/gm)) {
      if (/^\d/.test(m[1])) continue;
      const host = m[1].toLowerCase();
      domains.add(host);
      // the registrable domain too (anzo.example.org → example.org): other hosts on it and the bare domain
      const labels = host.split('.');
      if (labels.length > 2) domains.add(labels.slice(-2).join('.'));
    }
  } catch { /* no .env: a clone */ }
  // every learner of the live database (accounts added in Admin → Users), read-only, when this user may
  let db = false;
  if (useDb) {
    try {
      const out = execFileSync('sudo', ['-n', '-u', 'anzo', 'sqlite3', '-readonly', '-separator', '\t', path.join(root, 'data/anzo.sqlite'),
        "SELECT username, display_name FROM users WHERE role = 'child'"], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000 });
      for (const line of out.split('\n').filter(Boolean)) for (const n of line.split('\t')) if (n.trim().length >= 3) names.add(n.trim().toLowerCase());
      db = true;
    } catch { /* not readable here (a clone, or no sudo): the files only */ }
  }
  return { names: [...names], domains: [...domains], sources: { seed: Boolean(seed), local: Boolean(local), db } };
}

/** Test files whose fake secrets are what the test checks (the diagnostics' redaction must remove them). */
export const SECRET_SAMPLES = { 'server/test/ops.test.js': "fake keys and tokens that the diagnostics' redaction must remove" };

/**
 * What may look like a real name: config/publish.local.json → allow (gitignored, the installation's own):
 * { lessonNames: { name: why }, files: { file: { names, why } } }. Without it nothing is allowed beyond the generic checks.
 */
export function allowList(root = ROOT) {
  const a = readJson(path.join(root, 'config/publish.local.json'))?.allow ?? {};
  return { lessonNames: Object.keys(a.lessonNames ?? {}).map((n) => n.toLowerCase()), files: a.files ?? {}, secretSamples: SECRET_SAMPLES };
}

const wordRe = (w) => new RegExp(`(?<![\\p{L}\\p{N}_])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'iu');

/**
 * Check one file's text (pure; unit-tested). Returns [{ kind: secret|email|ip|domain|name, line, text, lesson }].
 * `terms`: personalTerms(); `allowNames`: the names this file may contain (allowList().files[file].names).
 */
export function scanText(file, text, { terms = { names: [], domains: [] }, allowNames = [], secretSamples = {} } = {}) {
  const out = [];
  // a file may name only what the allow-list grants it, as a whole (never a phrase that could hide a name elsewhere)
  const nameRes = terms.names.filter((n) => !allowNames.includes(n)).map((n) => [n, wordRe(n)]);
  const lesson = isLessonContent(file);
  text.split('\n').forEach((line, i) => {
    const at = { file, line: i + 1, text: line.trim().slice(0, 140) };
    if (!secretSamples[file]) for (const [label, re] of SECRET_PATTERNS) if (re.test(line)) out.push({ ...at, kind: 'secret', what: label });
    if (EMAIL.test(line)) out.push({ ...at, kind: 'email', what: line.match(EMAIL)[0] });
    if (PRIVATE_IP.test(line)) out.push({ ...at, kind: 'ip', what: line.match(PRIVATE_IP)[0] });
    const lower = line.toLowerCase();
    for (const d of terms.domains) if (lower.includes(d)) out.push({ ...at, kind: 'domain', what: d });
    for (const [n, re] of nameRes) if (re.test(lower)) out.push({ ...at, kind: 'name', what: n, lesson });
  });
  return out;
}

export function neverReason(file) {
  return NEVER.find(([re]) => re.test(file))?.[1] ?? null;
}

/** The patterns themselves, their test samples, and the allow-list: never scanned (they name what they look for). */
export const SELF_FILES = ['scripts/ops/publish-check.js', 'server/test/publish-check.test.js'];

/**
 * What the history's added lines hold (pure; unit-tested): `log` is `git log -p --unified=0`. The same rules per file as the
 * working tree: a file's allowed names (config/publish.allow.json → files), a test file's sample secrets, the
 * self files skipped; lesson content is not scanned (its names are listed by the working-tree check).
 */
export function scanHistoryPatch(log, { terms = { names: [], domains: [] }, allowFiles = {}, lessonNames = [], secretSamples = {} } = {}) {
  const history = { names: new Set(), domains: new Set(), ips: 0, secrets: 0, emails: 0, never: new Set() };
  let file = '';
  let skip = false;
  let nameRes = [];
  for (const line of log.split('\n')) {
    if (line.startsWith('+++ b/')) {
      file = line.slice(6);
      if (neverReason(file)) history.never.add(file);
      skip = SELF_FILES.includes(file) || isLessonContent(file);
      const allow = [...(allowFiles[file]?.names ?? []).map((n) => n.toLowerCase()), ...lessonNames.filter(() => isLessonContent(file))];
      nameRes = terms.names.filter((n) => !allow.includes(n)).map((n) => [n, wordRe(n)]);
    } else if (line.startsWith('+') && !line.startsWith('+++') && !skip) {
      if (!secretSamples[file] && SECRET_PATTERNS.some(([, re]) => re.test(line))) history.secrets += 1;
      if (EMAIL.test(line)) history.emails += 1;
      if (PRIVATE_IP.test(line)) history.ips += 1;
      const lower = line.toLowerCase();
      for (const d of terms.domains) if (lower.includes(d)) history.domains.add(d);
      for (const [n, re] of nameRes) if (re.test(lower)) history.names.add(n);
    }
  }
  return history;
}

// ---- the run ---------------------------------------------------------------------------------------------------------
function main() {
  const strictHistory = process.argv.includes('--history');
  const strictPublic = process.argv.includes('--public');
  const terms = personalTerms(ROOT, { useDb: true });
  const { lessonNames, files: allowFiles, secretSamples } = allowList();
  const tracked = git('ls-files', '-z').split('\0').filter(Boolean);
  const untracked = git('ls-files', '-z', '--others', '--exclude-standard').split('\0').filter(Boolean);
  const files = [...tracked, ...untracked].filter((f) => fs.existsSync(path.join(ROOT, f)));
  const never = [];
  const hits = [];
  for (const f of files) {
    const why = neverReason(f);
    if (why) never.push(`${f}: ${why}`);
    const full = path.join(ROOT, f);
    const st = fs.statSync(full);
    if (!st.isFile() || st.size > 8 * 1024 * 1024) continue;
    const buf = fs.readFileSync(full);
    if (buf.includes(0)) continue; // binary
    // the patterns themselves, their test samples, and the list of allowed lesson phrases
    if (SELF_FILES.includes(f)) continue;
    const allowNames = [...(allowFiles[f]?.names ?? []).map((n) => n.toLowerCase()), ...(isLessonContent(f) ? lessonNames : [])];
    hits.push(...scanText(f, buf.toString('utf8'), { terms, allowNames, secretSamples }));
  }
  const of = (kind, lesson = false) => hits.filter((h) => h.kind === kind && Boolean(h.lesson) === lesson);

  // the history: what the old commits still hold (reported; a public push uses a fresh history)
  const log = git('log', '--all', '-p', '--no-color', '--no-ext-diff', '--format=@@commit %h', '--unified=0');
  const history = scanHistoryPatch(log, { terms, allowFiles, lessonNames, secretSamples });
  const nameRes = terms.names.map((n) => [n, wordRe(n)]);
  for (const a of git('log', '--all', '--format=%ae%n%ce').split('\n').filter(Boolean)) if (EMAIL.test(a)) history.emails += 1;
  // commit messages and file paths too
  for (const line of `${git('log', '--all', '--format=%B')}\n${git('log', '--all', '--name-only', '--format=')}`.split('\n')) {
    const lower = line.toLowerCase();
    for (const d of terms.domains) if (lower.includes(d)) history.domains.add(d);
    for (const [n, re] of nameRes) if (re.test(lower)) history.names.add(n);
    if (PRIVATE_IP.test(line)) history.ips += 1;
  }

  const say = (s = '') => console.log(s);
  say(`publish:check — working tree: ${tracked.length} tracked + ${untracked.length} untracked files; history: ${git('rev-list', '--all', '--count').trim()} commits\n`);
  say(`Personal terms from ${[terms.sources.seed && 'config/seed.local.json', terms.sources.local && 'config/publish.local.json', terms.sources.db && 'the live database', terms.domains.length && '.env'].filter(Boolean).join(', ') || 'nothing (no local seed file, no .env, no database: only the generic checks run)'}: `
    + `${terms.names.length} name(s), ${terms.domains.length} domain(s)\n`);
  const show = (h) => `${h.file}:${h.line}: ${h.what} — ${h.text}`;
  const block = (title, list, okText) => {
    say(`${list.length ? '✗' : '✓'} ${title}${list.length ? ` (${list.length})` : `: ${okText}`}`);
    for (const x of list.slice(0, 25)) say(`    ${typeof x === 'string' ? x : show(x)}`);
    if (list.length > 25) say(`    … and ${list.length - 25} more`);
  };
  const failed = [];
  const check = (title, list, okText) => {
    block(title, list, okText);
    if (list.length) failed.push(title);
  };
  check('Files that are never published (reference material, recordings, voices, databases, .env, local seed)', never, 'none');
  check('Secrets (keys, tokens, SESSION_SECRET, password hashes)', of('secret'), 'none found');
  check('Personal e-mail addresses', of('email'), 'none found');
  check('Private LAN addresses (use 192.0.2.x / 198.51.100.x / 203.0.113.x in docs and tests)', of('ip'), 'none found');
  check(`This installation's domain (${terms.domains.join(', ') || 'none known'})`, of('domain'), 'none found');
  check(`Real account names (${terms.names.join(', ') || 'none known'})`, of('name'), 'none outside the lesson content');
  // a real name in the lessons (not a character of the material: config/publish.local.json → allow.lessonNames) — a content release
  const inLessons = of('name', true);
  if (inLessons.length) {
    say(`✗ For a public repository: real names in the lesson content (${inLessons.length} line(s); a content release changes them):`);
    const byName = {};
    for (const h of inLessons) (byName[h.what] ??= []).push(`${h.file}:${h.line}`);
    for (const [n, where] of Object.entries(byName)) say(`    ${n}: ${where.length} line(s), e.g. ${where.slice(0, 3).join(', ')}`);
    if (strictPublic) failed.push('real names in the lesson content');
  }
  say('');
  const hist = [
    history.names.size && `names (${[...history.names].join(', ')})`, history.domains.size && `the domain (${[...history.domains].join(', ')})`,
    history.ips && `${history.ips} line(s) with private addresses`, history.secrets && `${history.secrets} line(s) that look like secrets`,
    history.emails && `${history.emails} e-mail address(es)`, history.never.size && `${history.never.size} file(s) that are never published`,
  ].filter(Boolean);
  if (hist.length) {
    say(`History: the old commits still hold ${hist.join('; ')}. A public repository must be pushed from a fresh history (one new`);
    say('  initial commit of this tree; keep the old one as a git bundle): docs/operator-guide.md → "Version history (git)". A private one may take the history, but the fresh one is recommended.');
    if (strictHistory) failed.push('history');
  } else say('History: clean.');
  say('');
  if (failed.length) say(`VERDICT: NOT ready — ${failed.length} check(s) failed: ${failed.join('; ')}.`);
  else {
    say(`VERDICT (private repository): the working tree is ready${hist.length ? ' — from a fresh history recommended (see above)' : ''}.`);
    say(`VERDICT (public repository): ${inLessons.length || hist.length ? `NOT ready — ${[inLessons.length && 'real names in the lesson content', hist.length && 'push a fresh history'].filter(Boolean).join('; ')} (npm run publish:check -- --public --history makes these fail)` : 'ready'}.`);
  }
  process.exit(failed.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
