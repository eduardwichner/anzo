// Operations logic: diagnostics (redaction, cap), the watchdog's decision, the full archive's contents and retention,
// the cleanup's pattern list, and reading the logs for the System page.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { buildDiagnostics, CAP_BYTES, HEADER, redact } from '../src/ops/diagnostics.js';
import { acknowledgeProblems, parseLine, problemKey, problemShape, readAcks, recentProblems } from '../src/ops/logs.js';
import { decide, MAX_RESTARTS_PER_HOUR, parseUnitState } from '../../scripts/ops/watchdog-lib.js';
import { openMemoryDb, runMigrations } from '../src/db/index.js';
import { ARCHIVE_ENTRIES, missingEntries, restoreText, retention } from '../../scripts/ops/archive-lib.js';
import { matchTmp, TMP_PATTERNS } from '../../scripts/ops/cleanup-lib.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-api-ops-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('diagnostics: redaction', () => {
  const secret = 'f3'.repeat(48);
  it('removes the session secret, cookies, session ids, password hashes and common tokens; keeps git hashes', () => {
    const text = [
      `SESSION_SECRET=${secret}`, `the secret ${secret} again`,
      'cookie: anzo.sid=s%3AaBcD1234.xyzSIGNATURE; Path=/', 's:Q2xhdWRlQ29kZTEyMzQ.QWJjZGVmZ2hpamtsbW5vcHFy',
      `$2b$10$${'A'.repeat(53)}`, 'ghp_' + 'a'.repeat(36), 'glpat-' + 'b'.repeat(20), 'sk-ant-' + 'c'.repeat(30),
      'xoxb-1234567890-abcdef', 'AKIAABCDEFGHIJKLMNOP', 'Authorization: Bearer abc.def.ghi123456',
      '{"password":"geheim123","username":"kid1"}', 'https://user:p4ssw0rd@git.example.com/repo.git',
      '-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----',
      'commit 8dde734abc0123456789abcdef0123456789abcd',
    ].join('\n');
    const out = redact(text, { secrets: [secret] });
    expect(out).not.toContain(secret);
    for (const leak of ['aBcD1234', 'Q2xhdWRlQ29kZTEyMzQ', 'A'.repeat(53), 'ghp_', 'glpat-', 'sk-ant-', 'xoxb-', 'AKIAABCD', 'abc.def.ghi123456', 'geheim123', 'p4ssw0rd', 'AAAA']) {
      expect(out, leak).not.toContain(leak);
    }
    expect(out).toContain('8dde734abc0123456789abcdef0123456789abcd');
    expect(out).toContain('"username":"kid1"');
    expect(out).toContain('SESSION_SECRET=[redacted secret]');
  });

  it('starts with the instruction header, keeps the newest problems and stays under the cap', () => {
    const problems = Array.from({ length: 400 }, (_, i) => ({
      time: new Date(Date.UTC(2026, 9, 2, 12, 0, 400 - i)).toISOString(), source: 'app', level: 'error',
      raw: JSON.stringify({ level: 50, msg: `problem number ${i}`, error: 'x'.repeat(120), sid: 'zz' }),
    }));
    const text = buildDiagnostics({
      generatedAt: '2026-10-02T12:00:00Z', version: '0.1.0', commit: 'abc', health: { ok: true }, tiles: [{ id: 'app', level: 'green' }],
      problems, failedJob: null, disk: { freeBytes: 1 }, backupLines: ['ok'], fullBackupLines: [], restarts: { watchdog: [] },
    }, { secrets: ['f3'.repeat(48)] });
    expect(text.startsWith(HEADER)).toBe(true);
    expect(text.startsWith('Anzo diagnostics (Admin → System): the version, the health, every tile, the problems, the last failed job, the disk,')).toBe(true);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(CAP_BYTES);
    expect(text).toContain('problem number 0');
    expect(text).not.toContain('problem number 399');
    expect(text).toMatch(/\[\d+ older problem\(s\) left out to stay under 25 KB\]/);
    expect(text).not.toContain('"sid":"zz"');
  });

  it('a huge fixed section is shortened, keeping its end', () => {
    const text = buildDiagnostics({ generatedAt: 'now', version: 'v', health: {}, tiles: [], problems: [], failedJob: { detail: `${'old '.repeat(20000)}NEWEST` } });
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(CAP_BYTES);
    expect(text).toContain('NEWEST');
    expect(text).toContain('[…shortened]');
  });
});

