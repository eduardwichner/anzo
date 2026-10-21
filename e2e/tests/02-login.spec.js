import { test, expect } from '@playwright/test';
import { loginChild, readManifest, readPack, t } from './helpers.js';

test('kid1 sees the English path', async ({ page }) => {
  await loginChild(page, 'kid1', undefined, { ui: true });
  await expect(page.getByTestId('home')).toHaveAttribute('data-track', 'en');
  await expect(page.getByTestId('track-name')).toHaveText('Engels');
  await expect(page.getByTestId('unit-node').first()).toContainText('Dieren');
  const lessons = readManifest().tracks.find((tr) => tr.id === 'en').packs.filter((p) => p.status === 'available')
    .reduce((n, p) => n + readPack(p.file).units.reduce((m, u) => m + u.lessons.length, 0), 0);
  await expect(page.getByTestId('lesson-node')).toHaveCount(lessons);
});

test('kid2 sees the French path', async ({ page }) => {
  await loginChild(page, 'kid2', undefined, { ui: true });
  await expect(page.getByTestId('home')).toHaveAttribute('data-track', 'fr');
  await expect(page.getByTestId('track-name')).toHaveText('Frans');
  await expect(page.getByTestId('unit-node').first()).toContainText('Ik en mijn familie');
});

test('wrong password shows an error and creates no session', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('profile-kid1').click();
  await page.locator('#login-password').fill('not-her-password');
  await page.getByRole('button', { name: t('login.submit') }).click();
  await expect(page.getByTestId('login-error')).toHaveText(t('login.wrong'));
  await expect(page).toHaveURL(/\/login$/);
  const me = await page.request.get('/api/auth/me');
  expect(me.status()).toBe(401);
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === 'anzo.sid')).toBeUndefined();
});
