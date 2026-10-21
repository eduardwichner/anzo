import { test, expect } from '@playwright/test';
import { loginChild, logout, t } from './helpers.js';

test('kid2 picks another avatar and colour: Home and the login grid show it', async ({ page }) => {
  await loginChild(page, 'kid2');
  const homeAvatar = page.getByTestId('home-avatar-link').locator('svg');
  await expect(homeAvatar).toHaveAttribute('data-avatar', 'rabbit');

  await page.getByTestId('settings-link').click();
  await expect(page.getByTestId('avatar-grid').getByRole('radio')).toHaveCount(16);
  await expect(page.getByTestId('avatar-colours').getByRole('radio')).toHaveCount(8);
  await page.getByTestId('avatar-panda').click();
  await page.getByTestId('avatar-bg-mint').click();
  await expect(page.getByTestId('avatar-panda')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('avatar-bg-mint')).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('link', { name: t('app.back') }).click();
  await expect(homeAvatar).toHaveAttribute('data-avatar', 'panda');
  await expect(homeAvatar).toHaveAttribute('data-avatar-bg', 'mint');

  await logout(page);
  const card = page.getByTestId('profile-kid2').locator('svg');
  await expect(card).toHaveAttribute('data-avatar', 'panda');
  await expect(card).toHaveAttribute('data-avatar-bg', 'mint');

  // Restore the seeded avatar for the other specs and projects.
  await loginChild(page, 'kid2');
  expect((await page.request.patch('/api/auth/me', { data: { avatar: 'rabbit', avatarBg: 'peach' } })).ok()).toBe(true);
});
