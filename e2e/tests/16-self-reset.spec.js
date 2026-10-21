import { test, expect } from '@playwright/test';
import { loginAdmin, loginChild, readPack, t } from './helpers.js';

const L1_TOTAL = readPack('en/pre-a1.json').units[0].lessons[0].exercises.length;

async function setSelfReset(browser, baseURL, allowed) {
  const ctx = await browser.newContext({ baseURL });
  const page = await ctx.newPage();
  await loginAdmin(page);
  await page.getByTestId('admin-user-kid1').click();
  const box = page.getByTestId('user-canSelfReset');
  if (allowed) await box.check();
  else await box.uncheck();
  await page.getByTestId('user-save').click();
  await expect(page.getByTestId('user-message')).toBeVisible();
  await ctx.close();
}

test('self-reset: kid1 has no reset option until the admin grants it; then resets one level with password + WISSEN', async ({ page, browser, baseURL }) => {
  await loginChild(page, 'kid1');
  // Progress to lose: lesson 1 done today.
  expect((await page.request.post('/api/progress/lesson/en-pre-a1-u01-l01/complete', { data: { firstTryCorrect: L1_TOTAL, total: L1_TOTAL } })).ok()).toBe(true);
  await page.reload();
  const lesson1 = page.locator('[data-lesson-id="en-pre-a1-u01-l01"]');
  await expect(lesson1).toHaveAttribute('data-state', 'done');
  const xpBefore = Number(await page.getByTestId('xp').innerText());
  const streakBefore = await page.getByTestId('streak').innerText();
  expect(xpBefore).toBeGreaterThan(0);

  await page.getByTestId('settings-link').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await expect(page.getByTestId('settings-reset')).toHaveCount(0);
  expect((await page.request.post('/api/progress/reset', { data: { scope: 'track', password: 'kid1', confirm: 'WISSEN' } })).status()).toBe(403);

  await setSelfReset(browser, baseURL, true);
  try {
    await page.reload();
    await page.getByTestId('reset-open').click();
    await page.getByTestId('reset-scope-en-pre-a1').check();
    await page.getByTestId('reset-next').click();
    await expect(page.getByTestId('reset-confirm')).toBeVisible();
    await expect(page.getByTestId('reset-submit')).toBeDisabled();
    await page.getByTestId('reset-password').fill('kid1');
    await page.getByTestId('reset-word').fill('WISSE');
    await expect(page.getByTestId('reset-submit')).toBeDisabled();
    await page.getByTestId('reset-word').fill('WISSEN');
    await page.getByTestId('reset-submit').click();
    const scope = t('settings.resetScopePack', 'nl', { cefr: 'Pre-A1', title: 'Starters' });
    await expect(page.getByTestId('reset-message')).toHaveText(t('settings.resetDone', 'nl', { scope }));

    await page.getByRole('link', { name: t('app.back') }).click();
    await expect(lesson1).toHaveAttribute('data-state', 'current');
    await expect(page.locator('[data-lesson-id="en-pre-a1-u01-l02"]')).toHaveAttribute('data-state', 'locked');
    expect(Number(await page.getByTestId('xp').innerText())).toBeLessThan(xpBefore);
    await expect(page.getByTestId('streak')).toHaveText(streakBefore);
  } finally {
    await setSelfReset(browser, baseURL, false);
  }
});
