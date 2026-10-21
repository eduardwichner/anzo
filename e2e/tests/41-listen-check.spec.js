import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { ADMIN_LANG, loginAdmin, loginChild, t } from './helpers.js';

// Admin → Listen check: one random clip of the real audio at a time, ▶, OK / Bad (reason, note), the fix
// queue and the error bounds per stratum; it resumes after a reload. The verdicts stay in the e2e server's temporary
// database (nothing else reads them); the counts are compared before and after, so the spec runs in any order and project.

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const shot = async (page, testInfo, name, fullPage = false) => {
  if (testInfo.project.name !== 'mobile') return;
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `mobile-41-${name}.png`), fullPage });
};
const stateOf = async (page) => (await page.request.get('/api/admin/listen')).json();

test.describe.serial('listen check', () => {
  test('a clip, ▶, OK; then Bad with a reason and a note goes to the fix queue; a reload resumes', async ({ page }, testInfo) => {
    await loginAdmin(page);
    await page.getByTestId('admin-listen-link').click();
    await expect(page.getByTestId('listen-check')).toBeVisible();
    const before = await stateOf(page);
    const clip = page.getByTestId('listen-clip');
    await expect(clip).toBeVisible();
    const first = await clip.getAttribute('data-file');
    expect((await page.request.get(`/audio/${first}`)).status()).toBe(200);
    await page.getByTestId('listen-play').click();
    await shot(page, testInfo, 'listen-check');
    await page.getByTestId('listen-ok').click();
    await expect(clip).not.toHaveAttribute('data-file', first);

    const second = await clip.getAttribute('data-file');
    await page.getByTestId('listen-bad').click();
    await expect(page.getByTestId('listen-bad-form')).toBeVisible();
    await page.getByTestId('listen-reason-cut-off').click();
    await expect(page.getByTestId('listen-reason-cut-off')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('listen-note').fill('the first sound is missing');
    await shot(page, testInfo, 'listen-bad');
    await page.getByTestId('listen-save-bad').click();
    await expect(clip).not.toHaveAttribute('data-file', second);

    const after = await stateOf(page);
    expect(after.heard).toBe(before.heard + 2);
    expect(after.queue.waiting).toBe(before.queue.waiting + 1);
    await expect(page.getByTestId('listen-queue')).toContainText(t('listen.queue', ADMIN_LANG, after.queue));

    // resumes: the same next clip after a reload, the verdicts kept
    const next = await clip.getAttribute('data-file');
    await page.reload();
    await expect(page.getByTestId('listen-clip')).toBeVisible();
    expect((await stateOf(page)).heard).toBe(after.heard);
    expect(typeof next).toBe('string');

    // the strata, per language
    const en = page.getByTestId('listen-stats-track').filter({ hasText: t('languages.en', ADMIN_LANG) });
    await en.locator('summary').click();
    await expect(en.getByTestId('listen-stratum').first()).toBeVisible();
    await page.getByTestId('listen-stats').scrollIntoViewIfNeeded();
    await shot(page, testInfo, 'listen-stats');
  });

  test('a learner cannot reach it', async ({ page }) => {
    await loginChild(page, 'kid1');
    expect((await page.request.get('/api/admin/listen')).status()).toBe(403);
    await page.goto('/admin/listen');
    await expect(page.getByTestId('listen-check')).toHaveCount(0);
  });
});
