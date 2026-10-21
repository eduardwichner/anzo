import { test, expect } from '@playwright/test';

test('web app manifest is served with the right name and display', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ name: 'Anzo', short_name: 'Anzo', display: 'standalone', lang: 'nl', start_url: '/' });
  expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) expect((await request.get(`/${icon.src}`)).ok()).toBe(true);
});

test('a service worker registers on localhost (secure context)', async ({ page }) => {
  await page.goto('/login');
  const result = await page.evaluate(async () => {
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 15_000));
    const reg = await Promise.race([navigator.serviceWorker.ready, timeout]);
    return reg ? { scope: reg.scope, active: Boolean(reg.active), secure: window.isSecureContext } : null;
  });
  expect(result).not.toBeNull();
  expect(result.secure).toBe(true);
  expect(result.active).toBe(true);
  expect(result.scope).toMatch(/^http:\/\/localhost:3999\/$/);
});
