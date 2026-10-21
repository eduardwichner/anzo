import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import {
  ADMIN_LANG, adminUsers, deleteUserIfExists, exercisesById, loginAdmin, loginChild, logoutAnywhere, playToEnd, playUntil,
  readManifest, readPack, t,
} from './helpers.js';

// One continuous path over every available level of the track, a heading per level, opened at the current lesson;
// the admin-set start level makes earlier levels optional and unlocks the path from the start level's first lesson.
// Only stable ids are used: <pack>-u01-l01, <pack>-u01-review.

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const EN = readManifest().tracks.find((tr) => tr.id === 'en').packs.filter((p) => p.status === 'available');
const KID = { username: 'pathkid', displayName: 'Pim', role: 'child', course: { track: 'en' }, uiLang: 'nl', avatar: 'frog', avatarBg: 'mint', password: 'kind' };
const shot = (page, testInfo, name, opts = {}) => {
  if (testInfo.project.name !== 'mobile') return null;
  fs.mkdirSync(outDir, { recursive: true });
  return page.screenshot({ path: path.join(outDir, `mobile-${name}.png`), ...opts });
};

test.describe.serial('Home path and start level', () => {
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    await deleteUserIfExists(page, KID.username);
    expect((await adminUsers(page)).map((u) => u.username).sort()).toEqual(['admin', 'kid1', 'kid2']);
    await page.close();
  });

  test("Sam's path shows every available English level with a heading and opens at her current lesson", async ({ page }, testInfo) => {
    await loginChild(page, 'kid1');
    const headings = page.getByTestId('pack-heading');
    await expect(headings).toHaveCount(EN.length);
    expect(await headings.evaluateAll((els) => els.map((e) => e.dataset.packId))).toEqual(EN.map((p) => p.id));
    for (const p of EN) await expect(page.locator(`[data-lesson-id="${p.id}-u01-l01"]`)).toHaveCount(1);
    // Exactly one current lesson, scrolled into view on open.
    const current = page.locator('[data-testid="lesson-node"][data-state="current"]');
    await expect(current).toHaveCount(1);
    await expect(current).toBeInViewport();
    await expect(page.locator(`[data-lesson-id="${EN[1].id}-u01-l01"]`)).toHaveAttribute('data-state', 'locked');
    await shot(page, testInfo, 'home-path');
    await page.locator(`[data-testid="pack-heading"][data-pack-id="${EN[1].id}"]`).scrollIntoViewIfNeeded();
    await shot(page, testInfo, 'home-path-level-heading');
  });

  test('admin sets a start level in the user\'s course; the child starts there, earlier levels are optional', async ({ page }) => {
    await loginAdmin(page);
    await deleteUserIfExists(page, KID.username);
    expect((await page.request.post('/api/admin/users', { data: KID })).status()).toBe(201);
    const id = (await adminUsers(page)).find((u) => u.username === KID.username).id;
    await page.goto(`/admin/users/${id}`);
    await expect(page.getByTestId('course-start-en')).toBeVisible();
    await expect(page.getByTestId('course-start-en')).toHaveValue('');
    await page.getByTestId('course-start-en').selectOption(EN[1].id);
    await expect.poll(async () => (await (await page.request.get(`/api/admin/users/${id}/courses`)).json()).courses[0].startPack).toBe(EN[1].id);
    await page.goto('/admin');
    await expect(page.getByTestId('admin')).toBeVisible();
    await logoutAnywhere(page);

    await loginChild(page, KID.username, KID.password);
    await expect(page.locator(`[data-lesson-id="${EN[1].id}-u01-l01"]`)).toHaveAttribute('data-state', 'current');
    await expect(page.locator(`[data-lesson-id="${EN[0].id}-u01-l01"]`)).toHaveAttribute('data-state', 'optional');
    await expect(page.locator(`[data-testid="pack-heading"][data-pack-id="${EN[0].id}"]`)).toHaveAttribute('data-optional', 'true');
    await expect(page.locator(`[data-lesson-id="${EN[1].id}-u01-l01"]`)).toBeInViewport();
  });

  test('a generated lesson of each higher level can be completed through the UI', async ({ page, browser }, testInfo) => {
    await loginAdmin(page);
    const id = (await adminUsers(page)).find((u) => u.username === KID.username).id;
    // B1 opens with text lessons (reading, dialogue): played in spec 36.
    for (const pack of EN.slice(1).filter((p) => p.cefr !== 'B1')) {
      expect((await page.request.put(`/api/admin/users/${id}/courses/en`, { data: { startPack: pack.id } })).status()).toBe(200);
      // A separate browser context: the admin session must not leak into the child's login.
      const ctx = await browser.newContext({ ...testInfo.project.use, baseURL: testInfo.project.use.baseURL });
      const p = await ctx.newPage();
      await loginChild(p, KID.username, KID.password);
      const lessonId = `${pack.id}-u01-l01`;
      await expect(p.locator(`[data-lesson-id="${lessonId}"]`)).toHaveAttribute('data-state', 'current');
      await p.locator(`[data-lesson-id="${lessonId}"]`).click();
      const seen = await playToEnd(p, exercisesById(readPack(pack.file)));
      expect(new Set(seen.map((s) => s.type)).size).toBe(6);
      await expect(p.getByTestId('lesson-done')).toBeVisible();
      await p.getByTestId('done-continue').click();
      await expect(p.locator(`[data-lesson-id="${lessonId}"]`)).toHaveAttribute('data-state', 'done');
      await expect(p.locator(`[data-lesson-id="${pack.id}-u01-l02"]`)).toHaveAttribute('data-state', 'current');
      await ctx.close();
    }
  });

  test('screenshots: a review lesson and the longest Flyers build-the-sentence', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'screenshots are taken in the mobile project only');
    await loginChild(page, KID.username, KID.password);
    // The Starters review lesson is optional (playable) for a child who starts higher up.
    await page.locator(`[data-lesson-id="${EN[0].id}-u01-review"]`).click();
    await expect(page.getByTestId('exercise')).toBeVisible();
    await shot(page, testInfo, 'review-lesson');
    await page.getByTestId('quit-lesson').click();

    const last = EN.find((p) => p.id === 'en-b1'); // the longest builds before B2 (whose review opens with transformations)
    const pack = readPack(last.file);
    const byId = exercisesById(pack);
    const builds = [...byId.values()].filter((e) => e.type === 'build_sentence');
    const longest = builds.reduce((a, b) => (b.tokens.length > a.tokens.length ? b : a));
    expect(longest.tokens.length).toBeGreaterThanOrEqual(8);
    const lessonId = pack.units.flatMap((u) => u.lessons).find((l) => l.exercises.some((e) => e.id === longest.id)).id;
    await page.goto(`/lesson/${lessonId}`);
    await playUntil(page, byId, longest.id);
    await shot(page, testInfo, 'flyers-build-sentence', { fullPage: true });
    // Nothing wider than the phone screen.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(412);
  });
});
