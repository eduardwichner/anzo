// The content job on a scratch repository: hide, undo, undo in any order (split from content-job.test.js; helpers in
// content-job-scratch.js).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkAndUpdateLock, processRequest } from '../../scripts/jobs/content-job-lib.js';
import { readLock } from '../src/content/idlock.js';
import { scratchSuite } from './content-job-scratch.js';
import { ms } from './slow.js';

const S = scratchSuite('anzo-job-hide-');
const { git, env, request, nativeFix, unitText, expectClean, reloads, setReload } = S;

describe('content job: hide, undo, undo in any order on a scratch repository', { timeout: ms(180_000) }, () => {

  it('hide an exercise: retired in the lock with the reason; undo brings it back and un-retires it', async () => {
    const pack = () => JSON.parse(fs.readFileSync(path.join(S.scratch.root, 'content/packs/en/a2.json'), 'utf8'));
    const exId = pack().units[0].lessons[0].exercises[4].id;
    const hide = await processRequest(request({ kind: 'hide', target: { kind: 'exercise', id: exId }, before: { hidden: false }, after: { hidden: true }, reason: 'wrong', summary: `hide exercise ${exId}` }), env());
    expect(hide.status).toBe('applied');
    expect(pack().units[0].lessons[0].exercises.map((e) => e.id)).not.toContain(exId);
    expect(pack().units[0].lessons[0].exercises[4].id).toBe(exId.replace(/e05$/, 'e06')); // no other id moved
    const lock = readLock(path.join(S.scratch.root, 'content/ids.lock.json'));
    expect(lock.retired[exId]).toMatchObject({ reason: `admin correction #${hide.id}: hide exercise ${exId}` });
    const undo = await processRequest(request({ kind: 'undo', target: { kind: 'exercise', id: exId }, before: { commit: hide.commit }, after: { hidden: false }, summary: 'undo', undo: { of: hide.id, commit: hide.commit } }), env());
    expect(undo.status).toBe('applied');
    expect(pack().units[0].lessons[0].exercises[4].id).toBe(exId);
    expect(readLock(path.join(S.scratch.root, 'content/ids.lock.json')).retired).toBeUndefined();
  });

  it('C1: undo of an older correction after a later one in another pack (both wrote the id lock), in any order', async () => {
    const enPack = () => JSON.parse(fs.readFileSync(path.join(S.scratch.root, 'content/packs/en/a2.json'), 'utf8'));
    const frPack = () => JSON.parse(fs.readFileSync(path.join(S.scratch.root, 'content/packs/fr/a2.json'), 'utf8'));
    const enEx = enPack().units[0].lessons[0].exercises[3].id;
    const frEx = frPack().units[0].lessons[0].exercises[3].id;
    const hide = (track, packId, unitId, exId) => processRequest(request({ track, packId, unitId, kind: 'hide', target: { kind: 'exercise', id: exId },
      before: { hidden: false }, after: { hidden: true }, reason: 'c1', summary: `hide exercise ${exId}` }), env());
    const undo = (orig, track, packId, unitId, exId) => processRequest(request({ track, packId, unitId, kind: 'undo', target: { kind: 'exercise', id: exId },
      before: { commit: orig.commit }, after: { hidden: false }, summary: 'undo', undo: { of: orig.id, commit: orig.commit } }), env());
    const older = await hide('en', 'en-a2', 'en-a2-u01', enEx);
    const newer = await hide('fr', 'fr-a2', 'fr-a2-u01', frEx);
    expect([older.status, newer.status]).toEqual(['applied', 'applied']);
    const lockFile = path.join(S.scratch.root, 'content/ids.lock.json');
    expect(Object.keys(readLock(lockFile).retired).sort()).toEqual([enEx, frEx].sort());

    const u1 = await undo(older, 'en', 'en-a2', 'en-a2-u01', enEx); // the older one first
    expect(u1).toMatchObject({ status: 'applied' });
    expect(enPack().units[0].lessons[0].exercises.map((e) => e.id)).toContain(enEx);
    expect(frPack().units[0].lessons[0].exercises.map((e) => e.id)).not.toContain(frEx);
    const lock = readLock(lockFile);
    expect(Object.keys(lock.retired)).toEqual([frEx]);
    expect(lock.history.at(-1).reason).toBe(`undo of correction #${older.id}`);
    expect(git('show', '--name-only', '--format=', 'HEAD').split('\n').sort())
      .toEqual(['content/ids.lock.json', 'content/packs/en/a2.json', 'content/src/en/a2/01-months.yaml']);

    const u2 = await undo(newer, 'fr', 'fr-a2', 'fr-a2-u01', frEx);
    expect(u2.status).toBe('applied');
    expect(readLock(lockFile).retired).toBeUndefined();
    expect(git('status', '--porcelain', '--', 'content/')).toBe('');
  }, ms(360_000)); // four content-job runs (two corrections, two undos) over every pack, B1 included
});
