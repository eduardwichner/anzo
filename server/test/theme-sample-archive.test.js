// Settings → Theme (users.theme, migration 021): stored per account, 'system' by default, only system |
// light | dark. The System tile's audio check is the current state (the last full check combined with the latest
// Listen-check verdict per current file); the fix queue carries the Bad verdict's reason and note of the current file;
// "Heard OK now" is an OK verdict on that file; in Record again, Keep old from the fix queue marks the old file heard OK, while
// Neither — try again (a plain drop) leaves the clip in the queue.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openMemoryDb } from '../src/db/index.js';
import { findUserById, publicUser, seedUsers, THEMES, validatePreferences } from '../src/lib/users.js';
import { loadContent } from '../src/content/loader.js';
import { listenPool, listenQueue, liveAudioCheck } from '../src/lib/listen.js';
import { collectSystem } from '../src/ops/system.js';
import { ensureSpool, writeStatus } from '../src/ops/spool.js';
import { RESERVE_FREE_BYTES, spaceForArchive } from '../../scripts/ops/archive-lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONTENT_DIR = path.join(ROOT, 'content');
const content = loadContent({ contentDir: CONTENT_DIR });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-theme-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const CLIPS = [
  { file: 'en/0123456789abcdef.mp3', track: 'en', speed: 'normal', text: 'You are not alone: in a survey.', kind: 'sentence' },
  { file: 'en/fedcba9876543210.mp3', track: 'en', speed: 'normal', text: 'OK. Shall I ask Maya as well?', kind: 'sentence' },
  { file: 'en/1111111111111111.mp3', track: 'en', speed: 'slow', text: 'old', kind: 'word', carrier: 'The word,' },
];
const audio = () => ({ clips: CLIPS.map((c) => ({ ...c })), url: () => null, both: () => ({ audio: null, audioSlow: null }), missing: 0, expected: 3, present: 3 });

function makeApp() {
  const db = openMemoryDb();
  seedUsers(db);
  const spoolDir = path.join(tmp, `spool-${Math.random().toString(36).slice(2)}`);
  ensureSpool(spoolDir);
  const config = { version: 'test', sessionSecret: 'x'.repeat(48), dataDir: tmp, audioDir: path.join(tmp, 'no-audio'), contentDir: CONTENT_DIR,
    clientDist: path.join(tmp, 'no-dist'), loginRateLimit: 50, spoolDir, jobRunner: 'stub', logDir: path.join(tmp, 'no-logs'),
    backupDir: path.join(tmp, 'no-backups'), rootDir: ROOT };
  const a = audio();
  const ctx = { db, content, audio: a, config, logger: pino({ level: 'silent' }) };
  return { ctx, db, app: createApp(ctx), audio: a };
}
async function admin(app) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin' });
  expect((await agent.post('/api/auth/password').send({ current: 'admin', next: 'beheer-test-1' })).status).toBe(204);
  return agent;
}
const verdicts = (db) => db.prepare('SELECT file, verdict, reason, note FROM listen_checks ORDER BY id').all();

describe('Settings → Theme (migration 021)', () => {
  it('system by default, light and dark stored per account, anything else refused', async () => {
    const { app, db } = makeApp();
    expect(THEMES).toEqual(['system', 'light', 'dark']);
    const kid1 = db.prepare("SELECT * FROM users WHERE username = 'kid1'").get();
    expect(kid1.theme).toBe('system');
    expect(publicUser(kid1).theme).toBe('system');
    expect(validatePreferences({ theme: 'dark' })).toEqual({ values: { theme: 'dark' } });
    expect(validatePreferences({ theme: 'sepia' }).errors).toEqual({ theme: 'invalid' });
    const kid = request.agent(app);
    await kid.post('/api/auth/login').send({ username: 'kid1', password: 'kid1' });
    expect((await kid.get('/api/auth/me')).body.user.theme).toBe('system');
    expect((await kid.patch('/api/auth/me').send({ theme: 'dark' })).body.user.theme).toBe('dark');
    expect(findUserById(db, kid1.id).theme).toBe('dark');
    expect((await kid.patch('/api/auth/me').send({ theme: 'purple' })).status).toBe(400);
    expect((await kid.patch('/api/auth/me').send({ theme: 'light' })).body.user.theme).toBe('light');
    // another account is not touched; the database refuses a value the route would not send
    expect(db.prepare("SELECT theme FROM users WHERE username = 'kid2'").pluck().get()).toBe('system');
    expect(() => db.prepare("UPDATE users SET theme = 'blue' WHERE id = ?").run(kid1.id)).toThrow(/CHECK/);
  });
});

