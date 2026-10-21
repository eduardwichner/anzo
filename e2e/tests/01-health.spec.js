import { test, expect } from '@playwright/test';
import { readManifest } from './helpers.js';

test('health endpoint lists every loaded pack of the manifest (available and preview)', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.ok).toBe(true);
  const available = readManifest().tracks.flatMap((t) => t.packs.filter((p) => ['available', 'preview'].includes(p.status)).map((p) => p.id));
  expect(body.packs).toEqual(available);
  expect(body.packs).toEqual(expect.arrayContaining(['en-pre-a1', 'en-a1', 'en-a2', 'fr-a1-1', 'fr-a1', 'fr-a2']));
});
