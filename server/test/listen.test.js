// Admin → Listen check — strata, the 95 % upper bound (rule of three, Clopper–Pearson),
// the sampler (recorded again first, then new recordings, then random: sentences 2 in 3), the fix queue (waiting → heard
// again → fixed), the Audio quality table (lib/quality.js), the routes (admins only, verdicts checked), and the queue as
// audio:check reads it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import pino from 'pino';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openMemoryDb, runMigrations } from '../src/db/index.js';
import { loadContent } from '../src/content/loader.js';
import { loadAudio } from '../src/audio/manifest.js';
import { deleteUser, seedUsers, USER_TABLES } from '../src/lib/users.js';
import { listenPool, listenQueue, listenStats, nextClip, SENTENCE_SHARE, upperBound } from '../src/lib/listen.js';
import { audioQuality, qualityGroup } from '../src/lib/quality.js';
import { readListenBad } from '../../scripts/audio-check/listen.js';
import { ms } from './slow.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const CONTENT_DIR = path.join(ROOT, 'content');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-listen-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
const content = loadContent({ contentDir: CONTENT_DIR });

// a sentence of a real reading text, so the pool can tell a text sentence from a plain one
const textSentence = (() => {
  for (const { pack, trackId } of content.packs.values()) {
    for (const u of pack.units) for (const t of u.texts ?? []) if (t.kind !== 'dialogue' && trackId === 'en') return t.paragraphs.flat()[0].target;
  }
  return null;
})();

const CLIPS = [
  { file: 'en/w1.mp3', track: 'en', speed: 'normal', text: 'eight', kind: 'word', carrier: 'The word,' },
  { file: 'en/w2.mp3', track: 'en', speed: 'slow', text: 'eight', kind: 'word', carrier: 'The word,' },
  { file: 'en/w3.mp3', track: 'en', speed: 'normal', text: 'old', kind: 'word', carrier: 'The word,' },
  { file: 'en/s1.mp3', track: 'en', speed: 'normal', text: 'The cat is black.', kind: 'sentence' },
  { file: 'en/t1.mp3', track: 'en', speed: 'normal', text: textSentence, kind: 'sentence' },
  { file: 'nl/w1.mp3', track: 'nl', speed: 'normal', text: 'job', kind: 'word', carrier: 'Het woord is:', said: '[[ dʒˈɔp ]]' },
  { file: 'nl/d1.mp3', track: 'nl', speed: 'dialogue-normal', text: 'Ja, graag.', kind: 'short' },
  { file: 'fr/w1.mp3', track: 'fr', speed: 'normal', text: 'jus', kind: 'word', carrier: 'Le mot :' },
  { file: 'fr/p1.mp3', track: 'fr', speed: 'normal', text: "s'il te plaît", kind: 'short', carrier: 'Le mot :' },
];
const fakeAudio = () => ({ ...loadAudio({ audioDir: path.join(tmp, 'no-audio'), contentDir: CONTENT_DIR, content }), clips: CLIPS.map((c) => ({ ...c })) });
const row = (id, file, verdict, extra = {}) => {
  const c = CLIPS.find((x) => x.file === file);
  return { id, file, track: c.track, speed: c.speed, text: c.text, verdict, reason: null, note: null, ...extra };
};

describe('the 95 % upper bound', () => {
  it('rule of three with none bad; exact Clopper–Pearson otherwise', () => {
    expect(upperBound(0, 0)).toBeNull();
    expect(upperBound(300, 0)).toBeCloseTo(0.01, 6);
    expect(upperBound(150, 0)).toBeCloseTo(0.02, 6);
    expect(upperBound(1, 0)).toBe(1);
    expect(upperBound(300, 2)).toBeCloseTo(0.0239, 3); // A10: 2 bad in 300 → < 2.4 %
    expect(upperBound(10, 10)).toBe(1);
    expect(upperBound(100, 5)).toBeGreaterThan(0.05);
    expect(upperBound(100, 5)).toBeLessThan(0.12);
  });
});