describe('the audio-check tile: the current state', () => {
  const pool = listenPool(content, audio());
  const status = (extra) => ({ checkedAt: '2026-10-16T17:34:25.349Z', clips: 3, flagged: 2, failed: 0, ...extra });
  const bad = (id, file, extra = {}) => ({ id, file, ...CLIPS.find((c) => c.file === file), verdict: 'bad', reason: 'other', note: null, heard_at: `2026-10-1${id}`, ...extra });
  const ok = (id, file) => ({ ...bad(id, file), verdict: 'ok', reason: null });

  it('the check flagged two clips for their Bad verdicts: an OK heard since clears one, a machine flag stays until heard OK', () => {
    const worst = [{ file: CLIPS[0].file, flags: ['listen'] }, { file: CLIPS[1].file, flags: ['listen'] }];
    const rows = [bad(1, CLIPS[0].file), bad(2, CLIPS[1].file)];
    expect(liveAudioCheck(status({ worst }), rows, pool)).toMatchObject({ flagged: 2, heardBad: 2, machine: 0 });
    expect(liveAudioCheck(status({ worst }), [...rows, ok(3, CLIPS[1].file)], pool)).toMatchObject({ flagged: 1, heardBad: 1 });
    // a measured flag (not "listen"): flagged until someone hears that file OK
    const measured = status({ flagged: 1, flaggedFiles: [{ file: CLIPS[2].file, flags: ['onset'] }] });
    expect(liveAudioCheck(measured, [], pool)).toMatchObject({ flagged: 1, machine: 1, worst: [{ text: 'old', flags: ['onset'] }] });
    expect(liveAudioCheck(measured, [ok(4, CLIPS[2].file)], pool).flagged).toBe(0);
    // a flag on a file no longer in use is gone (the new file counts as not checked)
    expect(liveAudioCheck(status({ flagged: 1, flaggedFiles: [{ file: 'en/9999999999999999.mp3', flags: ['tail'] }] }), [], pool).flagged).toBe(0);
    // a Bad verdict given after the check counts too
    expect(liveAudioCheck(status({ flagged: 0, flaggedFiles: [] }), [bad(5, CLIPS[2].file)], pool)).toMatchObject({ flagged: 1, heardBad: 1 });
    // an old status lists its worst ten only: flagged clips it does not name still count
    expect(liveAudioCheck(status({ flagged: 12, worst }), rows, pool).flagged).toBe(12);
    expect(liveAudioCheck(null, rows, pool)).toBeNull();
  });

  it('the System tile is amber while a clip is Bad and green once it is heard OK, whatever the check counted', async () => {
    const { ctx, db, app } = makeApp();
    writeStatus(ctx.config.spoolDir, 'audio-check', status({ worst: [{ file: CLIPS[0].file, flags: ['listen'] }, { file: CLIPS[1].file, flags: ['listen'] }] }));
    const a = await admin(app);
    for (const c of CLIPS.slice(0, 2)) await a.post('/api/admin/listen').send({ file: c.file, verdict: 'bad', reason: 'other' });
    const tile = () => collectSystem({ db, config: ctx.config, store: { content, audio: ctx.audio } }, { withProblems: false }).tiles.find((x) => x.id === 'audiocheck');
    expect(tile()).toMatchObject({ level: 'amber', data: { flagged: 2, flaggedAtCheck: 2, heardBad: 2 } });
    for (const c of CLIPS.slice(0, 2)) await a.post('/api/admin/listen').send({ file: c.file, verdict: 'ok' });
    expect(tile()).toMatchObject({ level: 'green', data: { flagged: 0, flaggedAtCheck: 2, heardBad: 0 } });
  });
});

