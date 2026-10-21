// Children's reports, the inbox, one-time messages and the corrections API (search, preview, queue to the spool,
// results, undo, the e2e stub runner, the bug-hunter badge).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openMemoryDb } from '../src/db/index.js';
import { loadContent } from '../src/content/loader.js';
import { seedUsers } from '../src/lib/users.js';
import { createReport, REPORTS_PER_DAY } from '../src/ops/reports.js';
import { collectResults, substitute } from '../src/ops/corrections.js';
import { ensureSpool } from '../src/ops/spool.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(here, '../../content');
const content = loadContent({ contentDir: CONTENT_DIR });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-api-reports-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const LESSON = 'en-pre-a1-u01-l01';
const lessonEx = content.lessons.get(LESSON).lesson.exercises;
const EX = lessonEx[0];

function makeApp({ jobRunner = 'spool' } = {}) {
  const spoolDir = fs.mkdtempSync(path.join(tmp, 'spool-'));
  ensureSpool(spoolDir);
  const db = openMemoryDb();
  seedUsers(db);
  const config = {
    version: 'test', sessionSecret: 'x'.repeat(48), dataDir: tmp, audioDir: path.join(tmp, 'no-audio'), contentDir: CONTENT_DIR,
    clientDist: path.join(tmp, 'no-dist'), loginRateLimit: 100, modelsDir: tmp, spoolDir, logDir: path.join(tmp, 'logs'),
    backupDir: path.join(tmp, 'backups'), rootDir: path.resolve(here, '../..'), jobRunner,
  };
  const audio = { url: () => null, both: () => ({ audio: null, audioSlow: null }), missing: 0, loaded: true };
  const logger = pino({ level: 'silent' });
  const app = createApp({ db, content, audio, config, logger });
  return { app, db, config, ctx: { db, config, logger, content, audio } };
}
async function agent(app, username, password) {
  const a = request.agent(app);
  expect((await a.post('/api/auth/login').send({ username, password })).status).toBe(200);
  return a;
}
async function adminAgent(app) {
  const a = request.agent(app);
  await a.post('/api/auth/login').send({ username: 'admin', password: 'admin' });
  await a.post('/api/auth/password').send({ current: 'admin', next: 'admin-pass-1' });
  return a;
}

