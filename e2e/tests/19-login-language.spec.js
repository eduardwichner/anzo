import path from 'node:path';
import Database from 'better-sqlite3';
import { test, expect } from '@playwright/test';
import { loginAdmin, logoutAnywhere, t } from './helpers.js';

// The login screen's NL | EN toggle always shows the language that will be used: the device's until an
// account is tapped, then that account's saved language; a change made then is saved to that account only.

/** users.ui_lang as stored by the test server (read-only look at its temp DB). */
function uiLangs() {
  const db = new Database(path.join(process.env.ANZO_E2E_DATA_DIR, 'anzo.sqlite'), { readonly: true });
  try {
    return Object.fromEntries(db.prepare('SELECT username, ui_lang FROM users ORDER BY id').all().map((r) => [r.username, r.ui_lang]));
  } finally {
    db.close();
  }
}

const pressed = (page, lang) => expect(page.getByTestId(`login-lang-${lang}`)).toHaveAttribute('aria-pressed', 'true');

async function selectChild(page, username) {
  await page.getByTestId(`profile-${username}`).click();
  await expect(page.locator('#login-password')).toBeVisible();
}

async function submit(page, password, lang) {
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: t('login.submit', lang) }).click();
}

async function settingsLang(page) {
  await page.getByTestId('settings-link').click();
  await expect(page.getByTestId('settings')).toBeVisible();
}

test.describe.serial('login-screen language', () => {
  test.beforeAll(() => {
    expect(uiLangs()).toMatchObject({ kid1: 'nl', kid2: 'nl' });
  });

  test.afterAll(async ({ browser }) => {
    // Restore the seeded languages through the app (the test DB is read-only here).
    for (const username of ['kid2', 'kid1']) {
      const page = await browser.newPage();
      await page.request.post('/api/auth/login', { data: { username, password: username, uiLang: 'nl' } });
      await page.close();
    }
    expect(uiLangs()).toMatchObject({ kid1: 'nl', kid2: 'nl', admin: 'en' });
  });

  test('(a) device NL, select Alex (NL), toggle EN, log in → app, Settings and DB in English; Sam untouched', async ({ page }) => {
    await page.goto('/login');
    await pressed(page, 'nl');
    await selectChild(page, 'kid2');
    await pressed(page, 'nl');
    await page.getByTestId('login-lang-en').click();
    await pressed(page, 'en');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(t('login.hello', 'en', { name: 'Alex' }));
    await submit(page, 'kid2', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('home.greeting', 'en', { name: 'Alex' }));
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await settingsLang(page);
    await expect(page.getByTestId('settings-lang-en')).toHaveAttribute('aria-pressed', 'true');
    expect(uiLangs()).toMatchObject({ kid2: 'en', kid1: 'nl' });
  });

  test('(b) Alex sets NL in Settings, logs out, selects Alex → NL; toggles EN at login → EN everywhere', async ({ page }) => {
    await page.goto('/login');
    await selectChild(page, 'kid2');
    await pressed(page, 'en'); // her saved language from (a)
    await submit(page, 'kid2', 'en');
    await settingsLang(page);
    await page.getByTestId('settings-lang-nl').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
    await expect.poll(() => uiLangs().kid2).toBe('nl');
    await page.getByTestId('logout-button').click();
    await expect(page).toHaveURL(/\/login$/);
    await pressed(page, 'nl');

    await selectChild(page, 'kid2');
    await pressed(page, 'nl');
    await page.getByTestId('login-lang-en').click();
    await submit(page, 'kid2', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('home.greeting', 'en', { name: 'Alex' }));
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await settingsLang(page);
    await expect(page.getByTestId('settings-lang-en')).toHaveAttribute('aria-pressed', 'true');
    expect(uiLangs().kid2).toBe('en');
  });

  test('(c) a wrong password with the toggle changed leaves ui_lang unchanged', async ({ page }) => {
    const before = uiLangs();
    await page.goto('/login');
    await selectChild(page, 'kid2');
    await pressed(page, before.kid2);
    const other = before.kid2 === 'en' ? 'nl' : 'en';
    await page.getByTestId(`login-lang-${other}`).click();
    await submit(page, 'wrong-password', other);
    await expect(page.getByTestId('login-error')).toHaveText(t('login.wrong', other));
    expect(uiLangs()).toEqual(before);
  });

  test('(d) Sam toggles EN at login → only Sam changes; Alex untouched', async ({ page }) => {
    const before = uiLangs();
    console.log(`SELECT username, ui_lang FROM users — before (d): ${JSON.stringify(before)}`);
    await page.goto('/login');
    await selectChild(page, 'kid1');
    await pressed(page, 'nl');
    await page.getByTestId('login-lang-en').click();
    await submit(page, 'kid1', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('home.greeting', 'en', { name: 'Sam' }));
    const after = uiLangs();
    console.log(`SELECT username, ui_lang FROM users — after (d):  ${JSON.stringify(after)}`);
    expect(after).toEqual({ ...before, kid1: 'en' });
  });

  test('(e) the admin (EN) logs out → the login screen shows the device default again', async ({ page }) => {
    await page.goto('/login');
    await pressed(page, 'nl'); // device default: nl-NL browser, nothing chosen on this device
    await loginAdmin(page, { ui: true });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await logoutAnywhere(page);
    await pressed(page, 'nl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(t('login.title', 'nl'));
  });

  test('"Other account": a typed child keeps the saved language unless the toggle is touched', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-other').click();
    await page.locator('#login-username').fill('kid1');
    await submit(page, 'kid1', 'nl');
    // Not touched: Sam's saved English (from (d)) wins over the device's Dutch.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('home.greeting', 'en', { name: 'Sam' }));
    await settingsLang(page);
    await page.getByTestId('logout-button').click();
    await pressed(page, 'nl');

    await page.getByTestId('login-other').click();
    await page.locator('#login-username').fill('kid1');
    await page.getByTestId('login-lang-nl').click(); // already NL: no change, still counts as untouched
    await page.getByTestId('login-lang-en').click();
    await page.getByTestId('login-lang-nl').click();
    await submit(page, 'kid1', 'nl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('home.greeting', 'nl', { name: 'Sam' }));
    expect(uiLangs().kid1).toBe('nl');
  });
});
