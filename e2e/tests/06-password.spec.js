import { test, expect } from '@playwright/test';
import { loginChild, logout, t } from './helpers.js';

async function changePassword(page, current, next) {
  await page.getByTestId('settings-link').click();
  await page.locator('#pw-current').fill(current);
  await page.locator('#pw-next').fill(next);
  await page.locator('#pw-repeat').fill(next);
  await page.getByRole('button', { name: t('settings.save') }).click();
  await expect(page.getByTestId('settings-message')).toHaveText(t('settings.saved'));
  await page.getByRole('link', { name: t('app.back') }).click();
}

// Whatever happens in the test, kid1 ends on her seeded password: every later spec logs in with it.
test.afterEach(async ({ request }) => {
  if ((await request.post('/api/auth/login', { data: { username: 'kid1', password: 'giraf' } })).ok()) {
    await request.post('/api/auth/password', { data: { current: 'giraf', next: 'kid1' } });
  }
  await request.post('/api/auth/logout');
});

test('kid1 changes her password, logs out and logs in with the new one', async ({ page }) => {
  await loginChild(page, 'kid1', undefined, { ui: true });
  await changePassword(page, 'kid1', 'giraf');
  await logout(page);

  await page.getByTestId('profile-kid1').click();
  await page.locator('#login-password').fill('kid1');
  await page.getByRole('button', { name: t('login.submit') }).click();
  await expect(page.getByTestId('login-error')).toBeVisible();

  await page.locator('#login-password').fill('giraf');
  await page.getByRole('button', { name: t('login.submit') }).click();
  await expect(page.getByTestId('home')).toBeVisible();

  // Restore so the other project's run starts from the seeded password.
  await changePassword(page, 'giraf', 'kid1');
});
