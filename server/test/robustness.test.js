// One test per fix.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openDb, openMemoryDb, runMigrations } from '../src/db/index.js';
import { seedUsers } from '../src/lib/users.js';
import { loadContent } from '../src/content/loader.js';
import { redact } from '../src/ops/diagnostics.js';
import { releasedClipFiles } from '../../scripts/jobs/content-job-lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-robust-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('D1: the content job deletes only the clips a correction stopped using', () => {
  it('a Record again take or a Before-release file outside the manifest is kept', () => {
    const before = JSON.stringify({ clips: { en: { normal: { cat: 'en/aaaaaaaaaaaaaaaa.mp3', dog: 'en/bbbbbbbbbbbbbbbb.mp3' }, slow: { cat: 'en/cccccccccccccccc.mp3' } } } });
    const after = JSON.stringify({ clips: { en: { normal: { cat: 'en/dddddddddddddddd.mp3', dog: 'en/bbbbbbbbbbbbbbbb.mp3' }, slow: { cat: 'en/cccccccccccccccc.mp3' } } } });
    expect(releasedClipFiles(before, after)).toEqual(['en/aaaaaaaaaaaaaaaa.mp3']);
    expect(releasedClipFiles(before, before)).toEqual([]);
    expect(releasedClipFiles(null, after)).toEqual([]); // no manifest before: nothing is deleted
  });
});

