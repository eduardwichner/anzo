// The rules of npm run publish:check (scripts/ops/publish-check.js) on planted samples. This
// file holds fake secrets, addresses and names on purpose: publish:check skips it (and only it).
import { describe, expect, it } from 'vitest';

describe('publish:check rules', async () => {
  const { neverReason, scanText, PRIVATE_IP } = await import('../../scripts/ops/publish-check.js');
  const terms = { names: ['zoë', 'kim'], domains: ['anzo.home.example'] };
  it('finds names, the domain, private addresses, secrets and personal e-mail; documentation addresses pass', () => {
    const text = ['Kim learns English', 'see https://anzo.home.example/api', 'proxy 192.168.1.4', 'proxy 192.0.2.1 and 203.0.113.9',
      'contact jan@gmail.com', `SESSION_SECRET=${'ab'.repeat(24)}`, 'Kimberley is not Kim\'s name… but Kim is'].join('\n');
    const hits = scanText('README.md', text, { terms });
    expect(hits.map((h) => `${h.line}:${h.kind}`)).toEqual(['1:name', '2:domain', '3:ip', '5:email', '6:secret', '7:name']);
    expect(PRIVATE_IP.test('10.20.30.40') && PRIVATE_IP.test('172.20.1.1') && !PRIVATE_IP.test('172.32.1.1')).toBe(true);
  });
  it('a lesson sentence is listed as lesson content; an allowed phrase is not a name; sample secrets of a test file pass', () => {
    expect(scanText('content/packs/en/a1.json', 'Kim has a dog.', { terms })[0]).toMatchObject({ kind: 'name', lesson: true });
    // A file may name only what the allow-list grants it — as a whole, never by phrase
    expect(scanText('docs/developer/audio.md', '*Kim is* → "Kimmer"', { terms, allowNames: ['kim'] })).toEqual([]);
    expect(scanText('docs/other.md', '"displayName": "Kim"', { terms, allowNames: [] }).map((h) => h.kind)).toEqual(['name']);
    // The registrable domain and more private ranges
    expect(scanText('README.md', 'see https://status.home.example', { terms: { names: [], domains: ['anzo.home.example', 'home.example'] } })
      .map((h) => h.kind)).toEqual(['domain']);
    for (const ip of ['100.64.1.2', '169.254.1.1', 'fd12:3456::1', 'fe80::1']) expect(PRIVATE_IP.test(ip), ip).toBe(true);
    expect(PRIVATE_IP.test('100.128.0.1')).toBe(false);
    expect(scanText('server/test/x.test.js', 'AKIAABCDEFGHIJKLMNOP', { terms, secretSamples: { 'server/test/x.test.js': 'why' } })).toEqual([]);
  });
  it('never publishes reference files, recordings, voices, databases, environment files or the local seed', () => {
    for (const f of ['content/reference/yle.pdf', 'content/reference/extracted/wordlist-fr.json', 'audio/en/a.mp3', 'models/piper/x.onnx',
      '.env', '.env.local', 'data/anzo.sqlite', 'config/seed.local.json', 'config/publish.local.json', 'x/backup.sqlite.gz',
      'content/reference/README.md', 'CLAUDE.md', 'docs/README-private.md', 'docs/review/x.md', 'content/review/en/u.md']) expect(neverReason(f), f).toBeTruthy();
    for (const f of ['.env.example', 'models/manifest.json', 'docs/developer/content.md', 'docs/operator-guide.md', 'README.md',
      'config/seed.example.json']) expect(neverReason(f), f).toBeNull();
  });
  it('the history scan follows the same allow-list per file (a fresh history of an allowed tree is clean)', async () => {
    const { scanHistoryPatch } = await import('../../scripts/ops/publish-check.js');
    const patch = (file, ...lines) => [`+++ b/${file}`, ...lines.map((l) => `+${l}`)].join('\n');
    const log = [patch('docs/developer/audio.md', '*Kim is* → "Kimmer"'),
      patch('server/test/x.test.js', 'AKIAABCDEFGHIJKLMNOP'), patch('content/packs/en/a1.json', 'Zoë has a dog.')].join('\n');
    const opts = { terms, allowFiles: { 'docs/developer/audio.md': { names: ['kim'] } }, secretSamples: { 'server/test/x.test.js': 'why' } };
    const clean = scanHistoryPatch(log, opts);
    expect([clean.names.size, clean.secrets, clean.ips, clean.emails, clean.never.size]).toEqual([0, 0, 0, 0, 0]);
    // the same lines in a file the allow-list does not name are found
    const found = scanHistoryPatch([patch('docs/other.md', 'Kim is here', 'AKIAABCDEFGHIJKLMNOP'), patch('audio/en/a.mp3', 'x')].join('\n'), opts);
    expect([[...found.names], found.secrets, [...found.never]]).toEqual([['kim'], 1, ['audio/en/a.mp3']]);
  });
});
