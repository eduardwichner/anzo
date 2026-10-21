import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import {
  ADMIN_LANG, adminUsers, answerCurrent, deleteUserIfExists, exercisesById, loginAdmin, loginChild, loginLang, logoutAnywhere, playToEnd, readManifest,
  readPack, t,
} from './helpers.js';

// Courses decoupled from users. The flag chip on Home switches and adds courses; each course keeps its own path;
// XP is the learner's total; the admin enrols, hides and sets a start level per course; adults get adult wording.
// Self-restoring: kid1 ends with English active and French hidden (its progress kept), kid2 with English hidden.

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const shot = (page, testInfo, name) => {
  if (testInfo.project.name !== 'mobile') return null;
  fs.mkdirSync(outDir, { recursive: true });
  return page.screenshot({ path: path.join(outDir, `mobile-s8-${name}.png`) });
};
const filesOf = (track) => readManifest().tracks.find((tr) => tr.id === track).packs.filter((p) => p.status === 'available').map((p) => p.file);
const byId = new Map(['en', 'fr'].flatMap((tr) => filesOf(tr)).flatMap((f) => [...exercisesById(readPack(f))]));
const current = (page) => page.locator('[data-testid="lesson-node"][data-state="current"]');

async function openSheet(page) {
  await page.getByTestId('course-chip').click();
  await expect(page.getByTestId('course-sheet')).toBeVisible();
}
const profile = async (page) => (await page.request.get('/api/profile')).json();

test('kid1 adds French with the flag chip, plays a French lesson, switches back: both paths keep their state; XP adds up', async ({ page }, testInfo) => {
  await loginChild(page, 'kid1');
  await expect(page.getByTestId('course-chip')).toHaveAttribute('data-track', 'en');
  await expect(page.getByTestId('home')).toHaveAttribute('data-track', 'en');
  const enCurrent = await current(page).getAttribute('data-lesson-id');
  const xpBefore = (await profile(page)).stats.xp;

  // The sheet: English (active) and "+ Add a course" with French (new, or "bring back" after an earlier run).
  await openSheet(page);
  await expect(page.getByTestId('course-item')).toHaveCount(1);
  await page.getByTestId('course-add').click();
  await expect(page.getByTestId('course-add-fr')).toBeVisible();
  await shot(page, testInfo, 'course-sheet-add');
  await page.getByTestId('course-add-fr').click();

  // French is the active course now: its own path, the fox, the French accent.
  await expect(page.getByTestId('home')).toHaveAttribute('data-track', 'fr');
  await expect(page.getByTestId('course-chip')).toHaveAttribute('data-track', 'fr');
  await expect(page.getByTestId('home-mascot')).toHaveAttribute('data-kind', 'fox');
  await expect(page.locator('html')).toHaveAttribute('data-track', 'fr');
  if (testInfo.project.name === 'mobile') {
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByTestId('course-chip')).toBeInViewport();
  }
  await shot(page, testInfo, 'home-course-chip');
  const frLesson = await current(page).getAttribute('data-lesson-id');
  expect(frLesson).toMatch(/^fr-/);
  await current(page).click();
  await playToEnd(page, byId);
  await page.getByTestId('done-continue').click();
  await expect(page.getByTestId('home')).toHaveAttribute('data-track', 'fr');
  await expect(page.locator(`[data-lesson-id="${frLesson}"]`)).toHaveAttribute('data-state', 'done');

  // Two courses in the sheet, each with its progress; switch back to English.
  await openSheet(page);
  await expect(page.getByTestId('course-item')).toHaveCount(2);
  await expect(page.locator('[data-testid="course-item"][data-active="true"]')).toHaveAttribute('data-track', 'fr');
  await shot(page, testInfo, 'course-sheet-two');
  await page.getByTestId('course-switch-en').click();
  await expect(page.getByTestId('home')).toHaveAttribute('data-track', 'en');
  await expect(current(page)).toHaveAttribute('data-lesson-id', enCurrent);
  await expect(page.getByTestId('home-mascot')).toHaveAttribute('data-kind', 'otter');
  // The active course is stored on the server: it follows the account.
  expect((await (await page.request.get('/api/auth/me')).json()).user.activeTrack).toBe('en');

  // Total XP = English XP + French XP; the profile shows both.
  const p = await profile(page);
  expect(p.stats.xp).toBeGreaterThan(xpBefore);
  expect(p.courses.map((c) => c.track)).toEqual(['en', 'fr']);
  expect(p.courses.reduce((s, c) => s + c.xp, 0)).toBe(p.stats.xp);
  await page.getByTestId('home-avatar-link').click();
  await expect(page.getByTestId('profile-course')).toHaveCount(2);
  await expect(page.locator('[data-testid="profile-course"][data-track="fr"]')).toHaveAttribute('data-xp', String(p.courses[1].xp));
  await shot(page, testInfo, 'profile-courses');
  await page.goBack();

  // Hide French: gone from the sheet, offered again as "bring back"; its progress is kept.
  await openSheet(page);
  await page.getByTestId('course-remove-fr').click();
  await page.getByTestId('course-remove-yes').click();
  await expect(page.getByTestId('course-item')).toHaveCount(1);
  await page.getByTestId('course-add').click();
  await expect(page.getByTestId('course-add-fr')).toContainText(t('courses.restore'));
  await page.getByTestId('course-add-fr').click();
  await expect(page.getByTestId('home')).toHaveAttribute('data-track', 'fr');
  await expect(page.locator(`[data-lesson-id="${frLesson}"]`)).toHaveAttribute('data-state', 'done');

  // Leave kid1 as the other specs expect her: English active, French hidden (kept).
  await openSheet(page);
  await page.getByTestId('course-switch-en').click();
  await expect(page.getByTestId('home')).toHaveAttribute('data-track', 'en');
  expect((await (await page.request.delete('/api/courses/fr')).json()).courses.map((c) => c.track)).toEqual(['en']);
});

