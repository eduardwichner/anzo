// Admin → Corrections for French for English speakers (track fr-en, ids fe…). Its items are found and edited like
// any course's; the meaning is the course's own (the `en` layer of the French unit sources), the French text is shared with the
// French course for Dutch speakers (the form says so), and the content job maps the course's ids to the sources (fe.bonjour →
// fr.bonjour in content/src/fr/a1-1). A hide applies to the course that hid the exercise only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import request from 'supertest';
import YAML from 'yaml';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openMemoryDb } from '../src/db/index.js';
import { loadContent } from '../src/content/loader.js';
import { seedUsers } from '../src/lib/users.js';
import { itemDetail, previewEdit, searchContent, sourceIdOf } from '../src/ops/corrections.js';
import { ensureSpool } from '../src/ops/spool.js';
import { affectedPacks, applyEditToText, applyHideToText, sourceSide } from '../../scripts/jobs/content-job-lib.js';
import { readPackSources } from '../../scripts/content/sources.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(here, '../../content');
const content = loadContent({ contentDir: CONTENT_DIR });
const audio = { url: () => null, both: () => ({ audio: null, audioSlow: null }), missing: 0, loaded: true };
const ctx = { content, audio, contentDir: CONTENT_DIR };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-courses-variant-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('Corrections: fe items next to fr items', () => {
  it('a search finds both courses\' items; each says its course, target and meaning language, and who shares the French', () => {
    const r = searchContent(content, audio, 'bonjour');
    const fe = r.vocabulary.find((v) => v.id === 'fe.bonjour');
    const fr = r.vocabulary.find((v) => v.id === 'fr.bonjour');
    expect(fe).toMatchObject({ target: 'bonjour', native: 'hello', track: 'fr-en', targetLang: 'fr', nativeLang: 'en', packId: 'fe-a1-1',
      sharedWith: [{ track: 'fr', nativeLang: 'nl' }] });
    expect(fr).toMatchObject({ native: 'hallo', track: 'fr', targetLang: 'fr', nativeLang: 'nl', sharedWith: [{ track: 'fr-en', nativeLang: 'en' }] });
    // the English meaning is searchable
    expect(searchContent(content, audio, 'hello').vocabulary.map((v) => v.id)).toContain('fe.bonjour');
    // the exercises listed are the course's own
    expect(fe.exercises.every((e) => e.id.startsWith('fe-'))).toBe(true);
  });

  it('the item\'s editable meaning is its English one, read from the French unit source', () => {
    const item = itemDetail(ctx, 'fe.bonjour');
    expect(item.editable).toEqual({ target: 'bonjour', native: 'hello', acceptAlso: [] });
    expect(item.sourceFile).toBe('content/src/fr/a1-1/01-famille.yaml');
    expect(itemDetail(ctx, 'fr.bonjour').editable.native).toBe('hallo');
    const s = itemDetail(ctx, 'fe-a1-1-u01-s02');
    expect(s.editable.native).toBe('Hello, my name is Paul.');
  });

  it('a preview of a meaning edit changes this course only; a French edit names the course that shares it', () => {
    const meaning = previewEdit(ctx, 'fe.bonjour', { native: 'hello, good morning' });
    expect(meaning).toMatchObject({ before: { native: 'hello' }, after: { native: 'hello, good morning' }, audioChange: false, sharedWith: [] });
    expect(meaning.exercises.length).toBeGreaterThan(0);
    const french = previewEdit(ctx, 'fe.bonjour', { target: 'bonjour !' });
    expect(french).toMatchObject({ audioChange: true, sharedWith: [{ track: 'fr', nativeLang: 'nl' }] });
  });

  it('ids map to the sources by the course prefix', () => {
    expect(sourceIdOf('fe.bonjour', 'fe', 'fr')).toBe('fr.bonjour');
    expect(sourceIdOf('fe-a1-1-u01-s02', 'fe', 'fr')).toBe('fr-a1-1-u01-s02');
    expect(sourceIdOf('fr.bonjour', 'fr', 'fr')).toBe('fr.bonjour');
    expect(sourceIdOf('fe.fe', 'fe', 'fr')).toBe('fr.fe');
  });
});

