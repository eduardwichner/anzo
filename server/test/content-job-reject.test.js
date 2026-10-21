// The content job on a scratch repository: rejections and rollback (split from content-job.test.js; helpers in
// content-job-scratch.js).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkAndUpdateLock, processRequest } from '../../scripts/jobs/content-job-lib.js';
import { readLock } from '../src/content/idlock.js';
import { scratchSuite } from './content-job-scratch.js';
import { ms } from './slow.js';

const S = scratchSuite('anzo-job-rej-');
// The trace step needs the derived French word list (from the reference files, not in the repository): without it the trace
// is skipped by design, so a fresh clone cannot reject an off-level word (docs/developer/content.md → "Reference files").
const WORDLIST_FR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../content/reference/extracted/wordlist-fr.json');
const { git, env, request, nativeFix, unitText, expectClean, reloads, setReload } = S;

describe('content job: rejections and rollback on a scratch repository', { timeout: ms(180_000) }, () => {

  it.skipIf(!fs.existsSync(WORDLIST_FR))('a word outside the level is rejected ("… isn\'t on the A2 word list") and nothing stays behind', async () => {
    const head = git('rev-parse', 'HEAD');
    const result = await processRequest(request({
      track: 'fr', packId: 'fr-a2', unitId: 'fr-a2-u01', target: { kind: 'sentence', id: 'fr-a2-u01-s01' },
      before: { target: 'Hier, je suis allé à la piscine.' }, after: { target: 'Hier, je suis allé à la piscine avec un ornithorynque.' },
      summary: 'off-level',
    }), env());
    expect(result).toMatchObject({ status: 'rejected', failedStep: 'trace', reason: '"ornithorynque" isn\'t on the A2 word list.', rollbackClean: true });
    expectClean(head);
  });

  it('failing content tests reject the change; the tree, HEAD and audio are as before', async () => {
    fs.writeFileSync(path.join(S.scratch.root, 'server/test/zz-fail.test.js'), "import { it, expect } from 'vitest';\nit('fails', () => expect(1).toBe(2));\n");
    const head = git('rev-parse', 'HEAD');
    const manifest = fs.readFileSync(path.join(S.scratch.audioDir, 'manifest.json'), 'utf8');
    const result = await processRequest(nativeFix('en-a2-u01-s02', 'Februari is een korte maand.', 'Februari is een heel korte maand.'),
      env({ testFiles: ['test/zz-fail.test.js'] }));
    fs.rmSync(path.join(S.scratch.root, 'server/test/zz-fail.test.js'));
    expect(result).toMatchObject({ status: 'rejected', failedStep: 'tests', reason: 'The automatic content checks failed with this change.', rollbackClean: true });
    expectClean(head);
    expect(fs.readFileSync(path.join(S.scratch.audioDir, 'manifest.json'), 'utf8')).toBe(manifest);
  });

  it('health failing after the reload: the commit is undone and the old content reloaded', async () => {
    const head = git('rev-parse', 'HEAD');
    const r0 = reloads();
    S.health = { status: 503, body: { ok: false, problems: ['3 audio clip(s) missing (run npm run audio:render)'] } };
    const result = await processRequest(nativeFix('en-a2-u01-s02', 'Februari is een korte maand.', 'Februari is een heel korte maand.'), env());
    S.health = { status: 200, body: { ok: true } };
    expect(result).toMatchObject({ status: 'rejected', failedStep: 'reload', rollbackClean: true });
    expect(result.reason).toBe('After the change the app reports a problem: 3 audio clip(s) missing (run npm run audio:render).');
    expect(reloads()).toBe(r0 + 2); // the new content, then the old one again
    expectClean(head);
  });

  it('the service refusing the reload, or its integrity check failing, also roll back', async () => {
    const head = git('rev-parse', 'HEAD');
    setReload({ reloadOk: true, integrityOk: false });
    const a = await processRequest(nativeFix('en-a2-u01-s02', 'Februari is een korte maand.', 'Februari is een heel korte maand.'), env());
    expect(a).toMatchObject({ status: 'rejected', failedStep: 'integrity', reason: expect.stringMatching(/progress would no longer match/) });
    expectClean(head);
    setReload({ reloadOk: false, integrityOk: true });
    const b = await processRequest(nativeFix('en-a2-u01-s02', 'Februari is een korte maand.', 'Februari is een heel korte maand.'), env());
    expect(b).toMatchObject({ status: 'rejected', failedStep: 'reload', reason: 'The app refused the corrected lessons and kept the previous ones.' });
    expectClean(head);
    setReload({ reloadOk: true, integrityOk: true });
  });

  it('a locked id that would disappear is rejected by the lock step', () => {
    const lockFile = path.join(S.scratch.root, 'content/ids.lock.json');
    const before = fs.readFileSync(lockFile, 'utf8');
    const lock = JSON.parse(before);
    lock.packs['en-a2'].items.push('en.ghost-word');
    fs.writeFileSync(lockFile, JSON.stringify(lock));
    expect(() => checkAndUpdateLock(S.scratch.root, { reason: 'x' })).toThrow(/would remove en\.ghost-word from the lessons/);
    fs.writeFileSync(lockFile, before);
    expect(checkAndUpdateLock(S.scratch.root, { reason: 'x' })).toMatchObject({ written: false });
  });

  it('a locked exercise that would change its type, or a new exercise id, is rejected (no renumbering)', () => {
    const lockFile = path.join(S.scratch.root, 'content/ids.lock.json');
    const before = fs.readFileSync(lockFile, 'utf8');
    const lock = JSON.parse(before);
    const exercises = lock.packs['en-a2'].exercises;
    const [id, key] = Object.entries(exercises).find(([, k]) => k.startsWith('multiple_choice '));
    exercises[id] = key.replace(/^multiple_choice/, 'match_pairs');
    fs.writeFileSync(lockFile, JSON.stringify(lock));
    expect(() => checkAndUpdateLock(S.scratch.root, { reason: 'x' })).toThrow(/different exercises/);
    const lock2 = JSON.parse(before);
    const [last] = Object.keys(lock2.packs['en-a2'].exercises).slice(-1);
    delete lock2.packs['en-a2'].exercises[last];
    fs.writeFileSync(lockFile, JSON.stringify(lock2));
    expect(() => checkAndUpdateLock(S.scratch.root, { reason: 'x' })).toThrow(/different exercises/);
    // A text exercise that would stand for another question is rejected the same way
    const lock3 = JSON.parse(before);
    const tx = lock3.packs['en-b1'].textExercises;
    const [tid, tkey] = Object.entries(tx).find(([, k]) => / [a-z0-9-]+-q\d+$/.test(k));
    tx[tid] = tkey.replace(/-q(\d+)$/, (m, n) => `-q${Number(n) + 1}`);
    fs.writeFileSync(lockFile, JSON.stringify(lock3));
    expect(() => checkAndUpdateLock(S.scratch.root, { reason: 'x' })).toThrow(/different exercises/);
    fs.writeFileSync(lockFile, before);
  });
});