describe('D6: a manual backup never decides the Backups tile', () => {
  it('its log lines are tagged [manual]', () => {
    const dataDir = path.join(tmp, 'data');
    const db = openDb(dataDir);
    runMigrations(db);
    db.close();
    const log = path.join(tmp, 'backup.log');
    const r = spawnSync('bash', [path.join(ROOT, 'scripts/backup-db.sh'), '--db', path.join(dataDir, 'anzo.sqlite'), '--dest', path.join(tmp, 'b'),
      '--manual', '--stamp', '20261019-120000', '--log', log], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(fs.readFileSync(log, 'utf8')).toMatch(/anzo-backup\[manual\]: ok file=.*anzo-manual-20261019-120000/);
    const w = spawnSync('bash', [path.join(ROOT, 'scripts/backup-db.sh'), '--db', path.join(dataDir, 'anzo.sqlite'), '--dest', path.join(tmp, 'b'),
      '--stamp', '20261019-120001', '--log', log], { encoding: 'utf8' });
    expect(w.status).toBe(0);
    expect(fs.readFileSync(log, 'utf8').trim().split('\n').at(-1)).toMatch(/anzo-backup: ok file=.*anzo-20261019-120001/);
  });
  it('the tile reads the last weekly line', async () => {
    const { collectSystem } = await import('../src/ops/system.js');
    const logDir = path.join(tmp, 'logs-d6');
    const backupDir = path.join(tmp, 'backups-d6');
    fs.mkdirSync(logDir, { recursive: true });
    fs.mkdirSync(path.join(backupDir, 'db'), { recursive: true });
    fs.writeFileSync(path.join(backupDir, 'db', 'anzo-20261019-033000.sqlite.gz'), 'x');
    fs.writeFileSync(path.join(logDir, 'backup.log'), '2026-10-19T03:30:00+02:00 anzo-backup: FAILED: integrity_check on the copy: no\n'
      + '2026-10-19T12:00:00+02:00 anzo-backup[manual]: ok file=/x/anzo-manual-20261019-120000.sqlite.gz\n');
    const db = openMemoryDb();
    const content = loadContent({ contentDir: path.join(ROOT, 'content') });
    const audio = { clips: [], expected: 0, missing: 0, url: () => null, both: () => ({}) };
    const sys = collectSystem({ db, config: { logDir, backupDir, spoolDir: path.join(tmp, 'spool-d6'), rootDir: ROOT, version: 't' }, store: { content, audio } }, { withProblems: false });
    expect(sys.tiles.find((t) => t.id === 'backups').data.db).toMatchObject({ failed: true });
  });
});

describe('S6: the must-change-password gate looks at the full path', () => {
  it('an admin with a seeded password reaches /api/auth/* only — also under a router mounted elsewhere', async () => {
    const db = openMemoryDb();
    seedUsers(db);
    const content = loadContent({ contentDir: path.join(ROOT, 'content') });
    const config = { version: 'test', sessionSecret: 'x'.repeat(48), dataDir: tmp, audioDir: path.join(tmp, 'no-audio'), contentDir: path.join(ROOT, 'content'),
      clientDist: path.join(tmp, 'no-dist'), loginRateLimit: 50 };
    const app = createApp({ db, content, audio: { clips: [], url: () => null, both: () => ({ audio: null, audioSlow: null }), missing: 0, expected: 0 }, config, logger: pino({ level: 'silent' }) });
    const a = request.agent(app);
    await a.post('/api/auth/login').send({ username: 'admin', password: 'admin' });
    expect((await a.get('/api/auth/me')).status).toBe(200);
    for (const url of ['/api/courses/auth/', '/api/practice/auth/attempt', '/api/admin/users']) {
      expect((await a.get(url)).body, url).toMatchObject({ error: 'must_change_password' });
    }
  });
});

describe('S7: the diagnostics carry no account names or LAN addresses', () => {
  it('redact(…, { personal: true }); the System page keeps them', () => {
    // the sample addresses are built here, so no private address is written in a tracked file (publish:check)
    const lan = [192, 168, 1, 20].join('.');
    const peer = [10, 0, 0, 5].join('.');
    const line = `{"level":40,"username":"kid1","by":"admin","ip":"${lan}","peer":"${peer}","msg":"login blocked"}`;
    const out = redact(line, { personal: true });
    expect(out).not.toContain('kid1');
    expect(out).not.toContain(lan);
    expect(out).not.toContain(peer);
    expect(out).toMatch(/"username":"\[user\]".*\[lan-ip\]/);
    expect(redact(line)).toBe(line);
  });
});

describe('D5: a malformed pronunciation list is a health problem, not a quiet green', () => {
  it('loadAudio reports expectedError; staticProblems lists it', async () => {
    const { loadAudio } = await import('../src/audio/manifest.js');
    const { staticProblems } = await import('../src/routes/health.js');
    const contentDir = path.join(tmp, 'content-d5');
    fs.mkdirSync(contentDir, { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'content/voices.json'), path.join(contentDir, 'voices.json'));
    fs.writeFileSync(path.join(contentDir, 'pronunciations.json'), '{ "tracks": { half written');
    const content = loadContent({ contentDir: path.join(ROOT, 'content') });
    const audio = loadAudio({ audioDir: path.join(ROOT, 'audio'), contentDir, content, logger: pino({ level: 'silent' }) });
    expect(audio.expectedError).toMatch(/JSON/);
    expect(staticProblems({ content, audio }).join('\n')).toMatch(/cannot be worked out/);
  });
});

describe('C1/C2: grading', async () => {
  const { gradeCloze, gradeTransform, gradeTyped } = await import('../src/content/grading.js');
  it('C1: a Dutch typed gap joins a compound only from words of the course', () => {
    expect(gradeCloze({ gaps: [{ word: 'beslissing' }] }, ['be slissing'], { track: 'nl' }).correct).toBe(false);
    expect(gradeTransform({ answers: ['werkgever'] }, 'wer kgever', { track: 'nl' }).correct).toBe(false);
    const known = new Set(['thuis', 'gekomen']);
    expect(gradeCloze({ gaps: [{ word: 'thuisgekomen' }] }, ['thuis gekomen'], { track: 'nl', knownWords: known }).gaps[0]).toMatchObject({ correct: true, note: 'spelling' });
  });
  it('C2: the US "math" for "maths"', () => {
    expect(gradeTyped('math', 'maths', { track: 'en' }).correct).toBe(true);
    expect(gradeTyped('maths', 'maths', { track: 'en' }).correct).toBe(true);
  });
});

describe('C3: Record again and audio:fix keep a say text\'s hiatus', async () => {
  const { nextTake, validateRerecord } = await import('../../scripts/jobs/rerecord-lib.js');
  const voices = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/voices.json'), 'utf8'));
  it('the next take carries hiatus; a keep request with it is valid', () => {
    const text = 'We will visit Grandma on Sunday.';
    const overrides = { clips: { en: { [text]: { slow: { say: 'We will visit [[ ɡɹˈanmɑ, ]] on Sunday.', hiatus: ['ɡɹˈanmɑ'], take: 2 } } } } };
    const t = nextTake(overrides, { track: 'en', speed: 'slow', text }, { fileOf: () => 'en/0000000000000000.mp3', exists: () => false, author: 'admin', id: 9 });
    expect(t.entry).toMatchObject({ say: expect.any(String), hiatus: ['ɡɹˈanmɑ'], take: 3 });
    const req = { kind: 'rerecord', phase: 'keep', id: 9, author: 'admin', track: 'en', speed: 'slow', text, oldFile: 'en/0123456789abcdef.mp3',
      newFile: 'en/aaaaaaaaaaaaaaaa.mp3', entry: t.entry, unpin: false };
    expect(() => validateRerecord(req, voices)).not.toThrow();
    expect(() => validateRerecord({ ...req, entry: { ...t.entry, hiatus: 'x' } }, voices)).toThrow();
  });
});

describe('C6, D3, D4: the fix queue and the live tile count right', async () => {
  const { listenPool, listenQueue, liveAudioCheck } = await import('../src/lib/listen.js');
  const clips = [
    { file: 'en/1111111111111111.mp3', track: 'en', speed: 'normal', text: 'one', kind: 'word' },
    { file: 'en/2222222222222222.mp3', track: 'en', speed: 'normal', text: 'two', kind: 'word' },
  ];
  const pool = listenPool(null, { clips });
  const row = (id, file, text, verdict, extra = {}) => ({ id, file, track: 'en', speed: 'normal', text, verdict, reason: null, note: null, heard_at: `2026-10-1${id}`, ...extra });
  it('C6: the latest Bad\'s note; a Bad overruled by an OK is no "again" after a re-render', () => {
    const rows = [row(1, 'en/1111111111111111.mp3', 'one', 'bad', { note: 'first' }), row(2, 'en/1111111111111111.mp3', 'one', 'bad', { note: 'second' }),
      row(3, 'en/0000000000000002.mp3', 'two', 'bad'), row(4, 'en/0000000000000002.mp3', 'two', 'ok')];
    const q = listenQueue(rows, pool);
    expect(q.waiting.map((c) => [c.text, c.note])).toEqual([['one', 'second']]);
    expect(q.again).toEqual([]);
  });
  it('D3: an old status — a clip heard Bad outside its worst ten is not counted twice; D4: a cut list still counts the rest', () => {
    const rows = [row(1, 'en/2222222222222222.mp3', 'two', 'bad')];
    const old = { checkedAt: '2026-10-19T00:00:00Z', flagged: 3, worst: [{ file: 'en/1111111111111111.mp3', flags: ['onset'] }] };
    expect(liveAudioCheck(old, rows, pool).flagged).toBe(3); // one named, one heard Bad (counted once), one unnamed
    const cut = { checkedAt: '2026-10-19T00:00:00Z', flagged: 5, flaggedFiles: [{ file: 'en/1111111111111111.mp3', flags: ['onset'] }] };
    expect(liveAudioCheck(cut, [], pool).flagged).toBe(5);
  });
});

describe('D2: a clip recorded again since the last check counts as not checked', async () => {
  const { clipsChangedSince } = await import('../src/ops/system.js');
  it('by the file\'s time against the check\'s', () => {
    const dir = path.join(tmp, 'audio-d2');
    fs.mkdirSync(path.join(dir, 'en'), { recursive: true });
    for (const f of ['en/1111111111111111.mp3', 'en/2222222222222222.mp3']) fs.writeFileSync(path.join(dir, f), 'x');
    const past = new Date(Date.now() - 3_600_000);
    fs.utimesSync(path.join(dir, 'en/1111111111111111.mp3'), past, past);
    const audio = { clips: [{ file: 'en/1111111111111111.mp3' }, { file: 'en/2222222222222222.mp3' }] };
    expect(clipsChangedSince(audio, dir, new Date(Date.now() - 60_000).toISOString())).toBe(1);
    expect(clipsChangedSince({ clips: audio.clips }, dir, null)).toBe(0);
  });
});

describe('S8: the Before-release sample shows only well-formed rows', async () => {
  const { readSample } = await import('../src/routes/sample.js');
  const { writeStatus, ensureSpool } = await import('../src/ops/spool.js');
  it('a row without a speed, flags that are not a list, or a file of another language is dropped', () => {
    const spoolDir = path.join(tmp, 'spool-s8');
    ensureSpool(spoolDir);
    const audioDir = path.join(tmp, 'audio-s8');
    fs.mkdirSync(path.join(audioDir, 'en'), { recursive: true });
    for (const f of ['en/aaaaaaaaaaaaaaaa.mp3', 'en/bbbbbbbbbbbbbbbb.mp3']) fs.writeFileSync(path.join(audioDir, f), 'x');
    const base = { track: 'en', speed: 'normal', text: 't', oldFile: 'en/aaaaaaaaaaaaaaaa.mp3', newFile: 'en/bbbbbbbbbbbbbbbb.mp3' };
    writeStatus(spoolDir, 'audio-sample', { name: 's', rows: [{ id: 'ok', ...base }, { id: 'nospeed', ...base, speed: undefined },
      { id: 'flags', ...base, flagsOld: 'onset' }, { id: 'lang', ...base, track: 'fr' }] });
    expect(readSample({ spoolDir, audioDir }).rows.map((r) => r.id)).toEqual(['ok']);
  });
});

describe('S9: a seed file follows the account rules', async () => {
  const { parseSeed, readSeedFile, SEED_EXAMPLE, seedProblems } = await import('../src/lib/seed.js');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/packs/manifest.json'), 'utf8'));
  it('the example passes (a seeded admin may start with a short first password); a typo is refused with a message', async () => {
    expect(await seedProblems(readSeedFile(SEED_EXAMPLE), manifest)).toEqual([]);
    const bad = parseSeed({ accounts: [{ username: 'x1', password: 'abcd', role: 'child', displayName: 'X', uiLang: 'de' }] });
    expect(await seedProblems(bad, manifest)).toEqual([expect.stringMatching(/x1: ui_lang/)]);
  });
});