describe('watchdog decision', () => {
  const t0 = Date.parse('2026-10-02T12:00:00Z');
  const fail = { ok: false, error: 'ECONNREFUSED' };
  it('one failure waits; the second in a row restarts; a success resets the count', () => {
    let r = decide({}, fail, t0);
    expect(r.action).toBe('none');
    r = decide(r.state, { ok: true }, t0 + 120_000);
    expect(r).toMatchObject({ action: 'recovered', state: { failures: 0 } });
    r = decide(r.state, fail, t0 + 240_000);
    r = decide(r.state, fail, t0 + 360_000);
    expect(r.action).toBe('restart');
    expect(r.reason).toMatch(/\/api\/live failed 2 times in a row \(ECONNREFUSED\)/);
    expect(r.state.restarts).toHaveLength(1);
    expect(r.state.failures).toBe(0);
  });

  it(`more than ${MAX_RESTARTS_PER_HOUR} restarts in an hour: stops restarting (red) until the app answers again`, () => {
    let state = {};
    const actions = [];
    for (let i = 0; i < 10; i++) {
      const r = decide(state, fail, t0 + i * 120_000);
      actions.push(r.action);
      state = r.state;
    }
    expect(actions.filter((a) => a === 'restart')).toHaveLength(3);
    expect(actions).toContain('give-up');
    expect(state.stopped).toBe(true);
    expect(decide(state, fail, t0 + 11 * 120_000).action).toBe('none');
    const back = decide(state, { ok: true }, t0 + 12 * 120_000);
    expect(back).toMatchObject({ action: 'recovered', state: { stopped: false } });
    // An hour later restarts are allowed again; restarts older than 7 days are forgotten.
    expect(decide({ restarts: state.restarts, failures: 1 }, fail, t0 + 2 * 3600_000).action).toBe('restart');
    expect(decide({ restarts: state.restarts }, { ok: true }, t0 + 8 * 86_400_000).state.restarts).toEqual([]);
  });
});

