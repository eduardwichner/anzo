import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openMemoryDb } from '../src/db/index.js';
import { attemptItemIds, loadContent } from '../src/content/loader.js';
import { seedUsers } from '../src/lib/users.js';
import { clipsForPacks, readAudioOverrides, readPronunciations } from '../src/audio/clips.js';
import { loadAudio } from '../src/audio/manifest.js';
import { buildManifest } from '../../scripts/render-audio/render.js';
import { ms } from './slow.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(here, '../../content');
const content = loadContent({ contentDir: CONTENT_DIR });
const VOICES_JSON = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'voices.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-api-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

// A fake rendered audio dir: 1 KB dummy "MP3" per clip the content needs (incl. the voice samples), plus manifest.
const AUDIO_DIR = path.join(tmp, 'audio');
const MODELS_DIR = path.join(tmp, 'models');
{
  const voices = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'voices.json'), 'utf8'));
  const clips = clipsForPacks([...content.packs.values()].map((p) => ({ ...p.pack, target: p.target })), voices, readAudioOverrides(CONTENT_DIR), readPronunciations(CONTENT_DIR));
  for (const c of clips) {
    fs.mkdirSync(path.join(AUDIO_DIR, c.track), { recursive: true });
    fs.writeFileSync(path.join(AUDIO_DIR, c.file), Buffer.alloc(1000, 7));
  }
  fs.writeFileSync(path.join(AUDIO_DIR, 'manifest.json'), JSON.stringify(buildManifest(clips, voices, {})));
  const v = voices.en.voice;
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  fs.writeFileSync(path.join(MODELS_DIR, 'manifest.json'), JSON.stringify({
    voices: [{ name: v, licence: 'public domain', licenceAssessment: 'permissive', speakers: 1, files: { onnx: { size: 63_000_000 } } }],
  }));
}

function makeApp(overrides = {}) {
  const db = openMemoryDb();
  seedUsers(db);
  const config = {
    version: 'test', sessionSecret: 'x'.repeat(48), dataDir: tmp, audioDir: AUDIO_DIR, modelsDir: MODELS_DIR,
    contentDir: CONTENT_DIR, clientDist: path.join(tmp, 'no-dist'), loginRateLimit: 10, ...overrides,
  };
  const audio = loadAudio({ audioDir: config.audioDir, contentDir: CONTENT_DIR, content });
  return { db, audio, app: createApp({ db, content, audio, config, logger: pino({ level: 'silent' }) }) };
}

/** The seeded admin must change its password before any admin route works. */
async function adminAgent(app, next = 'beheer-test-1') {
  const agent = await login(app, 'admin', 'admin');
  expect((await agent.get('/api/admin/users')).body).toEqual({ error: 'must_change_password' });
  expect((await agent.post('/api/auth/password').send({ current: 'admin', next })).status).toBe(204);
  return agent;
}

async function login(app, username, password = username) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ username, password });
  expect(res.status).toBe(200);
  return agent;
}