describe('pool, strata', () => {
  it('kinds: a reading-text sentence and a dialogue turn are text sentences; re-rendered = carrier or lexicon', () => {
    expect(textSentence).toBeTruthy();
    const pool = listenPool(content, fakeAudio());
    const by = (f) => pool.byFile.get(f);
    expect(by('en/t1.mp3').kind).toBe('text');
    expect(by('en/s1.mp3').kind).toBe('sentence');
    expect(by('nl/d1.mp3')).toMatchObject({ kind: 'text', speedClass: 'normal' });
    expect(by('en/w2.mp3')).toMatchObject({ speedClass: 'slow', rerendered: true });
    expect(by('en/s1.mp3').rerendered).toBe(false);
    expect(by('nl/w1.mp3').rerendered).toBe(true);
  });
  it('per stratum: heard and bad count the latest verdict of each current file; the bound and "may be bad" follow', () => {
    const pool = listenPool(content, fakeAudio());
    const rows = [row(1, 'en/w1.mp3', 'bad'), row(2, 'en/w1.mp3', 'ok'), row(3, 'en/w3.mp3', 'bad'), row(4, 'fr/w1.mp3', 'ok'), { id: 5, file: 'en/gone.mp3', track: 'en', speed: 'normal', text: 'gone', verdict: 'bad' }];
    const s = listenStats(rows, pool);
    const enWord = s.find((x) => x.key === 'en|word|normal');
    expect(enWord).toMatchObject({ clips: 2, heard: 2, bad: 1 });
    expect(enWord.upper).toBeGreaterThan(0.5);
    expect(enWord.mayBeBad).toBeLessThanOrEqual(2);
    expect(s.find((x) => x.key === 'fr|word|normal')).toMatchObject({ heard: 1, bad: 0, upper: 1 });
    expect(s.find((x) => x.key === 'en|sentence|normal')).toMatchObject({ heard: 0, upper: null, mayBeBad: null });
  });
});

describe('fix queue and sampler', () => {
  it('Bad → waiting; re-rendered (a new file) → heard again first; OK on the new file → fixed', () => {
    const audio = fakeAudio();
    const rows = [row(1, 'en/w3.mp3', 'bad', { reason: 'babble' })];
    let q = listenQueue(rows, listenPool(content, audio));
    expect(q.waiting.map((c) => c.text)).toEqual(['old']);
    expect(q.waiting[0].reason).toBe('babble');
    // audio:fix renders "old" again: a new file
    const fixed = { ...audio, clips: audio.clips.map((c) => (c.file === 'en/w3.mp3' ? { ...c, file: 'en/w3b.mp3' } : c)) };
    const pool = listenPool(content, fixed);
    q = listenQueue(rows, pool);
    expect(q).toMatchObject({ waiting: [], fixed: [] });
    expect(q.again.map((c) => c.file)).toEqual(['en/w3b.mp3']);
    expect(nextClip(rows, pool, () => 0.99)).toMatchObject({ file: 'en/w3b.mp3', again: true });
    const after = [...rows, { ...row(2, 'en/w3.mp3', 'ok'), file: 'en/w3b.mp3' }];
    expect(listenQueue(after, pool).fixed.map((c) => c.file)).toEqual(['en/w3b.mp3']);
    const again = [...rows, { ...row(2, 'en/w3.mp3', 'bad'), file: 'en/w3b.mp3' }];
    expect(listenQueue(again, pool).waiting.map((c) => c.file)).toEqual(['en/w3b.mp3']);
  });
  it('never serves a file twice; random: a sentence when the draw is under 2 in 3, else a word or short phrase; null when all are heard', () => {
    const pool = listenPool(content, fakeAudio());
    const rows = CLIPS.slice(0, 4).map((c, i) => row(i + 1, c.file, 'ok'));
    for (let i = 0; i < 50; i++) {
      const c = nextClip(rows, pool, Math.random);
      expect(rows.some((r) => r.file === c.file)).toBe(false);
    }
    expect(SENTENCE_SHARE).toBeCloseTo(2 / 3, 6);
    const sentence = (c) => c.kind === 'sentence' || c.kind === 'text';
    let seq = [0.1, 0, 0];
    expect(sentence(nextClip([], pool, () => seq.shift() ?? 0))).toBe(true);
    seq = [0.9, 0, 0];
    expect(sentence(nextClip([], pool, () => seq.shift() ?? 0))).toBe(false);
    // only sentences left: a sentence whatever the draw
    const words = CLIPS.filter((c) => !['sentence'].includes(c.kind) && c.file !== 'nl/d1.mp3').map((c, i) => row(i + 1, c.file, 'ok'));
    expect(sentence(listenPool(content, fakeAudio()).byFile.get(nextClip(words, pool, () => 0.99).file))).toBe(true);
    expect(nextClip(CLIPS.map((c, i) => row(i + 1, c.file, 'ok')), pool)).toBeNull();
  }, ms(30_000));
  it('every language is drawn', () => {
    const pool = listenPool(content, fakeAudio());
    const tracks = new Set();
    for (let i = 0; i < 300; i++) tracks.add(nextClip([], pool).track);
    expect([...tracks].sort()).toEqual(['en', 'fr', 'nl']);
  }, ms(30_000));
});