describe('Corrections API: a fe edit is queued with the course\'s ids and an English summary', () => {
  it('summary names English, the request names fe-a1-1 and fe ids', async () => {
    const spoolDir = fs.mkdtempSync(path.join(tmp, 'spool-'));
    ensureSpool(spoolDir);
    const db = openMemoryDb();
    seedUsers(db);
    const config = {
      version: 'test', sessionSecret: 'x'.repeat(48), dataDir: tmp, audioDir: path.join(tmp, 'no-audio'), contentDir: CONTENT_DIR,
      clientDist: path.join(tmp, 'no-dist'), loginRateLimit: 100, modelsDir: tmp, spoolDir, logDir: path.join(tmp, 'logs'),
      backupDir: path.join(tmp, 'backups'), rootDir: path.resolve(here, '../..'), jobRunner: 'spool',
    };
    const app = createApp({ db, content, audio, config, logger: pino({ level: 'silent' }) });
    const admin = request.agent(app);
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'admin' });
    await admin.post('/api/auth/password').send({ current: 'admin', next: 'admin-pass-1' });
    const item = (await admin.get('/api/admin/corrections/item/fe.bonjour')).body.item;
    expect(item).toMatchObject({ track: 'fr-en', targetLang: 'fr', nativeLang: 'en', editable: { native: 'hello' } });
    const res = await admin.post('/api/admin/corrections').send({ id: 'fe.bonjour', after: { native: 'hello, good morning' }, reason: 'both' });
    expect(res.status).toBe(201);
    expect(res.body.correction).toMatchObject({ track: 'fr-en', packId: 'fe-a1-1', unitId: 'fe-a1-1-u01', targetId: 'fe.bonjour',
      summary: 'fe.bonjour: English "hello" → "hello, good morning"' });
    const req = JSON.parse(fs.readFileSync(path.join(spoolDir, 'requests/000001.json'), 'utf8'));
    expect(req).toMatchObject({ packId: 'fe-a1-1', track: 'fr-en', unitId: 'fe-a1-1-u01', target: { kind: 'vocabulary', id: 'fe.bonjour' } });
    expect(sourceSide(req)).toEqual({ unitId: 'fr-a1-1-u01', id: 'fr.bonjour', target: 'fr', native: 'en' });
    const french = await admin.post('/api/admin/corrections').send({ id: 'fe.bonjour', after: { target: 'Bonjour' } });
    expect(french.body.correction.summary).toBe('fe.bonjour: French "bonjour" → "Bonjour"');
  });
});

describe('the content job on the shared French source', () => {
  const UNIT = fs.readFileSync(path.join(CONTENT_DIR, 'src/fr/a1-1/01-famille.yaml'), 'utf8');
  const line = (text, re) => text.split('\n').find((l) => re.test(l));
  it('an fe meaning edit changes only the en value; an fr edit only the nl one; a French edit the shared target', () => {
    const en = applyEditToText(UNIT, { track: 'fr', unitId: 'fr-a1-1-u01', kind: 'vocabulary', id: 'fr.bonjour', before: { native: 'hello' },
      after: { native: 'hello, good morning' }, native: 'en' });
    expect(line(en, /fr\.bonjour/)).toBe('  - { id: fr.bonjour, target: bonjour, native: { nl: hallo, en: "hello, good morning" }, pos: exclamation }');
    const nl = applyEditToText(UNIT, { track: 'fr', unitId: 'fr-a1-1-u01', kind: 'vocabulary', id: 'fr.bonjour', before: { native: 'hallo' }, after: { native: 'hoi, hallo' } });
    expect(line(nl, /fr\.bonjour/)).toContain('native: { nl: "hoi, hallo", en: "hello" }');
    const fr = applyEditToText(UNIT, { track: 'fr', unitId: 'fr-a1-1-u01', kind: 'sentence', id: 'fr-a1-1-u01-s01', before: { target: "Je m'appelle Rose." },
      after: { target: "Je m'appelle Léa." }, native: 'en' });
    expect(line(fr, /^ {2}- \{ id: s01,/)).toContain(`target: "Je m'appelle Léa."`);
    expect(line(fr, /^ {2}- \{ id: s01,/)).toContain('en: "My name is Rose."');
    // the meaning the request saw must still be there
    expect(() => applyEditToText(UNIT, { track: 'fr', unitId: 'fr-a1-1-u01', kind: 'vocabulary', id: 'fr.bonjour', before: { native: 'hallo' },
      after: { native: 'x' }, native: 'en' })).toThrow(/changed since/);
  });

  it('a correction of fe-a1-1 rebuilds the French packs from that level up and the fe packs that exist', () => {
    const packs = affectedPacks('fe-a1-1');
    expect(packs.slice(0, 5)).toEqual(['fr-a1-1', 'fr-a1', 'fr-a2', 'fr-b1', 'fr-b2']);
    expect(packs).toContain('fe-a1-1');
    expect(affectedPacks('fr-a1-1')).toEqual(packs);
  });

  it('a hide names the course\'s exercise and applies to that course only', () => {
    const dir = path.join(tmp, 'src');
    fs.cpSync(path.join(CONTENT_DIR, 'src/fr/a1-1'), path.join(dir, 'fr/a1-1'), { recursive: true });
    const file = path.join(dir, 'fr/a1-1/01-famille.yaml');
    let text = applyHideToText(fs.readFileSync(file, 'utf8'), { exerciseId: 'fe-a1-1-u01-l01-e03', reason: 'test' });
    text = applyHideToText(text, { exerciseId: 'fr-a1-1-u01-l02-e01', reason: 'test' });
    fs.writeFileSync(file, text);
    expect(YAML.parse(text).hidden.map((h) => h.exercise)).toEqual(['fe-a1-1-u01-l01-e03', 'fr-a1-1-u01-l02-e01']);
    const unitOf = (packId) => readPackSources(packId, dir).units.find((u) => u.id === 'fr-a1-1-u01');
    expect(unitOf('fe-a1-1').hidden).toEqual([{ exercise: 'fr-a1-1-u01-l01-e03', reason: 'test' }]);
    expect(unitOf('fr-a1-1').hidden).toEqual([{ exercise: 'fr-a1-1-u01-l02-e01', reason: 'test' }]);
    expect(readPackSources('fr-a1-1', dir).units.find((u) => u.id === 'fr-a1-1-u02').hidden).toBeUndefined();
  });
});
