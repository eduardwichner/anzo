// The scratch repository the content-job tests run processRequest on (content-job*.test.js: three files so
// they run on three workers, each with its own scratch clone). `scratchSuite()` registers the hooks of one file and
// returns its helpers; `S.scratch` and `S.health` are set/read by the tests.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect } from 'vitest';
import { makeScratchRepo } from '../../scripts/jobs/scratch.js';
import { collectClips } from '../../scripts/render-audio/collect.js';
import { ms } from './slow.js';

export const REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Every clip the content needs must be on disk: a job run renders what is missing (Piper inside the unit suite, and each
 * rollback deletes it again for the next run to render). Returns how many are missing.
 */
export function missingClips() {
  return collectClips().filter((c) => !fs.existsSync(path.join(REAL, 'audio', c.file))).length;
}

export function scratchSuite(prefix = 'anzo-job-') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const S = { base, scratch: null, health: { status: 200, body: { ok: true } } };
  let server;
  let healthUrl;
  let nextId = 100;
  S.reloads = () => Number(fs.readFileSync(path.join(base, 'reloads'), 'utf8') || 0);
  S.setReload = (mode) => fs.writeFileSync(path.join(base, 'reload-mode.json'), JSON.stringify(mode));

  beforeAll(async () => {
    const missing = missingClips();
    if (missing) throw new Error(`${missing} audio clip(s) missing: run npm run audio:render before npm test (a job run would render them)`);
    S.scratch = makeScratchRepo(base, { realRoot: REAL });
    // Fake `systemctl reload anzo`: writes what the service writes after loading content (status/content.json).
    fs.writeFileSync(path.join(base, 'reloads'), '0');
    S.setReload({ reloadOk: true, integrityOk: true });
    fs.writeFileSync(path.join(base, 'fake-reload.mjs'), `
      import fs from 'node:fs';
      const base = ${JSON.stringify(base)};
      fs.writeFileSync(base + '/reloads', String(Number(fs.readFileSync(base + '/reloads', 'utf8')) + 1));
      const mode = JSON.parse(fs.readFileSync(base + '/reload-mode.json', 'utf8'));
      const now = new Date().toISOString();
      fs.writeFileSync(${JSON.stringify(path.join(S.scratch.spoolDir, 'status/content.json'))}, JSON.stringify({
        lastReload: mode.reloadOk ? { ok: true, at: now } : { ok: false, at: now, error: 'refused' },
        integrity: { ok: mode.integrityOk, errors: mode.integrityOk ? [] : ['kid2: attempt 7: exercise "x" does not exist'] },
        writtenAt: now,
      }));`);
    server = http.createServer((req, res) => res.writeHead(S.health.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(S.health.body)));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    healthUrl = `http://127.0.0.1:${server.address().port}/api/health`;
  }, ms(120_000));
  afterAll(() => {
    server?.close();
    fs.rmSync(base, { recursive: true, force: true });
  });

  S.git = (...args) => execFileSync('git', ['-C', S.scratch.root, ...args], { encoding: 'utf8' }).trim();
  S.env = (over = {}) => ({
    root: S.scratch.root, spoolDir: S.scratch.spoolDir, audioDir: S.scratch.audioDir, healthUrl,
    reloadCmd: [process.execPath, path.join(base, 'fake-reload.mjs')], testFiles: [], reloadTimeoutMs: 5000, ...over,
  });
  S.request = (over) => ({ id: nextId++, kind: 'edit', author: 'admin', track: 'en', packId: 'en-a2', unitId: 'en-a2-u01', reason: 'test', ...over });
  S.nativeFix = (id, from, to, over = {}) => S.request({ target: { kind: 'sentence', id }, before: { native: from }, after: { native: to }, summary: `${id}: Dutch fix`, ...over });
  S.unitText = () => fs.readFileSync(path.join(S.scratch.root, 'content/src/en/a2/01-months.yaml'), 'utf8');
  S.expectClean = (head) => {
    expect(S.git('status', '--porcelain', '--', 'content/')).toBe('');
    expect(S.git('rev-parse', 'HEAD')).toBe(head);
  };
  return S;
}
