import { test, expect } from '@playwright/test';
import { readPack, ADMIN_LANG, ADMIN_PW, loginAdmin, loginChild, t } from './helpers.js';

test('an admin with a seeded or reset password must change it before using any admin page', async ({ page, browser, baseURL }) => {
  // Put the admin in the "must change" state: a fresh server still has the seeded password;
  // in the second project the admin resets its own password through the API (which sets the flag).
  const ctx = await browser.newContext({ baseURL });
  let current = 'admin';
  if (!(await ctx.request.post('/api/auth/login', { data: { username: 'admin', password: 'admin' } })).ok()) {
    expect((await ctx.request.post('/api/auth/login', { data: { username: 'admin', password: ADMIN_PW } })).ok()).toBe(true);
    const me = await (await ctx.request.get('/api/auth/me')).json();
    current = 'tijdelijk-e2e';
    expect((await ctx.request.post(`/api/admin/users/${me.user.id}/password`, { data: { next: current } })).status()).toBe(204);
  }
  await ctx.close();

  await page.goto('/login');
  await page.getByTestId('login-other').click();
  await page.locator('#login-username').fill('admin');
  await page.locator('#login-password').fill(current);
  await page.getByRole('button', { name: t('login.submit') }).click();

  const force = page.getByTestId('force-password');
  await expect(force).toBeVisible();
  // The admin account works in English, so the forced form is English too.
  await expect(force.getByRole('heading')).toHaveText(t('forcePassword.title', ADMIN_LANG));
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('admin')).toHaveCount(0);
  expect(await (await page.request.get('/api/admin/users')).json()).toEqual({ error: 'must_change_password' });

  // Every admin page shows the same blocking form.
  for (const path of ['/levels', '/settings', '/admin/voices']) {
    await page.goto(path);
    await expect(page.getByTestId('force-password')).toBeVisible();
  }

  await page.goto('/admin');
  await page.locator('#force-current').fill(current);
  await page.locator('#force-next').fill('kort');
  await page.locator('#force-repeat').fill('kort');
  await page.getByRole('button', { name: t('forcePassword.submit', ADMIN_LANG) }).click();
  await expect(page.getByTestId('force-password-error')).toHaveText(t('settings.tooShort', ADMIN_LANG, { min: 8 }));

  await page.locator('#force-next').fill(ADMIN_PW);
  await page.locator('#force-repeat').fill(ADMIN_PW);
  await page.getByRole('button', { name: t('forcePassword.submit', ADMIN_LANG) }).click();
  await expect(page.getByTestId('admin')).toBeVisible();
  expect((await page.request.get('/api/admin/users')).status()).toBe(200);
});

test('admin sets kid2\'s password and sees her progress', async ({ page, browser, baseURL }) => {
  await loginAdmin(page, { ui: true });
  await page.getByTestId('admin-user-kid2').click();
  await expect(page.getByTestId('admin-user')).toBeVisible();
  await page.getByTestId('user-password').fill('vosje');
  await page.getByTestId('user-save').click();
  await expect(page.getByTestId('user-message')).toHaveText(t('admin.userSaved', ADMIN_LANG));

  // Alex can log in with the new password (children are never blocked) and finishes a lesson via the API.
  const annaCtx = await browser.newContext({ baseURL });
  const kid2 = annaCtx.request;
  expect((await kid2.post('/api/auth/login', { data: { username: 'kid2', password: 'kid2' } })).status()).toBe(401);
  expect((await kid2.post('/api/auth/login', { data: { username: 'kid2', password: 'vosje' } })).status()).toBe(200);
  expect((await kid2.get('/api/content/tracks')).status()).toBe(200);
  const total = readPack('fr/a1-1.json').units[0].lessons[0].exercises.filter((e) => e.type !== 'speak').length;
  expect((await kid2.post('/api/progress/lesson/fr-a1-1-u01-l01/complete', { data: { firstTryCorrect: total - 1, total } })).status()).toBe(200);
  await annaCtx.close();

  await page.goto('/admin');
  await expect(page.locator('[data-testid="admin-users"] li[data-username="kid2"]')).not.toHaveAttribute('data-xp', '0');
  await page.getByTestId('admin-user-kid2').click();
  await page.getByTestId('admin-progress-toggle').click();
  const row = page.locator('[data-testid="admin-progress"] tr[data-lesson-id="fr-a1-1-u01-l01"]');
  await expect(row).toHaveAttribute('data-done', 'true');
  await expect(row).toContainText(t('admin.statusDone', ADMIN_LANG));
  await expect(row).toContainText(String(Math.round((100 * (total - 1)) / total)));

  // Restore the seeded password (and the "no forced change" flag of a child).
  await page.getByTestId('user-password').fill('kid2');
  await page.getByTestId('user-mustChangePassword').uncheck();
  await page.getByTestId('user-save').click();
  await expect(page.getByTestId('user-message')).toHaveText(t('admin.userSaved', ADMIN_LANG));
});

test('kid1 cannot use admin routes', async ({ page }) => {
  await loginChild(page, 'kid1', undefined, { ui: true });
  const res = await page.request.get('/api/admin/users');
  expect(res.status()).toBe(403);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('home')).toBeVisible();
});
