// The content job (scripts/jobs/content-job-lib.js): each step, each rejection reason with full rollback, and undo.
// The pure parts run on strings; processRequest runs for real on a scratch clone of the repository (scratch.js,
// content-job-scratch.js) with a fake reload command (writes the service's status file) and a fake /api/health. Audio-rendering
// runs are in the end-to-end integration (npm run test:content-job): here no change needs a new clip, so Piper never starts
// (the suite stops at once when clips are missing). The scratch tests are split over three files (also content-job-reject and
// content-job-hide) so they run on three workers.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  affectedPacks, applyEditToText, applyHideToText, audioSnapshot, checkAndUpdateLock, levelOfFile, processRequest, recoverInterrupted, restoreAudio,
  validateRequest,
  traceProblems,
} from '../../scripts/jobs/content-job-lib.js';
import { readLock } from '../src/content/idlock.js';
import { scratchSuite } from './content-job-scratch.js';
import { ms } from './slow.js';

const UNIT = [
  'id: en-x-u01',
  'title: { nl: Dieren }',
  'vocabulary:',
  '  - { target: cat, native: { nl: kat }, pos: noun }',
  '  - { id: en.bat-animal, target: bat, native: { nl: "vleermuis, vleermuizen" }, pos: noun }',
  'sentences:',
  '  - { id: s01, target: "The cat is black.", native: { nl: "De kat is zwart." }, items: [en.cat] }',
  '  - { id: s02, target: "I see a bat.", native: { nl: "Ik zie een vleermuis." }, items: [en.bat-animal], acceptAlso: ["I can see a bat."] }',
  '',
].join('\n');
const edit = (kind, id, before, after) => applyEditToText(UNIT, { track: 'en', unitId: 'en-x-u01', kind, id, before, after });
const changed = (text) => text.split('\n').filter((l, i) => UNIT.split('\n')[i] !== l);

describe('content job: the unit YAML (step 1)', () => {
  it('changes only the edited values and writes out an id that was derived from the target', () => {
    expect(changed(edit('vocabulary', 'en.cat', { target: 'cat', native: 'kat' }, { target: 'kitty', native: 'poes, kat' })))
      .toEqual(['  - { id: en.cat, target: "kitty", native: { nl: "poes, kat" }, pos: noun }']);
    expect(changed(edit('vocabulary', 'en.bat-animal', { native: 'vleermuis, vleermuizen' }, { native: 'vleermuis' })))
      .toEqual(['  - { id: en.bat-animal, target: bat, native: { nl: "vleermuis" }, pos: noun }']);
  });

  it('sentence ids in shorthand (s01); acceptAlso added, replaced and removed', () => {
    expect(changed(edit('sentence', 'en-x-u01-s01', {}, { acceptAlso: ['The cat\'s black.'] })))
      .toEqual(['  - { id: s01, target: "The cat is black.", native: { nl: "De kat is zwart." }, items: [en.cat], acceptAlso: ["The cat\'s black."] }']);
    expect(changed(edit('sentence', 'en-x-u01-s02', { acceptAlso: ['I can see a bat.'] }, { acceptAlso: ['I saw a bat.', 'A bat!'] })))
      .toEqual(['  - { id: s02, target: "I see a bat.", native: { nl: "Ik zie een vleermuis." }, items: [en.bat-animal], acceptAlso: ["I saw a bat.", "A bat!"] }']);
    expect(changed(edit('sentence', 'en-x-u01-s02', { acceptAlso: ['I can see a bat.'] }, { acceptAlso: [] })))
      .toEqual(['  - { id: s02, target: "I see a bat.", native: { nl: "Ik zie een vleermuis." }, items: [en.bat-animal] }']);
  });

  it('quotes safely (quotes, colons, backslashes) and rejects when the text changed since the correction was made', () => {
    const out = edit('sentence', 'en-x-u01-s01', { target: 'The cat is black.' }, { target: 'The cat says: "miaow" \\o/' });
    expect(changed(out)[0]).toContain('target: "The cat says: \\"miaow\\" \\\\o/"');
    expect(() => edit('vocabulary', 'en.cat', { target: 'dog' }, { target: 'kitty' })).toThrow(/changed since the correction was made/);
    expect(() => edit('vocabulary', 'en.nope', {}, { target: 'x' })).toThrow(/not found/);
  });

  it('hiding an exercise appends to (or creates) the unit\'s hidden list; twice is refused', () => {
    const once = applyHideToText(UNIT, { exerciseId: 'en-x-u01-l01-e03', reason: 'admin correction #4: wrong picture' });
    expect(once.endsWith('hidden:\n  - { exercise: "en-x-u01-l01-e03", reason: "admin correction #4: wrong picture" }\n')).toBe(true);
    const twice = applyHideToText(once, { exerciseId: 'en-x-u01-l02-e01', reason: 'x' });
    expect(twice.split('\n').filter((l) => l.startsWith('  - { exercise:'))).toHaveLength(2);
    expect(() => applyHideToText(once, { exerciseId: 'en-x-u01-l01-e03', reason: 'x' })).toThrow(/already hidden/);
  });
});

