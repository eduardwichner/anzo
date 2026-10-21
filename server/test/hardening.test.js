// No sequence of taps on an audio control can
// break the client, an error answer is never cached (browser, service worker, proxy), the API keeps answering.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openMemoryDb } from '../src/db/index.js';
import { loadContent } from '../src/content/loader.js';
import { loadAudio } from '../src/audio/manifest.js';
import { seedUsers } from '../src/lib/users.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const CONTENT_DIR = path.join(ROOT, 'content');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-hardening-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('API cache headers', () => {
  let agent;
  let server;
  afterAll(() => server?.close());
  beforeAll(async () => {
    const content = loadContent({ contentDir: CONTENT_DIR });
    const db = openMemoryDb();
    seedUsers(db);
    const config = {
      version: 'test', sessionSecret: 'x'.repeat(48), dataDir: tmp, audioDir: path.join(tmp, 'none'), modelsDir: tmp, contentDir: CONTENT_DIR,
      clientDist: path.join(tmp, 'no-dist'), loginRateLimit: 10,
    };
    const audio = loadAudio({ audioDir: config.audioDir, contentDir: CONTENT_DIR, content, logger: pino({ level: 'silent' }) });
    server = createApp({ db, content, audio, config, logger: pino({ level: 'silent' }) }).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    agent = request.agent(`http://127.0.0.1:${server.address().port}`);
  });

  it('an error answer is never stored (no-store); a good one is always revalidated (no-cache)', async () => {
    const anon = await agent.get('/api/auth/me');
    expect(anon.status).toBe(401);
    expect(anon.headers['cache-control']).toBe('no-store');
    expect((await agent.get('/api/nope')).headers['cache-control']).toBe('no-store');
    expect((await agent.post('/api/auth/login').send({ username: 'kid1', password: 'kid1' })).status).toBe(200);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.headers['cache-control']).toBe('no-cache');
    const pack = await agent.get('/api/content/packs/en-pre-a1');
    expect(pack.status).toBe(200);
    expect(pack.headers['cache-control']).toBe('no-cache');
    expect((await agent.get('/api/content/packs/fr-a1')).headers['cache-control']).toBe('no-store'); // 403: another course
  });

  it('auto-play is an account setting (Settings → Play words automatically): on by default, a boolean only', async () => {
    expect((await agent.get('/api/auth/me')).body.user.autoplay).toBe(true);
    expect((await agent.patch('/api/auth/me').send({ autoplay: 'no' })).status).toBe(400);
    expect((await agent.patch('/api/auth/me').send({ autoplay: false })).body.user.autoplay).toBe(false);
    // Rapid switching ends in the last state.
    for (let i = 0; i < 9; i += 1) await agent.patch('/api/auth/me').send({ autoplay: i % 2 === 0 });
    expect((await agent.get('/api/auth/me')).body.user.autoplay).toBe(true);
  });

  it('a hundred rapid requests for the same lesson data all answer', async () => {
    const res = await Promise.all(Array.from({ length: 100 }, () => agent.get('/api/progress/me')));
    expect(res.every((r) => r.status === 200)).toBe(true);
  });
});

describe('service worker', () => {
  it('caches only 200 answers of the lesson content, never an error', () => {
    const cfg = fs.readFileSync(path.join(ROOT, 'client/vite.config.js'), 'utf8');
    const entries = cfg.split('handler:').length - 1;
    expect(entries).toBeGreaterThan(0);
    expect(cfg.match(/cacheableResponse: \{ statuses: \[200\] \}/g)?.length).toBe(entries);
    expect(cfg).toMatch(/navigateFallbackDenylist: \[\/\^\\\/api\\\/\/, \/\^\\\/audio\\\/\/\]/);
  });
});

describe('audio player under rapid taps', () => {
  let player;
  let el;
  beforeAll(async () => {
    // A minimal DOM: one <audio> whose play() is interrupted by the next pause() (as browsers do: AbortError).
    let pending = null;
    el = {
      loads: 0, readyState: 0, paused: true, currentTime: 0, listeners: {}, attrs: {},
      set src(v) { this.attrs.src = v; this._src = new URL(v, 'http://anzo.test/').href; this.loads += 1; this.readyState = 0; },
      get src() { return this._src ?? ''; },
      get currentSrc() { return this._src ?? ''; },
      getAttribute(k) { return this.attrs[k] ?? null; },
      addEventListener(k, fn) { (this.listeners[k] ??= []).push(fn); },
      pause() {
        const was = !this.paused;
        this.paused = true;
        if (pending) { pending.reject(Object.assign(new Error('interrupted'), { name: 'AbortError' })); pending = null; }
        if (was) setTimeout(() => (this.listeners.pause ?? []).forEach((f) => f()), 0); // a task later, as in browsers
      },
      play() {
        this.paused = false;
        this.readyState = 4;
        return new Promise((resolve, reject) => { pending = { resolve, reject }; setTimeout(() => { if (pending?.resolve === resolve) { pending = null; resolve(); } }, 1); });
      },
    };
    globalThis.location = { href: 'http://anzo.test/lesson/x' };
    globalThis.window = {};
    globalThis.document = { createElement: () => el, body: { appendChild() {} } };
    player = await import('../../client/src/audio/player.js');
  });
  afterAll(() => {
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.location;
  });

  it('200 taps in a row never throw, the same clip is loaded once and restarted, a new clip replaces it', async () => {
    const results = [];
    for (let i = 0; i < 200; i += 1) results.push(player.play('/audio/nl/0123456789abcdef.mp3'));
    const settled = await Promise.allSettled(results);
    expect(settled.every((s) => s.status === 'fulfilled')).toBe(true); // interrupted plays resolve false, never reject
    expect(settled.at(-1).value).toBe(true);
    expect(el.loads).toBe(1);
    await player.play('/audio/nl/fedcba9876543210.mp3');
    expect(el.loads).toBe(2);
    expect(player.getState().url).toBe('/audio/nl/fedcba9876543210.mp3');
    expect(await player.play(null)).toBe(false);
  });

  const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
  const fire = (k) => (el.listeners[k] ?? []).forEach((f) => f());

  it('a clip that fails in a text is skipped; an interruption holds the text until ▶ (⏸ / ▶)', async () => {
    const items = ['a', 'b', 'c', 'd'].map((x) => ({ url: `/audio/nl/${x.repeat(16)}.mp3`, pauseMs: 0 }));
    expect(await player.playSequence('t1', items)).toBe(true);
    expect(player.getState().sequence).toMatchObject({ key: 't1', index: 0, total: 4, paused: false });
    el.ended = true; fire('ended'); el.ended = false;
    await tick();
    expect(player.getState().sequence.index).toBe(1);
    el.error = { code: 4 }; fire('error'); el.error = null; // clip b is missing
    await tick();
    expect(player.getState().sequence.index).toBe(2);
    expect(el.src).toContain('cccc');
    fire('pause'); // an iOS call: not the player's own pause
    expect(player.getState().sequence).toMatchObject({ index: 2, paused: true });
    expect(await player.resumeSequence()).toBe(true);
    expect(player.getState().sequence).toMatchObject({ index: 2, paused: false });
    player.pauseSequence();
    await tick();
    expect(player.getState().sequence.paused).toBe(true);
    await player.resumeSequence();
    el.ended = true; fire('ended'); el.ended = false;
    await tick();
    expect(player.getState().sequence.index).toBe(3);
    el.ended = true; fire('ended'); el.ended = false;
    await tick();
    expect(player.getState().sequence).toBeNull();
  });
});
