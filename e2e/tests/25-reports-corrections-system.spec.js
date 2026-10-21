import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import {
  ADMIN_LANG, answerCurrent, deleteUserIfExists, exercisesById, loginAdmin, loginChild, readManifest, readPack, t, txt,
} from './helpers.js';

// The child's 🚩 report button (only after checking), the admin Inbox (Already correct with a message the
// child sees once; Fix through Corrections, applied by the e2e stub job runner: the report closes, the child is
// thanked and gets the bug-hunter badge), the Corrections editor (preview, audio warning, history) and Admin → System
// (every tile, Problems, diagnostics copied with the instruction header and without the session secret).
// One fresh child (rik), deleted at the end; each project runs the whole flow.

test.describe.configure({ mode: 'serial' });

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const EN_FILES = readManifest().tracks.find((tr) => tr.id === 'en').packs.filter((p) => p.status === 'available').map((p) => p.file);
const PACK = readPack(EN_FILES[0]);
const byId = new Map(EN_FILES.flatMap((f) => [...exercisesById(readPack(f))]));
const LESSON = 'en-pre-a1-u01-l01';
const lesson = PACK.units[0].lessons[0];
const FIRST = lesson.exercises[0];
const SECOND = lesson.exercises[1];
const KID = 'rik';
const SECRET = process.env.ANZO_E2E_SESSION_SECRET;

const shot = async (page, testInfo, name, locator, { fullPage = false } = {}) => {
  if (testInfo.project.name !== 'mobile') return;
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `mobile-s7-${name}.png`);
  if (locator) await locator.screenshot({ path: file });
  else await page.screenshot({ path: file, fullPage });
};

let admin;
let child;
// Pages made here get the project's device (phone size, touch, locale) and base URL explicitly.
const contextOptions = (testInfo) => {
  const u = testInfo.project.use;
  const keys = ['viewport', 'userAgent', 'deviceScaleFactor', 'isMobile', 'hasTouch', 'locale', 'timezoneId', 'baseURL'];
  return Object.fromEntries(keys.filter((k) => u[k] !== undefined).map((k) => [k, u[k]]));
};
test.beforeAll(async ({ browser }, testInfo) => {
  admin = await browser.newPage(contextOptions(testInfo));
  await loginAdmin(admin);
  await deleteUserIfExists(admin, KID);
  const res = await admin.request.post('/api/admin/users', {
    data: { username: KID, displayName: 'Rik', role: 'child', course: { track: 'en' }, uiLang: 'nl', avatar: 'dino', avatarBg: 'teal', password: 'rik1' },
  });
  expect(res.status()).toBe(201);
  child = await browser.newPage(contextOptions(testInfo));
  // A chosen daily goal keeps the inline goal card out of the Home screenshots.
  await loginChild(child, KID, 'rik1').catch(async () => {
    await child.goto('/login');
    await child.getByTestId('login-other').click();
    await child.locator('#login-username').fill(KID);
    await child.locator('#login-password').fill('rik1');
    await child.getByRole('button', { name: t('login.submit') }).click();
    await expect(child.getByTestId('home')).toBeVisible();
  });
  await child.request.patch('/api/auth/me', { data: { dailyGoal: 20 } });
});
test.afterAll(async () => {
  await deleteUserIfExists(admin, KID);
  await admin.close();
  await child.close();
});

test('the child reports an exercise with 🚩 — only after checking; ⓘ explains it in one line', async ({}, testInfo) => {
  await child.goto('/');
  await child.locator(`[data-lesson-id="${LESSON}"]`).click();
  await expect(child.getByTestId('exercise')).toHaveAttribute('data-exercise-id', FIRST.id);
  // During the exercise there is no flag: it cannot be used to fish for the answer.
  await expect(child.getByTestId('report-flag')).toHaveCount(0);
  await expect(child.getByTestId('report-info')).toHaveCount(0);
  await answerCurrent(child, byId, { wrong: true });
  await expect(child.getByTestId('report-flag')).toBeVisible();
  await child.getByTestId('report-info').click();
  await expect(child.getByTestId('report-info-text')).toHaveText(t('report.infoText'));
  await shot(child, testInfo, 'result-strip-flag', child.getByTestId('result-strip'));

  await child.getByTestId('report-flag').click();
  await expect(child.getByTestId('report-sheet')).toBeVisible();
  for (const r of ['native', 'target', 'audio', 'other']) {
    await expect(child.getByTestId(`report-reason-${r}`)).toHaveText(t(`report.reason.${r}`, 'nl', { language: t('languages.en'), native: t('nativeLanguages.nl') }));
  }
  await child.getByTestId('report-note').fill('kat is toch cat?');
  await shot(child, testInfo, 'report-sheet');
  await child.getByTestId('report-reason-native').click();
  await expect(child.getByTestId('report-thanks')).toHaveText(t('report.thanks'));
  await expect(child.getByTestId('report-sheet')).toHaveCount(0, { timeout: 5000 });
  await expect(child.getByTestId('report-flag')).toBeDisabled();
});

