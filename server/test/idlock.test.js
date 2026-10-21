// content/ids.lock.json: no locked id may disappear and no locked exercise may change its type or items.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  compareLock, formatLock, lockEntries, lockFailures, readLock, readPacks, updateLock,
} from '../src/content/idlock.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PACKS_DIR = path.join(root, 'content/packs');
const LOCK_FILE = path.join(root, 'content/ids.lock.json');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-lock-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const pack = () => ({
  id: 'en-x', units: [{
    id: 'en-x-u01',
    vocabulary: [{ id: 'en.cat' }, { id: 'en.dog' }],
    sentences: [{ id: 'en-x-u01-s01' }],
    lessons: [{
      id: 'en-x-u01-l01',
      exercises: [
        { id: 'en-x-u01-l01-e01', type: 'multiple_choice', items: ['en.cat'] },
        { id: 'en-x-u01-l01-e02', type: 'match_pairs', items: ['en.cat', 'en.dog'] },
      ],
    }],
  }],
});
const lockOf = (p) => updateLock(null, lockEntries([p]), { reason: 'test', date: '2026-10-02' });

describe('id lock', () => {
  it('the committed lock holds for the current packs: nothing removed, nothing changed, nothing unlocked', () => {
    const lock = readLock(LOCK_FILE);
    expect(lock, 'content/ids.lock.json exists').toBeTruthy();
    const diff = compareLock(lock, lockEntries(readPacks(PACKS_DIR)));
    expect(lockFailures(diff)).toEqual([]);
    expect(diff.unlocked, 'ids not locked yet: npm run content:lock -- --reason "<why>"').toEqual([]);
    expect(lock.history.every((h) => h.reason && h.date)).toBe(true);
  });

  it('fails when a locked id disappears (exercise, lesson, unit or item)', () => {
    const lock = lockOf(pack());
    const p = pack();
    p.units[0].lessons[0].exercises.pop();
    p.units[0].sentences = [];
    const failures = lockFailures(compareLock(lock, lockEntries([p])));
    expect(failures).toEqual([
      'locked id "en-x-u01-s01" no longer exists in the content',
      'locked id "en-x-u01-l01-e02" no longer exists in the content',
    ]);
  });

  it('fails when a locked exercise id now points at another exercise type', () => {
    const lock = lockOf(pack());
    const p = pack();
    p.units[0].lessons[0].exercises[0].type = 'listen_choose';
    expect(lockFailures(compareLock(lock, lockEntries([p])))).toEqual([
      'locked exercise "en-x-u01-l01-e01" changed its type: was "multiple_choice en.cat", now "listen_choose en.cat"',
    ]);
  });

  it('fails when a locked exercise id now has other items (order does not matter)', () => {
    const lock = lockOf(pack());
    const p = pack();
    p.units[0].lessons[0].exercises[1].items = ['en.dog', 'en.cat']; // same set: fine
    expect(lockFailures(compareLock(lock, lockEntries([p])))).toEqual([]);
    p.units[0].lessons[0].exercises[0].items = ['en.dog'];
    expect(lockFailures(compareLock(lock, lockEntries([p])))).toEqual([
      'locked exercise "en-x-u01-l01-e01" changed its items: was "multiple_choice en.cat", now "multiple_choice en.dog"',
    ]);
  });

  it('appending exercises with new ids is not a failure, only "unlocked" until locked with a reason', () => {
    const lock = lockOf(pack());
    const p = pack();
    p.units[0].lessons[0].exercises.push({ id: 'en-x-u01-l01-e03', type: 'listen_type', items: ['en.dog'] });
    const diff = compareLock(lock, lockEntries([p]));
    expect(lockFailures(diff)).toEqual([]);
    expect(diff.unlocked).toEqual(['en-x-u01-l01-e03']);
    const next = updateLock(lock, lockEntries([p]), { reason: 'e03 appended', date: '2026-10-03' });
    expect(next.history.at(-1)).toEqual({ date: '2026-10-03', reason: 'e03 appended', added: 1, removed: [], changed: [] });
    expect(compareLock(next, lockEntries([p])).unlocked).toEqual([]);
  });

  it('updating the lock requires a reason, which the lock records with what was removed or changed', () => {
    expect(() => updateLock(null, lockEntries([pack()]), { reason: ' ', date: '2026-10-02' })).toThrow(/reason/);
    const p = pack();
    p.units[0].lessons[0].exercises[0].items = ['en.dog'];
    const next = updateLock(lockOf(pack()), lockEntries([p]), { reason: 'cat exercise now asks for dog', date: '2026-10-04' });
    expect(next.history.at(-1)).toMatchObject({ reason: 'cat exercise now asks for dog', removed: [], changed: ['en-x-u01-l01-e01'] });
  });

  it('a retired (hidden) exercise may leave the content; it stays in the lock with its key and reason; an undo un-retires it', () => {
    const lock = lockOf(pack());
    const p = pack();
    p.units[0].lessons[0].exercises.pop(); // e02 hidden
    expect(lockFailures(compareLock(lock, lockEntries([p])))).toEqual(['locked id "en-x-u01-l01-e02" no longer exists in the content']);
    expect(() => updateLock(lock, lockEntries([pack()]), { reason: 'x', date: 'd', retire: ['en-x-u01-l01-e02'] })).toThrow(/still in the content/);
    expect(() => updateLock(lock, lockEntries([p]), { reason: 'x', date: 'd', retire: ['nope'] })).toThrow(/not a locked exercise/);
    const next = updateLock(lock, lockEntries([p]), { reason: 'admin correction #3: hide', date: '2026-10-05', retire: ['en-x-u01-l01-e02'] });
    expect(next.retired).toEqual({ 'en-x-u01-l01-e02': { key: 'match_pairs en.cat en.dog', date: '2026-10-05', reason: 'admin correction #3: hide' } });
    expect(next.history.at(-1)).toMatchObject({ removed: [], retired: ['en-x-u01-l01-e02'] });
    expect(lockFailures(compareLock(next, lockEntries([p])))).toEqual([]);
    expect(compareLock(next, lockEntries([p])).unlocked).toEqual([]);
    // Another update keeps it retired; the exercise coming back (undo) removes it from `retired`.
    expect(updateLock(next, lockEntries([p]), { reason: 'later', date: 'd' }).retired).toHaveProperty(['en-x-u01-l01-e02']);
    const back = updateLock(next, lockEntries([pack()]), { reason: 'undo', date: 'd' });
    expect(back.retired).toBeUndefined();
    expect(lockFailures(compareLock(back, lockEntries([pack()])))).toEqual([]);
  });

  // Texts, their sentences/turns and questions, and what each text exercise stands for are locked too.
  const textPack = () => {
    const p = pack();
    p.units[0].texts = [{
      id: 'en-x-t01', kind: 'reading',
      paragraphs: [[{ id: 'en-x-t01-s01' }, { id: 'en-x-t01-s02' }], [{ id: 'en-x-t01-s03' }]],
      questions: [{ id: 'en-x-t01-q1' }, { id: 'en-x-t01-q2' }], listeningQuestions: [{ id: 'en-x-t01-l1' }],
    }];
    p.units[0].lessons.push({
      id: 'en-x-u01-l02',
      exercises: [
        { id: 'en-x-u01-l02-e01', type: 'reading', items: ['en.cat'], textId: 'en-x-t01', question: { id: 'en-x-t01-q1' } },
        { id: 'en-x-u01-l02-e02', type: 'reading', items: ['en.cat'], textId: 'en-x-t01', question: { id: 'en-x-t01-q2' } },
        { id: 'en-x-u01-l02-e03', type: 'cloze', items: ['en.cat'], textId: 'en-x-t01', gaps: [{ sentence: 'en-x-t01-s01', word: 'cat' }] },
        { id: 'en-x-u01-l02-e04', type: 'order_paragraphs', items: ['en.cat'], textId: 'en-x-t01', unit: 'paragraph' },
      ],
    });
    return p;
  };

  it('locks text, sentence/turn and question ids and each text exercise\'s reference (only for packs with texts)', () => {
    const e = lockEntries([textPack()])['en-x'];
    expect(e.texts).toEqual(['en-x-t01']);
    expect(e.segments).toEqual(['en-x-t01-s01', 'en-x-t01-s02', 'en-x-t01-s03']);
    expect(e.questions).toEqual(['en-x-t01-q1', 'en-x-t01-q2', 'en-x-t01-l1']);
    expect(e.textExercises).toEqual({
      'en-x-u01-l02-e01': 'en-x-t01 en-x-t01-q1', 'en-x-u01-l02-e02': 'en-x-t01 en-x-t01-q2',
      'en-x-u01-l02-e03': 'en-x-t01 en-x-t01-s01:cat', 'en-x-u01-l02-e04': 'en-x-t01 paragraph',
    });
    expect(lockEntries([pack()])['en-x']).not.toHaveProperty('texts');
  });

  it('fails when a locked text, sentence or question id disappears', () => {
    const lock = lockOf(textPack());
    const p = textPack();
    p.units[0].texts[0].paragraphs[1] = [{ id: 'en-x-t01-s04' }]; // s03 renamed
    p.units[0].texts[0].listeningQuestions = [];
    expect(lockFailures(compareLock(lock, lockEntries([p])))).toEqual([
      'locked id "en-x-t01-s03" no longer exists in the content',
      'locked id "en-x-t01-l1" no longer exists in the content',
    ]);
    const q = textPack();
    q.units[0].texts[0].id = 'en-x-t09';
    for (const ex of q.units[0].lessons[1].exercises) ex.textId = 'en-x-t09';
    expect(lockFailures(compareLock(lock, lockEntries([q])))).toContain('locked id "en-x-t01" no longer exists in the content');
  });

  it('fails when a locked text exercise now asks another question, has other gaps or another unit', () => {
    const lock = lockOf(textPack());
    const p = textPack();
    const [e1, , e3, e4] = p.units[0].lessons[1].exercises;
    e1.question = { id: 'en-x-t01-q2' }; // questions renumbered
    e3.gaps = [{ sentence: 'en-x-t01-s02', word: 'dog' }];
    e4.unit = 'sentence';
    expect(lockFailures(compareLock(lock, lockEntries([p])))).toEqual([
      'locked exercise "en-x-u01-l02-e01" changed its text reference: was "en-x-t01 en-x-t01-q1", now "en-x-t01 en-x-t01-q2"',
      'locked exercise "en-x-u01-l02-e03" changed its text reference: was "en-x-t01 en-x-t01-s01:cat", now "en-x-t01 en-x-t01-s02:dog"',
      'locked exercise "en-x-u01-l02-e04" changed its text reference: was "en-x-t01 paragraph", now "en-x-t01 sentence"',
    ]);
  });

  it('a lock written before texts were locked reports their ids as unlocked, not removed or changed', () => {
    const old = lockOf(textPack());
    for (const k of ['texts', 'segments', 'questions', 'textExercises']) delete old.packs['en-x'][k];
    const diff = compareLock(old, lockEntries([textPack()]));
    expect(lockFailures(diff)).toEqual([]);
    expect(diff.unlocked).toHaveLength(7); // 1 text, 3 sentences, 3 questions
  });

  it('npm run content:lock: check fails on a changed exercise; --reason without text is refused; --reason rewrites', () => {
    const packsDir = path.join(tmp, 'packs');
    fs.mkdirSync(path.join(packsDir, 'en'), { recursive: true });
    fs.writeFileSync(path.join(packsDir, 'manifest.json'), JSON.stringify({ tracks: [{ id: 'en', packs: [{ id: 'en-x', file: 'en/x.json', status: 'available' }] }] }));
    fs.writeFileSync(path.join(packsDir, 'en/x.json'), JSON.stringify(pack()));
    const lockFile = path.join(tmp, 'ids.lock.json');
    fs.writeFileSync(lockFile, formatLock(lockOf(pack())));
    const script = path.join(root, 'scripts/content/lock.js');
    const run = (...extra) => spawnSync(process.execPath, [script, '--packs', packsDir, '--lock', lockFile, ...extra], { encoding: 'utf8' });

    expect(run().status).toBe(0);
    const changed = pack();
    changed.units[0].lessons[0].exercises[0].type = 'fill_blank';
    fs.writeFileSync(path.join(packsDir, 'en/x.json'), JSON.stringify(changed));
    const check = run();
    expect(check.status).toBe(1);
    expect(check.stderr).toMatch(/locked exercise "en-x-u01-l01-e01" changed its type/);
    expect(run('--reason').status).toBe(2);
    const ok = run('--reason', 'e01 became a fill-in on purpose');
    expect(ok.status).toBe(0);
    expect(readLock(lockFile).history.at(-1)).toMatchObject({ reason: 'e01 became a fill-in on purpose', changed: ['en-x-u01-l01-e01'] });
    expect(execFileSync(process.execPath, [script, '--packs', packsDir, '--lock', lockFile], { encoding: 'utf8' })).toMatch(/content:lock OK/);
  });
});
