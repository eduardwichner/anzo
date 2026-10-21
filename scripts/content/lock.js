#!/usr/bin/env node
// npm run content:lock [-- --reason "<why>"] [--packs <dir>] [--lock <file>]
// Without --reason: compare content/packs with content/ids.lock.json and report; exit 1 if a locked id disappeared or
// a locked exercise changed its type or items, or if the content has ids the lock does not know yet.
// With --reason: rewrite the lock from the current packs and append the reason (with what was added, removed or
// changed) to its history. Use it only deliberately: for new content, or for a change whose orphaned progress has been
// dealt with (npm run check:integrity on the live data).
import path from 'node:path';
import fs from 'node:fs';
import { ROOT } from './sources.js';
import { compareLock, formatLock, ID_KINDS, lockEntries, lockFailures, readLock, readPacks, updateLock } from './idlock.js';

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const packsDir = path.resolve(opt('--packs') ?? path.join(ROOT, 'content/packs'));
const lockFile = path.resolve(opt('--lock') ?? path.join(ROOT, 'content/ids.lock.json'));
const reason = opt('--reason');

const current = lockEntries(readPacks(packsDir));
const lock = readLock(lockFile);
const count = (entries) => Object.values(entries).reduce((n, e) => n + ID_KINDS.reduce((k, kind) => k + (e[kind]?.length ?? 0), 0) + Object.keys(e.exercises).length, 0);

if (args.includes('--reason')) {
  if (!reason || reason.startsWith('--') || !reason.trim()) {
    console.error('content:lock: --reason needs a text, e.g. --reason "fr-a2 u31 added"');
    process.exit(2);
  }
  const next = updateLock(lock, current, { reason, date: new Date().toISOString().slice(0, 10) });
  fs.writeFileSync(lockFile, formatLock(next));
  const h = next.history[next.history.length - 1];
  console.log(`wrote ${path.relative(process.cwd(), lockFile)}: ${count(current)} ids in ${Object.keys(current).length} packs`);
  console.log(`  reason: ${h.reason}; added ${h.added}, removed ${h.removed.length}, changed ${h.changed.length}`);
  process.exit(0);
}

if (!lock) {
  console.error(`content:lock: ${path.relative(process.cwd(), lockFile)} does not exist; create it with --reason "<why>"`);
  process.exit(1);
}
const diff = compareLock(lock, current);
const failures = lockFailures(diff);
for (const f of failures) console.error(`  ${f}`);
for (const [packId, e] of Object.entries(current)) {
  const texts = e.texts ? `, ${e.texts.length} texts, ${e.segments.length} text sentences/turns, ${e.questions.length} questions, ${Object.keys(e.textExercises).length} text exercises` : '';
  console.log(`${packId}: ${e.units.length} units, ${e.lessons.length} lessons, ${e.items.length} items, ${Object.keys(e.exercises).length} exercises${texts}`);
}
if (diff.unlocked.length) {
  console.error(`${diff.unlocked.length} id(s) not in the lock yet (e.g. ${diff.unlocked.slice(0, 5).join(', ')}): `
    + 'lock them with npm run content:lock -- --reason "<why>"');
}
if (failures.length || diff.unlocked.length) {
  if (failures.length) console.error(`content:lock FAILED: ${failures.length} locked id(s) removed or changed. Restore them, or (deliberately) --reason.`);
  process.exit(1);
}
console.log(`content:lock OK: ${count(current)} ids match the lock (${lock.history.length} lock update(s))`);
