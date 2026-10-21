import { test, expect } from '@playwright/test';
import {
  ADMIN_LANG, adminUsers, answerCurrent, deleteUserIfExists, exercisesById, loginAdmin, loginChild, logoutAnywhere, readPack, t,
} from './helpers.js';

// The admin manages accounts. test_kid learns French with an English interface.
const KID = { username: 'test_kid', name: 'Test Kid', password: 'kid1' };

test('admin creates test_kid (French, English UI, owl); she appears on the grid, sees English chrome and French content', async ({ page }) => {
  await loginAdmin(page);
  await deleteUserIfExists(page, KID.username); // a previous failed run must not block this one

  await page.getByTestId('admin-add-user').click();
  await expect(page.getByTestId('user-form')).toBeVisible();
  // Child defaults: shown on the login screen, no forced password change, no self-reset.
  await expect(page.getByTestId('user-role-child')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('user-showOnLogin')).toBeChecked();
  await expect(page.getByTestId('user-mustChangePassword')).not.toBeChecked();
  await expect(page.getByTestId('user-canSelfReset')).not.toBeChecked();

  // Client-side validation mirrors the server.
  await page.getByTestId('user-username').fill('X!');
  await page.getByTestId('user-save').click();
  await expect(page.locator('#err-username')).toHaveText(t('admin.errors.username.invalid', ADMIN_LANG));

  await page.getByTestId('user-username').fill(KID.username);
  await page.getByTestId('user-displayName').fill(KID.name);
  await page.getByTestId('user-course').selectOption('fr');
  await page.getByTestId('user-uiLang-en').click();
  await page.getByTestId('avatar-owl').click();
  await page.getByTestId('user-password').fill(KID.password);
  await page.getByTestId('user-save').click();
  await expect(page.getByTestId('user-message')).toHaveText(t('admin.userCreated', ADMIN_LANG, { name: KID.name }));
  await expect(page).toHaveURL(/\/admin\/users\/\d+$/);

  // A duplicate username is refused by the server.
  const dup = await page.request.post('/api/admin/users', {
    data: { username: 'TEST_KID', displayName: 'x', role: 'child', course: { track: 'en' }, uiLang: 'nl', avatar: 'fox', avatarBg: 'sky', password: 'abcd' },
  });
  expect(await dup.json()).toMatchObject({ error: 'invalid_user', fields: { username: 'taken' } });

  await page.getByRole('link', { name: t('app.back', ADMIN_LANG) }).click();
  await logoutAnywhere(page);

  await expect(page.getByTestId(`profile-${KID.username}`)).toBeVisible();
  await expect(page.getByTestId(`profile-${KID.username}`).locator('svg')).toHaveAttribute('data-avatar', 'owl');
  await loginChild(page, KID.username, KID.password);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('home')).toHaveAttribute('data-track', 'fr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('home.greeting', 'en', { name: KID.name }));
  await expect(page.getByTestId('track-name')).toHaveText(t('languages.fr', 'en'));

  // One exercise: the instruction is English, the question French, the meanings Dutch.
  const pack = readPack('fr/a1-1.json');
  const first = pack.units[0].lessons[0].exercises[0];
  await page.locator('[data-lesson-id="fr-a1-1-u01-l01"]').click();
  await expect(page.getByTestId('exercise-instruction')).toHaveText(t('exercise.multiple_choice.fromTarget', 'en'));
  await expect(page.getByTestId('mc-question')).toContainText(first.question);
  await expect(page.getByTestId('mc-option').first()).toHaveAttribute('lang', 'nl');
  await answerCurrent(page, exercisesById(pack));
  await expect(page.getByTestId('result-strip')).toContainText(t('lesson.correct', 'en'));
  await expect(page.getByTestId('continue-button')).toHaveText(t('lesson.continue', 'en'));
});

test('admin deletes test_kid after typing the username; she is gone from the grid and the API', async ({ page }) => {
  await loginAdmin(page);
  const kid = (await adminUsers(page)).find((u) => u.username === KID.username);
  expect(kid, 'created by the previous test').toBeTruthy();

  await page.getByTestId(`admin-user-${KID.username}`).click();
  await page.getByTestId('admin-delete').click();
  const dialog = page.getByTestId('admin-delete-dialog');
  await expect(dialog).toContainText(t('admin.deleteTitle', ADMIN_LANG, { name: KID.name }));
  await expect(page.getByTestId('admin-delete-confirm')).toBeDisabled();
  await page.getByTestId('admin-delete-input').fill('test_ki');
  await expect(page.getByTestId('admin-delete-confirm')).toBeDisabled();
  await page.getByTestId('admin-delete-input').fill(KID.username);
  await page.getByTestId('admin-delete-confirm').click();

  await expect(page.getByTestId('admin')).toBeVisible();
  await expect(page.getByTestId('admin-message')).toHaveText(t('admin.deleted', ADMIN_LANG, { name: KID.name }));
  await expect(page.locator(`[data-username="${KID.username}"]`)).toHaveCount(0);
  expect((await page.request.get(`/api/admin/users/${kid.id}`)).status()).toBe(404);
  expect((await page.request.get(`/api/admin/users/${kid.id}/progress`)).status()).toBe(404);

  // The server refuses to delete the last admin and self-deletion.
  const self = (await adminUsers(page)).find((u) => u.username === 'admin');
  expect(await (await page.request.delete(`/api/admin/users/${self.id}`, { data: { confirmUsername: 'admin' } })).json()).toEqual({ error: 'last_admin' });

  await logoutAnywhere(page);
  await expect(page.getByTestId('profile-kid1')).toBeVisible();
  await expect(page.getByTestId(`profile-${KID.username}`)).toHaveCount(0);
});
