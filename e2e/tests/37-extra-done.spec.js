import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { deleteUserIfExists, exercisesById, loginAdmin, loginChild, playToEnd, readPack, syncClock, t } from './helpers.js';

// A finished Extra oefening has its own done state — a green star with a small check on the path (never
// the green disc of a finished lesson) and "Extra oefening: n van m gedaan" in the level sheet — and still does not count
// for the level's progress, the unit or the level badge. Self-restoring: the learner is deleted at the end.

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const shot = async (page, testInfo, name) => {
  if (testInfo.project.name !== 'mobile') return;
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `mobile-37-${name}.png`) });
};
const pack = readPack('en/pre-a1.json');
const byId = exercisesById(pack);
const EXTRA = pack.units[0].lessons.find((l) => l.extra); // en-pre-a1-u01-extra, Dieren (Sam's unit 1)
const USER = 'e2e-extra';

test.describe.serial('Extra oefening: done state', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    await deleteUserIfExists(page, USER);
    const res = await page.request.post('/api/admin/users', {
      data: { username: USER, displayName: 'Xena', role: 'child', uiLang: 'nl', avatar: 'cat', avatarBg: 'sky', password: 'extra', course: { track: 'en' } },
    });
    expect(res.status()).toBe(201);
    await page.close();
  });
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    await deleteUserIfExists(page, USER);
    await page.close();
  });

  test('an extra lesson played to the end shows its done state after a reload; level progress and badges stay as they were', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await syncClock(page);
    await loginChild(page, USER, 'extra');
    const node = page.locator(`[data-testid="lesson-node"][data-lesson-id="${EXTRA.id}"]`);
    await expect(node).toHaveAttribute('data-state', 'optional');
    await expect(node).toHaveAttribute('data-extra', 'true');
    await page.goto(`/lesson/${EXTRA.id}`);
    await playToEnd(page, byId);
    await expect(page.getByTestId('lesson-done')).toBeVisible();
    await page.goto('/');
    await page.reload();
    await expect(node).toHaveAttribute('data-state', 'done');
    await expect(node).toHaveAttribute('aria-label', t('home.lessonExtraDone', 'nl', { title: EXTRA.title.nl }));
    await expect(node.locator('.extra-check')).toBeVisible();
    // a finished regular lesson would be the green disc: this one is white with a green ring
    const bg = await node.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe(await page.locator('[data-testid="lesson-node"]').first().evaluate((el) => {
      const probe = el.cloneNode(); probe.dataset.state = 'done'; delete probe.dataset.extra; document.body.append(probe);
      const c = getComputedStyle(probe).backgroundColor; probe.remove(); return c;
    }));
    // the first regular lesson is still the current one
    await expect(page.locator(`[data-testid="lesson-node"][data-lesson-id="${pack.units[0].lessons[0].id}"]`)).toHaveAttribute('data-state', 'current');
    await node.scrollIntoViewIfNeeded();
    await shot(page, testInfo, 'extra-done-path');
    await page.getByTestId('level-bar').click();
    const row = page.locator('[data-testid="level-row"][data-pack-id="en-pre-a1"]');
    await expect(row.getByTestId('level-percent')).toHaveText(t('levels.percentDone', 'nl', { n: 0 }));
    const extras = row.getByTestId('level-extras');
    const total = pack.units.flatMap((u) => u.lessons).filter((l) => l.extra).length;
    await expect(extras).toHaveAttribute('data-done', '1');
    await expect(extras).toHaveText(t('levels.extrasDone', 'nl', { n: 1, total }));
    await shot(page, testInfo, 'extra-done-sheet');
    const profile = await (await page.request.get('/api/profile')).json();
    const earned = profile.badges.filter((b) => b.earnedAt).map((b) => b.id);
    expect(earned).not.toContain('unit-complete');
    expect(earned).not.toContain('level-en-pre-a1');
  });
});
