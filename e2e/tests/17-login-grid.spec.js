import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { adminUsers, deleteUserIfExists, loginAdmin, logoutAnywhere } from './helpers.js';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const AVATARS = ['fox', 'owl', 'dog', 'bear', 'panda', 'frog', 'penguin', 'lion', 'koala', 'hedgehog'];
const BGS = ['sky', 'mint', 'sun', 'peach', 'lilac', 'rose', 'sand', 'teal', 'sky', 'mint'];
// Realistic, some long, display names: the grid must stay readable.
const NAMES = ['Mees', 'Fleur', 'Sem', 'Liv', 'Noah', 'Tess', 'Maximiliaan', 'Julia', 'Daan', 'Sophie-Anne'];
const EXTRA = NAMES.map((name, i) => ({
  username: `grid${String(i + 1).padStart(2, '0')}`, displayName: name, role: 'child', track: i % 2 ? 'fr' : 'en',
  uiLang: 'nl', avatar: AVATARS[i], avatarBg: BGS[i], password: 'kind',
}));

test('the login grid with 10 extra children (12 in all) stays readable at 412×915', async ({ page }, testInfo) => {
  await loginAdmin(page, { ui: true });
  for (const u of EXTRA) await deleteUserIfExists(page, u.username);
  for (const u of EXTRA) expect((await page.request.post('/api/admin/users', { data: u })).status()).toBe(201);
  try {
    await logoutAnywhere(page);
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto('/login');
    const cards = page.getByTestId('profile-grid').getByRole('button');
    await expect(cards).toHaveCount(12);

    // Sorted by display name; nothing wider than the screen; every name fully visible (no clipping).
    const names = await cards.allInnerTexts();
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' })));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(412);
    for (const card of await cards.all()) {
      const box = await card.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(412);
      expect(box.width).toBeGreaterThanOrEqual(100);
      const clipped = await card.locator('.profile-name').evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(clipped, await card.innerText()).toBe(false);
    }
    if (testInfo.project.name === 'mobile') {
      fs.mkdirSync(outDir, { recursive: true });
      await page.screenshot({ path: path.join(outDir, 'mobile-login-grid.png'), fullPage: true });
      await page.getByTestId('profile-grid07').click();
      await page.screenshot({ path: path.join(outDir, 'mobile-login-grid-selected.png'), fullPage: true });
    }
  } finally {
    await loginAdmin(page, { ui: true });
    for (const u of EXTRA) await deleteUserIfExists(page, u.username);
    expect((await adminUsers(page)).map((u) => u.username).sort()).toEqual(['admin', 'kid1', 'kid2']);
  }
});