describe('full archive', () => {
  it('lists every required part; a listing without one is reported', () => {
    expect(ARCHIVE_ENTRIES.map((e) => e.path)).toEqual(['anzo.bundle', 'env', 'db', 'content/reference', 'local', 'models', 'audio', 'RESTORE.txt', 'MANIFEST.json']);
    const full = ['anzo.bundle', 'env', 'db/', 'db/anzo-20261002-031500.sqlite.gz', 'RESTORE.txt', 'MANIFEST.json', 'content/reference/', 'models/', 'models/manifest.json', 'audio/', 'audio/manifest.json'];
    expect(missingEntries(full)).toEqual([]);
    expect(missingEntries(full.filter((l) => !l.startsWith('audio')))).toEqual(['audio']);
    expect(missingEntries(full.filter((l) => l !== 'env'))).toEqual(['env']);
    expect(missingEntries(full.filter((l) => !l.startsWith('content/')))).toEqual([]); // reference files are optional
    expect(missingEntries([...full, 'local/', 'local/docs/gotchas.md'])).toEqual([]); // the local documents are optional too
  });

  describe('archive retention: a budget relative to the disk', () => {
    const G = 1000 ** 3;
    const a = (name, gb) => ({ name: `anzo-full-${name}.tar`, bytes: gb * G });
    const four = [a('20261004-040000', 0.8), a('20260927-040000', 0.8), a('20260920-040000', 0.8), a('20260913-040000', 0.8)];

    it('keeps the newest 3 while they take at most 25 % of the disk and at least 4 GB stays free', () => {
      const r = retention(four, { disk: { totalBytes: 20 * G, freeBytes: 9 * G } });
      expect(r.keep).toEqual(['anzo-full-20261004-040000.tar', 'anzo-full-20260927-040000.tar', 'anzo-full-20260920-040000.tar']);
      expect(r.remove).toEqual(['anzo-full-20260913-040000.tar']);
      expect(r.note).toBeNull();
      expect(r.budget).toMatchObject({ diskBytes: 20 * G, limitBytes: 5 * G, minFreeBytes: 4 * G, freeAfterBytes: 9.8 * G });
      expect(r.budget.keptBytes).toBeCloseTo(2.4 * G);
    });

    it('keeps 2 when 3 would exceed 25 % of the disk', () => {
      const r = retention(four, { disk: { totalBytes: 8 * G, freeBytes: 6 * G } }); // limit 2 GB < 2.4 GB
      expect(r.keep).toHaveLength(2);
      expect(r.remove).toEqual(['anzo-full-20260920-040000.tar', 'anzo-full-20260913-040000.tar']);
      expect(r.note).toMatch(/kept 2 instead of 3: 3 archives would take 2\.40 GB \(limit 2\.00 GB = 25 % of the disk\)/);
    });

    it('keeps 2 when 3 would leave less than 4 GB free', () => {
      const r = retention(four, { disk: { totalBytes: 20 * G, freeBytes: 2.5 * G } }); // 3 kept: 2.5 + 0.8 = 3.3 GB free
      expect(r.keep).toHaveLength(2);
      expect(r.note).toMatch(/kept 2 instead of 3: 3 archives would leave 3\.30 GB free \(at least 4\.00 GB\)/);
      expect(r.budget.freeAfterBytes).toBeCloseTo(4.1 * G);
    });

    it('never keeps fewer than 1, even when the newest alone breaks the budget', () => {
      const r = retention(four, { disk: { totalBytes: 20 * G, freeBytes: 1 * G } }); // even 1 kept leaves 3.4 GB
      expect(r.keep).toEqual(['anzo-full-20261004-040000.tar']);
      expect(r.remove).toHaveLength(3);
      expect(r.note).toMatch(/kept 1 instead of 3: .*; the newest archive alone is over the budget/);
      expect(retention([a('20261004-040000', 6)], { disk: { totalBytes: 20 * G, freeBytes: 9 * G } }))
        .toMatchObject({ keep: ['anzo-full-20261004-040000.tar'], remove: [], note: 'the newest archive alone is over the budget' });
    });

    it('with fewer archives than 3 keeps them all when they fit, and needs the disk size', () => {
      expect(retention([a('20261004-040000', 0.8)], { disk: { totalBytes: 20 * G, freeBytes: 9 * G } }))
        .toMatchObject({ keep: ['anzo-full-20261004-040000.tar'], remove: [], note: null });
      expect(() => retention(four)).toThrow(/disk size/);
    });
  });

  it('RESTORE.txt names the file, the commit and the restore command', () => {
    const text = restoreText({ file: 'anzo-full-20261004-040000.tar', commit: 'abc1234', created: '2026-10-04T02:00:00Z' });
    expect(text).toContain('scripts/restore-full.sh anzo-full-20261004-040000.tar');
    expect(text).toContain('--target /tmp/anzo-restore-test --port 3997 --no-systemd');
    expect(text).toContain('Commit: abc1234');
  });
});

