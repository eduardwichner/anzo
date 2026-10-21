// French for English speakers B1 and B2 (fe-b1, fe-b2) — the English meaning layer of the French B1/B2 units
// (vocabulary, sentences, titles, text sentences and turns, glossaries, gap hints, the B2 transform lines), the packs built
// from it (the French packs for Dutch speakers unchanged), the clips (all already rendered for French), Corrections for fe
// B1/B2 items, and typed fill-ins that accept another word for one course only (`typedAlso`: fe-a1-u19 *mail*).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/content/loader.js';
import { validateContent } from '../src/content/validate.js';
import { gradeFillBlank } from '../src/content/grading.js';
import { clipPacks, clipsForPacks, readAudioOverrides, readPronunciations } from '../src/audio/clips.js';
import { offeredCourses } from '../src/lib/courses.js';
import { exercisesUsing, itemDetail, previewEdit, searchContent } from '../src/ops/corrections.js';
import { readPackSources } from '../../scripts/content/sources.js';
import { buildPack } from '../../scripts/content/build-pack.js';
import { affectedPacks } from '../../scripts/jobs/content-job-lib.js';
import { formatPack } from '../../scripts/format-packs.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(here, '../../content');
const PACKS = path.join(CONTENT_DIR, 'packs');
const content = loadContent({ contentDir: CONTENT_DIR });
const audio = { url: () => null, both: () => ({ audio: null, audioSlow: null }), missing: 0, loaded: true };
const ctx = { content, audio, contentDir: CONTENT_DIR };
const readPack = (rel) => JSON.parse(fs.readFileSync(path.join(PACKS, rel), 'utf8'));
const exercises = (pack) => pack.units.flatMap((u) => u.lessons.flatMap((l) => l.exercises));

describe('sources: every French B1 and B2 unit has its English meanings', () => {
  for (const level of ['b1', 'b2']) {
    it(`fe-${level}: 20 units, none skipped; texts, glossaries and hints in English only; fr-${level} sees only Dutch`, () => {
      const fe = readPackSources(`fe-${level}`);
      expect(fe.units).toHaveLength(20);
      expect(fe.skipped).toEqual([]);
      expect(JSON.stringify(fe.units)).not.toMatch(/"nl":/);
      const texts = fe.units.flatMap((u) => u.textSources ?? u.texts ?? []).filter((t) => typeof t === 'object');
      expect(texts.length).toBeGreaterThanOrEqual(20);
      for (const t of texts) {
        expect(Object.keys(t.title)).toEqual(['en']);
        for (const x of [...(t.paragraphs || []).flat(), ...(t.turns || [])]) expect(typeof x.native.en).toBe('string');
        for (const g of t.glossary || []) expect(typeof g.native.en).toBe('string');
        for (const g of t.cloze || []) if (g.hint) expect(Object.keys(g.hint)).toEqual(['en']);
      }
      // the French reading keeps only Dutch — except a transform's English line, which the generator leaves out of fr-b2
      const fr = readPackSources(`fr-${level}`);
      expect(JSON.stringify(fr.units.map(({ transforms, ...u }) => u))).not.toMatch(/"en":\s*"/);
    });
  }
});

describe('packs: fe-b1 and fe-b2', () => {
  for (const level of ['b1', 'b2']) {
    const pack = readPack(`fr-en/${level}.json`);
    it(`fe-${level} is what the sources generate, validates, has fe ids and English meanings only`, () => {
      expect(formatPack(buildPack(`fe-${level}`).pack)).toBe(fs.readFileSync(path.join(PACKS, `fr-en/${level}.json`), 'utf8'));
      expect(pack).toMatchObject({ id: `fe-${level}`, track: 'fr-en' });
      expect(pack.units).toHaveLength(20);
      expect(JSON.stringify(pack)).not.toMatch(/"nl":/);
      expect(JSON.stringify(pack)).not.toMatch(/"fr[.-](?!en")[a-z0-9]/);
      expect(content.packs.has(`fe-${level}`)).toBe(true); // loaded = validated (loadContent refuses invalid content)
    });
    it(`fe-${level} texts carry their English: titles, every sentence or turn, glossaries, cloze hints`, () => {
      const texts = pack.units.flatMap((u) => u.texts || []);
      expect(texts.length).toBeGreaterThanOrEqual(20);
      for (const t of texts) {
        expect(Object.keys(t.title)).toEqual(['en']);
        for (const x of [...(t.paragraphs || []).flat(), ...(t.turns || [])]) expect(Object.keys(x.native)).toEqual(['en']);
        for (const g of t.glossary || []) expect(Object.keys(g.native)).toEqual(['en']);
      }
      const hinted = exercises(pack).filter((e) => e.type === 'cloze').flatMap((e) => e.gaps).filter((g) => g.hint);
      if (level === 'b1') expect(hinted.length).toBeGreaterThan(0); // B2 texts have open clozes and word formation: no hints
      expect(hinted.every((g) => Object.keys(g.hint).join() === 'en')).toBe(true);
    });
  }
  it('fe-b2: every key word transformation shows its English line; fr-b2 transforms show none (unchanged)', () => {
    const fe = exercises(readPack('fr-en/b2.json')).filter((e) => e.type === 'transform');
    expect(fe).toHaveLength(60);
    expect(fe.every((e) => typeof e.native?.en === 'string' && e.native.en.length > 5)).toBe(true);
    const fr = exercises(readPack('fr/b2.json')).filter((e) => e.type === 'transform');
    expect(fr).toHaveLength(60);
    expect(fr.some((e) => e.native)).toBe(false);
  });
  it('the French packs for Dutch speakers are still what their sources generate (byte-identical to the committed files)', () => {
    for (const level of ['b1', 'b2']) expect(formatPack(buildPack(`fr-${level}`).pack)).toBe(fs.readFileSync(path.join(PACKS, `fr/${level}.json`), 'utf8'));
  });
  it('fe-b1 and fe-b2 play only French clips that fr-b1 and fr-b2 need too: nothing new to render', () => {
    const voices = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'voices.json'), 'utf8'));
    const files = (id) => new Set(clipsForPacks(clipPacks([{ pack: content.packs.get(id).pack ?? readPack(id.startsWith('fe') ? `fr-en/${id.slice(3)}.json` : `fr/${id.slice(3)}.json`), track: { target: 'fr' } }]),
      voices.voices ?? voices, readAudioOverrides(CONTENT_DIR), readPronunciations(CONTENT_DIR)).map((c) => c.file));
    for (const level of ['b1', 'b2']) {
      const fe = files(`fe-${level}`);
      const fr = files(`fr-${level}`);
      expect(fe.size).toBeGreaterThan(1000);
      expect([...fe].filter((f) => !fr.has(f))).toEqual([]);
    }
  });
});

