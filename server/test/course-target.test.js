// A course's target language separate from its id. The manifest's `target` (en, fr, nl = their ids) and
// the variant course fr-en (French for English speakers: target fr, native en, id prefix fe): sources and the en meaning layer
// (projectNative / missingNative), buildPack (fe ids, units without en left out, none = not generated), the validator's rules,
// the loader (target on packs, lessons, exercises; clips and grading by target), clip collection, the offering rule
// (Coming soon until a level is available), removed-lesson tracks, the content job's affected packs, Corrections leaving the
// variant out — and the existing packs as they were.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openMemoryDb } from '../src/db/index.js';
import { loadContent, publicPack, knownWordsOf } from '../src/content/loader.js';
import { validateContent } from '../src/content/validate.js';
import { loadAudio } from '../src/audio/manifest.js';
import { clipPacks, clipsForPacks, readAudioOverrides, readPronunciations } from '../src/audio/clips.js';
import { allCourses, comingCourses, CourseError, enrol, lessonTrack, offeredCourses } from '../src/lib/courses.js';
import { coursesView } from '../src/routes/courses.js';
import { exercisesUsing } from '../src/ops/corrections.js';
import { createUser, findUserByUsername, seedUsers } from '../src/lib/users.js';
import { TARGET_LANGS } from '../src/lib/langs.js';
import { courseOfPrefix, isLocalized, missingNative, packSourceDir, projectNative, readPackSources } from '../../scripts/content/sources.js';
import { buildPack, withPrefix } from '../../scripts/content/build-pack.js';
import { affectedPacks } from '../../scripts/jobs/content-job-lib.js';
import { formatPack } from '../../scripts/format-packs.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const CONTENT_DIR = path.join(ROOT, 'content');
const PACKS = path.join(CONTENT_DIR, 'packs');
const manifest = JSON.parse(fs.readFileSync(path.join(PACKS, 'manifest.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-target-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
const content = loadContent({ contentDir: CONTENT_DIR });
const strings = (x, out = []) => {
  if (Array.isArray(x)) x.forEach((y) => strings(y, out));
  else if (x && typeof x === 'object') Object.values(x).forEach((y) => strings(y, out));
  else if (typeof x === 'string') out.push(x);
  return out;
};

describe('manifest: target and the fr-en track', () => {
  it('every track names its target; en, fr and nl teach themselves; fr-en teaches fr to English speakers under prefix fe', () => {
    const byId = Object.fromEntries(manifest.tracks.map((t) => [t.id, t]));
    for (const id of ['en', 'fr', 'nl']) expect(byId[id]).toMatchObject({ target: id });
    expect(byId['fr-en']).toMatchObject({ target: 'fr', native: 'en', idPrefix: 'fe', mascot: 'fox', name: { en: 'French', nl: 'Frans' } });
    // A1.1 to B2
    expect(byId['fr-en'].packs.map((p) => [p.id, p.status, p.file])).toEqual([['fe-a1-1', 'available', 'fr-en/a1-1.json'], ['fe-a1', 'available', 'fr-en/a1.json'],
      ['fe-a2', 'available', 'fr-en/a2.json'], ['fe-b1', 'available', 'fr-en/b1.json'], ['fe-b2', 'available', 'fr-en/b2.json']]);
    for (const t of manifest.tracks) expect(TARGET_LANGS).toContain(t.target);
  });
  it('the validator: a variant needs its own id prefix, a real target that is not its native language, pack ids with its prefix', () => {
    const dir = path.join(tmp, 'v');
    fs.mkdirSync(dir, { recursive: true });
    const check = (tracks) => {
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ tracks }));
      return validateContent({ packsDir: dir }).errors.map((e) => e.message);
    };
    const planned = (id) => ({ id, file: null, cefr: 'A1', title: { en: 'A1' }, status: 'planned' });
    const t = (extra) => ({ id: 'fr-en', name: { en: 'French' }, native: 'en', mascot: 'fox', packs: [planned('fe-a1')], ...extra });
    expect(check([t({ target: 'fr', idPrefix: 'fe' })])).toEqual([]);
    expect(check([t({ target: 'fr' })])).toContain('track "fr-en" teaches fr: it needs an idPrefix of its own');
    expect(check([t({ idPrefix: 'fe' })]).join()).toMatch(/track "fr-en" needs a target: one of en, fr, nl/);
    expect(check([t({ target: 'en', idPrefix: 'fe' })])).toContain('target "en" is the course\'s native language');
    expect(check([t({ target: 'fr', idPrefix: 'fe' }), { ...t({ target: 'fr', idPrefix: 'fe' }), id: 'fr' }]).join()).toMatch(/id prefix "fe" is used by another track/);
  });
});