describe('children\'s reports', () => {
  it('stores what the child saw, their latest answer and the correct one; admins and other tracks are refused', async () => {
    const { app, db } = makeApp();
    const kid1 = await agent(app, 'kid1', 'kid1');
    await kid1.post('/api/progress/attempt').send({ lessonId: LESSON, exerciseId: EX.id, answer: 'koe', firstTry: true });
    const res = await kid1.post('/api/reports').send({ exerciseId: EX.id, reason: 'native', note: '  waarom  koe? ' });
    expect(res.status).toBe(201);
    const row = db.prepare('SELECT * FROM content_reports').get();
    expect(row).toMatchObject({ exercise_id: EX.id, lesson_id: LESSON, pack_id: 'en-pre-a1', unit_id: 'en-pre-a1-u01', track: 'en', reason: 'native', note: 'waarom koe?', ui_lang: 'nl', status: 'open' });
    const snap = JSON.parse(row.snapshot);
    expect(snap).toMatchObject({ childAnswer: 'koe', childCorrect: false, uiLang: 'nl', correctAnswer: EX.options.find((o) => o.correct).text.nl });
    expect(snap.exercise).toMatchObject({ id: EX.id, type: EX.type, instruction: expect.any(String) });
    expect(snap.exercise.options).not.toBeUndefined();
    expect(JSON.stringify(snap.exercise)).not.toContain('"correct"');

    expect((await kid1.post('/api/reports').send({ exerciseId: EX.id, reason: 'nope' })).status).toBe(400);
    expect((await kid1.post('/api/reports').send({ exerciseId: EX.id, reason: 'other', note: 'x'.repeat(201) })).status).toBe(400);
    expect((await kid1.post('/api/reports').send({ exerciseId: 'fr-a1-1-u01-l01-e01', reason: 'other' })).status).toBe(404);
    const admin = await adminAgent(app);
    expect((await admin.post('/api/reports').send({ exerciseId: EX.id, reason: 'other' })).status).toBe(403);
  });

  it('the same exercise again within 7 days updates an open report; a closed one keeps its outcome; 10 new reports a day at most', () => {
    const { db, ctx } = makeApp();
    const kid1 = db.prepare("SELECT * FROM users WHERE username = 'kid1'").get();
    const day = new Date('2026-10-02T08:00:00Z');
    expect(createReport(ctx, kid1, { exerciseId: EX.id, reason: 'native' }, day).updated).toBe(false);
    expect(createReport(ctx, kid1, { exerciseId: EX.id, reason: 'target' }, new Date('2026-10-03T08:00:00Z')).updated).toBe(true);
    db.prepare("UPDATE content_reports SET status = 'closed', resolution = 'fixed', correction_id = 7").run();
    const again = createReport(ctx, kid1, { exerciseId: EX.id, reason: 'audio', note: 'echt' }, new Date('2026-10-05T08:00:00Z'));
    expect(again.updated).toBe(false);
    expect(db.prepare('SELECT reason, note, status, resolution, correction_id FROM content_reports ORDER BY id').all()).toEqual([
      { reason: 'target', note: '', status: 'closed', resolution: 'fixed', correction_id: 7 },
      { reason: 'audio', note: 'echt', status: 'open', resolution: null, correction_id: null },
    ]);
    // After 7 days it is a new report.
    expect(createReport(ctx, kid1, { exerciseId: EX.id, reason: 'native' }, new Date('2026-10-13T08:00:00Z')).updated).toBe(false);

    const ids = [...content.exercises.values()].filter((e) => e.trackId === 'en').slice(1, 1 + REPORTS_PER_DAY + 1).map((e) => e.exercise.id);
    const later = new Date('2026-10-20T07:00:00Z');
    for (const id of ids.slice(0, REPORTS_PER_DAY)) createReport(ctx, kid1, { exerciseId: id, reason: 'other' }, later);
    expect(() => createReport(ctx, kid1, { exerciseId: ids[REPORTS_PER_DAY], reason: 'other' }, later)).toThrow(/report_limit/);
    // Updating one of today's does not count; the next Amsterdam day is fine again.
    expect(createReport(ctx, kid1, { exerciseId: ids[0], reason: 'native' }, later).updated).toBe(true);
    expect(createReport(ctx, kid1, { exerciseId: ids[REPORTS_PER_DAY], reason: 'other' }, new Date('2026-10-20T22:30:00Z')).updated).toBe(false);
  });
});

