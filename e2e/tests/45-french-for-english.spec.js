import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { ADMIN_LANG, adminUsers, deleteUserIfExists, exercisesById, loginAdmin, loginLang, logoutAnywhere, playToEnd, readManifest, readPack, t } from './helpers.js';

// French for English speakers released (A1.1, A1, A2): an English-speaking learner (an account made and deleted
// here) adds French from the course sheet, plays the first A1.1 lesson, and — from the start level A2 the admin sets — an A2
// lesson, with English meanings and French text. Admin → Corrections finds an fe item, names its course, edits its English
// meaning (the stub job runner: applied at once, no file changed) and says that the French text is shared with the course for
// Dutch speakers. The Listen check has no compare round any more.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(ROOT, 'e2e', 'screenshots');
const shot = async (page, testInfo, name) => {
  if (testInfo.project.name !== 'mobile') return;
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `mobile-45-${name}.png`) });
};
const feFiles = readManifest().tracks.find((tr) => tr.id === 'fr-en').packs.filter((p) => p.status === 'available').map((p) => p.file);
const byId = new Map(feFiles.flatMap((f) => [...exercisesById(readPack(f))]));
const current = (page) => page.locator('[data-testid="lesson-node"][data-state="current"]');
const USER = 'e2e-fe18';
const PW = 'fen-e2e-18';

async function loginUser(page) {
  await page.goto('/login');
  await page.getByTestId('login-other').click();
  await page.locator('#login-username').fill(USER);
  await page.locator('#login-password').fill(PW);
  await page.getByTestId('login').getByRole('button', { name: t('login.submit', await loginLang(page)) }).click();
  await expect(page.getByTestId('home')).toBeVisible();
}