describe('content job: helpers', () => {
  it('trace errors become words with their level; affected packs are the level and the ones above', () => {
    const out = [
      'content/src/fr/a2/01-hier.yaml: sentence fr-a2-u01-s01 "Hier, je suis allé à la piscine avec un ornithorynque.": "ornithorynque" — not in the French word list',
      'content/src/en/pre-a1/03-x.yaml: vocabulary en.zebra "zebra": not on the word list at level S',
    ].join('\n');
    expect(traceProblems(out)).toEqual([
      { word: 'ornithorynque', file: 'content/src/fr/a2/01-hier.yaml' },
      { word: 'zebra', file: 'content/src/en/pre-a1/03-x.yaml' },
    ]);
    expect(levelOfFile('content/src/fr/a2/01-hier.yaml')).toBe('A2');
    expect(levelOfFile('content/src/en/pre-a1/03-x.yaml')).toBe('Pre-A1 Starters');
    // the levels above include the B1 pilot unit (its generator reads the lower levels' vocabulary)
    expect(affectedPacks('en-pre-a1')).toEqual(['en-pre-a1', 'en-a1', 'en-a2', 'en-b1', 'en-b2']);
    expect(affectedPacks('fr-a1')).toEqual(['fr-a1', 'fr-a2', 'fr-b1', 'fr-b2', 'fe-a1', 'fe-a2', 'fe-b1', 'fe-b2']); // + French for English speakers
    expect(affectedPacks('en-a2')).toEqual(['en-a2', 'en-b1', 'en-b2']);
  });

  it('audio snapshot: new clips are removed and the manifest restored on rollback', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-audio-'));
    fs.mkdirSync(path.join(dir, 'en'));
    fs.writeFileSync(path.join(dir, 'en/aaaa.mp3'), 'x');
    fs.writeFileSync(path.join(dir, 'manifest.json'), '{"v":1}');
    const snap = audioSnapshot(dir);
    fs.writeFileSync(path.join(dir, 'en/bbbb.mp3'), 'y');
    fs.writeFileSync(path.join(dir, 'manifest.json'), '{"v":2}');
    expect(restoreAudio(dir, snap)).toEqual({ removed: 1 });
    expect(fs.readdirSync(path.join(dir, 'en'))).toEqual(['aaaa.mp3']);
    expect(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).toBe('{"v":1}');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ---- processRequest on a scratch clone ----------------------------------------------------------------------------
const S = scratchSuite('anzo-job-');
const { git, env, request, nativeFix, unitText, expectClean, reloads, setReload } = S;

describe('content job: processRequest on a scratch repository (fix, undo, malformed, interrupted, dirty)', { timeout: ms(180_000) }, () => {
  let applied;

  it('a Dutch-meaning fix: YAML, packs, commit by the admin, reload, health, integrity — no recording made', async () => {
    const head = git('rev-parse', 'HEAD');
    const r0 = reloads();
    const result = await processRequest(nativeFix('en-a2-u01-s01', 'Ik ben in januari jarig.', 'In januari ben ik jarig.'), env());
    expect(result).toMatchObject({ status: 'applied', rendered: 0, steps: ['preflight', 'apply', 'generate', 'trace', 'lock', 'audio', 'commit', 'reload', 'integrity', 'orphans'].filter((s) => s !== 'trace') });
    expect(git('rev-parse', 'HEAD~1')).toBe(head);
    expect(git('log', '-1', '--format=%an|%s')).toBe(`admin (Anzo admin)|content: admin correction #${result.id - 0} — en-a2-u01-s01: Dutch fix`);
    expect(git('show', '--stat', '--format=', 'HEAD').split('\n').map((l) => l.trim().split(' ')[0]).filter(Boolean).slice(0, -1).sort())
      .toEqual(['content/packs/en/a2.json', 'content/src/en/a2/01-months.yaml']);
    expect(unitText()).toContain('native: { nl: "In januari ben ik jarig." }');
    expect(reloads()).toBe(r0 + 1);
    expect(git('status', '--porcelain', '--', 'content/')).toBe('');
    applied = result;
  });

  it('undo: that commit\'s lesson-source changes reversed, packs rebuilt, through the same checks', async () => {
    const result = await processRequest(request({
      kind: 'undo', target: { kind: 'sentence', id: 'en-a2-u01-s01' }, before: { commit: applied.commit }, after: { native: 'Ik ben in januari jarig.' },
      summary: 'undo', undo: { of: applied.id, commit: applied.commit },
    }), env());
    expect(result.status).toBe('applied');
    expect(git('log', '-1', '--format=%s')).toBe(`content: admin correction #${result.id} — undo #${applied.id}`);
    expect(unitText()).toContain('native: { nl: "Ik ben in januari jarig." }');
    expect(git('diff', `${applied.commit}~1`, 'HEAD', '--', 'content/')).toBe('');
  });

  it('a malformed request (path, git argument or YAML injection) is rejected before anything is touched', async () => {
    const head = git('rev-parse', 'HEAD');
    const bad = [
      { packId: 'en-../../etc' }, { track: 'fr' }, { unitId: '../x' }, { author: 'root; rm -rf /' }, { id: '7' },
      { target: { kind: 'exercise', id: 'x\ny: 1' } },
      { kind: 'undo', undo: { of: 1, commit: '--hard' } },
    ];
    for (const over of bad) {
      const result = await processRequest(nativeFix('en-a2-u01-s02', 'a', 'b', over), env());
      expect(result, JSON.stringify(over)).toMatchObject({ status: 'rejected', reason: 'The correction request was malformed and was not applied.' });
    }
    expect(() => validateRequest(nativeFix('en-a2-u01-s02', 'a', 'b'), S.scratch.root)).not.toThrow();
    expectClean(head);
  });

  it('an interrupted run (killed after its commit, files left behind) is undone at the next start', async () => {
    const head = git('rev-parse', 'HEAD');
    fs.appendFileSync(path.join(S.scratch.root, 'content/src/en/a2/01-months.yaml'), '# half-done\n');
    git('add', '-A', '--', 'content/');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'content: admin correction #999 — killed');
    fs.appendFileSync(path.join(S.scratch.root, 'content/src/en/a2/01-months.yaml'), '# more\n');
    const r0 = reloads();
    const result = await recoverInterrupted(999, env());
    expect(result).toMatchObject({ id: 999, status: 'rejected', failedStep: 'interrupted', rollbackClean: true });
    expect(reloads()).toBe(r0 + 1);
    expectClean(head);
  });

  it('a dirty content folder pauses corrections instead of mixing changes', async () => {
    fs.appendFileSync(path.join(S.scratch.root, 'content/src/en/a2/01-months.yaml'), '# stray edit\n');
    const result = await processRequest(nativeFix('en-a2-u01-s02', 'x', 'y'), env());
    expect(result).toMatchObject({ status: 'rejected', reason: expect.stringMatching(/corrections are paused/) });
    git('checkout', '--', 'content/');
  });
});
