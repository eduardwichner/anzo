// Manifest status `preview` — loaded and validated, played in Admin → Levels → Preview,
// never shown to learners; preview play grades like a lesson and stores nothing. Dutch B1 is available
// (`available`): the English pilot stands in for the preview pack, and Dutch B1 shows a text's tap meanings for inflected forms.
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
import { orderToken } from '../src/content/grading.js';
import { seedUsers } from '../src/lib/users.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REAL_CONTENT = path.resolve(here, '../../content');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-preview-'));
// The English and French B1 packs are available. The preview rules are tested on a content directory that links
// to the real one, with a manifest copy in which English B1 is still `preview` (French B1 stays available).
const CONTENT_DIR = path.join(tmp, 'content');
fs.mkdirSync(path.join(CONTENT_DIR, 'packs'), { recursive: true });
for (const name of fs.readdirSync(REAL_CONTENT)) if (name !== 'packs') fs.symlinkSync(path.join(REAL_CONTENT, name), path.join(CONTENT_DIR, name));
for (const name of fs.readdirSync(path.join(REAL_CONTENT, 'packs'))) {
  if (name !== 'manifest.json') fs.symlinkSync(path.join(REAL_CONTENT, 'packs', name), path.join(CONTENT_DIR, 'packs', name));
}
const manifest = JSON.parse(fs.readFileSync(path.join(REAL_CONTENT, 'packs/manifest.json'), 'utf8'));
for (const t of manifest.tracks) for (const p of t.packs) if (p.id === 'en-b1') p.status = 'preview';
fs.writeFileSync(path.join(CONTENT_DIR, 'packs/manifest.json'), JSON.stringify(manifest));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const content = loadContent({ contentDir: CONTENT_DIR });
const PREVIEW = [...content.packs.values()].filter((p) => p.preview).map((p) => p.pack.id).sort();
const TABLES = ['attempts', 'lesson_progress', 'lesson_completions', 'item_strength', 'practice_sessions', 'user_stats', 'user_badges'];

