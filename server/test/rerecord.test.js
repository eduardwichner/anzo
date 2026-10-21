// "Record again": the service side (server/src/ops/rerecord.js: queue, decisions, results, routes) and the
// content job's pure parts (scripts/jobs/rerecord-lib.js: request checks, the next take, the override it writes).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openMemoryDb } from '../src/db/index.js';
import { seedUsers } from '../src/lib/users.js';
import { loadContent } from '../src/content/loader.js';
import { collectRerecordResults, liveClip, queueRerecord, recordRerecordResult } from '../src/ops/rerecord.js';
import { ensureSpool, spoolPaths } from '../src/ops/spool.js';
import { currentEntry, nextTake, validateRerecord, withEntry } from '../../scripts/jobs/rerecord-lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONTENT_DIR = path.join(ROOT, 'content');
const content = loadContent({ contentDir: CONTENT_DIR });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-rerecord-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const CLIPS = [
  { file: 'en/0123456789abcdef.mp3', track: 'en', speed: 'normal', text: 'old', kind: 'word', carrier: 'The word,' },
  { file: 'en/fedcba9876543210.mp3', track: 'en', speed: 'slow', text: 'old', kind: 'word', carrier: 'The word,' },
];
const audio = { clips: CLIPS, url: () => null, both: () => ({ audio: null, audioSlow: null }), missing: 0, expected: 2, present: 2 };
const voices = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'voices.json'), 'utf8'));

describe('the job: request checks and the next take', () => {
  const req = { kind: 'rerecord', phase: 'make', id: 3, author: 'admin', track: 'en', speed: 'normal', text: 'old', oldFile: 'en/0123456789abcdef.mp3' };
  it('trusts nothing in a request', () => {
    expect(() => validateRerecord(req, voices)).not.toThrow();
    for (const bad of [{ phase: 'nuke' }, { id: 0 }, { author: 'Rob Tables;' }, { track: 'xx' }, { speed: 'fast' }, { text: '' },
      { oldFile: '../etc/passwd' }]) {
      expect(() => validateRerecord({ ...req, ...bad }, voices), JSON.stringify(bad)).toThrow();
    }
    const keep = { ...req, phase: 'keep', newFile: 'en/aaaaaaaaaaaaaaaa.mp3', entry: { take: 2, why: 'x' }, unpin: false };
    expect(() => validateRerecord(keep, voices)).not.toThrow();
    expect(() => validateRerecord({ ...keep, newFile: 'fr/aaaaaaaaaaaaaaaa.mp3' }, voices)).toThrow(); // another language's folder
    expect(() => validateRerecord({ ...keep, entry: { take: 2, noiseScale: 0.3 } }, voices)).toThrow(); // never low noise
    expect(() => validateRerecord({ ...keep, entry: { take: 1 } }, voices)).toThrow();
    expect(() => validateRerecord({ ...keep, entry: { take: 2, end: 'rm -rf' } }, voices)).toThrow();
  });
  it('the next take keeps say/carrier/end, skips takes already on disk, and lifts a pin', () => {
    const o = { clips: { en: { old: { normal: { carrier: 'The word;', take: 2, why: 'audio:fix' } } } }, accepted: {},
      pins: { en: { old: { slow: { file: 'en/fedcba9876543210.mp3', why: 'pinned' } } } } };
    expect(currentEntry(o, { track: 'en', speed: 'normal', text: 'old' })).toMatchObject({ take: 2 });
    const fileOf = (x) => `take-${currentEntry(x, { track: 'en', speed: 'normal', text: 'old' }).take}`;
    const n = nextTake(o, { track: 'en', speed: 'normal', text: 'old' }, { fileOf, exists: (f) => f === 'take-3', author: 'admin', id: 7 });
    expect(n.entry).toMatchObject({ carrier: 'The word;', take: 4 });
    expect(n.entry.why).toBe('Per-clip override: after the carrier "The word;", take 4.');
    expect(n.unpin).toBe(false);
    const slow = nextTake(o, { track: 'en', speed: 'slow', text: 'old' }, { fileOf: () => 'x', exists: () => false, author: 'admin', id: 8 });
    expect(slow).toMatchObject({ unpin: true, entry: { take: 2 } });
    const w = withEntry(o, { track: 'en', speed: 'slow', text: 'old' }, slow.entry, true);
    expect(w.pins.en.old).toBeUndefined();
    expect(w.clips.en.old.normal).toMatchObject({ take: 2 }); // the other speed untouched
    expect(o.pins.en.old.slow).toBeTruthy(); // a pure function
  });
});

