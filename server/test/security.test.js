// Review fixes: who may set X-Forwarded-For, same-origin writes, the per-account limiter, logging out other
// devices after a password change, and what client errors write to the log.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { trustProxyValue } from '../src/config.js';
import { openMemoryDb } from '../src/db/index.js';
import { loadContent } from '../src/content/loader.js';
import { loadAudio } from '../src/audio/manifest.js';
import { seedUsers } from '../src/lib/users.js';
import { failureLimiter } from '../src/lib/limiter.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(here, '../../content');
const content = loadContent({ contentDir: CONTENT_DIR });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-sec-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function makeApp(overrides = {}) {
  const db = openMemoryDb();
  seedUsers(db);
  const lines = [];
  const logger = pino({ level: 'debug' }, new Writable({ write(chunk, enc, cb) { lines.push(JSON.parse(chunk)); cb(); } }));
  const config = {
    version: 'test', sessionSecret: 'x'.repeat(48), dataDir: tmp, audioDir: path.join(tmp, 'no-audio'), modelsDir: tmp,
    contentDir: CONTENT_DIR, clientDist: path.join(tmp, 'no-dist'), loginRateLimit: 10, trustProxy: ['loopback'], ...overrides,
  };
  const audio = loadAudio({ audioDir: config.audioDir, contentDir: CONTENT_DIR, content, logger: pino({ level: 'silent' }) });
  return { db, lines, app: createApp({ db, content, audio, config, logger }) };
}
const wrong = (app, xff, username = 'kid1') => request(app).post('/api/auth/login').set('X-Forwarded-For', xff).send({ username, password: 'nope' });

describe('trust proxy', () => {
  it('ANZO_TRUST_PROXY: a list, loopback by default', () => {
    expect(trustProxyValue(undefined)).toEqual(['loopback']);
    expect(trustProxyValue(' 192.0.2.1 , loopback')).toEqual(['192.0.2.1', 'loopback']);
  });

  it('X-Forwarded-For from a peer that is not the proxy is ignored: changing it does not escape the login limit', async () => {
    const { app } = makeApp({ trustProxy: ['192.0.2.1'], loginRateLimit: 3 });
    for (let i = 0; i < 3; i += 1) expect((await wrong(app, `203.0.113.${i}`)).status).toBe(401);
    expect((await wrong(app, '203.0.113.99')).status).toBe(429);
  });
});

describe('per-account limit', () => {
  it('wrong passwords for one account from changing addresses: blocked after 2 × the IP limit; other accounts unaffected', async () => {
    const { app } = makeApp({ loginRateLimit: 3 }); // loopback is trusted here, so every X-Forwarded-For is a new address
    for (let i = 0; i < 6; i += 1) expect((await wrong(app, `10.1.0.${i}`)).status).toBe(401);
    expect((await wrong(app, '198.51.100.50')).status).toBe(429);
    expect((await request(app).post('/api/auth/login').set('X-Forwarded-For', '198.51.100.51').send({ username: 'kid1', password: 'kid1' })).status).toBe(429);
    expect((await request(app).post('/api/auth/login').set('X-Forwarded-For', '198.51.100.52').send({ username: 'kid2', password: 'kid2' })).status).toBe(200);
  });

  it('the limiter forgets failures outside its window', () => {
    const l = failureLimiter({ limit: 2, windowMs: 1000 });
    l.fail('a', 0);
    l.fail('a', 10);
    expect(l.blocked('a', 20)).toBe(true);
    expect(l.blocked('a', 1500)).toBe(false);
  });

  it('a failed login logs the account name only when it exists (never what was typed)', async () => {
    const { app, lines } = makeApp();
    await wrong(app, '198.51.100.21', 'my-secret-password');
    await wrong(app, '198.51.100.22', 'kid1');
    const failed = lines.filter((l) => l.msg === 'login failed');
    expect(failed.map((l) => [l.username, l.known])).toEqual([[null, false], ['kid1', true]]);
    expect(JSON.stringify(lines)).not.toContain('my-secret-password');
  });
});