describe('inbox and one-time messages', () => {
  it('groups open reports per exercise; "already correct" sends each child a message in their language, shown once', async () => {
    const { app } = makeApp();
    const kid1 = await agent(app, 'kid1', 'kid1');
    const admin = await adminAgent(app);
    // A second English child, with English as app language.
    await admin.post('/api/admin/users').send({ username: 'tom', displayName: 'Tom', role: 'child', course: { track: 'en' }, uiLang: 'en', avatar: 'fox', avatarBg: 'sky', password: 'tom1' });
    const tom = await agent(app, 'tom', 'tom1');
    await kid1.post('/api/reports').send({ exerciseId: EX.id, reason: 'native', note: 'kat?' });
    await tom.post('/api/reports').send({ exerciseId: EX.id, reason: 'target' });
    await kid1.post('/api/reports').send({ exerciseId: lessonEx[1].id, reason: 'audio' });

    const { groups } = (await admin.get('/api/admin/inbox')).body;
    expect(groups.map((g) => [g.exerciseId, g.count])).toEqual([[lessonEx[1].id, 1], [EX.id, 2]]);
    const g = groups[1];
    expect(g.reasons).toEqual({ native: 1, target: 1 });
    expect(g.reports.map((r) => r.displayName).sort()).toEqual(['Sam', 'Tom']);
    expect(g.items.map((i) => i.id)).toEqual(EX.items);
    expect(g.current).toMatchObject({ id: EX.id, answer: expect.any(String) });
    expect((await admin.get('/api/admin/summary')).body).toMatchObject({ openReports: 2 });

    expect((await admin.post(`/api/admin/inbox/${EX.id}`).send({ action: 'correct', message: true })).body).toEqual({ closed: 2, messages: 2 });
    expect((await admin.post(`/api/admin/inbox/${EX.id}`).send({ action: 'correct' })).status).toBe(404);
    const zm = (await kid1.get('/api/messages')).body.messages;
    expect(zm).toEqual([expect.objectContaining({ kind: 'checked', text: 'Bedankt! We hebben het gecontroleerd: het was goed.' })]);
    expect((await tom.get('/api/messages')).body.messages[0].text).toBe('Thank you! We checked it: it was correct.');
    expect((await kid1.post(`/api/messages/${zm[0].id}/shown`)).status).toBe(204);
    expect((await kid1.get('/api/messages')).body.messages).toEqual([]);
    // Another child cannot mark it.
    expect((await tom.post(`/api/messages/${zm[0].id}/shown`)).status).toBe(204);

    // Dismiss: closed without a message; a custom text reaches the child as written.
    expect((await admin.post(`/api/admin/inbox/${lessonEx[1].id}`).send({ action: 'dismiss' })).body).toEqual({ closed: 1, messages: 0 });
    expect((await kid1.get('/api/messages')).body.messages).toEqual([]);
    await kid1.post('/api/reports').send({ exerciseId: lessonEx[2].id, reason: 'other' });
    await admin.post(`/api/admin/inbox/${lessonEx[2].id}`).send({ action: 'correct', message: 'Goed gezien, maar het klopt toch!' });
    expect((await kid1.get('/api/messages')).body.messages[0].text).toBe('Goed gezien, maar het klopt toch!');
    expect((await kid1.get('/api/admin/inbox')).status).toBe(403);
  });

  it('"fixed another way" (e.g. an audio re-render): closed as fixed, the "fixed" message and the bug-hunter badge', async () => {
    const { app, db } = makeApp();
    const kid1 = await agent(app, 'kid1', 'kid1');
    const admin = await adminAgent(app);
    await kid1.post('/api/reports').send({ exerciseId: EX.id, reason: 'audio' });
    expect((await admin.post(`/api/admin/inbox/${EX.id}`).send({ action: 'fixed' })).body).toEqual({ closed: 1, messages: 1 });
    expect(db.prepare('SELECT status, resolution FROM content_reports WHERE exercise_id = ?').get(EX.id)).toEqual({ status: 'closed', resolution: 'fixed' });
    const m = (await kid1.get('/api/messages')).body.messages;
    expect(m).toEqual([expect.objectContaining({ kind: 'fixed', text: 'Bedankt! Jouw melding heeft een fout opgelost.', badge: 'bug-hunter' })]);
    const zolaId = db.prepare("SELECT id FROM users WHERE username = 'kid1'").pluck().get();
    expect(db.prepare("SELECT COUNT(*) FROM user_badges WHERE user_id = ? AND badge_id = 'bug-hunter'").pluck().get(zolaId)).toBe(1);
    expect((await admin.post(`/api/admin/inbox/${EX.id}`).send({ action: 'fixed' })).status).toBe(404); // nothing open any more
    await kid1.post('/api/reports').send({ exerciseId: lessonEx[1].id, reason: 'audio' });
    expect((await admin.post(`/api/admin/inbox/${lessonEx[1].id}`).send({ action: 'nope' })).status).toBe(400);
  });
});