test.describe.serial('French for English speakers, A1.1 to A2', () => {
  test('an English speaker adds French, plays A1.1 and (from start level A2) an A2 lesson', async ({ page }, testInfo) => {
    expect(feFiles).toEqual(['fr-en/a1-1.json', 'fr-en/a1.json', 'fr-en/a2.json', 'fr-en/b1.json', 'fr-en/b2.json']); // every level
    await loginAdmin(page);
    await deleteUserIfExists(page, USER);
    expect((await page.request.post('/api/admin/users', {
      data: { username: USER, displayName: 'Fern', role: 'child', audience: 'adult', nativeLang: 'en', uiLang: 'en', avatar: 'fox', avatarBg: 'sky',
        password: PW, showOnLogin: false, course: { track: 'nl' } },
    })).status()).toBe(201);
    await logoutAnywhere(page);

    await loginUser(page);
    await page.getByTestId('course-chip').click();
    await expect(page.getByTestId('course-sheet')).toBeVisible();
    await expect(page.getByTestId('course-soon')).toHaveCount(0); // nothing is "coming soon" for an English speaker now
    await page.getByTestId('course-add').click();
    const add = page.getByTestId('course-add-fr-en');
    await expect(add).toContainText(t('languages.fr-en', 'en'));
    await shot(page, testInfo, 'add-french');
    await add.click();
    await expect(page.getByTestId('home')).toHaveAttribute('data-track', 'fr-en');
    await expect(page.getByTestId('home-mascot')).toHaveAttribute('data-kind', 'fox');
    await expect(current(page)).toHaveAttribute('data-lesson-id', 'fe-a1-1-u01-l01');
    await current(page).click();
    // the first exercise: a French word, English options
    const question = page.getByTestId('mc-question');
    await expect(question.locator('[lang="fr"]').first()).toContainText('bonjour');
    await expect(page.getByTestId('mc-option').filter({ hasText: /^hello$/ })).toHaveCount(1);
    await shot(page, testInfo, 'a1-1-lesson');
    const seen = await playToEnd(page, byId);
    expect(seen.length).toBeGreaterThan(8);
    await page.getByTestId('done-continue').click();
    await expect(page.locator('[data-lesson-id="fe-a1-1-u01-l01"]')).toHaveAttribute('data-state', 'done');
    await logoutAnywhere(page);

    // the admin sets the start level A2 for this course; the learner's current lesson is the first A2 lesson
    await loginAdmin(page);
    const user = (await adminUsers(page)).find((u) => u.username === USER);
    await page.goto(`/admin/users/${user.id}`);
    await page.getByTestId('course-start-fr-en').selectOption('fe-a2');
    await expect.poll(async () => (await (await page.request.get(`/api/admin/users/${user.id}/courses`)).json())
      .courses.find((c) => c.track === 'fr-en').startPack).toBe('fe-a2');
    await page.goto('/admin');
    await logoutAnywhere(page);
    await loginUser(page);
    await expect(current(page)).toHaveAttribute('data-lesson-id', 'fe-a2-u01-l01');
    await current(page).click();
    await expect(page.getByTestId('exercise')).toBeVisible();
    await shot(page, testInfo, 'a2-lesson');
    await playToEnd(page, byId);
    await page.getByTestId('done-continue').click();
    await expect(page.locator('[data-lesson-id="fe-a2-u01-l01"]')).toHaveAttribute('data-state', 'done');
    const progress = (await (await page.request.get('/api/profile')).json());
    expect(progress.stats.xp).toBeGreaterThan(0);
    await logoutAnywhere(page);
    await loginAdmin(page);
    await deleteUserIfExists(page, USER);
  });

  test('Corrections: an fe item names its course; its English meaning is edited; the French text is shared', async ({ page }, testInfo) => {
    await loginAdmin(page);
    await page.goto('/admin/corrections');
    await page.getByTestId('corrections-search').fill('hello');
    const row = page.getByTestId('corrections-item-fe.bonjour');
    await expect(row).toContainText(t('ops.corrections.courseFor', ADMIN_LANG, { language: t('languages.fr', ADMIN_LANG), native: t('nativeLanguages.en', ADMIN_LANG) }));
    await row.click();
    await expect(page.getByTestId('correction-edit')).toHaveAttribute('data-item', 'fe.bonjour');
    await expect(page.getByTestId('correction-course')).toContainText('French for English speakers');
    await expect(page.getByText(t('ops.corrections.field.nativeIn', ADMIN_LANG, { native: t('nativeLanguages.en', ADMIN_LANG) }))).toBeVisible();
    await expect(page.getByTestId('correction-native')).toHaveValue('hello');
    await expect(page.getByTestId('correction-native')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('correction-target')).toHaveAttribute('lang', 'fr');
    const shared = page.getByTestId('correction-shared');
    await expect(shared).toContainText('French for Dutch speakers');
    await page.getByTestId('correction-native').fill('hello, good morning');
    await expect(page.getByTestId('warning-used')).toBeVisible();
    await expect(page.getByTestId('warning-audio')).toHaveCount(0);
    await shot(page, testInfo, 'corrections-fe');
    await page.getByTestId('correction-reason').fill('e2e');
    await page.getByTestId('correction-submit').click();
    await expect(page).toHaveURL(/tab=history/);
    const list = (await (await page.request.get('/api/admin/corrections')).json()).corrections;
    expect(list[0]).toMatchObject({ track: 'fr-en', targetId: 'fe.bonjour', status: 'applied', summary: 'fe.bonjour: English "hello" → "hello, good morning"' });
  });

  test('the Listen check without the compare round', async ({ page }) => {
    await loginAdmin(page);
    await page.getByTestId('admin-listen-link').click();
    await expect(page.getByTestId('listen-check')).toBeVisible();
    await expect(page.getByTestId('audio-quality')).toBeVisible();
    await expect(page.getByTestId('compare-round')).toHaveCount(0);
    expect((await page.request.get('/api/admin/listen/compare')).status()).toBe(404);
    expect((await page.request.get('/audio/compare/0123456789abcdef.mp3')).status()).toBe(404);
  });
});