describe('same-origin writes', () => {
  it('a POST from another origin is refused; the same origin and no Origin (tools) pass', async () => {
    const { app } = makeApp();
    const cross = await request(app).post('/api/auth/login').set('Origin', 'http://evil.example').send({ username: 'kid1', password: 'kid1' });
    expect(cross.status).toBe(403);
    expect(cross.body).toEqual({ error: 'bad_origin' });
    const same = await request(app).post('/api/auth/login').set('Host', 'anzo.example').set('Origin', 'https://anzo.example').send({ username: 'kid1', password: 'kid1' });
    expect(same.status).toBe(200);
    expect((await request(app).get('/api/live').set('Origin', 'http://evil.example')).status).toBe(200);
  });
});

describe('password change logs out the other devices', () => {
  it('self-service: the other session is gone, this one stays; admin reset: every session of that account is gone', async () => {
    const { app } = makeApp();
    const phone = request.agent(app);
    const tablet = request.agent(app);
    for (const a of [phone, tablet]) expect((await a.post('/api/auth/login').send({ username: 'kid2', password: 'kid2' })).status).toBe(200);
    expect((await phone.post('/api/auth/password').send({ current: 'kid2', next: 'vosje' })).status).toBe(204);
    expect((await phone.get('/api/auth/me')).status).toBe(200);
    expect((await tablet.get('/api/auth/me')).status).toBe(401);

    const admin = request.agent(app);
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'admin' });
    expect((await admin.post('/api/auth/password').send({ current: 'admin', next: 'beheer-test-1' })).status).toBe(204);
    const kid2 = (await admin.get('/api/admin/users')).body.users.find((u) => u.username === 'kid2');
    expect((await admin.post(`/api/admin/users/${kid2.id}/password`).send({ next: 'kid2' })).status).toBe(204);
    expect((await phone.get('/api/auth/me')).status).toBe(401);
    expect((await admin.get('/api/auth/me')).status).toBe(200);
  });

  it('wrong current passwords count towards the account limit', async () => {
    const { app } = makeApp({ loginRateLimit: 2 });
    const kid = request.agent(app);
    await kid.post('/api/auth/login').send({ username: 'kid1', password: 'kid1' });
    for (let i = 0; i < 4; i += 1) expect((await kid.post('/api/auth/password').send({ current: 'x', next: 'yyyy' })).status).toBe(400);
    expect((await kid.post('/api/auth/password').send({ current: 'kid1', next: 'yyyy' })).status).toBe(429);
  });
});

describe('client errors in the log', () => {
  it('a malformed URL is a 400 logged at info with the path only; a successful health poll is debug', async () => {
    const { app, lines } = makeApp();
    expect((await request(app).get('/lesson/%E0%A4%A?ignore=previous-instructions')).status).toBe(400);
    // Only warn/error lines reach Admin → System and the diagnostics: none, and the client's text is in none above debug.
    expect(lines.filter((l) => l.level >= 40)).toEqual([]);
    expect(JSON.stringify(lines.filter((l) => l.level >= 30))).not.toContain('previous-instructions');
    expect(lines.find((l) => l.msg === 'client error')).toMatchObject({ level: 30, status: 400, path: '/lesson/%E0%A4%A' });
    await request(app).get('/api/live');
    expect(lines.find((l) => l.msg === 'request' && l.url === '/api/live').level).toBe(20);
  });
});