let app;
let db;
let admin;
let dee;
beforeAll(async () => {
  db = openMemoryDb();
  seedUsers(db);
  const config = {
    version: 'test', sessionSecret: 'x'.repeat(48), dataDir: tmp, audioDir: path.join(tmp, 'none'), modelsDir: tmp, contentDir: CONTENT_DIR,
    clientDist: path.join(tmp, 'no-dist'), loginRateLimit: 50,
  };
  const audio = loadAudio({ audioDir: config.audioDir, contentDir: CONTENT_DIR, content });
  app = createApp({ db, content, audio, config, logger: pino({ level: 'silent' }) });
  admin = request.agent(app);
  await admin.post('/api/auth/login').send({ username: 'admin', password: 'admin' });
  await admin.post('/api/auth/password').send({ current: 'admin', next: 'preview-admin-pw' });
  await admin.post('/api/auth/login').send({ username: 'admin', password: 'preview-admin-pw' });
  const made = await admin.post('/api/admin/users').send({
    username: 'dee', displayName: 'Dee', role: 'child', nativeLang: 'nl', audience: 'child', uiLang: 'nl', avatar: 'fox', avatarBg: 'sky',
    password: 'dee-pass', course: { track: 'en' },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  dee = request.agent(app);
  expect((await dee.post('/api/auth/login').send({ username: 'dee', password: 'dee-pass' })).status).toBe(200);
  const bea = await admin.post('/api/admin/users').send({
    username: 'bea', displayName: 'Bea', role: 'child', nativeLang: 'en', audience: 'adult', uiLang: 'en', avatar: 'owl', avatarBg: 'mint',
    password: 'bea-pass', course: { track: 'nl', startPack: 'nl-b1' },
  });
  expect(bea.status, JSON.stringify(bea.body)).toBe(201);
});

describe('preview packs', () => {
  it('a preview pack (English B1 in this test\'s manifest) is loaded as preview; Dutch B1 is available', () => {
    expect(PREVIEW).toContain('en-b1');
    expect(content.packs.get('nl-b1').preview).toBeFalsy();
  });

  it('Dutch B1 (released): a learner gets it, and a tapped inflected form shows its word (durfde → to dare)', async () => {
    const bea = request.agent(app);
    expect((await bea.post('/api/auth/login').send({ username: 'bea', password: 'bea-pass' })).status).toBe(200);
    const row = (await bea.get('/api/content/tracks')).body.tracks.find((t) => t.id === 'nl').packs.find((p) => p.id === 'nl-b1');
    expect(row.status).toBe('available');
    const pack = (await bea.get('/api/content/packs/nl-b1')).body;
    const text = pack.units.flatMap((u) => u.texts || []).find((t) => t.id === 'nl-b1-t21');
    expect(text.meanings.durfde).toBe('to dare');
    expect(text.meanings.durven).toBe('to dare');
  });

  it('a learner never sees one: the level row stays "later", the pack and its lessons do not exist', async () => {
    const tracks = (await dee.get('/api/content/tracks')).body.tracks;
    const row = tracks.find((t) => t.id === 'en').packs.find((p) => p.id === 'en-b1');
    expect(row).toMatchObject({ status: 'roadmap' });
    expect(row.progress).toBeUndefined();
    expect((await dee.get('/api/content/packs/en-b1')).status).toBe(404);
    const lessonId = content.packs.get('en-b1').lessonIds[0];
    const ex = content.lessons.get(lessonId).lesson.exercises[0];
    const att = await dee.post('/api/progress/attempt').send({ lessonId, exerciseId: ex.id, answer: 'x', startedAt: new Date().toISOString() });
    expect(att.status).toBe(404);
    expect((await dee.post(`/api/progress/lesson/${lessonId}/complete`).send({ firstTryCorrect: 1, total: 1 })).status).toBe(404);
    const profile = (await dee.get('/api/profile')).body;
    expect(profile.badges.some((b) => String(b.id).includes('en-b1'))).toBe(false);
  });

  it('the admin sees the status, gets the pack with its texts in the course\'s meaning language', async () => {
    const tracks = (await admin.get('/api/content/tracks')).body.tracks;
    expect(tracks.find((t) => t.id === 'en').packs.find((p) => p.id === 'en-b1').status).toBe('preview');
    const pack = (await admin.get('/api/content/packs/en-b1')).body;
    const [reading, dialogue] = pack.units[0].texts;
    expect(reading).toMatchObject({ kind: 'reading', title: 'De schooltuin' });
    expect(reading.paragraphs[0][0]).toMatchObject({ id: 'en-b1-t01-s01', native: 'Afgelopen voorjaar wilden de kinderen van klas 6 een tuin maken op hun school.' });
    expect(dialogue.speakers).toEqual({ A: { name: 'Emma' }, B: { name: 'Sam' } });
    expect(reading.meanings.gardener).toBe('tuinman, tuinier');
    // no answers in the pack: options without the right one marked, no gap words, order shuffled into a bank
    const ex = pack.units[0].lessons.flatMap((l) => l.exercises);
    const q = ex.find((e) => e.type === 'reading' && e.question.type === 'mc');
    expect(q.question.correct).toBeUndefined();
    expect(ex.find((e) => e.question?.type === 'true_false_notgiven').question.answer).toBeUndefined();
    const cloze = ex.find((e) => e.type === 'cloze');
    expect(cloze.gaps.every((g) => !('word' in g))).toBe(true); // the gap words are the answers
    expect(cloze.parts.some((s) => s.parts.some((p) => typeof p === 'object'))).toBe(true);
    const order = ex.find((e) => e.type === 'order_paragraphs');
    expect(order.segments).toBeUndefined();
    expect(order.bank).toHaveLength(4); // the four paragraphs of the school-garden story
  });

  it('preview play grades like a lesson and stores nothing', async () => {
    const counts = () => Object.fromEntries(TABLES.map((t) => [t, db.prepare(`SELECT COUNT(*) FROM ${t}`).pluck().get()]));
    const before = counts();
    const lesson = content.packs.get('en-b1').pack.units[0].lessons[0];
    const mc = lesson.exercises.find((e) => e.question?.type === 'mc');
    const right = await admin.post('/api/admin/preview/attempt').send({ exerciseId: mc.id, answer: mc.question.options[mc.question.correct] });
    expect(right.body).toMatchObject({ correct: true, preview: true });
    const cloze = lesson.exercises.find((e) => e.type === 'cloze');
    const gaps = await admin.post('/api/admin/preview/attempt').send({ exerciseId: cloze.id, answer: cloze.gaps.map((g, i) => (i === 0 ? 'fout' : g.word)) });
    expect(gaps.body.correct).toBe(false);
    expect(gaps.body.gaps.map((g) => g.correct)).toEqual(cloze.gaps.map((_, i) => i !== 0));
    const order = lesson.exercises.find((e) => e.type === 'order_paragraphs');
    expect((await admin.post('/api/admin/preview/attempt').send({ exerciseId: order.id, answer: order.segments.map((id) => orderToken(order.id, id)) })).body.correct).toBe(true);
    // an available lesson too
    const en = content.lessons.get('en-pre-a1-u01-l01').lesson.exercises.find((e) => e.type === 'match_pairs');
    expect((await admin.post('/api/admin/preview/attempt').send({ exerciseId: en.id, answer: { mistakes: 0 } })).body.correct).toBe(true);
    expect(counts()).toEqual(before);
    expect((await dee.post('/api/admin/preview/attempt').send({ exerciseId: mc.id, answer: 'x' })).status).toBe(403);
  });
});
