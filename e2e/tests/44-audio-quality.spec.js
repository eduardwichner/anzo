import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { ADMIN_LANG, loginAdmin, t } from './helpers.js';

// French for English speakers (track fr-en, target fr): the pilot pack fe-a1-1 in Admin → Levels →
// Preview with English meanings and French clips (spec 45 plays it as a learner). Part C: the Listen check's Audio quality table (per group and language, live), "How this works" in the admin's
// language, Record again on a Bad clip of the fix queue (the stub job runner: Keep old leaves everything as it was), and the
// one-line summary + explanation on Corrections. (The former compare round is gone: spec 45.)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(ROOT, 'e2e', 'screenshots');
const shot = async (page, testInfo, name, fullPage = false) => {
  if (testInfo.project.name !== 'mobile') return;
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `mobile-44-${name}.png`), fullPage });
};

test.describe.serial('Audio quality and French for English speakers in Preview', () => {
  test('Listen check: Audio quality table, How this works, Record again on a Bad clip; Corrections: summary line and explanation', async ({ page }, testInfo) => {
    await loginAdmin(page);
    await page.getByTestId('admin-listen-link').click();
    const quality = page.getByTestId('audio-quality');
    await expect(quality.getByRole('heading', { name: t('quality.title', ADMIN_LANG) })).toBeVisible();
    let state = await (await page.request.get('/api/admin/listen')).json();
    if (!state.queue.waitingClips.length) { // a Bad clip for the fix queue (the e2e server's temporary database)
      state = await (await page.request.post('/api/admin/listen', { data: { file: state.next.file, verdict: 'bad', reason: 'babble' } })).json();
      await page.reload();
    }
    await expect(quality.getByTestId('quality-group')).toHaveCount(2);
    for (const g of state.quality.groups) {
      const group = quality.locator(`[data-testid="quality-group"][data-group="${g.group}"]`);
      await expect(group.getByRole('heading', { name: t(`quality.group.${g.group}`, ADMIN_LANG) })).toBeVisible();
      await expect(group.getByTestId('quality-row')).toHaveCount(g.rows.length);
      await expect(group.getByTestId('quality-row').first()).toContainText(t(`languages.${g.rows[0].track}`, ADMIN_LANG));
    }
    expect(state.quality.groups.flatMap((g) => g.rows).map((r) => r.track).sort()).toEqual(['en', 'en', 'fr', 'fr', 'nl', 'nl']);
    await expect(page.getByText(/ of 300$/)).toHaveCount(0); // no former targets are left
    // How this works: closed, opens with a tap, every part in the admin's language
    const how = page.getByTestId('how-it-works');
    await expect(how.getByText(t('listen.how.machine.text', ADMIN_LANG))).toBeHidden();
    await how.getByText(t('listen.how.title', ADMIN_LANG)).click();
    for (const part of ['what', 'picked', 'verdict', 'bad', 'pronunciation', 'machine', 'table', 'later']) {
      await expect(how.getByText(t(`listen.how.${part}.title`, ADMIN_LANG), { exact: true })).toBeVisible();
    }
    if (testInfo.project.name === 'mobile') await quality.screenshot({ path: path.join(outDir, 'mobile-44-listen-quality.png') });
    // the fix queue (spec 41 left a Bad clip): open it, Record again, hear old and new, keep the old one
    expect(state.queue.waitingClips.length).toBeGreaterThan(0);
    const waiting = page.getByTestId('listen-waiting-clip').first();
    await waiting.locator('summary').click();
    await waiting.getByTestId('rerecord-start').click();
    await expect(waiting.getByTestId('rerecord-review')).toBeVisible();
    await expect(waiting.getByTestId('rerecord-old')).toBeVisible();
    await waiting.getByTestId('rerecord-drop').click();
    await expect(waiting.getByTestId('rerecord-clip')).toHaveAttribute('data-status', 'dropped');
    // Corrections: the one-line summary links to the Listen check; How this works opens
    await page.goto('/admin/corrections');
    const line = page.getByTestId('quality-line');
    await expect(line).toBeVisible();
    await page.getByTestId('how-it-works').getByText(t('ops.corrections.how.title', ADMIN_LANG)).click();
    await expect(page.getByText(t('ops.corrections.how.limits.title', ADMIN_LANG), { exact: true })).toBeVisible();
    await shot(page, testInfo, 'corrections-how');
    await page.getByTestId('quality-line-link').click();
    await expect(page.getByTestId('listen-check')).toBeVisible();
  });

  test('French for English speakers: a level in Preview (English meanings, French text); the course itself is spec 45', async ({ page }, testInfo) => {
    await loginAdmin(page);
    const tracks = (await (await page.request.get('/api/content/tracks')).json()).tracks;
    expect(tracks.find((tr) => tr.id === 'fr-en')).toMatchObject({ target: 'fr', native: 'en', mascot: 'fox' });
    await page.goto('/admin/preview/fe-a1-1');
    await expect(page.getByTestId('preview-unit').first()).toContainText('Me and my family');
    await page.getByTestId('preview-lesson').first().click();
    await expect(page.getByTestId('preview-banner')).toBeVisible();
    const question = page.getByTestId('mc-question');
    await expect(question.locator('[lang="fr"]').first()).toContainText('bonjour');
    await expect(page.getByTestId('mc-option').filter({ hasText: /^hello$/ })).toHaveCount(1);
    await shot(page, testInfo, 'fr-en-preview');
  });
});