describe('the fix queue: the note, Heard OK now, Keep old and Neither', () => {
  it('shows the reason and the note of the current file\'s latest Bad verdict', () => {
    const pool = listenPool(content, audio());
    const rows = [
      { id: 1, file: CLIPS[0].file, ...CLIPS[0], verdict: 'bad', reason: 'babble', note: 'first time', heard_at: 'a' },
      { id: 2, file: CLIPS[0].file, ...CLIPS[0], verdict: 'bad', reason: 'other', note: 'not enough pause after the ":"', heard_at: 'b' },
    ];
    expect(listenQueue(rows, pool).waiting[0]).toMatchObject({ reason: 'other', note: 'not enough pause after the ":"', heardAt: 'b' });
  });

  it('the route sends the note; Heard OK now (an OK verdict on that file) takes the clip out of the queue', async () => {
    const { app, db } = makeApp();
    const a = await admin(app);
    let state = (await a.post('/api/admin/listen').send({ file: CLIPS[1].file, verdict: 'bad', reason: 'babble', note: 'OK sounds like "okkhiei"' })).body;
    expect(state.queue.waitingClips).toEqual([expect.objectContaining({ file: CLIPS[1].file, reason: 'babble', note: 'OK sounds like "okkhiei"' })]);
    state = (await a.post('/api/admin/listen').send({ file: CLIPS[1].file, verdict: 'ok' })).body;
    expect(state.queue.waiting).toBe(0);
    expect(verdicts(db).map((v) => v.verdict)).toEqual(['bad', 'ok']);
  });

  it('Keep old from the queue marks the old file heard OK; Neither — try again drops the take and keeps the clip in the queue', async () => {
    const { app, db } = makeApp();
    const a = await admin(app);
    for (const c of CLIPS.slice(0, 2)) await a.post('/api/admin/listen').send({ file: c.file, verdict: 'bad', reason: 'other' });
    // Neither: the stub's take is dropped, nothing is heard, the clip stays
    const r1 = (await a.post('/api/admin/rerecord').send({ file: CLIPS[0].file })).body.rerecord;
    expect((await a.post(`/api/admin/rerecord/${r1.id}/drop`).send({})).body.rerecord.status).toBe('dropped');
    // Keep old from the fix queue: dropped too, and an OK verdict on the old file
    const r2 = (await a.post('/api/admin/rerecord').send({ file: CLIPS[1].file })).body.rerecord;
    expect((await a.post(`/api/admin/rerecord/${r2.id}/drop`).send({ heardOk: true })).body.rerecord.status).toBe('dropped');
    expect(verdicts(db).filter((v) => v.verdict === 'ok')).toEqual([{ file: CLIPS[1].file, verdict: 'ok', reason: null, note: null }]);
    const state = (await a.get('/api/admin/listen')).body;
    expect(state.queue.waitingClips.map((c) => c.file)).toEqual([CLIPS[0].file]);
    // a second decision is refused, and so is anything but true for heardOk
    expect((await a.post(`/api/admin/rerecord/${r2.id}/drop`).send({ heardOk: true })).status).toBe(409);
    const r3 = (await a.post('/api/admin/rerecord').send({ file: CLIPS[0].file })).body.rerecord;
    await a.post(`/api/admin/rerecord/${r3.id}/drop`).send({ heardOk: 'yes' });
    expect(verdicts(db).filter((v) => v.verdict === 'ok')).toHaveLength(1);
  });
});

