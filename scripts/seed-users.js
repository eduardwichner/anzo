#!/usr/bin/env node
// npm run seed — creates the seed accounts if they don't exist: config/seed.local.json (this installation's own, gitignored),
// else config/seed.example.json (generic: kid1, kid2, admin); ANZO_SEED_FILE names another file.
// Idempotent: existing accounts and their passwords are never changed.
// --account '<json>' creates one more account the same way (never changing an existing one), e.g. an adult learner:
//   {"username":"…","password":"…","role":"child","display_name":"…","native_lang":"en","ui_lang":"en","audience":"adult",
//    "avatar":"fox","avatar_bg":"sky","show_on_login":1,"courses":[{"track":"nl","startPack":"nl-a2"}]}
// The password may be left out and given as ANZO_SEED_PASSWORD (not on the command line). The account rules of
// Admin → Users apply (username, password length, languages, avatar); an admin must change the password at first login.
// Its courses must be offered for its native language and its start level an available pack of that course (manifest).
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../server/src/config.js';
import { openDb, runMigrations } from '../server/src/db/index.js';
import { seedUsers } from '../server/src/lib/users.js';
import { readSeedFile, seedFile, seedProblems } from '../server/src/lib/seed.js';
import { checkSeedAccount } from '../server/src/lib/courses.js';

const config = loadConfig();
const k = process.argv.indexOf('--account');
let users = readSeedFile(seedFile());
const seedIssues = await seedProblems(users, JSON.parse(fs.readFileSync(path.join(config.contentDir, 'packs', 'manifest.json'), 'utf8')));
if (k < 0 && seedIssues.length) {
  console.error(`${seedFile()}: ${seedIssues.join('; ')}`);
  process.exit(1);
}
if (k > -1) {
  const account = JSON.parse(process.argv[k + 1] ?? '');
  // the password may come from the environment instead of the command line (ps, shell history): ANZO_SEED_PASSWORD
  if (!account.password && process.env.ANZO_SEED_PASSWORD) account.password = process.env.ANZO_SEED_PASSWORD;
  // an admin created here must replace the password at the first login, like one created in Admin → Users
  if (account.role === 'admin') account.must_change_password = 1;
  const manifest = JSON.parse(fs.readFileSync(path.join(config.contentDir, 'packs', 'manifest.json'), 'utf8'));
  const problem = checkSeedAccount(manifest, account);
  if (problem) {
    console.error(`--account: ${problem}`);
    process.exit(1);
  }
  users = [account];
}
const db = openDb(config.dataDir);
runMigrations(db);
const created = seedUsers(db, users);
console.log(created.length ? `Created users: ${created.join(', ')}` : 'All seed users already exist; nothing changed.');
db.close();