describe('corrections API', () => {
  it('search by English, Dutch, item id and exercise id; item detail with its source and exercises', async () => {
    const { app } = makeApp();
    const admin = await adminAgent(app);
    const byText = (await admin.get('/api/admin/corrections/search?q=cat')).body;
    expect(byText.vocabulary[0]).toMatchObject({ id: 'en.cat', target: 'cat', native: 'kat', track: 'en', level: 'Pre-A1 Starters' });
    expect((await admin.get('/api/admin/corrections/search?q=kat')).body.vocabulary[0].id).toBe('en.cat');
    expect((await admin.get(`/api/admin/corrections/search?q=${EX.id}`)).body.exercise).toMatchObject({ id: EX.id });
    expect((await admin.get('/api/admin/corrections/search?q=ecole')).body.vocabulary.map((v) => v.id)).toContain('fr.ecole');
    const item = (await admin.get('/api/admin/corrections/item/en.cat')).body.item;
    expect(item).toMatchObject({ id: 'en.cat', kind: 'vocabulary', editable: { target: 'cat', native: 'kat', acceptAlso: [] }, sourceFile: 'content/src/en/pre-a1/01-animals.yaml' });
    expect(item.exercises.length).toBeGreaterThan(3);
    expect((await admin.get('/api/admin/corrections/item/en.nope')).status).toBe(404);
  });

  it('preview: before/after of each exercise, the audio warning only for target text; invalid input explained', async () => {
    const { app } = makeApp();
    const admin = await adminAgent(app);
    const p = (await admin.post('/api/admin/corrections/preview').send({ id: 'en.cat', after: { target: 'kitty' } })).body;
    expect(p).toMatchObject({ audioChange: true, after: { target: 'kitty' }, usedIn: p.exercises.length });
    const mc = p.exercises.find((x) => x.type === 'multiple_choice' && x.before.question === 'cat');
    expect(mc.after.question).toBe('kitty');
    const dutch = (await admin.post('/api/admin/corrections/preview').send({ id: 'en.cat', after: { native: 'poes' } })).body;
    expect(dutch.audioChange).toBe(false);
    expect((await admin.post('/api/admin/corrections/preview').send({ id: 'en.cat', after: { native: 'kat' } })).body).toEqual({ error: 'nothing_changed' });
    expect((await admin.post('/api/admin/corrections/preview').send({ id: 'en.cat', after: { native: ' ', target: 'x'.repeat(201) } })).body)
      .toEqual({ error: 'invalid_correction', fields: { native: 'required', target: 'too_long' } });
  });

  it('a correction is spooled as a request; the job\'s result is recorded; undo is queued the same way', async () => {
    const { app, config, ctx } = makeApp();
    const admin = await adminAgent(app);
    const res = await admin.post('/api/admin/corrections').send({ id: 'en.cat', after: { native: 'kat, poes' }, reason: 'both words' });
    expect(res.status).toBe(201);
    expect(res.body.correction).toMatchObject({ id: 1, status: 'queued', kind: 'edit', summary: 'en.cat: Dutch "kat" → "kat, poes"', before: { native: 'kat' } });
    const reqFile = path.join(config.spoolDir, 'requests/000001.json');
    expect(JSON.parse(fs.readFileSync(reqFile, 'utf8'))).toMatchObject({
      id: 1, kind: 'edit', author: 'admin', packId: 'en-pre-a1', unitId: 'en-pre-a1-u01', target: { kind: 'vocabulary', id: 'en.cat' },
      before: { native: 'kat' }, after: { native: 'kat, poes' }, reason: 'both words',
    });
    // The job's result arrives in results/; the service records it and moves the file to processed/.
    fs.writeFileSync(path.join(config.spoolDir, 'results/000001.json'), JSON.stringify({ id: 1, status: 'applied', reason: 'Applied.', commit: 'abc1234def', detail: 'log' }));
    expect(collectResults(ctx)).toBe(1);
    expect(fs.existsSync(path.join(config.spoolDir, 'processed/000001.result.json'))).toBe(true);
    const applied = (await admin.get('/api/admin/corrections/1')).body.correction;
    expect(applied).toMatchObject({ status: 'applied', commit: 'abc1234def', canUndo: true });

    const undo = await admin.post('/api/admin/corrections/1/undo');
    expect(undo.body.correction).toMatchObject({ id: 2, kind: 'undo', undoOf: 1, summary: expect.stringMatching(/^undo #1/) });
    expect(JSON.parse(fs.readFileSync(path.join(config.spoolDir, 'requests/000002.json'), 'utf8')).undo).toEqual({ of: 1, commit: 'abc1234def' });
    expect((await admin.post('/api/admin/corrections/1/undo')).status).toBe(409); // already queued
    fs.writeFileSync(path.join(config.spoolDir, 'results/000002.json'), JSON.stringify({ id: 2, status: 'applied', commit: 'fff' }));
    collectResults(ctx);
    expect((await admin.get('/api/admin/corrections/1')).body.correction).toMatchObject({ undoneBy: 2, canUndo: false });
    // A rejected result keeps the plain reason and the detail.
    await admin.post('/api/admin/corrections/hide').send({ exerciseId: EX.id, reason: 'wrong picture' });
    fs.writeFileSync(path.join(config.spoolDir, 'results/000003.json'), JSON.stringify({ id: 3, status: 'rejected', reason: '"x" isn\'t on the A1 word list.', detail: 'trace output' }));
    collectResults(ctx);
    expect((await admin.get('/api/admin/corrections')).body.corrections[0]).toMatchObject({ id: 3, kind: 'hide', status: 'rejected', resultReason: '"x" isn\'t on the A1 word list.', detail: 'trace output' });
    expect((await admin.post('/api/admin/corrections/hide').send({ exerciseId: EX.id })).body).toEqual({ error: 'invalid_correction', fields: { reason: 'required' } });
  });

  it('Fix from the inbox (stub runner applies at once): reports close, the child is thanked and earns bug-hunter once', async () => {
    const { app, db } = makeApp({ jobRunner: 'stub' });
    const kid1 = await agent(app, 'kid1', 'kid1');
    const admin = await adminAgent(app);
    await kid1.post('/api/reports').send({ exerciseId: EX.id, reason: 'native' });
    const res = await admin.post('/api/admin/corrections').send({ id: EX.items[0], after: { native: 'kat (dier)' }, reportExercise: EX.id });
    expect(res.body.correction).toMatchObject({ status: 'applied', commit: 'stub' });
    expect(db.prepare('SELECT status, resolution, correction_id FROM content_reports').get()).toEqual({ status: 'closed', resolution: 'fixed', correction_id: 1 });
    const msgs = (await kid1.get('/api/messages')).body.messages;
    expect(msgs).toEqual([expect.objectContaining({ kind: 'fixed', text: 'Bedankt! Jouw melding heeft een fout opgelost.', badge: 'bug-hunter' })]);
    expect((await kid1.get('/api/profile')).body.badges.find((b) => b.id === 'bug-hunter')).toMatchObject({ family: 'bug', earnedAt: expect.any(String) });
    // A second fixed report: thanked again, no second badge announcement.
    await kid1.post('/api/reports').send({ exerciseId: lessonEx[1].id, reason: 'native' });
    // (The stub changes no files: the item still reads "kat".)
    expect((await admin.post('/api/admin/corrections').send({ id: EX.items[0], after: { native: 'kat, poes' }, reportExercise: lessonEx[1].id })).status).toBe(201);
    const all = (await kid1.get('/api/messages')).body.messages;
    expect(all).toHaveLength(2);
    const second = all.at(-1);
    expect(second).toMatchObject({ kind: 'fixed' });
    expect(second.badge).toBeUndefined();
  });

  it('preview substitution: a sentence change rebuilds the tiles and the fill-in; a blanked word that changes is flagged', () => {
    const build = { type: 'build_sentence', id: 'x', items: ['en.cat'], sentenceId: 's', answer: 'The cat is black.', tokens: ['The', 'cat', 'is', 'black.'] };
    expect(substitute(build, 'sentence', 's', { target: 'The cat is black.' }, { target: 'The cat is white.' }).exercise.tokens).toEqual(['The', 'cat', 'is', 'white.']);
    const fill = { type: 'fill_blank', id: 'y', items: ['en.cat'], sentenceId: 's', sentence: 'The ___ is black.', answer: 'cat' };
    expect(substitute(fill, 'sentence', 's', { target: 'The cat is black.' }, { target: 'My cat is black.' }).exercise.sentence).toBe('My ___ is black.');
    expect(substitute(fill, 'vocabulary', 'en.cat', { target: 'cat' }, { target: 'kitty' }).mayChange).toBe(true);
  });
});
