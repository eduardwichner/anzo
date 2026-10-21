import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { deleteUserIfExists, exercisesById, loginAdmin, loginLang, logoutAnywhere, playToEnd, readManifest, readPack, t } from './helpers.js';

// The end screen (Continue primary → the next lesson on the path; Once more secondary; the < 60 % line),
// Settings → Play words automatically, the avatar picker fitting the card at 320 and 412 px, the course sheet's "no other
// courses" line, and the recoverable error screen (Try again, Back to Home). Self-restoring: the learner is deleted.

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const shot = (page, testInfo, name) => {
  if (testInfo.project.name !== 'mobile') return null;
  fs.mkdirSync(outDir, { recursive: true });
  return page.screenshot({ path: path.join(outDir, `mobile-29-${name}.png`), fullPage: false });
};
const NL = readManifest().tracks.find((tr) => tr.id === 'nl');
const startPack = readPack(NL.packs.find((p) => p.id === 'nl-pre-a1').file);
const byId = exercisesById(startPack);
const [L1, L2] = startPack.units[0].lessons;
const USER = 'e2e-end-screen';
const PW = 'ten-e2e';
const LANG = 'en';
const current = (page) => page.locator('[data-testid="lesson-node"][data-state="current"]');

async function login(page) {
  await page.goto('/login');
  await page.getByTestId('login-other').click();
  await page.locator('#login-username').fill(USER);
  await page.locator('#login-password').fill(PW);
  await page.getByTestId('login').getByRole('button', { name: t('login.submit', await loginLang(page)) }).click();
  await expect(page.getByTestId('home')).toBeVisible();
}