describe('cleanup patterns', () => {
  it('matches exactly the known leftovers', () => {
    expect(matchTmp({ name: '0123456789abcdef0123456789abcdef', isDir: true, children: ['sw.js'] })).toBe('workbox');
    expect(matchTmp({ name: 'Xy3kQ9', isDir: true, children: ['ssr'] })).toBe('vitest');
    expect(matchTmp({ name: 'playwright-transform-cache-1000', isDir: true })).toBe('playwright-cache');
    expect(matchTmp({ name: 'node-compile-cache', isDir: true })).toBe('node-compile-cache');
    expect(matchTmp({ name: 'mat-debug-12345.log', isDir: false })).toBe('mat-debug');
    expect(matchTmp({ name: 'pulse-PKdhtXMmr18n', isDir: true })).toBe('pulse');
    expect(matchTmp({ name: '.ses', isDir: false })).toBe('ses');
    for (const n of ['anzo-e2e-AbC123', 'anzo-jobint-x9', 'anzo-api-1', 'anzo-restore-test', 'anzo-full-zz', 'anzo-render-q']) expect(matchTmp({ name: n, isDir: true }), n).toBe('anzo-scratch');
    expect(matchTmp({ name: 'anzo-integrity-123-1790000000.sqlite', isDir: false })).toBe('anzo-integrity-copy');
  });

  it('every temp-dir prefix the tests use is cleaned', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const files = ['server/test', 'scripts', 'scripts/jobs', 'scripts/ops', 'scripts/render-audio'].flatMap((d) => fs.readdirSync(path.join(root, d))
      .filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(root, d, f), 'utf8')));
    const prefixes = new Set(files.flatMap((t) => [...t.matchAll(/(?:os\.tmpdir\(\), |scratchSuite\()'(anzo-[a-z0-9-]+)-'/g)].map((m) => m[1])));
    expect(prefixes.size).toBeGreaterThan(15);
    for (const p of prefixes) expect(matchTmp({ name: `${p}-AbC123`, isDir: true }), p).toBe('anzo-scratch');
  });

  it('never matches anything outside the list', () => {
    const never = [
      { name: 'systemd-private-abc-anzo.service-xyz', isDir: true },
      { name: 'dev-tool-1000', isDir: true },
      { name: 'tmux-1000', isDir: true },
      { name: 'anzo', isDir: true },
      { name: 'anzo-data', isDir: true },
      { name: 'anzo.sqlite', isDir: false },
      { name: '0123456789abcdef0123456789abcdef', isDir: true, children: ['index.html'] },
      { name: '0123456789abcdef0123456789abcdef', isDir: false },
      { name: 'Xy3kQ9', isDir: true, children: ['ssr', 'important.txt'] },
      { name: 'Xy3kQ9', isDir: true, children: [] },
      { name: '.X11-unix', isDir: true },
      { name: 'pulse', isDir: true },
      { name: 'mat-debug.log', isDir: false },
      { name: 'my-anzo-e2e-1', isDir: true },
      { name: 'anzo-e2e-1/../etc', isDir: true },
    ];
    for (const e of never) expect(matchTmp(e), e.name).toBeNull();
    expect(TMP_PATTERNS.every((p) => p.name.source.startsWith('^') && p.name.source.endsWith('$'))).toBe(true);
  });
});