describe('the service: queue → review → kept | dropped', () => {
  function makeApp(jobRunner = 'stub') {
    const db = openMemoryDb();
    seedUsers(db);
    const spoolDir = path.join(tmp, `spool-${jobRunner}-${Math.random().toString(36).slice(2)}`);
    ensureSpool(spoolDir);
    const config = { version: 'test', sessionSecret: 'x'.repeat(48), dataDir: tmp, audioDir: path.join(tmp, 'no-audio'), contentDir: CONTENT_DIR,
      clientDist: path.join(tmp, 'no-dist'), loginRateLimit: 50, spoolDir, jobRunner };
    const ctx = { db, content, audio, config, logger: pino({ level: 'silent' }) };
    return { ctx, db, app: createApp(ctx) };
  }
  async function admin(app) {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin' });
    expect((await agent.post('/api/auth/password').send({ current: 'admin', next: 'beheer-test-1' })).status).toBe(204);
    return agent;
  }
  it('admins only; only a clip the app plays; one open request per clip; keep or drop only in review', async () => {
    const { app } = makeApp();
    const child = request.agent(app);
    await child.post('/api/auth/login').send({ username: 'kid1', password: 'kid1' });
    expect((await child.post('/api/admin/rerecord').send({ file: CLIPS[0].file })).status).toBe(403);
    const a = await admin(app);
    expect((await a.post('/api/admin/rerecord').send({ file: 'en/../../x.mp3' })).status).toBe(404);
    expect((await a.post('/api/admin/rerecord').send({ file: 'en/1111111111111111.mp3' })).status).toBe(404);
    const made = (await a.post('/api/admin/rerecord').send({ file: CLIPS[0].file })).body.rerecord;
    // the stub runner: the "new" take is the old file, in review at once
    expect(made).toMatchObject({ status: 'review', track: 'en', speed: 'normal', text: 'old', oldUrl: `/audio/${CLIPS[0].file}`, newUrl: `/audio/${CLIPS[0].file}` });
    expect((await a.post('/api/admin/rerecord').send({ file: CLIPS[0].file })).status).toBe(409);
    const listed = (await a.get(`/api/admin/rerecord?files=${CLIPS[0].file}`)).body.rerecords;
    expect(listed.map((r) => r.id)).toEqual([made.id]);
    expect((await a.get(`/api/admin/rerecord?files=${CLIPS[1].file}`)).body.rerecords).toEqual([]);
    expect((await a.post(`/api/admin/rerecord/${made.id}/keep`)).body.rerecord.status).toBe('kept');
    expect((await a.post(`/api/admin/rerecord/${made.id}/drop`)).status).toBe(409); // decided
    const second = (await a.post('/api/admin/rerecord').send({ file: CLIPS[1].file })).body.rerecord;
    expect((await a.post(`/api/admin/rerecord/${second.id}/drop`)).body.rerecord.status).toBe('dropped');
  });
  it('with the real job: a spool request per phase, results recorded once, a failed Keep new goes back to review', async () => {
    const { ctx, db } = makeApp('job');
    const row = queueRerecord(ctx, { username: 'admin' }, { file: CLIPS[0].file });
    expect(row.status).toBe('making');
    const { requests, results } = spoolPaths(ctx.config.spoolDir);
    const req = JSON.parse(fs.readFileSync(path.join(requests, 'rerecord-000001.json'), 'utf8'));
    expect(req).toMatchObject({ kind: 'rerecord', phase: 'make', id: 1, track: 'en', speed: 'normal', text: 'old', oldFile: CLIPS[0].file });
    fs.writeFileSync(path.join(results, 'rerecord-000001.json'), JSON.stringify({ id: 1, phase: 'make', status: 'review', newFile: 'en/aaaaaaaaaaaaaaaa.mp3',
      entry: { take: 2, why: 'x' }, unpin: false, flagsOld: ['pause'], flagsNew: [] }));
    expect(collectRerecordResults(ctx)).toBe(1);
    expect(db.prepare('SELECT status, new_file, flags_old FROM clip_rerecords').get()).toEqual({ status: 'review', new_file: 'en/aaaaaaaaaaaaaaaa.mp3', flags_old: '["pause"]' });
    expect(recordRerecordResult(ctx, { id: 1, phase: 'make', status: 'failed' }).status).toBe('review'); // seen twice: no change
    const { decideRerecord } = await import('../src/ops/rerecord.js');
    expect(decideRerecord(ctx, 1, 'keep').status).toBe('keeping');
    const keepReq = JSON.parse(fs.readFileSync(path.join(requests, 'rerecord-000001.json'), 'utf8'));
    expect(keepReq).toMatchObject({ phase: 'keep', newFile: 'en/aaaaaaaaaaaaaaaa.mp3', entry: { take: 2 }, unpin: false });
    expect(recordRerecordResult(ctx, { id: 1, phase: 'keep', status: 'failed', reason: 'The app refused it.' })).toMatchObject({ status: 'review', result_reason: 'The app refused it.' });
    expect(liveClip(audio, CLIPS[1].file)).toMatchObject({ speed: 'slow' });
  });
});
