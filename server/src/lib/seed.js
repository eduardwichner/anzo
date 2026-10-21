// Seed accounts (publication readiness): config/seed.local.json — this installation's own accounts, gitignored —
// or else config/seed.example.json (committed: generic accounts kid1, kid2, admin). ANZO_SEED_FILE names another file (the
// tests and the e2e server use the example, whatever this machine has). Seeding only adds accounts that do not exist (an
// empty database at startup, or npm run seed); it never changes the live accounts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const SEED_EXAMPLE = path.join(ROOT, 'config/seed.example.json');
export const SEED_LOCAL = path.join(ROOT, 'config/seed.local.json');

const USERNAME = /^[a-z0-9_-]{2,24}$/;

/** The seed file's accounts as user rows ({ username, password, role, display_name, courses, … }); throws on a bad file. */
export function parseSeed(json, file = 'seed file') {
  const accounts = json?.accounts;
  if (!Array.isArray(accounts) || !accounts.length) throw new Error(`${file}: "accounts" must be a non-empty list`);
  const seen = new Set();
  return accounts.map((a, i) => {
    const where = `${file}: account ${i + 1}`;
    if (!USERNAME.test(a?.username ?? '')) throw new Error(`${where}: username must match ${USERNAME}`);
    if (seen.has(a.username)) throw new Error(`${where}: ${a.username} twice`);
    seen.add(a.username);
    if (!['child', 'admin'].includes(a.role)) throw new Error(`${where}: role must be child or admin`);
    if (typeof a.password !== 'string' || a.password.length < 4) throw new Error(`${where}: a password of at least 4 characters`);
    if (typeof a.displayName !== 'string' || !a.displayName.trim()) throw new Error(`${where}: displayName is required`);
    const courses = a.courses ?? [];
    if (!Array.isArray(courses)) throw new Error(`${where}: courses must be a list`);
    const row = {
      username: a.username, password: a.password, role: a.role, display_name: a.displayName.trim(), courses,
      avatar: a.avatar ?? 'owl', avatar_bg: a.avatarBg ?? 'sky',
      ...(a.uiLang ? { ui_lang: a.uiLang } : {}), ...(a.nativeLang ? { native_lang: a.nativeLang } : {}),
      ...(a.audience ? { audience: a.audience } : {}),
      // an admin always changes a seeded password at the first login (the rule of the example file)
      must_change_password: a.role === 'admin' || a.mustChangePassword ? 1 : 0,
      ...(a.showOnLogin !== undefined ? { show_on_login: a.showOnLogin ? 1 : 0 } : {}),
    };
    return row;
  });
}

export function readSeedFile(file) {
  return parseSeed(JSON.parse(fs.readFileSync(file, 'utf8')), path.basename(file));
}

/** The file this installation seeds from: ANZO_SEED_FILE, else config/seed.local.json when it exists, else the example. */
export function seedFile(env = process.env) {
  if (env.ANZO_SEED_FILE) return path.resolve(env.ANZO_SEED_FILE);
  return fs.existsSync(SEED_LOCAL) ? SEED_LOCAL : SEED_EXAMPLE;
}

/**
 * The account rules of Admin → Users for every seed account (`checkSeedAccount`, as for `npm run seed -- --account`):
 * a typo in config/seed.local.json is refused with a message instead of a crash at the first start. One exception: a seeded
 * admin's first password may be short — it must be changed at the first login anyway. Returns the problems ([] = fine).
 */
export async function seedProblems(rows, manifest) {
  const { checkSeedAccount } = await import('./courses.js');
  const out = [];
  for (const r of rows) {
    const p = checkSeedAccount(manifest, r);
    if (p && !(r.role === 'admin' && /^password:/.test(p))) out.push(`${r.username}: ${p}`);
  }
  return out;
}

/** The generic accounts of config/seed.example.json (the unit tests' default). */
export const EXAMPLE_ACCOUNTS = readSeedFile(SEED_EXAMPLE);