describe('System page: problems from the logs', () => {
  it('merges warnings and errors of every log, newest first; info lines and noise are left out', () => {
    const dir = path.join(tmp, 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'app.log'), [
      JSON.stringify({ level: 30, time: Date.parse('2026-10-02T10:00:00Z'), msg: 'request' }),
      JSON.stringify({ level: 40, time: Date.parse('2026-10-02T10:01:00Z'), msg: 'health check failing', problems: ['3 audio clip(s) missing'] }),
      'not json at all',
    ].join('\n'));
    fs.writeFileSync(path.join(dir, 'jobs.log'), `${JSON.stringify({ level: 50, time: Date.parse('2026-10-02T11:00:00Z'), source: 'content-job', msg: 'correction rejected', reason: 'x' })}\n`);
    fs.writeFileSync(path.join(dir, 'backup.log'), '2026-10-02T09:00:00+02:00 anzo-backup: ok file=a\n2026-10-02T12:30:00+02:00 anzo-backup: FAILED: disk full\n');
    const p = recentProblems(dir, { now: Date.parse('2026-10-03T00:00:00Z') }).problems;
    expect(p.map((x) => [x.source, x.level, x.message])).toEqual([
      ['content-job', 'error', 'correction rejected: x'],
      ['backup', 'error', 'FAILED: disk full'],
      ['app', 'warn', 'health check failing: 3 audio clip(s) missing'],
    ]);
    expect(parseLine('garbage', { source: 'app', format: 'json' })).toBeNull();
  });

  it('drops problems older than 14 days', () => {
    const dir = path.join(tmp, 'logs-age');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'watchdog.log'), [
      JSON.stringify({ level: 40, time: Date.parse('2026-10-06T12:31:18Z'), source: 'watchdog', msg: 'anzo did not answer /api/live', reason: 'ECONNREFUSED' }),
      JSON.stringify({ level: 40, time: Date.parse('2026-10-20T08:00:00Z'), source: 'watchdog', msg: 'anzo did not answer /api/live', reason: 'ECONNREFUSED' }),
    ].join('\n'));
    expect(recentProblems(dir, { now: Date.parse('2026-10-20T12:31:17Z') }).problems).toHaveLength(2);
    const later = recentProblems(dir, { now: Date.parse('2026-10-20T12:31:19Z') }).problems; // the 6 Oct one is 14 days + 1 s old
    expect(later.map((x) => x.time)).toEqual(['2026-10-20T08:00:00.000Z']);
  });

  it('acknowledged problems stay hidden until the same problem is logged again; acknowledge all; old acks are dropped', () => {
    const db = openMemoryDb();
    runMigrations(db);
    const dir = path.join(tmp, 'logs-ack');
    fs.mkdirSync(dir, { recursive: true });
    const line = (iso, msg, extra = {}) => JSON.stringify({ level: 40, time: Date.parse(iso), msg, ...extra });
    const file = path.join(dir, 'app.log');
    fs.writeFileSync(file, `${[line('2026-10-08T10:00:00Z', 'slow request', { error: 'took 1200 ms' }), line('2026-10-08T11:00:00Z', 'disk low')].join('\n')}\n`);
    const now = Date.parse('2026-10-09T12:00:00Z');
    const first = recentProblems(dir, { now, acks: readAcks(db) });
    expect(first.problems).toHaveLength(2);
    expect(problemShape(first.problems[1])).toBe('app|slow request: took # ms'); // numbers do not make another problem
    expect(problemKey(first.problems[1])).toMatch(/^p[0-9a-f]{20}$/); // opaque: no log text in the key
    expect(problemKey({ source: 'app', message: 'SESSION_SECRET=abc123' })).not.toContain('SESSION');
    acknowledgeProblems(db, [first.problems[1]], 'admin', new Date(now));
    const after = recentProblems(dir, { now, acks: readAcks(db) });
    expect(after.problems.map((x) => x.message)).toEqual(['disk low']);
    expect(after.acknowledged).toBe(1);
    // the same problem again (another number): shown again; the acknowledged one stays hidden
    fs.appendFileSync(file, `${line('2026-10-09T13:00:00Z', 'slow request', { error: 'took 900 ms' })}\n`);
    const again = recentProblems(dir, { now: now + 7200_000, acks: readAcks(db) });
    expect(again.problems.map((x) => x.message)).toEqual(['slow request: took 900 ms', 'disk low']);
    // acknowledge all
    acknowledgeProblems(db, again.problems, 'admin', new Date(now + 7200_000));
    expect(recentProblems(dir, { now: now + 7200_000, acks: readAcks(db) }).problems).toEqual([]);
    // an acknowledgement older than 30 days is deleted when a new one is written
    db.prepare("INSERT INTO problem_acks (key, acked_at, acked_by) VALUES ('old|x', '2026-08-01T00:00:00.000Z', 'admin')").run();
    acknowledgeProblems(db, [{ key: 'app|y', message: 'y' }], 'admin', new Date(now));
    expect(db.prepare("SELECT COUNT(*) FROM problem_acks WHERE key = 'old|x'").pluck().get()).toBe(0);
  });
});

