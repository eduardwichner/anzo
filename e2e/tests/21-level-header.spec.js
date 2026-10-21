import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { loginChild, readManifest, t } from './helpers.js';

// The sticky level bar on Home names the level and unit in view and opens the level sheet; "Go here" scrolls the
// path to a level; a floating button returns to the current lesson. Only stable ids are used (<pack>-u01).

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const EN = readManifest().tracks.find((tr) => tr.id === 'en').packs;
const AVAILABLE = EN.filter((p) => p.status === 'available');
const name = (p) => (p.title.nl === p.cefr ? p.cefr : `${p.title.nl} · ${p.cefr}`);
const shot = (page, testInfo, file) => {
  if (testInfo.project.name !== 'mobile') return null;
  fs.mkdirSync(outDir, { recursive: true });
  return page.screenshot({ path: path.join(outDir, `mobile-${file}.png`) });
};
const unitNode = (page, unitId) => page.locator(`[data-testid="unit-node"][data-unit-id="${unitId}"]`);
/** Scroll so that a unit heading sits in the upper third of the screen (above the bar's reference line). */
const scrollUnitToTop = (page, unitId) => unitNode(page, unitId).evaluate((el) => {
  window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - window.innerHeight / 4, behavior: 'instant' });
});

test.describe.serial('Level bar, level sheet and current-lesson button', () => {
  test('the bar shows the level and unit in view, at load and after scrolling into Movers', async ({ page }, testInfo) => {
    await loginChild(page, 'kid1');
    const bar = page.getByTestId('level-bar');
    await expect(bar).toBeVisible();
    // Sam's current lesson is the first of Starters: the bar names that level and unit.
    await expect(page.locator('[data-lesson-id="en-pre-a1-u01-l01"]')).toHaveAttribute('data-state', 'current');
    await expect(bar).toHaveAttribute('data-pack-id', AVAILABLE[0].id);
    await expect(bar).toHaveAttribute('data-unit-id', `${AVAILABLE[0].id}-u01`);
    await expect(page.getByTestId('level-bar-level')).toHaveText(name(AVAILABLE[0]));
    await expect(page.getByTestId('current-lesson-button')).toHaveCount(0);
    await shot(page, testInfo, 'level-bar');

    await scrollUnitToTop(page, `${AVAILABLE[1].id}-u01`);
    await expect(bar).toHaveAttribute('data-pack-id', AVAILABLE[1].id);
    await expect(bar).toHaveAttribute('data-unit-id', `${AVAILABLE[1].id}-u01`);
    await expect(page.getByTestId('level-bar-level')).toHaveText(name(AVAILABLE[1]));
    // Sticky: still at the top of the screen after scrolling hundreds of lessons.
    expect((await bar.boundingBox()).y).toBeLessThan(40);
  });

  test('the floating button appears when the current lesson is out of view and returns to it', async ({ page }, testInfo) => {
    await loginChild(page, 'kid1');
    await scrollUnitToTop(page, `${AVAILABLE[1].id}-u02`);
    const fab = page.getByTestId('current-lesson-button');
    await expect(fab).toBeVisible();
    await expect(fab).toHaveAttribute('data-direction', 'up');
    await expect(fab).toHaveText(t('home.currentLesson'));
    await shot(page, testInfo, 'current-lesson-button');
    await fab.click();
    await expect(page.locator('[data-testid="lesson-node"][data-state="current"]')).toBeInViewport();
    await expect(fab).toHaveCount(0);
    await expect(page.getByTestId('level-bar')).toHaveAttribute('data-pack-id', AVAILABLE[0].id);
  });

  test('tapping the bar opens the level sheet; "Go here" on Flyers scrolls to its first unit; ✕ returns to the current lesson', async ({ page }, testInfo) => {
    await loginChild(page, 'kid1');
    await page.getByTestId('level-bar').click();
    const sheet = page.getByTestId('level-sheet');
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/\/levels$/);
    const rows = sheet.getByTestId('level-row');
    await expect(rows).toHaveCount(EN.length);
    await expect(rows.first()).toHaveAttribute('data-current', 'true');
    await expect(sheet.getByTestId('level-go')).toHaveCount(AVAILABLE.length);
    await expect(sheet.getByTestId('level-go').first()).toHaveText(t('levels.goHere'));
    await shot(page, testInfo, 'level-sheet');

    const flyers = AVAILABLE[AVAILABLE.length - 1];
    await sheet.locator(`[data-pack-id="${flyers.id}"]`).getByTestId('level-go').click();
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    await expect(unitNode(page, `${flyers.id}-u01`)).toBeInViewport();
    await expect(page.getByTestId('level-bar')).toHaveAttribute('data-pack-id', flyers.id);
    await expect(page.getByTestId('level-bar')).toHaveAttribute('data-unit-id', `${flyers.id}-u01`);

    await page.getByTestId('level-bar').click();
    await expect(sheet).toBeVisible();
    await page.getByTestId('level-sheet-close').click();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('[data-testid="lesson-node"][data-state="current"]')).toBeInViewport();
  });

  test('/levels is a deep link to the sheet, and the old Levels block is gone from Home', async ({ page }) => {
    await loginChild(page, 'kid1');
    await expect(page.getByTestId('levels-link')).toHaveCount(0);
    await page.goto('/levels');
    await expect(page.getByTestId('level-sheet')).toBeVisible();
    await expect(page.getByTestId('home')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('level-sheet')).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[data-testid="lesson-node"][data-state="current"]')).toBeInViewport();
  });
});