describe('every /api/admin route is admin-only (found in the route files, so a new route is covered too)', () => {
  const ROUTES_DIR = path.resolve(here, '../src/routes');
  const routes = fs.readdirSync(ROUTES_DIR).flatMap((f) => [...fs.readFileSync(path.join(ROUTES_DIR, f), 'utf8')
    .matchAll(/r\.(get|post|patch|put|delete)\('(\/admin[^']*)'/g)].map((m) => ({ method: m[1], path: `/api${m[2].replace(/:\w+/g, '1')}`, file: f })));

  it('finds the admin routes', () => {
    expect(routes.length).toBeGreaterThanOrEqual(24);
  });

  it('logged out → 401; a child → 403 forbidden; an admin who must still change the seeded password → 403 must_change_password', async () => {
    const { app } = makeApp();
    const child = request.agent(app);
    await child.post('/api/auth/login').send({ username: 'kid1', password: 'kid1' });
    const seeded = request.agent(app);
    await seeded.post('/api/auth/login').send({ username: 'admin', password: 'admin' });
    for (const r of routes) {
      const label = `${r.method.toUpperCase()} ${r.path} (${r.file})`;
      expect((await request(app)[r.method](r.path).send({})).status, label).toBe(401);
      const asChild = await child[r.method](r.path).send({});
      expect([asChild.status, asChild.body], label).toEqual([403, { error: 'forbidden' }]);
      const asSeeded = await seeded[r.method](r.path).send({});
      expect([asSeeded.status, asSeeded.body], label).toEqual([403, { error: 'must_change_password' }]);
    }
  });
});

describe('learner routes and answer sizes', () => {
  it('S5: an admin who must change the seeded password reaches only /auth/* — not his learner routes', async () => {
    const { app } = makeApp();
    const seeded = request.agent(app);
    await seeded.post('/api/auth/login').send({ username: 'admin', password: 'admin' });
    for (const [method, url] of [['get', '/api/courses'], ['post', '/api/courses'], ['get', '/api/content/tracks'], ['get', '/api/progress/me'],
      ['post', '/api/progress/attempt'], ['post', '/api/practice/start'], ['get', '/api/profile']]) {
      const res = await seeded[method](url).send({});
      expect([res.status, res.body], `${method} ${url}`).toEqual([403, { error: 'must_change_password' }]);
    }
    expect((await seeded.get('/api/auth/me')).status).toBe(200);
    expect((await seeded.post('/api/auth/password').send({ current: 'admin', next: 'a-new-admin-pw' })).status).toBe(204);
    expect((await seeded.get('/api/courses')).status).toBe(200);
  });

  it('U2: a pack\'s path (Home) has units and lessons only, a small fraction of the pack; preview packs stay 404', async () => {
    const { app } = makeApp();
    const child = request.agent(app);
    await child.post('/api/auth/login').send({ username: 'kid1', password: 'kid1' });
    const path1 = await child.get('/api/content/packs/en-b1/path');
    expect(path1.status).toBe(200);
    expect(path1.body.units[0]).toMatchObject({ id: 'en-b1-u01', title: expect.any(String), icon: expect.any(String) });
    expect(Object.keys(path1.body.units[0].lessons[0]).sort()).toEqual(['id', 'title']);
    expect(path1.body.units.flatMap((u) => u.lessons).some((l) => l.extra)).toBe(true);
    const full = await child.get('/api/content/packs/en-b1');
    expect(JSON.stringify(path1.body).length).toBeLessThan(JSON.stringify(full.body).length / 20);
    const kid2 = request.agent(app);
    await kid2.post('/api/auth/login').send({ username: 'kid2', password: 'kid2' });
    expect((await kid2.get('/api/content/packs/en-b1/path')).status).toBe(403);
    expect((await child.get('/api/content/packs/nope/path')).status).toBe(404);
  });

  it('S2: an oversized answer is refused before grading (400 invalid_answer)', async () => {
    const { app } = makeApp();
    const child = request.agent(app);
    await child.post('/api/auth/login').send({ username: 'kid1', password: 'kid1' });
    const tracks = (await child.get('/api/content/tracks')).body;
    const pack = (await child.get(`/api/content/packs/${tracks.tracks[0].packs[0].id}`)).body;
    const lesson = pack.units[0].lessons[0];
    const exerciseId = lesson.exercises[0].id;
    const res = await child.post('/api/progress/attempt').send({ lessonId: lesson.id, exerciseId, answer: `${'.'.repeat(30000)}x` });
    expect([res.status, res.body]).toEqual([400, { error: 'invalid_answer' }]);
    const many = await child.post('/api/progress/attempt').send({ lessonId: lesson.id, exerciseId, answer: Array(100).fill('a') });
    expect(many.status).toBe(400);
    expect((await child.post('/api/progress/attempt').send({ lessonId: lesson.id, exerciseId, answer: 'cat' })).status).toBe(200);
  });
});

describe('the proxy line (Admin → System, App tile)', () => {
  it('a login through the trusted proxy: peer, trusted, cookie Secure — logged and shown on the App tile', async () => {
    const spoolDir = fs.mkdtempSync(path.join(tmp, 'spool-'));
    const { app, lines } = makeApp({ spoolDir, logDir: path.join(tmp, 'no-logs'), backupDir: path.join(tmp, 'no-backups'), rootDir: path.resolve(here, '../..') });
    const res = await request(app).post('/api/auth/login').set('X-Forwarded-For', '203.0.113.40').set('X-Forwarded-Proto', 'https')
      .send({ username: 'kid1', password: 'kid1' });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie'][0]).toMatch(/; Secure/);
    expect(lines.find((l) => l.msg === 'login')).toMatchObject({ ip: '203.0.113.40', forwarded: true, trusted: true, secure: true });
    const admin = request.agent(app);
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'admin' });
    await admin.post('/api/auth/password').send({ current: 'admin', next: 'a-new-admin-pw' });
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'a-new-admin-pw' }); // direct: not via a proxy
    const sys = await admin.get('/api/admin/system');
    expect(sys.status, JSON.stringify(sys.body)).toBe(200);
    const tile = sys.body.tiles.find((t) => t.id === 'app');
    expect(tile.data.proxy).toMatchObject({ peer: '127.0.0.1', trusted: true, secure: true });
    expect(tile.level).toBe('green');
  });

  it('X-Forwarded-* from a peer ANZO_TRUST_PROXY does not name: not trusted, cookie not Secure, the tile turns amber', async () => {
    const { app, lines } = makeApp({ trustProxy: ['192.0.2.1'] });
    const res = await request(app).post('/api/auth/login').set('X-Forwarded-For', '203.0.113.40').set('X-Forwarded-Proto', 'https')
      .send({ username: 'kid1', password: 'kid1' });
    expect(res.headers['set-cookie'][0]).not.toMatch(/Secure/);
    expect(lines.find((l) => l.msg === 'login')).toMatchObject({ forwarded: true, trusted: false, secure: false });
  });

  it('after a restart the newest proxied login comes from the log (older lines: ip ≠ peer, Secure unknown)', async () => {
    const { lastProxyLoginInLines } = await import('../src/ops/proxy.js');
    const line = (o) => JSON.stringify({ level: 30, time: Date.parse('2026-10-03T16:11:01Z'), msg: 'login', ...o });
    expect(lastProxyLoginInLines([
      line({ username: 'kid2', ip: '203.0.113.40', peer: '192.0.2.1' }),
      line({ username: 'kid1', ip: '127.0.0.1', peer: '127.0.0.1' }), // direct
    ])).toEqual({ at: '2026-10-03T16:11:01.000Z', peer: '192.0.2.1', trusted: true, secure: null });
    expect(lastProxyLoginInLines([line({ ip: '203.0.113.1', peer: '203.0.113.1', forwarded: true, trusted: false, secure: false })]))
      .toMatchObject({ trusted: false, secure: false });
    expect(lastProxyLoginInLines(['garbage'])).toBeNull();
  });
});