describe('offering and Corrections', () => {
  it('English speakers are offered French A1.1 → B2', () => {
    expect(offeredCourses(content, 'en').find((c) => c.track === 'fr-en').packIds).toEqual(['fe-a1-1', 'fe-a1', 'fe-a2', 'fe-b1', 'fe-b2']);
  });
  it('a fe B1 item is found next to its fr twin, edited in the French B1 source by its English meaning', () => {
    const r = searchContent(content, audio, 'décorer');
    expect(r.vocabulary.find((v) => v.id === 'fe.decorer')).toMatchObject({ native: 'to decorate', track: 'fr-en', nativeLang: 'en', packId: 'fe-b1' });
    expect(r.vocabulary.find((v) => v.id === 'fr.decorer')).toMatchObject({ native: 'versieren', track: 'fr', packId: 'fr-b1' });
    const item = itemDetail(ctx, 'fe.decorer');
    expect(item.sourceFile).toBe('content/src/fr/b1/01-ensemble.yaml');
    expect(item.editable.native).toBe('to decorate');
    expect(previewEdit(ctx, 'fe.decorer', { native: 'to decorate, to trim' })).toMatchObject({ audioChange: false, sharedWith: [] });
    expect(exercisesUsing(content, 'fe.decorer').every((id) => id.startsWith('fe-b1-'))).toBe(true);
  });
  it('a fe B2 sentence is edited in the French B2 source; a correction of B1 or B2 rebuilds both courses from that level up', () => {
    expect(itemDetail(ctx, 'fe-b2-u01-s01')).toMatchObject({ sourceFile: 'content/src/fr/b2/01-caractere-et-ambitions.yaml' });
    expect(itemDetail(ctx, 'fe-b2-u01-s01').editable.native).toBe('My sister is very ambitious: she wants to become a doctor.');
    expect(affectedPacks('fe-b1')).toEqual(['fr-b1', 'fr-b2', 'fe-b1', 'fe-b2']);
    expect(affectedPacks('fr-b2')).toEqual(['fr-b2', 'fe-b2']);
  });
});

describe('typedAlso: a typed fill-in that accepts another word in one course only', () => {
  const feMail = exercises(readPack('fr-en/a1.json')).find((e) => e.id === 'fe-a1-u19-extra-e04');
  const frMail = exercises(readPack('fr/a1.json')).find((e) => e.id === 'fr-a1-u19-extra-e04');
  it('fe-a1 *mail* accepts email and e-mail; the course for Dutch speakers keeps the exercise as it was', () => {
    expect(feMail).toMatchObject({ answer: 'mail', acceptAlso: ['email', 'e-mail'] });
    expect(frMail.acceptAlso).toBeUndefined();
    for (const a of ['mail', 'email', 'e-mail', 'Email']) expect(gradeFillBlank(feMail, a, { track: 'fr' }).correct, a).toBe(true);
    expect(gradeFillBlank(feMail, 'lettre', { track: 'fr' })).toMatchObject({ correct: false, correctAnswer: 'mail' });
    expect(gradeFillBlank(frMail, 'email', { track: 'fr' }).correct).toBe(false);
  });
  it('only typed fill-ins of a bare word get it, only in the course of that native language; the validator refuses it on a word bank', () => {
    const fe = ['fr-en/a1.json', 'fr-en/b1.json'].flatMap((f) => exercises(readPack(f))).filter((e) => e.acceptAlso && e.type === 'fill_blank');
    expect(fe.length).toBeGreaterThanOrEqual(2);
    expect(fe.every((e) => !e.options)).toBe(true);
    const fr = ['fr/a1.json', 'fr/b1.json', 'fr/b2.json'].flatMap((f) => exercises(readPack(f))).filter((e) => e.type === 'fill_blank' && e.acceptAlso);
    expect(fr).toEqual([]);
    const bank = { ...feMail, options: ['mail', 'journal', 'magazine'] };
    const pack = readPack('fr-en/a1.json');
    const broken = { ...pack, units: pack.units.map((u) => ({ ...u, lessons: u.lessons.map((l) => ({ ...l, exercises: l.exercises.map((e) => (e.id === bank.id ? bank : e)) })) })) };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-validate-'));
    try {
      fs.cpSync(PACKS, dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'fr-en/a1.json'), JSON.stringify(broken));
      expect(validateContent({ packsDir: dir }).errors.map((e) => e.message).join('\n')).toMatch(/acceptAlso is only for a typed fill-in/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