describe('order and Audio quality', () => {
  // en/s1 and nl/w1 recorded with a seed (in the manifest); fr/w1 has an override (another take), fr/p1 a pin
  const audio17 = () => ({ ...fakeAudio(), clips: CLIPS.map((c) => ({ ...c,
    ...(['en/s1.mp3', 'nl/w1.mp3'].includes(c.file) ? { seeded: true } : {}),
    ...(c.file === 'fr/w1.mp3' ? { override: { take: 2 } } : {}), ...(c.file === 'fr/p1.mp3' ? { pinned: true } : {}) })) });
  it('order: a Bad clip recorded again first, then new recordings (seeded) nobody heard, of any kind, then random', () => {
    const pool = listenPool(content, audio17());
    expect(pool.byFile.get('en/s1.mp3').seeded).toBe(true);
    const bad = [{ id: 1, file: 'en/w3-old.mp3', track: 'en', speed: 'normal', text: 'old', verdict: 'bad' }];
    expect(nextClip(bad, pool, () => 0)).toMatchObject({ file: 'en/w3.mp3', again: true });
    const first = nextClip([], pool, () => 0.99);
    expect(['en/s1.mp3', 'nl/w1.mp3']).toContain(first.file);
    const heard = ['en/s1.mp3', 'nl/w1.mp3'].map((f, i) => row(i + 1, f, 'ok'));
    expect(['en/s1.mp3', 'nl/w1.mp3']).not.toContain(nextClip(heard, pool, () => 0.5).file);
  });
  it('the table: per group (words + short phrases; sentences + text sentences) and language — clips, heard, bad now, the bound, rendered again', () => {
    const pool = listenPool(content, audio17());
    expect(qualityGroup({ kind: 'short' })).toBe('words');
    expect(qualityGroup({ kind: 'text' })).toBe('sentences');
    const rows = [row(1, 'en/w1.mp3', 'ok'), row(2, 'en/w2.mp3', 'bad', { reason: 'wrong-pronunciation' }), row(3, 'en/s1.mp3', 'ok'),
      row(4, 'en/t1.mp3', 'bad'), row(5, 'nl/d1.mp3', 'ok'), row(6, 'en/w3.mp3', 'bad'), row(7, 'en/w3.mp3', 'ok')];
    const q = audioQuality(rows, pool, { checkedAt: '2026-10-16T10:00:00Z', clips: 9, flagged: 1, explained: 2, failed: 0 });
    expect(q.groups.map((g) => g.group)).toEqual(['words', 'sentences']);
    const cell = (g, tr) => q.groups.find((x) => x.group === g).rows.find((r) => r.track === tr);
    expect(cell('words', 'en')).toMatchObject({ clips: 3, heard: 3, bad: 1, redone: 0 });
    expect(cell('words', 'fr')).toMatchObject({ clips: 2, heard: 0, bad: 0, upper: null, redone: 2 });
    expect(cell('sentences', 'en')).toMatchObject({ clips: 2, heard: 2, bad: 1 });
    expect(cell('sentences', 'nl')).toMatchObject({ clips: 1, heard: 1, bad: 0, upper: 1 });
    expect(cell('words', 'en').upper).toBeCloseTo(upperBound(3, 1), 9);
    // the latest verdict per file counts: en/w3 Bad then OK is OK now
    expect(q.fixing).toEqual({ again: 0, waiting: 2, pronunciation: 1, fixed: 0 }); // en/w3: Bad overruled by an OK
    expect(q.check).toEqual({ at: '2026-10-16T10:00:00Z', clips: 9, flagged: 1, explained: 2 });
    expect(audioQuality([], pool, null).check).toBeNull();
  });
  it('a Bad clip recorded again counts as not heard (its verdict stays with the old file) until it is heard', () => {
    const audio = audio17();
    const rows = [row(1, 'en/w3.mp3', 'bad')];
    const before = audioQuality(rows, listenPool(content, audio), null);
    expect(before.groups[0].rows.find((r) => r.track === 'en')).toMatchObject({ heard: 1, bad: 1 });
    const again = { ...audio, clips: audio.clips.map((c) => (c.file === 'en/w3.mp3' ? { ...c, file: 'en/w3b.mp3', seeded: true, override: { take: 2 } } : c)) };
    const pool = listenPool(content, again);
    const after = audioQuality(rows, pool, null);
    expect(after.groups[0].rows.find((r) => r.track === 'en')).toMatchObject({ heard: 0, bad: 0, redone: 1 });
    expect(after.fixing).toMatchObject({ again: 1, waiting: 0 });
    const heard = audioQuality([...rows, { ...row(2, 'en/w3.mp3', 'ok'), file: 'en/w3b.mp3' }], pool, null);
    expect(heard.groups[0].rows.find((r) => r.track === 'en')).toMatchObject({ heard: 1, bad: 0 });
    expect(heard.fixing).toMatchObject({ again: 0, fixed: 1 });
  });
});