test.describe.serial('the end screen, the grids and the error screen', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    const page = await (await browser.newContext({ ...testInfo.project.use })).newPage();
    await loginAdmin(page);
    await deleteUserIfExists(page, USER);
    const res = await page.request.post('/api/admin/users', {
      data: {
        username: USER, displayName: 'Tess', role: 'child', audience: 'adult', nativeLang: 'en', uiLang: LANG, avatar: 'owl', avatarBg: 'mint',
        password: PW, showOnLogin: false, course: { track: 'nl', startPack: 'nl-pre-a1' },
      },
    });
    expect(res.status()).toBe(201);
    await page.request.post('/api/auth/logout');
    await page.context().close();
  });

  test.afterAll(async ({ browser }, testInfo) => {
    const page = await (await browser.newContext({ ...testInfo.project.use })).newPage();
    await loginAdmin(page);
    await deleteUserIfExists(page, USER);
    await page.context().close();
  });

  test('end screen: below 60 % an encouraging line, Continue (primary) lands on the next lesson, Once more is secondary', async ({ page }, testInfo) => {
    await login(page);
    await expect(current(page)).toHaveAttribute('data-lesson-id', L1.id);
    await current(page).click();
    // Every exercise wrong at the first try: the score is 0 %.
    await playToEnd(page, byId, { wrongIds: new Set(L1.exercises.map((e) => e.id)) });
    await expect(page.getByTestId('done-score')).toHaveText(t('done.scoreValue', LANG, { n: 0 }));
    await expect(page.getByTestId('done-encourage')).toHaveText(t('done.lowScore', LANG));
    const cont = page.getByTestId('done-continue');
    const again = page.getByTestId('again-button');
    await expect(cont).toHaveText(t('done.continue', LANG));
    await expect(again).toHaveText(t('done.again', LANG));
    await expect(cont).not.toHaveClass(/btn--secondary/);
    await expect(again).toHaveClass(/btn--secondary/);
    // Continue comes first.
    expect((await cont.boundingBox()).y).toBeLessThan((await again.boundingBox()).y);
    await shot(page, testInfo, 'done-low');

    await cont.click();
    await expect(page.getByTestId('home')).toBeVisible();
    await expect(current(page)).toHaveAttribute('data-lesson-id', L2.id);
    await expect(current(page)).toBeInViewport();

    // The next lesson right first time: no encouraging line.
    await current(page).click();
    await playToEnd(page, exercisesById(startPack));
    await expect(page.getByTestId('done-score')).toHaveText(t('done.scoreValue', LANG, { n: 100 }));
    await expect(page.getByTestId('done-encourage')).toHaveCount(0);
    await shot(page, testInfo, 'done-ok');
    await page.getByTestId('done-continue').click();
    await expect(current(page)).toBeInViewport();
  });

  test('Settings: the auto-play switch, on by default', async ({ page }, testInfo) => {
    await login(page);
    await page.goto('/settings');
    await expect(page.getByTestId('autoplay-setting')).toBeChecked();
    await expect(page.getByTestId('settings-autoplay')).toContainText(t('settings.autoplay', LANG));
    await page.getByTestId('settings-autoplay').scrollIntoViewIfNeeded();
    await shot(page, testInfo, 'settings-autoplay');
  });

  for (const [w, h] of [[320, 640], [375, 812], [412, 915], [1280, 800]]) {
    test(`the avatar picker fits the card at ${w} px, the colours never overlap the avatars`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: w, height: h });
      await login(page);
      await page.goto('/settings');
      const card = page.getByTestId('avatar-grid').locator('xpath=ancestor::section[1]');
      const c = await card.boundingBox();
      const grid = await page.getByTestId('avatar-grid').boundingBox();
      const colours = await page.getByTestId('avatar-colours').boundingBox();
      expect(Math.abs(grid.width - colours.width)).toBeLessThan(1); // the same width
      for (const loc of [...await page.locator('.avatar-choice').all(), ...await page.locator('.colour-swatch').all()]) {
        const b = await loc.boundingBox();
        expect(b.x).toBeGreaterThanOrEqual(c.x - 0.5);
        expect(b.x + b.width).toBeLessThanOrEqual(c.x + c.width + 0.5);
        expect(b.width).toBeGreaterThanOrEqual(24);
      }
      const lastAvatar = await page.locator('.avatar-choice').last().boundingBox();
      expect(colours.y).toBeGreaterThanOrEqual(lastAvatar.y + lastAvatar.height); // no intersection
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (testInfo.project.name === 'mobile' && (w === 320 || w === 412)) {
        await card.scrollIntoViewIfNeeded();
        fs.mkdirSync(outDir, { recursive: true });
        await card.screenshot({ path: path.join(outDir, `mobile-29-avatar-${w}.png`) });
      }
    });
  }

  test('course sheet: with no other course for the learner\'s language, it says so', async ({ page }, testInfo) => {
    await login(page);
    // English speakers are offered French too: take it (and stay on Dutch), so nothing else is left
    expect((await page.request.post('/api/courses', { data: { track: 'fr-en' } })).status()).toBe(201);
    expect((await page.request.put('/api/courses/active', { data: { track: 'nl' } })).status()).toBe(200);
    await page.reload();
    await page.getByTestId('course-chip').click();
    await expect(page.getByTestId('course-sheet')).toBeVisible();
    await expect(page.getByTestId('course-none-offered')).toHaveText(t('courses.noneOffered', LANG));
    await expect(page.getByTestId('course-add')).toHaveCount(0);
    await shot(page, testInfo, 'course-sheet-none');
    await page.getByTestId('course-sheet-close').click();
  });

  test('the error screen recovers: Try again reloads the data, Back to Home reloads the app', async ({ browser }, testInfo) => {
    // No service worker here: page.route must see every request.
    const context = await browser.newContext({ ...testInfo.project.use, serviceWorkers: 'block' });
    const page = await context.newPage();
    await login(page);
    // The proxy answers 503 for a while (the incident's suspected shape): the app shows the error screen.
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 503, contentType: 'text/html', body: '<h1>Service Unavailable</h1>' }));
    await page.reload();
    await expect(page.getByTestId('load-error')).toBeVisible();
    // Nobody is loaded yet: the screen speaks the device's language.
    const lang = await loginLang(page);
    await expect(page.getByTestId('error-retry')).toHaveText(t('app.retry', lang));
    await expect(page.getByTestId('error-home')).toHaveText(t('lesson.backHome', lang));
    await page.getByTestId('error-retry').click(); // still failing: still the error screen, nothing breaks
    await expect(page.getByTestId('load-error')).toBeVisible();
    await page.unroute('**/api/auth/me');
    await page.getByTestId('error-retry').click();
    await expect(page.getByTestId('home')).toBeVisible();

    // A screen's own data failing: Back to Home brings the whole app back.
    await page.route('**/api/progress/me', (route) => route.fulfill({ status: 502, body: 'Bad Gateway' }));
    await page.reload();
    await expect(page.getByTestId('load-error')).toBeVisible();
    await page.unroute('**/api/progress/me');
    await page.getByTestId('error-home').click();
    await expect(page.getByTestId('home')).toBeVisible();
    await logoutAnywhere(page);
    await context.close();
  });
});