describe('watchdog: planned restarts and reloads are not failures', () => {
  const t0 = Date.parse('2026-10-03T10:00:00Z');
  const fail = { ok: false, error: 'ECONNREFUSED' };
  const show = (o) => parseUnitState(Object.entries({ ActiveState: 'active', SubState: 'running', NRestarts: '0', InvocationID: 'a1', ...o })
    .map(([k, v]) => `${k}=${v}`).join('\n'));

  it('parses systemctl show output (unix timestamps)', () => {
    expect(parseUnitState('ActiveState=active\nSubState=running\nStateChangeTimestamp=@1790980751\nNRestarts=2\nInvocationID=abc\n'))
      .toEqual({ activeState: 'active', subState: 'running', stateChangeAt: 1790980751000, nRestarts: 2, invocationId: 'abc', execStartAt: null });
    expect(parseUnitState('ActiveState=active\nExecMainStartTimestamp=@1791290000\n').execStartAt).toBe(1791290000000);
    expect(parseUnitState('').activeState).toBeNull();
  });

  it('skips (info) while the unit is activating, reloading or deactivating, and never counts it', () => {
    for (const s of ['activating', 'reloading', 'deactivating']) {
      const r = decide({ failures: 1, nRestarts: 0 }, fail, t0, show({ ActiveState: s, StateChangeTimestamp: `@${t0 / 1000 - 600}` }));
      expect(r.action).toBe('skip');
      expect(r.state.failures).toBe(0);
      expect(r.reason).toContain(s);
    }
  });

  it('skips within 60 s after a restart systemd did not make itself (NRestarts unchanged); counts after 60 s', () => {
    const recent = show({ StateChangeTimestamp: `@${(t0 - 20_000) / 1000}`, InvocationID: 'b2' });
    const r = decide({ failures: 1, nRestarts: 0, invocationId: 'a1' }, fail, t0, recent);
    expect(r.action).toBe('skip');
    expect(r.reason).toMatch(/planned/);
    const old = show({ StateChangeTimestamp: `@${(t0 - 61_000) / 1000}` });
    expect(decide({ failures: 0, nRestarts: 0, invocationId: 'a1' }, fail, t0, old).action).toBe('none');
    expect(decide({ failures: 1, nRestarts: 0, invocationId: 'a1' }, fail, t0, old).action).toBe('restart');
  });

  it('a crash restarted by systemd (NRestarts went up) is not planned: the failure counts', () => {
    const crashed = show({ NRestarts: '1', StateChangeTimestamp: `@${(t0 - 10_000) / 1000}` });
    const r = decide({ failures: 0, nRestarts: 0, invocationId: 'a1' }, fail, t0, crashed);
    expect(r.action).toBe('none');
    expect(r.state.failures).toBe(1);
    expect(r.state.nRestarts).toBe(1);
  });

  it('a stopped unit (systemctl stop) is left alone; failures of an earlier run of the service do not add up', () => {
    expect(decide({ failures: 1 }, fail, t0, show({ ActiveState: 'inactive', SubState: 'dead' })).action).toBe('skip');
    const r = decide({ failures: 1, nRestarts: 0, invocationId: 'old' }, fail, t0, show({ StateChangeTimestamp: `@${(t0 - 600_000) / 1000}`, InvocationID: 'new' }));
    expect(r.action).toBe('none');
    expect(r.state.failures).toBe(1);
  });

  // after a reboot anzo was "active" from 14:29:19 but listened only at 14:31:55; the first probe
  // after boot (14:31:18, 119 s after the state change) was logged as a failure. A run that never answered gets 5 minutes.
  it('a fresh run that has never answered (boot, start) is still loading for 5 minutes; then failures count', () => {
    const boot = (ago) => show({ InvocationID: 'boot2', StateChangeTimestamp: `@${(t0 - ago) / 1000}`, ExecMainStartTimestamp: `@${(t0 - ago) / 1000}` });
    const before = { failures: 0, nRestarts: 0, invocationId: 'boot1', okInvocationId: 'boot1' };
    const r = decide(before, fail, t0, boot(119_000));
    expect(r.action).toBe('skip');
    expect(r.reason).toMatch(/has not answered yet/);
    expect(r.state.failures).toBe(0);
    expect(decide(before, fail, t0, boot(301_000)).action).toBe('none'); // past the grace: counts
    // once this run has answered, a later failure counts at once (it is not loading any more)
    const ok = decide(before, { ok: true }, t0, boot(150_000));
    expect(ok.state.okInvocationId).toBe('boot2');
    expect(decide(ok.state, fail, t0 + 30_000, boot(180_000)).action).toBe('none');
    expect(decide({ ...ok.state, failures: 1 }, fail, t0 + 30_000, boot(180_000)).action).toBe('restart');
  });

  it('after a reboot NRestarts starts again at 0: only a rise means a crash', () => {
    const r = decide({ failures: 0, nRestarts: 2, invocationId: 'boot1', okInvocationId: 'boot1' }, fail, t0,
      show({ NRestarts: '0', InvocationID: 'boot2', StateChangeTimestamp: `@${(t0 - 90_000) / 1000}`, ExecMainStartTimestamp: `@${(t0 - 90_000) / 1000}` }));
    expect(r.action).toBe('skip');
    const crash = decide({ failures: 0, nRestarts: 0, invocationId: 'a1', okInvocationId: 'a1' }, fail, t0,
      show({ NRestarts: '1', InvocationID: 'a2', StateChangeTimestamp: `@${(t0 - 90_000) / 1000}`, ExecMainStartTimestamp: `@${(t0 - 90_000) / 1000}` }));
    expect(crash.action).toBe('none');
    expect(crash.state.failures).toBe(1);
  });

  it('without systemd information every failure counts as before', () => {
    expect(decide({ failures: 1 }, fail, t0, null).action).toBe('restart');
  });
});
