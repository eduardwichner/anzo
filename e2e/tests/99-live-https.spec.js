// Live smoke test (npm run test:live), never part of npm run test:e2e. It logs in as ANZO_LIVE_USER (an account shown on the
// login screen; default kid1) with ANZO_LIVE_PASSWORD, and answers nothing.
import { test, expect } from '@playwright/test';
import { hookPlaying, loginLang, played, t } from './helpers.js';

const USER = process.env.ANZO_LIVE_USER || 'kid1';
const PASSWORD = process.env.ANZO_LIVE_PASSWORD || 'kid1';

test('live HTTPS: health, secure login cookie, service worker, one audio clip plays', async ({ page, request, baseURL }) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  expect((await health.json()).ok).toBe(true);

  await page.goto('/login');
  await page.getByTestId(`profile-${USER}`).click();
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: t('login.submit', await loginLang(page)) }).click();
  await expect(page.getByTestId('home')).toBeVisible();

  const cookie = (await page.context().cookies(baseURL)).find((c) => c.name === 'anzo.sid');
  expect(cookie, 'session cookie').toBeTruthy();
  expect(cookie.secure).toBe(true);
  expect(cookie.httpOnly).toBe(true);

  const sw = await page.evaluate(async () => {
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 15_000));
    const reg = await Promise.race([navigator.serviceWorker.ready, timeout]);
    return reg ? { active: Boolean(reg.active), scope: reg.scope } : null;
  });
  expect(sw?.active).toBe(true);

  // Open the current lesson with a tap (unlocks audio); the first English question auto-plays.
  // Nothing is answered, so no attempt or progress is written.
  await hookPlaying(page);
  const node = page.locator('[data-testid="lesson-node"][data-state="current"], [data-testid="lesson-node"][data-state="done"]').first();
  await node.click();
  await expect(page.getByTestId('exercise')).toBeVisible();
  await page.getByTestId('exercise').getByTestId('speaker').first().click();
  await expect.poll(() => played(page), { timeout: 15_000 }).not.toEqual([]);

  await page.getByTestId('quit-lesson').click();
  await page.request.post('/api/auth/logout');
});