describe('sources: the en meaning layer', () => {
  it('a localized object has only native-language keys with text (an id map is not one); projection keeps the course key only', () => {
    expect(isLocalized({ nl: 'hallo', en: 'hello' })).toBe(true);
    expect(isLocalized({ en: 'fr.en' })).toBe(false); // a text's forms map: inflected word → item id
    expect(isLocalized({ nl: 'jas', vest: null })).toBe(false);
    const unit = { title: { nl: 'Familie', en: 'Family' }, vocabulary: [{ id: 'fr.x', native: { nl: 'x', en: 'x-en' }, forms: { en: 'fr.en' } }] };
    expect(projectNative(unit, 'nl')).toEqual({ title: { nl: 'Familie' }, vocabulary: [{ id: 'fr.x', native: { nl: 'x' }, forms: { en: 'fr.en' } }] });
    expect(projectNative(unit, 'en').title).toEqual({ en: 'Family' });
    expect(missingNative(unit, 'en')).toEqual([]);
    expect(missingNative({ ...unit, lessons: [{ title: { nl: 'Les' } }] }, 'en')).toEqual(['/lessons/0/title']);
  });
  it('fe-a1-1 is read from content/src/fr/a1-1: every unit has its English meanings; the French pack keeps only Dutch', () => {
    expect(courseOfPrefix('fe')).toMatchObject({ track: 'fr-en', target: 'fr', native: 'en' });
    expect(packSourceDir('fe-a1-1')).toMatchObject({ track: 'fr-en', target: 'fr', level: 'a1-1', dir: path.join(CONTENT_DIR, 'src/fr/a1-1') });
    expect(packSourceDir('fr-a1-1')).toMatchObject({ track: 'fr', target: 'fr', variant: null });
    const fe = readPackSources('fe-a1-1');
    expect(fe.meta).toMatchObject({ id: 'fe-a1-1', native: 'en', cefr: 'A1.1' });
    expect(fe.units).toHaveLength(19);
    expect(fe.skipped).toEqual([]);
    for (const level of ['a1', 'a2', 'b1', 'b2']) expect(readPackSources(`fe-${level}`).skipped).toEqual([]);
    expect(readPackSources('fe-b1').units).toHaveLength(20); // B1 and B2 English meanings: fr-en-b1-b2.test.js
    expect(JSON.stringify(fe.units)).not.toMatch(/"nl":/);
    expect(fe.units[0].vocabulary.find((v) => v.id === 'fr.bonjour').native).toEqual({ en: 'hello' });
    const fr = readPackSources('fr-a1-1');
    expect(JSON.stringify(fr.units)).not.toMatch(/"en":/);
    expect(fr.units[0].vocabulary.find((v) => v.id === 'fr.bonjour').native).toEqual({ nl: 'hallo' });
  });
});