describe('the full archive checks for room before it writes', () => {
  const GB = 1000 ** 3;
  const archives = [{ name: 'anzo-full-20261004-040000.tar', bytes: 1.3 * GB }, { name: 'anzo-full-20261011-040000.tar', bytes: 1.3 * GB },
    { name: 'anzo-full-20261018-040000.tar', bytes: 1.3 * GB }];
  it('room enough: nothing deleted first', () => {
    expect(spaceForArchive({ estimateBytes: 1.3 * GB, freeBytes: 5 * GB, archives })).toMatchObject({ ok: true, remove: [], note: null });
    expect(RESERVE_FREE_BYTES).toBe(GB);
  });
  it('short: the oldest archives go first, never the newest one', () => {
    const r = spaceForArchive({ estimateBytes: 1.3 * GB, freeBytes: 1.5 * GB, archives });
    expect(r).toMatchObject({ ok: true, remove: ['anzo-full-20261004-040000.tar'] });
    expect(spaceForArchive({ estimateBytes: 1.3 * GB, freeBytes: 0.2 * GB, archives }).remove)
      .toEqual(['anzo-full-20261004-040000.tar', 'anzo-full-20261011-040000.tar']);
  });
  it('still short: nothing is written and nothing deleted, with the reason', () => {
    const r = spaceForArchive({ estimateBytes: 3 * GB, freeBytes: 0.5 * GB, archives });
    expect(r).toMatchObject({ ok: false, remove: [] });
    expect(r.note).toMatch(/not enough free space.*nothing was written/);
    expect(spaceForArchive({ estimateBytes: 1.3 * GB, freeBytes: 1 * GB, archives: [] }).ok).toBe(false);
  });
});

describe('French text tap meanings (both French courses; display only, the lock unchanged)', () => {
  const text = (track, id) => {
    for (const { pack } of content.packs.values()) for (const u of pack.units) for (const t of u.texts ?? []) if (t.id === id && pack.track === track) return t;
    return null;
  };
  for (const [track, p] of [['fr', 'fr'], ['fr-en', 'fe']]) {
    it(`${track}: produits is not produire; tient/compagnie, tombent and moyenne show their phrase; je les maîtrise is the verb`, () => {
      expect(text(track, `${p}-b2-t07`).forms?.produits).toBeUndefined();
      expect(text(track, `${p}-b2-t07`).forms?.produite).toBe(`${p}.produire`);
      expect(text(track, `${p}-b2-t16`).forms).toMatchObject({ tient: `${p}.tenir-compagnie`, compagnie: `${p}.tenir-compagnie`, moyenne: `${p}.en-moyenne` });
      expect(text(track, `${p}-b2-t14`).forms?.tombent).toBe(`${p}.tomber-amoureux`);
      expect(text(track, `${p}-b2-t18`).forms?.['maîtrise']).toBe(`${p}.maitriser`);
      // a form of another course word never takes a phrase's meaning (est in il est temps que), nor does a function word
      expect(text(track, `${p}-b2-t17`).forms?.est).toBeUndefined();
      expect(text(track, `${p}-b2-t01`).forms?.par).toBeUndefined();
    });
  }
  it('the Dutch glossary of amoureux names both meanings', () => {
    expect(text('fr', 'fr-b2-t14').glossary.find((g) => g.word === 'amoureux').native.nl).toBe('de geliefden (un amoureux); verliefd (tomber amoureux)');
  });
});