describe('API', () => {
  let app;
  let db;
  beforeAll(() => ({ app, db } = makeApp()));

  it('GET /api/health: 200 with the loaded packs when the database, every available pack and every clip are there', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, version: 'test', packs: [...content.packs.keys()] });
    expect(res.body.packs).toEqual(expect.arrayContaining(['en-pre-a1', 'fr-a1-1']));
  });

  it('GET /api/users/profiles lists the login-grid accounts by display name without logging in', async () => {
    const res = await request(app).get('/api/users/profiles');
    expect(res.body.profiles.map((p) => p.username)).toEqual(['kid2', 'kid1']);
    expect(res.body.profiles[0]).toEqual({ username: 'kid2', displayName: 'Alex', avatar: 'rabbit', avatarBg: 'peach', uiLang: 'nl' });
  });

  it('POST /api/auth/login {uiLang} saves the login-screen language to that account only, and only on success', async () => {
    const langs = () => Object.fromEntries(db.prepare('SELECT username, ui_lang FROM users').all().map((r) => [r.username, r.ui_lang]));
    const before = langs();
    expect((await request(app).post('/api/auth/login').send({ username: 'kid2', password: 'wrong', uiLang: 'en' })).status).toBe(401);
    expect(langs()).toEqual(before);
    expect((await request(app).post('/api/auth/login').send({ username: 'kid2', password: 'kid2', uiLang: 'xx' })).body.user.uiLang).toBe('nl');
    expect(langs()).toEqual(before);
    const ok = await request(app).post('/api/auth/login').send({ username: 'kid2', password: 'kid2', uiLang: 'en' });
    expect(ok.body.user.uiLang).toBe('en');
    expect(langs()).toEqual({ ...before, kid2: 'en' });
    // Without uiLang the saved language is kept.
    expect((await request(app).post('/api/auth/login').send({ username: 'kid2', password: 'kid2' })).body.user.uiLang).toBe('en');
    await request(app).post('/api/auth/login').send({ username: 'kid2', password: 'kid2', uiLang: 'nl' });
    expect(langs()).toEqual(before);
  });

  it('protected routes return 401 without a session', async () => {
    for (const url of ['/api/auth/me', '/api/content/tracks', '/api/progress/me', '/api/admin/users']) {
      expect((await request(app).get(url)).status).toBe(401);
    }
  });

  it('wrong password: 401 and no session cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'kid1', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('session cookie: httpOnly, SameSite=Lax, 30 days; Secure only behind an HTTPS proxy', async () => {
    const plain = await request(app).post('/api/auth/login').send({ username: 'kid1', password: 'kid1' });
    const cookie = plain.headers['set-cookie'][0];
    expect(cookie).toMatch(/^anzo\.sid=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    const expires = new Date(cookie.match(/Expires=([^;]+)/)[1]).getTime();
    expect(Math.round((expires - Date.now()) / 86_400_000)).toBe(30);
    expect(cookie).not.toMatch(/Secure/);

    const proxied = await request(app).post('/api/auth/login').set('X-Forwarded-Proto', 'https').send({ username: 'kid1', password: 'kid1' });
    expect(proxied.headers['set-cookie'][0]).toMatch(/; Secure/);
  });

  it('children see only their own track; admin sees all', async () => {
    const kid1 = await login(app, 'kid1');
    const tracks = (await kid1.get('/api/content/tracks')).body.tracks;
    expect(tracks.map((t) => t.id)).toEqual(['en']);
    // a preview pack is a "later" row for a learner (Admin → Levels → Preview only)
    expect(tracks[0].packs.map((p) => p.status)).toEqual(content.manifest.tracks[0].packs.map((p) => (p.status === 'preview' ? 'roadmap' : p.status)));
    expect((await kid1.get('/api/content/packs/fr-a1-1')).status).toBe(403);
    expect((await kid1.get('/api/content/packs/en-b1')).status).toBe(200);
    expect((await kid1.get('/api/content/packs/en-b2')).status).toBe(200); // available

    const admin = await adminAgent(app);
    expect((await admin.get('/api/content/tracks')).body.tracks.map((t) => t.id)).toEqual(['en', 'fr', 'nl', 'fr-en']);
  });

  // The English pack is generated (npm run content:generate): tests find exercises by type, not by fixed id.
  const L1 = 'en-pre-a1-u01-l01';
  const l1 = () => content.lessons.get(L1).lesson.exercises;
  const first = (type, pred = () => true) => l1().find((e) => e.type === type && pred(e));
  const nl = (t) => (typeof t === 'string' ? t : t.nl);

  it('attempts are graded server-side and update item_strength', async () => {
    const kid1 = await login(app, 'kid1');
    const post = (exerciseId, answer) => kid1.post('/api/progress/attempt').send({ lessonId: L1, exerciseId, answer });

    const audioUrl = expect.stringMatching(/^\/audio\/en\/[0-9a-f]{16}\.mp3$/);
    const mc = first('multiple_choice', (e) => e.items[0] === 'en.cat');
    const right = nl(mc.options.find((o) => o.correct).text);
    const wrong = nl(mc.options.find((o) => !o.correct).text);
    expect((await post(mc.id, right)).body).toEqual({ correct: true, audio: audioUrl, audioSlow: audioUrl });
    expect((await post(mc.id, wrong)).body).toMatchObject({ correct: false, correctAnswer: right, audio: audioUrl });
    const build = first('build_sentence');
    expect((await post(build.id, build.tokens)).body).toMatchObject({ correct: true, audio: audioUrl });
    const match = first('match_pairs');
    expect((await post(match.id, { mistakes: 0 })).body).toEqual({ correct: true }); // match_pairs: no answer audio
    const fill = first('fill_blank');
    expect((await post(fill.id, ` ${fill.answer.toUpperCase()} `)).body).toMatchObject({ correct: true });
    expect((await post(`${L1}-e99`, 'x')).status).toBe(404);
    expect((await kid1.post('/api/progress/attempt').send({ lessonId: 'fr-a1-1-u01-l01', exerciseId: 'fr-a1-1-u01-l01-e01', answer: 'hallo' })).status).toBe(403);

    const strength = (id) => db.prepare('SELECT strength FROM item_strength WHERE user_id = 1 AND item_id = ?').pluck().get(id);
    let expected = 0;
    for (const [e, ok] of [[mc, true], [mc, false], [build, true], [match, true], [fill, true]]) {
      if (attemptItemIds(e).includes('en.cat')) expected = Math.max(0, Math.min(5, expected + (ok ? 1 : -1)));
    }
    expect(strength('en.cat')).toBe(expected);
    expect(strength(build.sentenceId)).toBe(1); // build_sentence exercises its sentence via sentenceId
    expect(db.prepare('SELECT COUNT(*) FROM attempts WHERE user_id = 1').pluck().get()).toBe(5);
  });

  it('French typed answers without accents are accepted with a note', async () => {
    const kid2 = await login(app, 'kid2');
    // a typed French fill-in (A1 and up) whose answer has an accent, from the real pack
    let found;
    for (const [lessonId, l] of content.lessons) {
      if (l.trackId !== 'fr') continue;
      const ex = l.lesson.exercises.find((x) => x.type === 'fill_blank' && !x.options && /[éèàê]/.test(x.answer));
      if (ex) {
        found = { lessonId, ex };
        break;
      }
    }
    const stripped = found.ex.answer.normalize('NFD').replace(/\p{M}/gu, '');
    const res = await kid2.post('/api/progress/attempt').send({ lessonId: found.lessonId, exerciseId: found.ex.id, answer: stripped });
    expect(res.body).toMatchObject({ correct: true, note: 'accents', correctAnswer: found.ex.answer });
  });

  it('listening exercises: graded server-side, answer audio only after answering, listened item tracked', async () => {
    const kid1 = await login(app, 'kid1');
    const post = (exerciseId, answer) => kid1.post('/api/progress/attempt').send({ lessonId: L1, exerciseId, answer });
    const lcT = first('listen_choose', (e) => e.answerSide === 'target');
    expect((await post(lcT.id, lcT.options.find((o) => o.correct).text)).body).toMatchObject({ correct: true });
    const lcN = first('listen_choose', (e) => e.answerSide === 'native');
    const rightN = nl(lcN.options.find((o) => o.correct).text);
    expect((await post(lcN.id, nl(lcN.options.find((o) => !o.correct).text))).body).toMatchObject({ correct: false, correctAnswer: rightN });
    const lt = first('listen_type');
    expect((await post(lt.id, lt.answer.replace(/[.!?]$/, ''))).body).toMatchObject({ correct: true });
    // One typo in a word of 5+ letters is "almost": correct with the spelling shown.
    const all = [...content.exercises.values()].filter((x) => x.packId === 'en-pre-a1' && x.exercise.type === 'listen_type');
    const { exercise: ltLong, lessonId } = all.find((x) => x.exercise.answer.split(' ').some((w) => w.replace(/\W/g, '').length >= 5));
    const long = ltLong.answer.split(' ').findIndex((w) => w.replace(/\W/g, '').length >= 5);
    const typo = ltLong.answer.split(' ').map((w, i) => (i === long ? w.slice(0, 2) + w.slice(3) : w)).join(' ');
    const almost = (await kid1.post('/api/progress/attempt').send({ lessonId, exerciseId: ltLong.id, answer: typo })).body;
    expect(almost).toMatchObject({ correct: true, note: 'spelling', correctAnswer: ltLong.answer });
    expect(almost.audio).toMatch(/^\/audio\/en\//);
    expect((await post(lt.id, 'The cap is green and red.')).body).toMatchObject({ correct: false });
    const n = db.prepare('SELECT COUNT(*) FROM attempts WHERE exercise_id = ? AND item_ids LIKE ?').pluck().get(lt.id, `%${lt.listen}%`);
    expect(n).toBe(2);
  });

  it('pack responses carry clip URLs (audio, audioSlow, wordAudio) and no listened text', async () => {
    const kid1 = await login(app, 'kid1');
    const pack = (await kid1.get('/api/content/packs/en-pre-a1')).body;
    const url = /^\/audio\/en\/[0-9a-f]{16}\.mp3$/;
    const unit = pack.units[0];
    expect(unit.vocabulary.find((v) => v.id === 'en.cat')).toEqual({ id: 'en.cat', audio: expect.stringMatching(url), audioSlow: expect.stringMatching(url) });
    expect(unit.sentences[0].audio).toMatch(url);
    expect(unit.sentences[0].audioSlow).toMatch(url);
    expect(unit.sentences[0].audio).not.toBe(unit.sentences[0].audioSlow);
    expect(pack.wordAudio.cat).toBe(unit.vocabulary.find((v) => v.id === 'en.cat').audio);
    expect(Object.keys(pack.wordAudio)).toEqual(expect.arrayContaining(['the', 'is', 'black', 'frog']));
    const lt = unit.lessons[0].exercises.find((e) => e.type === 'listen_type');
    expect(lt).toEqual({ type: 'listen_type', id: first('listen_type').id, instruction: 'exercise.listen_type', audio: expect.stringMatching(url), audioSlow: expect.stringMatching(url) });
    expect(JSON.stringify(pack)).not.toMatch(/The cat is black/);
    expect(JSON.stringify(pack)).not.toContain(first('listen_type').answer);
  });

  it('serves clips as immutable audio/mpeg with range support, and nothing else under /audio', async () => {
    const kid1 = await login(app, 'kid1');
    const clip = (await kid1.get('/api/content/packs/en-pre-a1')).body.units[0].vocabulary[0].audio;
    const full = await request(app).get(clip);
    expect(full.status).toBe(200);
    expect(full.headers['content-type']).toBe('audio/mpeg');
    expect(full.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(full.headers['accept-ranges']).toBe('bytes');
    const part = await request(app).get(clip).set('Range', 'bytes=0-99');
    expect(part.status).toBe(206);
    expect(part.headers['content-range']).toBe('bytes 0-99/1000');
    expect(part.headers['content-length']).toBe('100');
    for (const bad of ['/audio/manifest.json', '/audio/en/', '/audio/en/../manifest.json', '/audio/_audition/index.json', '/audio/en/0000000000000000.mp3']) {
      expect((await request(app).get(bad)).status).toBe(404);
    }
  });

  it('completing a lesson awards XP and starts the streak; totals are checked', async () => {
    const kid1 = await login(app, 'kid1');
    expect((await kid1.post('/api/progress/lesson/en-pre-a1-u01-l01/complete').send({ firstTryCorrect: 5, total: 4 })).status).toBe(400);
    expect((await kid1.post('/api/progress/lesson/en-pre-a1-u01-l01/complete').send({ firstTryCorrect: 3, total: 8 })).status).toBe(400);

    const total = l1().length; // every exercise is playable, listening ones included
    expect((await kid1.post('/api/progress/lesson/en-pre-a1-u01-l01/complete').send({ firstTryCorrect: 8, total: 9 })).body)
      .toEqual({ error: 'invalid_result', expectedTotal: total });

    const res = await kid1.post('/api/progress/lesson/en-pre-a1-u01-l01/complete').send({ firstTryCorrect: total - 1, total });
    const xp1 = 10 * (total - 1) + 5 + 20;
    expect(res.body).toMatchObject({ xpEarned: xp1, score: Math.round((100 * (total - 1)) / total), stats: { xp: xp1, streak: 1 } });

    const again = await kid1.post('/api/progress/lesson/en-pre-a1-u01-l01/complete').send({ firstTryCorrect: total, total });
    expect(again.body.stats).toMatchObject({ xp: xp1 + 10 * total + 20, streak: 1 });

    const me = (await kid1.get('/api/progress/me')).body;
    expect(me.lessons['en-pre-a1-u01-l01']).toMatchObject({ best_score: 100, times_completed: 2 });
    const tracks = (await kid1.get('/api/content/tracks')).body.tracks;
    const lessonsTotal = content.packs.get('en-pre-a1').requiredLessonIds.length; // extra lessons are optional
    expect(tracks[0].packs[0].progress).toEqual({ lessonsDone: 1, lessonsTotal, percent: Math.round(100 / lessonsTotal) });
  });

  it('password change checks the current password and minimum length', async () => {
    const { app: a } = makeApp();
    const kid2 = await login(a, 'kid2');
    expect((await kid2.post('/api/auth/password').send({ current: 'wrong', next: 'abcd' })).status).toBe(400);
    expect((await kid2.post('/api/auth/password').send({ current: 'kid2', next: 'abc' })).body).toEqual({ error: 'password_too_short', min: 4 });
    expect((await kid2.post('/api/auth/password').send({ current: 'kid2', next: 'abcd' })).status).toBe(204);
    expect((await request(a).post('/api/auth/login').send({ username: 'kid2', password: 'kid2' })).status).toBe(401);
    await login(a, 'kid2', 'abcd');

    const admin = await login(a, 'admin');
    expect((await admin.post('/api/auth/password').send({ current: 'admin', next: 'short' })).body.min).toBe(8);
  });

  it('the seeded admin must change its password; an admin reset forces it again; children are never blocked', async () => {
    const { app: a, db: d } = makeApp();
    const admin = await login(a, 'admin');
    expect((await admin.get('/api/auth/me')).body.user.mustChangePassword).toBe(true);
    expect((await admin.get('/api/admin/users')).status).toBe(403);
    expect((await admin.post('/api/auth/password').send({ current: 'admin', next: 'beheer-test-1' })).status).toBe(204);
    expect((await admin.get('/api/auth/me')).body.user.mustChangePassword).toBe(false);
    expect((await admin.get('/api/admin/users')).status).toBe(200);

    // An admin sets someone's password -> that user must change it (the flag is set for children too,
    // but only admins are blocked by it).
    const kid2 = d.prepare("SELECT id FROM users WHERE username = 'kid2'").pluck().get();
    expect((await admin.post(`/api/admin/users/${kid2}/password`).send({ next: 'vosje' })).status).toBe(204);
    expect(d.prepare('SELECT must_change_password FROM users WHERE id = ?').pluck().get(kid2)).toBe(1);
    const annaAgent = await login(a, 'kid2', 'vosje');
    expect((await annaAgent.get('/api/auth/me')).body.user.mustChangePassword).toBe(true);
    expect((await annaAgent.get('/api/content/tracks')).status).toBe(200);

    const self = d.prepare("SELECT id FROM users WHERE username = 'admin'").pluck().get();
    expect((await admin.post(`/api/admin/users/${self}/password`).send({ next: 'beheer-test-2' })).status).toBe(204);
    expect((await admin.get('/api/admin/users')).body).toEqual({ error: 'must_change_password' });
  });

  it('logout ends the session', async () => {
    const kid1 = await login(app, 'kid1');
    expect((await kid1.post('/api/auth/logout')).status).toBe(204);
    expect((await kid1.get('/api/auth/me')).status).toBe(401);
  });

  it('admin routes: 403 for children, full access for admin', async () => {
    const { app: a } = makeApp();
    const kid1 = await login(a, 'kid1');
    expect((await kid1.get('/api/admin/users')).status).toBe(403);

    const admin = await adminAgent(a);
    const users = (await admin.get('/api/admin/users')).body.users;
    expect(users.map((u) => [u.username, u.role, u.activeTrack, u.courses.map((c) => c.track)]))
      .toEqual([['kid2', 'child', 'fr', ['fr']], ['kid1', 'child', 'en', ['en']], ['admin', 'admin', null, []]]);
    const kid2 = users.find((u) => u.username === 'kid2');

    expect((await admin.post(`/api/admin/users/${kid2.id}/password`).send({ next: 'abc' })).status).toBe(400);
    expect((await admin.post(`/api/admin/users/${kid2.id}/password`).send({ next: 'nieuw1' })).status).toBe(204);
    const annaAgent = await login(a, 'kid2', 'nieuw1');
    const fr1 = content.lessons.get('fr-a1-1-u01-l01').playableCount;
    await annaAgent.post('/api/progress/lesson/fr-a1-1-u01-l01/complete').send({ firstTryCorrect: fr1, total: fr1 });

    const progress = (await admin.get(`/api/admin/users/${kid2.id}/progress`)).body;
    expect(progress.stats.xp).toBe(fr1 * 10 + 20);
    expect(progress.packs[0].units[0].lessons[0]).toMatchObject({ id: 'fr-a1-1-u01-l01', done: true, bestScore: 100 });

    expect((await admin.post(`/api/admin/users/${kid2.id}/progress/reset`)).body).toEqual({ error: 'invalid_scope' });
    expect((await admin.post(`/api/admin/users/${kid2.id}/progress/reset`).send({ scope: 'track' })).status).toBe(200);
    const after = (await admin.get(`/api/admin/users/${kid2.id}/progress`)).body;
    expect(after.stats.xp).toBe(0);
    expect(after.packs[0].units[0].lessons[0].done).toBe(false);
    expect((await admin.get('/api/admin/users/999/progress')).status).toBe(404);

    const voices = (await admin.get('/api/admin/voices')).body.tracks;
    expect(voices.map((v) => v.track)).toEqual(['en', 'fr', 'nl']);
    expect(voices[0]).toMatchObject({ voice: VOICES_JSON.en.voice, licence: 'public domain', licenceAssessment: 'permissive' });
    expect(voices[0]).not.toHaveProperty('candidates');
    expect(voices[0].sample).toEqual({ text: VOICES_JSON.en.sample, url: expect.stringMatching(/^\/audio\/en\/[0-9a-f]{16}\.mp3$/) });
    expect((await request(a).get(voices[0].sample.url)).status).toBe(200);
    expect((await kid1.get('/api/admin/voices')).status).toBe(403);
  });

  it('login is rate limited: the 11th failed attempt within a minute gets 429', async () => {
    const { app: a } = makeApp();
    for (let i = 0; i < 10; i++) {
      expect((await request(a).post('/api/auth/login').send({ username: 'kid1', password: 'x' })).status).toBe(401);
    }
    expect((await request(a).post('/api/auth/login').send({ username: 'kid1', password: 'x' })).status).toBe(429);
  });

  it('unknown /api routes are JSON 404; other routes fall through to the SPA', async () => {
    expect((await request(app).get('/api/nope')).body).toEqual({ error: 'not_found' });
    const spa = await request(app).get('/lesson/abc');
    expect(spa.status).toBe(503); // no client build in this test config
  });

  it('sends a strict CSP without upgrade-insecure-requests', async () => {
    const csp = (await request(app).get('/api/health')).headers['content-security-policy'];
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp).not.toMatch(/unsafe-inline/);
    expect(csp).not.toMatch(/upgrade-insecure-requests/);
  });
});

