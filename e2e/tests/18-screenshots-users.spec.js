import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import {
  adminUsers, deleteUserIfExists, exercisesById, loginAdmin, loginChild, logoutAnywhere, playUntil, readPack,
} from './helpers.js';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');

// Phone screenshots of the user and settings screens; each is checked for horizontal overflow.
test('mobile screenshots: settings, admin user list, add-user form, delete confirmation, English lesson', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'screenshots are taken in the mobile project only');
  fs.mkdirSync(outDir, { recursive: true });
  const shot = async (name) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${name} overflows`).toBeLessThanOrEqual(412);
    await page.screenshot({ path: path.join(outDir, `mobile-${name}.png`), fullPage: true });
  };

  // Admin: user list, add-user form (English UI), a user with the delete confirmation open.
  await loginAdmin(page);
  await deleteUserIfExists(page, 'shot_kid');
  await shot('admin-users');
  await page.getByTestId('admin-add-user').click();
  await expect(page.getByTestId('user-form')).toBeVisible();
  await shot('admin-add-user');
  await page.getByTestId('user-username').fill('shot_kid');
  await page.getByTestId('user-displayName').fill('Shot');
  await page.getByTestId('user-password').fill('kind');
  await page.getByTestId('user-save').click();
  await expect(page.getByTestId('user-message')).toBeVisible();
  await page.getByTestId('admin-delete').click();
  await page.getByTestId('admin-delete-input').fill('shot_kid');
  await page.getByTestId('admin-delete-dialog').scrollIntoViewIfNeeded();
  await shot('admin-delete-confirm');
  await page.getByTestId('admin-delete-confirm').click();
  await expect(page.getByTestId('admin')).toBeVisible();

  // Sam's Settings with the reset permission (granted for the screenshot, then revoked).
  const kid1 = (await adminUsers(page)).find((u) => u.username === 'kid1');
  await page.request.patch(`/api/admin/users/${kid1.id}`, { data: { canSelfReset: true } });
  try {
    await logoutAnywhere(page);
    await loginChild(page, 'kid1');
    await page.getByTestId('settings-link').click();
    await expect(page.getByTestId('settings-reset')).toBeVisible();
    await shot('settings');
    await page.getByTestId('reset-open').click();
    await page.getByTestId('reset-next').click();
    await page.getByTestId('reset-confirm').scrollIntoViewIfNeeded();
    await shot('settings-reset-confirm');

    // A lesson in English UI, then back to Dutch.
    await page.getByTestId('settings-lang-en').click();
    await page.goto('/lesson/en-pre-a1-u01-l01');
    await expect(page.getByTestId('exercise')).toBeVisible();
    await shot('lesson-english');
    // The build-sentence exercise: English instruction, the Dutch sentence as its own element.
    const byId = exercisesById(readPack('en/pre-a1.json'));
    const build = [...byId.values()].find((e) => e.type === 'build_sentence' && e.id.startsWith('en-pre-a1-u01-l01'));
    await playUntil(page, byId, build.id);
    await expect(page.getByTestId('build-native')).toBeVisible();
    await shot('lesson-english-build');
  } finally {
    await page.request.patch('/api/auth/me', { data: { uiLang: 'nl' } });
    await loginAdmin(page);
    await page.request.patch(`/api/admin/users/${kid1.id}`, { data: { canSelfReset: false } });
  }
});