describe('seed accounts from a file (publication readiness)', async () => {
  const { EXAMPLE_ACCOUNTS, parseSeed, readSeedFile, SEED_EXAMPLE, SEED_LOCAL, seedFile } = await import('../src/lib/seed.js');
  const { SEED_USERS, seedUsers } = await import('../src/lib/users.js');
  it('the committed example has generic accounts only; an admin must always change the seeded password', () => {
    expect(EXAMPLE_ACCOUNTS.map((a) => a.username)).toEqual(['kid1', 'kid2', 'admin']);
    expect(SEED_USERS).toBe(EXAMPLE_ACCOUNTS);
    expect(EXAMPLE_ACCOUNTS.find((a) => a.role === 'admin').must_change_password).toBe(1);
    const forced = parseSeed({ accounts: [{ username: 'boss', password: 'boss1234', role: 'admin', displayName: 'Boss' }] });
    expect(forced[0].must_change_password).toBe(1);
  });
  it('ANZO_SEED_FILE, else the local file when it exists, else the example', () => {
    expect(seedFile({ ANZO_SEED_FILE: SEED_EXAMPLE })).toBe(SEED_EXAMPLE);
    expect(seedFile({})).toBe(fs.existsSync(SEED_LOCAL) ? SEED_LOCAL : SEED_EXAMPLE);
    expect(process.env.ANZO_SEED_FILE).toBe(SEED_EXAMPLE); // the test run is pinned to the example (vitest.config.js)
  });
  it('a local file seeds its own accounts with courses and start levels; bad files are refused', () => {
    const file = path.join(tmp, 'seed.local.json');
    fs.writeFileSync(file, JSON.stringify({ accounts: [
      { username: 'pat', password: 'pat1', role: 'child', displayName: 'Pat', courses: [{ track: 'nl', startPack: 'nl-a2' }], nativeLang: 'en', uiLang: 'en', audience: 'adult' },
    ] }));
    const db = openMemoryDb();
    expect(seedUsers(db, readSeedFile(file))).toEqual(['pat']);
    expect(db.prepare("SELECT native_lang, ui_lang, audience, must_change_password FROM users WHERE username = 'pat'").get())
      .toEqual({ native_lang: 'en', ui_lang: 'en', audience: 'adult', must_change_password: 0 });
    expect(db.prepare("SELECT track, start_pack FROM user_courses").get()).toEqual({ track: 'nl', start_pack: 'nl-a2' });
    for (const bad of [{}, { accounts: [] }, { accounts: [{ username: 'X Y', password: 'abcd', role: 'child', displayName: 'x' }] },
      { accounts: [{ username: 'ok', password: 'abc', role: 'child', displayName: 'x' }] }, { accounts: [{ username: 'ok', password: 'abcd', role: 'root', displayName: 'x' }] }]) {
      expect(() => parseSeed(bad)).toThrow();
    }
  });
});