describe('routes', () => {
  function makeApp() {
    const db = openMemoryDb();
    seedUsers(db);
    const config = { version: 'test', sessionSecret: 'x'.repeat(48), dataDir: tmp, audioDir: path.join(tmp, 'no-audio'), contentDir: CONTENT_DIR,
      clientDist: path.join(tmp, 'no-dist'), loginRateLimit: 50 };
    return { db, app: createApp({ db, content, audio: fakeAudio(), config, logger: pino({ level: 'silent' }) }) };
  }
  async function agentFor(app, username, password = username) {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username, password });
    if (username === 'admin') expect((await agent.post('/api/auth/password').send({ current: 'admin', next: 'beheer-test-1' })).status).toBe(204);
    return agent;
  }

  it('admins only; a verdict is checked and stored; the state follows', async () => {
    const { app, db } = makeApp();
    const child = await agentFor(app, 'kid1');
    expect((await child.get('/api/admin/listen')).status).toBe(403);
    expect((await request(app).get('/api/admin/listen')).status).toBe(401);
    const admin = await agentFor(app, 'admin');
    const s0 = (await admin.get('/api/admin/listen')).body;
    expect(s0.heard).toBe(0);
    expect(s0.next).toMatchObject({ url: expect.stringMatching(/^\/audio\//), again: false });
    expect(s0.progress).toBeUndefined();
    expect(s0.quality.groups.map((g) => g.group)).toEqual(['words', 'sentences']);
    const q0 = (await admin.get('/api/admin/listen/quality')).body;
    expect(q0).toEqual(s0.quality);
    expect((await child.get('/api/admin/listen/quality')).status).toBe(403);
    expect(s0.strata.length).toBeGreaterThan(4);
    const file = s0.next.file;
    expect((await admin.post('/api/admin/listen').send({ file: 'en/../../etc/passwd', verdict: 'ok' })).status).toBe(404);
    expect((await admin.post('/api/admin/listen').send({ file, verdict: 'meh' })).status).toBe(400);
    expect((await admin.post('/api/admin/listen').send({ file, verdict: 'ok', reason: 'babble' })).status).toBe(400);
    expect((await admin.post('/api/admin/listen').send({ file, verdict: 'bad', reason: 'loud' })).status).toBe(400);
    const s1 = (await admin.post('/api/admin/listen').send({ file, verdict: 'bad', reason: 'cut-off', note: '  starts too late  ' })).body;
    expect(s1.heard).toBe(1);
    expect(s1.queue.waiting).toBe(1);
    expect(s1.queue.waitingClips[0]).toMatchObject({ reason: 'cut-off', file, url: `/audio/${file}` });
    expect(s1.quality.fixing.waiting).toBe(1);
    expect(s1.next.file).not.toBe(file);
    const stored = db.prepare('SELECT * FROM listen_checks').get();
    expect(stored).toMatchObject({ file, verdict: 'bad', reason: 'cut-off', note: 'starts too late', user_id: 3 });
  }, ms(30_000));

  it('listen_checks is a user table: deleting the account deletes its verdicts', () => {
    expect(USER_TABLES.some(([t]) => t === 'listen_checks')).toBe(true);
    const db = openMemoryDb();
    seedUsers(db);
    db.prepare(`INSERT INTO listen_checks (user_id, file, track, speed, text, kind, verdict, heard_at) VALUES (2, 'en/x.mp3', 'en', 'normal', 'x', 'word', 'ok', 'now')`).run();
    deleteUser(db, 2);
    expect(db.prepare('SELECT COUNT(*) AS n FROM listen_checks').get().n).toBe(0);
  });
});

describe('audio:check reads the fix queue', () => {
  it('the latest verdict per file decides; an OK after a Bad takes the clip out', async () => {
    const file = path.join(tmp, 'listen.sqlite');
    const db = new Database(file);
    runMigrations(db);
    seedUsers(db);
    const ins = db.prepare(`INSERT INTO listen_checks (user_id, file, track, speed, text, kind, verdict, reason, note, heard_at) VALUES (3, ?, 'en', 'normal', ?, 'word', ?, ?, ?, ?)`);
    ins.run('en/a.mp3', 'old', 'bad', 'babble', 'old old', '2026-10-14T10:00:00Z');
    ins.run('en/b.mp3', 'eight', 'bad', null, null, '2026-10-14T10:01:00Z');
    ins.run('en/b.mp3', 'eight', 'ok', null, null, '2026-10-14T10:02:00Z');
    db.close();
    process.env.ANZO_LISTEN_DB = file;
    try {
      const bad = await readListenBad(ROOT, { log: () => {} });
      expect([...bad.keys()]).toEqual(['en/a.mp3']);
      expect(bad.get('en/a.mp3')).toMatchObject({ reason: 'babble', note: 'old old' });
    } finally {
      delete process.env.ANZO_LISTEN_DB;
    }
  });
});