test('the admin enrols kid2 in English with a start level; she keeps French active until she switches', async ({ page, browser }, testInfo) => {
  await loginAdmin(page);
  const kid2 = (await adminUsers(page)).find((u) => u.username === 'kid2');
  await page.goto(`/admin/users/${kid2.id}`);
  await expect(page.getByTestId('admin-user-courses')).toBeVisible();
  // First run: add English; a later run: bring the hidden English back (wait for the list: isVisible does not wait).
  await expect(page.getByTestId('course-restore-en').or(page.getByTestId('course-add-select'))).toBeVisible();
  if (await page.getByTestId('course-restore-en').isVisible()) await page.getByTestId('course-restore-en').click();
  else {
    await page.getByTestId('course-add-select').selectOption('en');
    await page.getByTestId('course-add-button').click();
  }
  await expect(page.locator('[data-testid="admin-course"][data-track="en"]')).toHaveAttribute('data-hidden', 'false');
  await page.getByTestId('course-start-en').selectOption('en-a1');
  await expect.poll(async () => (await (await page.request.get(`/api/admin/users/${kid2.id}/courses`)).json())
    .courses.find((c) => c.track === 'en').startPack).toBe('en-a1');
  await expect(page.locator('[data-testid="admin-course"][data-track="fr"]')).toHaveAttribute('data-active', 'true');
  await page.getByTestId('admin-user-courses').scrollIntoViewIfNeeded();
  await shot(page, testInfo, 'admin-user-courses');

  const ctx = await browser.newContext({ ...testInfo.project.use, baseURL: testInfo.project.use.baseURL });
  const child = await ctx.newPage();
  await loginChild(child, 'kid2');
  await expect(child.getByTestId('home')).toHaveAttribute('data-track', 'fr');
  await child.getByTestId('course-chip').click();
  await child.getByTestId('course-switch-en').click();
  await expect(child.getByTestId('home')).toHaveAttribute('data-track', 'en');
  await expect(current(child)).toHaveAttribute('data-lesson-id', 'en-a1-u01-l01');
  await expect(child.locator('[data-lesson-id="en-pre-a1-u01-l01"]')).toHaveAttribute('data-state', 'optional');
  await child.getByTestId('course-chip').click();
  await child.getByTestId('course-switch-fr').click();
  await expect(child.getByTestId('home')).toHaveAttribute('data-track', 'fr');
  await ctx.close();

  // Restore: English hidden again (an admin action; kid2's French untouched).
  expect((await (await page.request.put(`/api/admin/users/${kid2.id}/courses/en`, { data: { hidden: true } })).json()).active).toBe('fr');
});

test('an adult learner gets the adult wording next to the 🚩 flag', async ({ page, browser }, testInfo) => {
  await loginAdmin(page);
  await deleteUserIfExists(page, 'grownup');
  expect((await page.request.post('/api/admin/users', {
    data: {
      username: 'grownup', displayName: 'Sam', role: 'child', audience: 'adult', course: { track: 'en' }, uiLang: 'en', avatar: 'bear', avatarBg: 'sand',
      password: 'sam1', showOnLogin: false,
    },
  })).status()).toBe(201);
  const ctx = await browser.newContext({ ...testInfo.project.use, baseURL: testInfo.project.use.baseURL });
  const learner = await ctx.newPage();
  await learner.goto('/login');
  await learner.getByTestId('login-other').click();
  await learner.locator('#login-username').fill('grownup');
  await learner.locator('#login-password').fill('sam1');
  await learner.getByTestId('login').getByRole('button', { name: t('login.submit', await loginLang(learner)) }).click();
  await expect(learner.getByTestId('home')).toBeVisible();
  await current(learner).click();
  await answerCurrent(learner, byId);
  await learner.getByTestId('report-info').click();
  await expect(learner.getByTestId('report-info-text')).toHaveText(t('report.infoTextAdult', 'en'));
  await ctx.close();
  await deleteUserIfExists(page, 'grownup');
  await page.goto('/admin');
  await logoutAnywhere(page);
  expect(ADMIN_LANG).toBe('en');
});