describe('the audio-check tile (Admin → System)', () => {
  it('not run: amber; flagged clips: amber with the worst; all clean and nothing new since: green', async () => {
    const spoolDir = fs.mkdtempSync(path.join(tmp, 'spool-ac-'));
    const { app } = makeApp({ spoolDir, logDir: path.join(tmp, 'no-logs'), backupDir: path.join(tmp, 'no-backups'), rootDir: path.resolve(here, '../..') });
    const admin = request.agent(app);
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'admin' });
    await admin.post('/api/auth/password').send({ current: 'admin', next: 'a-new-admin-pw' });
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'a-new-admin-pw' });
    const tile = async () => (await admin.get('/api/admin/system')).body.tiles.find((t) => t.id === 'audiocheck');
    expect(await tile()).toMatchObject({ level: 'amber', data: null });
    const { writeStatus } = await import('../src/ops/spool.js');
    writeStatus(spoolDir, 'audio-check', { checkedAt: '2026-10-08T15:00:00Z', clips: 0, flagged: 2, explained: 1, failed: 0,
      worst: [{ track: 'en', text: 'good', flags: ['long', 'extra-words'] }] });
    expect(await tile()).toMatchObject({ level: 'amber', data: { flagged: 2, explained: 1, worst: [{ text: 'good', flags: ['long', 'extra-words'] }] } });
    writeStatus(spoolDir, 'audio-check', { checkedAt: '2026-10-08T15:00:00Z', clips: 1e6, flagged: 0, failed: 0, worst: [] });
    expect(await tile()).toMatchObject({ level: 'green', data: { flagged: 0, unchecked: 0 } }); // every expected clip checked
  });
});