describe('buildPack: the variant pack', () => {
  const { pack, skipped } = buildPack('fe-a1-1');
  it('every id under fe (pack, units, lessons, exercises, items, sentences); track fr-en; English meanings only', () => {
    expect(pack).toMatchObject({ id: 'fe-a1-1', track: 'fr-en', cefr: 'A1.1' });
    expect(skipped).toEqual([]);
    expect(pack.units).toHaveLength(19);
    expect(pack.units[0].id).toBe('fe-a1-1-u01');
    const all = strings(pack);
    expect(all.filter((s) => /^fr[.-](?!en$)/.test(s))).toEqual([]);
    expect(all.filter((s) => /^fe[.-]/.test(s)).length).toBeGreaterThan(300);
    expect(JSON.stringify(pack)).not.toMatch(/"nl":/);
    expect(pack.units[0].title).toEqual({ en: 'Me and my family' });
  });
  it('the French unit\'s lessons and exercise types, words and sentences — the meanings (and so some distractors) differ', () => {
    const fr = JSON.parse(fs.readFileSync(path.join(PACKS, 'fr/a1-1.json'), 'utf8')).units[0];
    const shape = (u) => u.lessons.map((l) => l.exercises.map((e) => e.type).join());
    expect(shape(pack.units[0])).toEqual(shape(fr));
    expect(pack.units[0].vocabulary.map((v) => v.target)).toEqual(fr.vocabulary.map((v) => v.target));
  });
  it('content/packs/fr-en/<level>.json is what the sources generate (A1.1–A2; B1 and B2 in fr-en-b1-b2.test.js)', () => {
    expect(formatPack(pack)).toBe(fs.readFileSync(path.join(PACKS, 'fr-en/a1-1.json'), 'utf8'));
    for (const level of ['a1', 'a2']) expect(formatPack(buildPack(`fe-${level}`).pack)).toBe(fs.readFileSync(path.join(PACKS, `fr-en/${level}.json`), 'utf8'));
  });
  it('withPrefix renames ids by their form only: target text and the track id stay', () => {
    const out = withPrefix({ id: 'fr-a1', track: 'fr', items: ['fr.chat'], target: 'fr. chat', x: 'fr-a1-1-u02-s01', y: 'fr-ancien' }, 'fr', { track: 'fr-en', prefix: 'fe' });
    expect(out).toEqual({ id: 'fe-a1', track: 'fr-en', items: ['fe.chat'], target: 'fr. chat', x: 'fe-a1-1-u02-s01', y: 'fr-ancien' });
  });
});

describe('loader, clips and grading key on the target', () => {
  it('fe-a1-1: course fr-en, target fr — on the pack, its lessons and exercises; the public pack says both', () => {
    const p = content.packs.get('fe-a1-1');
    expect(p).toMatchObject({ trackId: 'fr-en', target: 'fr', preview: false });
    expect(content.lessons.get('fe-a1-1-u01-l01')).toMatchObject({ trackId: 'fr-en', target: 'fr' });
    expect(content.exercises.get('fe-a1-1-u01-l01-e01')).toMatchObject({ trackId: 'fr-en', target: 'fr' });
    expect(content.packs.get('fr-a1-1')).toMatchObject({ trackId: 'fr', target: 'fr' });
    expect(knownWordsOf(content, 'fr').has('frere')).toBe(true);
  });
  it('fe-a1-1 plays the French clips: every clip it needs is a fr clip that fr-a1-1 needs too — no new rendering', () => {
    const voices = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'voices.json'), 'utf8'));
    const { packs } = validateContent({ packsDir: PACKS });
    const of = (id) => clipsForPacks(clipPacks(packs.filter((x) => x.pack.id === id)), voices, readAudioOverrides(CONTENT_DIR), readPronunciations(CONTENT_DIR));
    const samples = new Set(clipsForPacks([], voices).map((c) => c.file)); // the voices' sample sentences (Admin → Voices)
    const fe = of('fe-a1-1').filter((c) => !samples.has(c.file));
    const fr = new Set(of('fr-a1-1').map((c) => c.file));
    expect(fe.length).toBeGreaterThan(150);
    expect(fe.every((c) => c.track === 'fr' && c.file.startsWith('fr/'))).toBe(true);
    expect(fe.filter((c) => !fr.has(c.file))).toEqual([]);
    const audio = loadAudio({ audioDir: path.join(ROOT, 'audio'), contentDir: CONTENT_DIR, content });
    const pub = publicPack(content, 'fe-a1-1', { audio, nativeLang: 'en' });
    expect(pub).toMatchObject({ track: 'fr-en', language: 'fr', nativeLang: 'en' });
    if (audio.loaded) expect(pub.units[0].vocabulary.find((v) => v.id === 'fe.bonjour').audio).toMatch(/^\/audio\/fr\/[0-9a-f]{16}\.mp3$/);
  });
  it('an fe answer is graded by the French rules (the accent note), not as a track named fr-en', async () => {
    const db = openMemoryDb();
    seedUsers(db);
    const config = { version: 'test', sessionSecret: 'x'.repeat(48), dataDir: tmp, audioDir: path.join(tmp, 'no-audio'), contentDir: CONTENT_DIR,
      clientDist: path.join(tmp, 'no-dist'), loginRateLimit: 50 };
    const app = createApp({ db, content, audio: loadAudio({ audioDir: path.join(tmp, 'no-audio'), contentDir: CONTENT_DIR, content }), config, logger: pino({ level: 'silent' }) });
    const admin = request.agent(app);
    await admin.post('/api/auth/login').send({ username: 'admin', password: 'admin' });
    await admin.post('/api/auth/password').send({ current: 'admin', next: 'beheer-test-1' });
    const r = await admin.post('/api/admin/preview/attempt').send({ exerciseId: 'fe-a1-1-u01-l02-e12', answer: 'Mon frere a dix ans.' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ correct: true, note: 'accents', preview: true });
  });
});

