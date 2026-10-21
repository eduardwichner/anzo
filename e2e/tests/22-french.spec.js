import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import {
  adminUsers, answerCurrent, deleteUserIfExists, exercisesById, loginAdmin, loginChild, playToEnd, playUntil, readManifest, readPack, t,
} from './helpers.js';

// French: Alex's path over every available French level, a generated A1 and A2 lesson played through the UI, typing on a
// phone (curly apostrophe, no accent), and phone screenshots of French exercises and the level sheet.
// Only stable ids are used (<pack>-u01-l01); other exercises are looked up in the pack files.

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const FR = readManifest().tracks.find((tr) => tr.id === 'fr').packs.filter((p) => p.status === 'available');
const KID = { username: 'frkid', displayName: 'Lou', role: 'child', course: { track: 'fr' }, uiLang: 'nl', avatar: 'fox', avatarBg: 'peach', password: 'kind' };
const shot = (page, testInfo, name, opts = {}) => {
  if (testInfo.project.name !== 'mobile') return null;
  fs.mkdirSync(outDir, { recursive: true });
  return page.screenshot({ path: path.join(outDir, `mobile-${name}.png`), ...opts });
};
const lessonOf = (pack, exId) => pack.units.flatMap((u) => u.lessons).find((l) => l.exercises.some((e) => e.id === exId)).id;
const findExercise = (pred) => {
  for (const p of FR) {
    const pack = readPack(p.file);
    for (const u of pack.units) for (const l of u.lessons) for (const e of l.exercises) if (pred(e)) return { pack, lessonId: l.id, ex: e };
  }
  return null;
};

test.describe.serial('French', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    await deleteUserIfExists(page, KID.username);
    expect((await page.request.post('/api/admin/users', { data: KID })).status()).toBe(201);
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    await deleteUserIfExists(page, KID.username);
    expect((await adminUsers(page)).map((u) => u.username).sort()).toEqual(['admin', 'kid1', 'kid2']);
    await page.close();
  });

  test("Alex's path shows A1.1 → A1 → A2 → B1 and opens at her current lesson; the level sheet lists the French levels", async ({ page }, testInfo) => {
    expect(FR.map((p) => p.id)).toEqual(['fr-a1-1', 'fr-a1', 'fr-a2', 'fr-b1', 'fr-b2']);
    await loginChild(page, 'kid2');
    await expect(page.getByTestId('home')).toHaveAttribute('data-track', 'fr');
    const headings = page.getByTestId('pack-heading');
    expect(await headings.evaluateAll((els) => els.map((e) => e.dataset.packId))).toEqual(FR.map((p) => p.id));
    const current = page.locator('[data-testid="lesson-node"][data-state="current"]');
    await expect(current).toHaveCount(1);
    await expect(current).toBeInViewport();
    await expect(page.getByTestId('level-bar')).toHaveAttribute('data-pack-id', 'fr-a1-1');
    await page.getByTestId('level-bar').click();
    const sheet = page.getByTestId('level-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(t('languages.fr'));
    const rows = sheet.getByTestId('level-row');
    await expect(rows).toHaveCount(readManifest().tracks.find((tr) => tr.id === 'fr').packs.length);
    await expect(sheet.getByTestId('level-go')).toHaveCount(FR.length);
    await shot(page, testInfo, 'level-sheet-fr');
  });

  test('a generated lesson of French A1 and A2 can be completed through the UI', async ({ page, browser }, testInfo) => {
    await loginAdmin(page);
    const id = (await adminUsers(page)).find((u) => u.username === KID.username).id;
    for (const pack of FR.slice(1).filter((p) => p.cefr !== 'B1')) { // B1: spec 36
      expect((await page.request.put(`/api/admin/users/${id}/courses/fr`, { data: { startPack: pack.id } })).status()).toBe(200);
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
      await ctx.close();
    }
  });

  test("typing l’ecole (curly apostrophe, no accent) for l'école is correct with the accent note", async ({ page }) => {
    const found = findExercise((e) => (e.type === 'listen_type' || (e.type === 'fill_blank' && !e.options)) && /l'école/.test(e.answer));
    expect(found, 'a typed French exercise whose answer contains l\'école').toBeTruthy();
    await loginChild(page, KID.username, KID.password);
    await page.goto(`/lesson/${found.lessonId}`);
    const byId = exercisesById(found.pack);
    await playUntil(page, byId, found.ex.id);
    const typed = found.ex.answer.replace(/'/g, '’').replace(/é/g, 'e').replace(/à/g, 'a').replace(/[.!?]$/, '');
    expect(typed).toContain('l’ecole');
    await answerCurrent(page, byId, { typed });
    await expect(page.getByTestId('result-strip')).toHaveAttribute('data-result', 'correct');
    await expect(page.getByTestId('accent-note')).toContainText(t('lesson.accents'));
    await expect(page.getByTestId('accent-note')).toContainText(found.ex.answer);
  });

  test('screenshots: a French build-the-sentence with elisions and a French match with articles', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'screenshots are taken in the mobile project only');
    await loginChild(page, KID.username, KID.password);
    const build = findExercise((e) => e.type === 'build_sentence' && e.tokens.some((tok) => /^\p{L}+'\p{L}/u.test(tok)) && e.tokens.length >= 5);
    await page.goto(`/lesson/${build.lessonId}`);
    await playUntil(page, exercisesById(build.pack), build.ex.id);
    await shot(page, testInfo, 'fr-build-sentence-elisions', { fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(412);

    const match = findExercise((e) => e.type === 'match_pairs' && e.pairs.filter((pr) => /^(le|la|les) |^l'/.test(pr.left)).length >= 4);
    await page.goto(`/lesson/${match.lessonId}`);
    await playUntil(page, exercisesById(match.pack), match.ex.id);
    await shot(page, testInfo, 'fr-match-articles', { fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(412);
  });
});