describe('GET /api/health: 503 with plain problems', () => {
  const config = { version: 'test', sessionSecret: 'x'.repeat(48), dataDir: tmp, audioDir: AUDIO_DIR, modelsDir: MODELS_DIR, contentDir: CONTENT_DIR, clientDist: path.join(tmp, 'no-dist'), loginRateLimit: 10 };
  const build = ({ db = openMemoryDb(), c = content, audio = loadAudio({ audioDir: AUDIO_DIR, contentDir: CONTENT_DIR, content }) } = {}) => {
    seedUsers(db);
    return { db, app: createApp({ db, content: c, audio, config, logger: pino({ level: 'silent' }) }) };
  };
  const expect503 = async (app, problem) => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, version: 'test', problems: [problem] });
    expect(JSON.stringify(res.body)).not.toMatch(/at |\/opt\/|SESSION|secret/i);
  };

  it('the database does not answer', async () => {
    const { db, app } = build();
    db.close();
    await expect503(app, 'database not readable');
  });

  it('GET /api/live stays 200 while health is 503 (liveness checks neither the database nor the content)', async () => {
    const { db, app } = build();
    db.close();
    const res = await request(app).get('/api/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('the users table is not readable', async () => {
    const { db, app } = build();
    db.pragma('foreign_keys = OFF');
    db.exec('DROP TABLE users');
    await expect503(app, 'database not readable');
  });

  it('an available pack is not loaded', async () => {
    const c = { ...content, packs: new Map([...content.packs].filter(([id]) => id !== 'fr-a1')) };
    await expect503(build({ c }).app, 'pack fr-a1 is available but not loaded');
  });

  it('no audio manifest', async () => {
    const audio = loadAudio({ audioDir: path.join(tmp, 'no-audio'), contentDir: CONTENT_DIR, content });
    await expect503(build({ audio }).app, 'audio manifest not loaded (run npm run audio:render)');
  });

  it('audio clips missing', async () => {
    const dir = path.join(tmp, 'audio-partial');
    fs.mkdirSync(dir, { recursive: true });
    // hard links, not an 847 MB copy; the manifest is a real copy, the clips links (a copy if linking fails)
    for (const e of fs.readdirSync(AUDIO_DIR, { withFileTypes: true })) {
      const from = path.join(AUDIO_DIR, e.name);
      if (!e.isDirectory()) { fs.copyFileSync(from, path.join(dir, e.name)); continue; }
      fs.mkdirSync(path.join(dir, e.name), { recursive: true });
      for (const f of fs.readdirSync(from)) {
        try { fs.linkSync(path.join(from, f), path.join(dir, e.name, f)); } catch { fs.copyFileSync(path.join(from, f), path.join(dir, e.name, f)); }
      }
    }
    const victims = fs.readdirSync(path.join(dir, 'fr')).slice(0, 3);
    for (const f of victims) fs.rmSync(path.join(dir, 'fr', f));
    const audio = loadAudio({ audioDir: dir, contentDir: CONTENT_DIR, content });
    expect(audio.missing).toBeGreaterThanOrEqual(3);
    await expect503(build({ audio }).app, `${audio.missing} audio clip(s) missing (run npm run audio:render)`);
  }, ms(60_000)); // links the whole audio/ (three languages, ~50,000 clips)
});