describe('offering: native English learners (Coming soon until a level is available)', () => {
  it('fr-en has available levels: offered to English speakers, not to Dutch ones; nothing is coming', () => {
    expect(allCourses(content).find((c) => c.track === 'fr-en')).toMatchObject({ target: 'fr', native: 'en', packIds: ['fe-a1-1', 'fe-a1', 'fe-a2', 'fe-b1', 'fe-b2'] });
    expect(offeredCourses(content, 'en').map((c) => c.track)).toEqual(['nl', 'fr-en']);
    expect(comingCourses(content, 'en')).toEqual([]);
    expect(offeredCourses(content, 'nl').map((c) => c.track)).toEqual(['en', 'fr']);
  });
  it('an English speaker enrols in it; a Dutch speaker is refused; the sheet lists nothing as coming', () => {
    const db = openMemoryDb();
    seedUsers(db);
    createUser(db, { username: 'learner-en', password: 'learner-en-1', role: 'child', display_name: 'L', native_lang: 'en', ui_lang: 'en' });
    const u = findUserByUsername(db, 'learner-en');
    expect(coursesView(db, content, u).soon).toEqual([]);
    expect(coursesView(db, content, u).offered.map((c) => c.track)).toContain('fr-en');
    enrol(db, content, u, 'fr-en');
    expect(coursesView(db, content, findUserByUsername(db, 'learner-en')).courses.map((c) => c.track)).toContain('fr-en');
    expect(() => enrol(db, content, findUserByUsername(db, 'kid1'), 'fr-en')).toThrow(CourseError);
  });
  it('while a variant has no available level it is Coming soon for its native speakers only', () => {
    const tracks = manifest.tracks.map((t) => (t.id === 'fr-en' ? { ...t, packs: t.packs.map((p) => ({ ...p, status: 'planned' })) } : t));
    const fake = { manifest: { tracks }, packs: content.packs };
    expect(offeredCourses(fake, 'en').map((c) => c.track)).toEqual(['nl']);
    expect(comingCourses(fake, 'en').map((c) => c.track)).toEqual(['fr-en']);
    expect(comingCourses(fake, 'nl')).toEqual([]);
  });
});

describe('ids, jobs and Corrections', () => {
  it('a removed lesson id belongs to the track of its prefix: fe → fr-en', () => {
    expect(lessonTrack(content, 'fe-a1-1-u42-l01')).toBe('fr-en');
    expect(lessonTrack(content, 'fr-a1-1-u42-l01')).toBe('fr');
    expect(lessonTrack(content, 'fe-a1-1-u01-l01')).toBe('fr-en');
  });
  it('a correction of the French sources regenerates the fr-en packs built from them', () => {
    expect(affectedPacks('fr-a1-1')).toEqual(['fr-a1-1', 'fr-a1', 'fr-a2', 'fr-b1', 'fr-b2', 'fe-a1-1', 'fe-a1', 'fe-a2', 'fe-b1', 'fe-b2']);
    expect(affectedPacks('fr-a2')).toEqual(['fr-a2', 'fr-b1', 'fr-b2', 'fe-a2', 'fe-b1', 'fe-b2']);
    expect(affectedPacks('fe-a2')).toEqual(affectedPacks('fr-a2'));
    expect(affectedPacks('nl-a1')).not.toContain('fe-a1-1');
  });
  it('Corrections index the variant course\'s own exercises (corrections-variant.test.js)', () => {
    expect(exercisesUsing(content, 'fe.bonjour').length).toBeGreaterThan(0);
    expect(exercisesUsing(content, 'fe.bonjour').every((id) => id.startsWith('fe-'))).toBe(true);
    expect(exercisesUsing(content, 'fr.bonjour').every((id) => id.startsWith('fr-'))).toBe(true);
  });
});