test('admin Inbox: the report as the child saw it; "Already correct" with a message the child sees once', async ({}, testInfo) => {
  await admin.goto('/admin');
  await expect(admin.getByTestId('admin-inbox-count')).toHaveText('1');
  await admin.getByTestId('admin-inbox-link').click();
  const group = admin.getByTestId(`inbox-group-${FIRST.id}`);
  await expect(group).toBeVisible();
  await expect(group.getByTestId('inbox-report')).toContainText('Rik');
  await expect(group.getByTestId('inbox-report')).toContainText('kat is toch cat?');
  await expect(group.getByTestId('inbox-exercise')).toHaveAttribute('data-exercise', FIRST.id);
  await shot(admin, testInfo, 'admin-inbox');

  // Copy question copies an English question with the context (Chromium: clipboard readable in the test).
  if (testInfo.project.name !== 'mobile-webkit') {
    await admin.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await group.getByTestId('inbox-ask').click();
    await expect(group.getByTestId('inbox-copied')).toBeVisible();
    const asked = await admin.evaluate(() => navigator.clipboard.readText());
    expect(asked).toContain('A Dutch-speaking child (age 8–10) learning English flagged this exercise as wrong');
    expect(asked).toContain(`(${FIRST.id})`);
    expect(asked).toContain('Note: kat is toch cat?');
    expect(asked).toMatch(/Is the English and the Dutch correct and natural for a child \(age 8–10\)\?/);
  }

  await group.getByTestId('inbox-correct').click();
  await expect(group.getByTestId('inbox-message')).toHaveValue(t('messages.checked', 'nl'));
  await group.getByTestId('inbox-correct-confirm').click();
  await expect(admin.getByTestId('inbox-notice')).toHaveText(t('ops.inbox.closedCorrect', ADMIN_LANG, { n: 1 }));
  await expect(admin.getByTestId('inbox-empty')).toBeVisible();

  await child.goto('/');
  await expect(child.getByTestId('child-message')).toHaveAttribute('data-kind', 'checked');
  await expect(child.getByTestId('child-message-text')).toHaveText(t('messages.checked'));
  await shot(child, testInfo, 'child-message-home');
  await child.getByTestId('child-message-ok').click();
  await expect(child.getByTestId('child-message')).toHaveCount(0);
  await child.reload();
  await expect(child.getByTestId('home')).toBeVisible();
  await expect(child.getByTestId('child-message')).toHaveCount(0); // once
});

