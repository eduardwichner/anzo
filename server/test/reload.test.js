// Content reload (SIGHUP): build the new runtime completely, check it, swap one reference; on failure keep the old one.
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
import { createContentStore, loadRuntime } from '../src/content/store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REAL = path.resolve(here, '../../content');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-reload-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function contentCopy(name) {
  const dir = path.join(tmp, name);
  fs.cpSync(path.join(REAL, 'packs'), path.join(dir, 'packs'), { recursive: true });
  for (const f of ['ids.lock.json', 'voices.json']) fs.copyFileSync(path.join(REAL, f), path.join(dir, f));
  return dir;
}
const PACK = (dir) => path.join(dir, 'packs/en/pre-a1.json');
const editPack = (dir, fn) => {
  const p = JSON.parse(fs.readFileSync(PACK(dir), 'utf8'));
  fn(p);
  fs.writeFileSync(PACK(dir), JSON.stringify(p));
};

function setup(name) {
  const contentDir = contentCopy(name);
  const config = {
    version: 'test', sessionSecret: 'x'.repeat(48), dataDir: tmp, audioDir: path.join(tmp, 'no-audio'), contentDir,
    clientDist: path.join(tmp, 'no-dist'), loginRateLimit: 10, modelsDir: tmp,
  };
  const logger = pino({ level: 'silent' });
  const swaps = [];
  const store = createContentStore(loadRuntime({ config, logger }), {
    load: () => loadRuntime({ config, logger, strictLock: true }),
    logger,
    onSwap: (rt) => swaps.push(rt.loadedAt),
  });
  const db = openMemoryDb();
  seedUsers(db);
  return { contentDir, store, swaps, db, app: createApp({ db, store, config, logger }) };
}

async function kid1(app) {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ username: 'kid1', password: 'kid1' })).status).toBe(200);
  return agent;
}
const firstLessonTitle = async (agent) => (await agent.get('/api/content/packs/en-pre-a1')).body.units[0].lessons[0].title;

describe('content reload', () => {
  it('swaps the content atomically: new requests see the new packs, the logged-in session survives', async () => {
    const { contentDir, store, swaps, app } = setup('ok');
    const agent = await kid1(app);
    const before = store.content;
    const title = await firstLessonTitle(agent);
    editPack(contentDir, (p) => { p.units[0].lessons[0].title.nl = 'Nieuwe titel'; });
    expect(await firstLessonTitle(agent)).toBe(title); // nothing changes until the reload

    const result = store.reload();
    expect(result).toMatchObject({ ok: true, packs: expect.arrayContaining(['en-pre-a1', 'fr-a1-1']) });
    expect(store.content).not.toBe(before);
    expect(swaps).toHaveLength(1);
    expect(store.status().generation).toBe(2);
    expect(await firstLessonTitle(agent)).toBe('Nieuwe titel');
    expect((await agent.get('/api/auth/me')).status).toBe(200); // same cookie, same session
    // The answer-checking path uses the new index too.
    const ex = store.content.lessons.get('en-pre-a1-u01-l01').lesson.exercises[0];
    expect((await agent.post('/api/progress/attempt').send({ lessonId: 'en-pre-a1-u01-l01', exerciseId: ex.id, answer: 'x' })).status).toBe(200);
  });

  it('invalid content: the reload fails, the old content stays in use and keeps serving', async () => {
    const { contentDir, store, swaps, app } = setup('invalid');
    const agent = await kid1(app);
    const before = store.content;
    const title = await firstLessonTitle(agent);
    fs.writeFileSync(PACK(contentDir), '{ "schemaVersion": 2, "id": "en-pre-a1", '); // truncated file
    const result = store.reload();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/en\/pre-a1\.json|JSON|validation/i);
    expect(store.content).toBe(before);
    expect(swaps).toEqual([]);
    expect(store.status()).toMatchObject({ generation: 1, lastReload: { ok: false } });
    expect(await firstLessonTitle(agent)).toBe(title);
    // Health still reports every pack loaded (this test has no audio, which is its only problem).
    expect((await request(app).get('/api/health')).body.problems).toEqual(['audio manifest not loaded (run npm run audio:render)']);
  });

  it('content that breaks the id lock (a locked exercise gone) is refused; at startup it is only reported', async () => {
    const { contentDir, store } = setup('lock');
    const before = store.content;
    editPack(contentDir, (p) => { p.units[0].lessons[0].exercises.pop(); });
    const result = store.reload();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/breaks the id lock: locked id "en-pre-a1-u01-l01-e\d+" no longer exists/);
    expect(store.content).toBe(before);
    const startup = loadRuntime({ config: { contentDir, audioDir: path.join(tmp, 'no-audio') }, logger: pino({ level: 'silent' }) });
    expect(startup.lockProblems[0]).toMatch(/no longer exists/);
  });

  it('an exercise retired in the lock (hidden by a correction) may be gone; content.retired lists it', async () => {
    const { contentDir, store } = setup('retired');
    let gone;
    editPack(contentDir, (p) => { gone = p.units[0].lessons[0].exercises.pop(); });
    const lock = JSON.parse(fs.readFileSync(path.join(contentDir, 'ids.lock.json'), 'utf8'));
    lock.retired = { [gone.id]: { key: 'x', date: '2026-10-02', reason: 'admin correction #1' } };
    fs.writeFileSync(path.join(contentDir, 'ids.lock.json'), JSON.stringify(lock));
    expect(store.reload().ok).toBe(true);
    expect(store.content.exercises.has(gone.id)).toBe(false);
    expect(store.content.retired.get(gone.id)).toMatchObject({ reason: 'admin correction #1' });
  });
});

describe('a reload that adds an exercise to an open lesson', () => {
  it('the lesson keeps the playable counts of earlier loads, so a run opened before completes', async () => {
    const { createContentStore } = await import('../src/content/store.js');
    const rt = (n) => ({ content: { lessons: new Map([['L1', { playableCount: n }]]), packs: new Map() }, audio: { missing: 0 }, lockProblems: [], loadedAt: 'x' });
    let next = rt(13);
    const store = createContentStore(rt(12), { load: () => next });
    expect(store.reload().ok).toBe(true);
    expect(store.content.lessons.get('L1')).toEqual({ playableCount: 13, knownCounts: [12] });
    next = rt(13);
    store.reload();
    expect(store.content.lessons.get('L1').knownCounts).toEqual([12]); // carried over while the count stays
  });
});
