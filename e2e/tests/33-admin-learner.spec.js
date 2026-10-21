import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { ADMIN_LANG, ADMIN_PW, adminUsers, exercisesById, loginAdmin, playToEnd, readPack, syncClock, t } from './helpers.js';

// The admin takes a course too. With native language English it is offered Dutch; it adds it on
// his own Home (course chip, path), plays a lesson, sees his profile and practice, his progress shows in Admin → Users
// like any learner's, and he resets his own Dutch progress. The spec puts everything back (progress reset, course
// hidden, native language as before), so both projects start from the same state.

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const shot = async (page, testInfo, name) => {
  if (testInfo.project.name !== 'mobile') return;
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `mobile-33-${name}.png`) });
};
const byId = exercisesById(readPack('nl/pre-a1.json'));
const LESSON = 'nl-pre-a1-u01-l01';

test('the admin enrols in Dutch, plays a lesson, sees his progress, and resets it', async ({ page }, testInfo) => {
  await syncClock(page);
  await loginAdmin(page);
  const me = (await adminUsers(page)).find((u) => u.username === 'admin');
  const before = { nativeLang: me.nativeLang };
  try {
    // his own account: native language English (the meanings he reads)
    await page.goto(`/admin/users/${me.id}`);
    await page.getByTestId('user-nativeLang').selectOption('en');
    await page.getByTestId('user-save').click();
    await expect(page.getByTestId('user-message')).toBeVisible();

    // Admin → "Learn a language yourself" → his Home without a course → add Dutch
    await page.goto('/admin');
    await expect(page.getByTestId('admin-my-course')).toHaveText(new RegExp(t('admin.learn', ADMIN_LANG)));
    await page.getByTestId('admin-my-course').click();
    await expect(page.getByTestId('no-course')).toBeVisible();
    await page.getByTestId('no-course-add').click();
    // the sheet opens a moment later: wait for it (isVisible does not wait; without tracing this raced)
    await expect(page.getByTestId('course-add').or(page.getByTestId('course-add-nl'))).toBeVisible();
    if (await page.getByTestId('course-add').isVisible()) await page.getByTestId('course-add').click();
    await page.getByTestId('course-add-nl').click();
    await expect(page.getByTestId('course-chip')).toHaveAttribute('data-track', 'nl');
    await expect(page.getByTestId('home')).toHaveAttribute('data-track', 'nl');
    await expect(page.getByTestId('home-admin-link')).toBeVisible();
    await expect(page.locator('[data-testid="lesson-node"][data-state="current"]')).toBeVisible();
    // the screenshot shows the top of his Home: the course chip (Home scrolls to the current lesson on load)
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByTestId('course-chip')).toBeInViewport();
    await shot(page, testInfo, 'admin-home-dutch');
    // his level sheet is his own course's (not the admin's every-track Levels page)
    await page.getByTestId('level-bar').click();
    await expect(page).toHaveURL(/\/my-levels$/);
    await expect(page.getByTestId('level-sheet')).toBeVisible();
    await page.goBack();

    // a lesson, played like any learner (no 🚩: reports would go to himself)
    await page.goto(`/lesson/${LESSON}`);
    await expect(page.getByTestId('exercise')).toBeVisible();
    await playToEnd(page, byId);
    await expect(page.getByTestId('lesson-done')).toBeVisible();
    await expect(page.getByTestId('report-flag')).toHaveCount(0);
    await page.getByTestId('done-continue').click();
    await expect(page.locator(`[data-testid="lesson-node"][data-lesson-id="${LESSON}"]`)).toHaveAttribute('data-state', 'done');
    expect((await (await page.request.get('/api/practice/summary')).json()).unlocked).toBe(true);
    await page.goto('/profile');
    await expect(page.getByTestId('profile')).toBeVisible();
    expect(Number(await page.getByTestId('profile-xp').locator('strong').textContent())).toBeGreaterThan(0);

    // Admin: "My course: Dutch"; Admin → Users → admin shows his course and his progress like anyone's
    await page.goto('/admin');
    await expect(page.getByTestId('admin-my-course')).toHaveAttribute('data-track', 'nl');
    await page.goto(`/admin/users/${me.id}`);
    await expect(page.locator('[data-testid="admin-course"][data-track="nl"]')).toHaveAttribute('data-active', 'true');
    await page.getByTestId('admin-progress-toggle').click();
    await expect(page.getByTestId('admin-progress')).toHaveAttribute('data-track', 'nl');
    const users = await adminUsers(page);
    expect(users.find((u) => u.username === 'admin').stats.xp).toBeGreaterThan(0);

    // his own reset (Settings → Reset progress; admins may always)
    await page.goto('/settings');
    await expect(page.getByTestId('settings-reset')).toBeVisible();
    const reset = await page.request.post('/api/progress/reset', { data: { scope: 'track', track: 'nl', password: ADMIN_PW, confirm: t('settings.resetWord', ADMIN_LANG) } });
    expect(reset.status()).toBe(200);
    expect((await reset.json()).xpAfter).toBe(0);
  } finally {
    // back as it was: Dutch hidden (progress already reset), native language as before
    await page.request.put(`/api/admin/users/${me.id}/courses/nl`, { data: { hidden: true } });
    expect((await page.request.patch(`/api/admin/users/${me.id}`, { data: { nativeLang: before.nativeLang } })).status()).toBe(200);
  }
  const after = (await adminUsers(page)).find((u) => u.username === 'admin');
  expect(after.nativeLang).toBe(before.nativeLang);
  expect(after.courses.filter((c) => !c.hidden)).toEqual([]);
});