test('Fix: the correction editor (preview, audio warning) → applied → the report closes, thanks + bug-hunter badge', async ({}, testInfo) => {
  // The child reports the second exercise (this time through the API: the UI path is covered above).
  const pick = SECOND.type === 'match_pairs' ? { mistakes: 1 } : 'xyz';
  await child.request.post('/api/progress/attempt', { data: { lessonId: LESSON, exerciseId: SECOND.id, answer: pick, firstTry: true } });
  expect((await child.request.post('/api/reports', { data: { exerciseId: SECOND.id, reason: 'native' } })).status()).toBe(201);

  const itemId = SECOND.items[0];
  const item = PACK.units[0].vocabulary.find((v) => v.id === itemId);
  await admin.goto('/admin/inbox');
  await admin.getByTestId(`inbox-group-${SECOND.id}`).getByTestId(`inbox-fix-${itemId}`).click();
  await expect(admin.getByTestId('correction-edit')).toHaveAttribute('data-item', itemId);
  await expect(admin.getByTestId('correction-for-report')).toBeVisible();
  await expect(admin.getByTestId('correction-native')).toHaveValue(txt(item.native));

  // An English change warns that the recording is made again.
  await admin.getByTestId('correction-target').fill(`${item.target}s`);
  await expect(admin.getByTestId('warning-audio')).toHaveText(t('ops.corrections.warnAudio', ADMIN_LANG, { language: t('languages.en', ADMIN_LANG) }));
  await expect(admin.getByTestId('warning-used')).toBeVisible();
  await expect(admin.getByTestId('preview-after').first()).toBeVisible();
  await admin.getByTestId('warning-audio').scrollIntoViewIfNeeded();
  await shot(admin, testInfo, 'correction-form', null, { fullPage: true });
  // The fix itself: the Dutch meaning only.
  await admin.getByTestId('correction-target').fill(item.target);
  await admin.getByTestId('correction-native').fill(`${txt(item.native)} (dier)`);
  await expect(admin.getByTestId('warning-audio')).toHaveCount(0);
  await admin.getByTestId('correction-reason').fill('e2e: clearer meaning');
  await admin.getByTestId('correction-submit').click();

  await expect(admin.getByTestId('corrections-history')).toBeVisible();
  const row = admin.locator('[data-testid^="correction-"].is-highlight');
  await expect(row).toHaveAttribute('data-status', 'applied');
  await expect(row.getByTestId('correction-status')).toHaveText(t('ops.corrections.status.applied', ADMIN_LANG));
  await shot(admin, testInfo, 'correction-history', null, { fullPage: true });
  await admin.goto('/admin/inbox');
  await expect(admin.getByTestId('inbox-empty')).toBeVisible();

  await child.goto('/');
  await expect(child.getByTestId('child-message')).toHaveAttribute('data-kind', 'fixed');
  await expect(child.getByTestId('child-message-text')).toHaveText(t('messages.fixed'));
  await expect(child.getByTestId('child-message-badge')).toContainText(t('badges.bug-hunter.title'));
  await shot(child, testInfo, 'child-message-fixed');
  await child.getByTestId('child-message-ok').click();
  await child.goto('/profile');
  await expect(child.locator('[data-badge-id="bug-hunter"]')).toHaveAttribute('data-earned', 'true');
});

test('Admin → System: every tile, the Problems list, and the diagnostics (header first, no secret)', async ({}, testInfo) => {
  await admin.goto('/admin');
  await admin.getByTestId('admin-system-link').click();
  await expect(admin.getByTestId('system')).toBeVisible();
  for (const id of ['app', 'health', 'content', 'backups', 'disk', 'integrity', 'jobs', 'watchdog', 'reports', 'audiocheck']) {
    await expect(admin.getByTestId(`tile-${id}`)).toBeVisible();
  }
  // Audio check: "Audio check: N flagged" or "N recordings checked", from status/audio-check.json
  await expect(admin.getByTestId('tile-audiocheck')).toContainText(/Audio check|recordings checked|Not run yet/);
  await admin.getByTestId('tile-audiocheck').scrollIntoViewIfNeeded();
  await shot(admin, testInfo, 'system-audio-check', admin.getByTestId('tile-audiocheck'));
  await admin.evaluate(() => window.scrollTo(0, 0));
  await expect(admin.getByTestId('tile-health')).toHaveAttribute('data-level', 'green');
  await expect(admin.getByTestId('problem').first()).toContainText('e2e planted error');
  // The page itself never shows the secret either (the planted line carries it).
  expect(await admin.getByTestId('system-problems').innerText()).not.toContain(SECRET);
  expect(await admin.getByTestId('system-problems').locator('pre').first().textContent()).not.toContain(SECRET);
  await shot(admin, testInfo, 'system-top');
  await admin.getByTestId('system-problems').scrollIntoViewIfNeeded();
  await shot(admin, testInfo, 'system-problems', admin.getByTestId('system-problems'));

  if (testInfo.project.name !== 'mobile-webkit') {
    await admin.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await admin.getByTestId('copy-diagnostics').click();
    await expect(admin.getByTestId('diagnostics-copied')).toBeVisible();
    const text = await admin.evaluate(() => navigator.clipboard.readText());
    expect(text.startsWith('Anzo diagnostics (Admin → System): the version, the health, every tile, the problems, the last failed job, the disk,')).toBe(true);
    expect(text).toContain('## Problems (last 14 days, newest first, raw log lines');
    expect(text).toContain('e2e planted error');
    expect(SECRET && SECRET.length).toBeGreaterThan(32);
    expect(text).not.toContain(SECRET);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(25 * 1024);
  }
});