describe('Listen check → Before release (migration 022): a sample of new recordings, votes per admin and row', () => {
  it('no sample → null; a sample shows only rows whose two files exist; votes are checked, kept and replaced', async () => {
    const { ctx, db, app } = makeApp();
    const a = await admin(app);
    expect((await a.get('/api/admin/audio-sample')).body).toEqual({ sample: null });
    const audioDir = path.join(tmp, `audio-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(path.join(audioDir, 'en'), { recursive: true });
    for (const f of ['en/aaaaaaaaaaaaaaaa.mp3', 'en/bbbbbbbbbbbbbbbb.mp3']) fs.writeFileSync(path.join(audioDir, f), 'x');
    ctx.config.audioDir = audioDir;
    writeStatus(ctx.config.spoolDir, 'audio-sample', { name: 'colon-sample', about: 'colon', rows: [
      { id: 'r1', track: 'en', speed: 'normal', text: 'You are not alone: in a survey.', oldFile: 'en/aaaaaaaaaaaaaaaa.mp3', newFile: 'en/bbbbbbbbbbbbbbbb.mp3', flagsNew: ['pause'] },
      { id: 'r2', track: 'en', speed: 'normal', text: 'gone', oldFile: 'en/aaaaaaaaaaaaaaaa.mp3', newFile: 'en/cccccccccccccccc.mp3' },
      { id: 'r3', track: 'en', speed: 'normal', text: 'bad', oldFile: '../../etc/passwd', newFile: 'en/bbbbbbbbbbbbbbbb.mp3' },
    ] });
    let s = (await a.get('/api/admin/audio-sample')).body.sample;
    expect(s.rows.map((r) => r.id)).toEqual(['r1']);
    expect(s.rows[0]).toMatchObject({ oldUrl: '/audio/en/aaaaaaaaaaaaaaaa.mp3', newUrl: '/audio/en/bbbbbbbbbbbbbbbb.mp3', flagsNew: ['pause'], vote: null });
    expect((await a.post('/api/admin/audio-sample/r1').send({ vote: 'maybe' })).status).toBe(400);
    expect((await a.post('/api/admin/audio-sample/r2').send({ vote: 'new' })).status).toBe(404);
    s = (await a.post('/api/admin/audio-sample/r1').send({ vote: 'neither', note: '  still too short ' })).body.sample;
    expect(s).toMatchObject({ voted: 1, totals: { new: 0, old: 0, neither: 1 }, rows: [{ vote: 'neither', note: 'still too short' }] });
    s = (await a.post('/api/admin/audio-sample/r1').send({ vote: 'new' })).body.sample;
    expect(s.totals).toEqual({ new: 1, old: 0, neither: 0 });
    expect(db.prepare('SELECT COUNT(*) FROM audio_sample_votes').pluck().get()).toBe(1);
    const kid = request.agent(app);
    await kid.post('/api/auth/login').send({ username: 'kid1', password: 'kid1' });
    expect((await kid.get('/api/admin/audio-sample')).status).toBe(403);
  });
});

describe('the colon in what the voice is given (lexicon `colon: sentence`)', async () => {
  const { applyLexicon, clipFile, colonAsSentence } = await import('../src/audio/clips.js');
  const { compileLexicon } = await import('../../scripts/render-audio/lexicon.js');
  it('a colon before a word becomes a full stop and the word a capital; learners still read the colon (only `said`)', () => {
    expect(colonAsSentence('You are not alone: in a survey last term.')).toBe('You are not alone. In a survey last term.');
    expect(colonAsSentence('Mia: I started an apprenticeship.')).toBe('Mia. I started an apprenticeship.');
    expect(colonAsSentence('Here is your ticket: "have fun!"')).toBe('Here is your ticket. "Have fun!"');
    expect(colonAsSentence('Iedereen kent het gevoel: je wilde brood.')).toBe('Iedereen kent het gevoel. Je wilde brood.');
    expect(colonAsSentence('De les begint om 10:30 uur.')).toBe('De les begint om 10:30 uur.'); // a clock time: no space after it
    // a phoneme block is never changed: a colon there may be a length mark
    expect(colonAsSentence('Hello [[ ˈanə: ]] is that you?')).toBe('Hello [[ ˈanə: ]] is that you?');
    expect(colonAsSentence('Een [[ tˈɵsəntˌaːl: ]] een mengvorm: met [[ ɑ:b ]] erin.')).toBe('Een [[ tˈɵsəntˌaːl: ]] een mengvorm. Met [[ ɑ:b ]] erin.');
    expect(colonAsSentence('Kies: [[ dʒˈɔp ]] of school.')).toBe('Kies. [[ dʒˈɔp ]] of school.');
    expect(colonAsSentence('No colon here.')).toBe('No colon here.');
  });
  it('only with the rule in the lexicon; it is part of the clip name', () => {
    const text = 'You are not alone: in a survey.';
    expect(applyLexicon(text, { words: {} })).toBe(text);
    const said = applyLexicon(text, { colon: 'sentence' });
    expect(said).toBe('You are not alone. In a survey.');
    const cfg = { voice: 'en_GB-cori-medium', speaker: null, lengthScale: 1.1 };
    expect(clipFile('en', cfg, text, null, { said })).not.toBe(clipFile('en', cfg, text));
  });
  it('the compiler accepts `colon: sentence` and nothing else there', () => {
    const dir = path.join(tmp, `lex-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(path.join(dir, 'src', 'en'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'en', 'pronunciations.yaml'), 'colon: sentence\nwords:\n  ok: əʊˈkeɪ\n');
    expect(compileLexicon(dir).tracks.en).toEqual({ colon: 'sentence', words: { ok: 'əʊˈkeɪ' } });
    fs.writeFileSync(path.join(dir, 'src', 'en', 'pronunciations.yaml'), 'colon: comma\n');
    expect(() => compileLexicon(dir)).toThrow(/colon must be one of sentence/);
  });
});
