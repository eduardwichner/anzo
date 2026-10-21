import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { ADMIN_LANG, hookPlaying, loginAdmin, played, t } from './helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const voices = JSON.parse(fs.readFileSync(path.join(root, 'content/voices.json'), 'utf8'));
const models = JSON.parse(fs.readFileSync(path.join(root, 'models/manifest.json'), 'utf8'));
const outDir = path.join(root, 'e2e/screenshots');

test('Admin → Voices is a read-only card per language: voice, licence and a playable sample; no choice anywhere', async ({ page }, testInfo) => {
  await loginAdmin(page);
  await page.getByTestId('voices-link').click();
  await expect(page.getByTestId('voices')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('voices.title', ADMIN_LANG));

  for (const [track, cfg] of Object.entries(voices)) {
    const card = page.getByTestId(`voices-${track}`);
    await expect(card.getByTestId('voice-name')).toHaveText(cfg.voice);
    const licence = models.voices.find((v) => v.name === cfg.voice).licence;
    await expect(card.getByTestId('voice-licence')).toContainText(licence);
    await expect(card.getByTestId('voice-sample')).toHaveCount(1);
  }
  // Nothing to choose: no radio buttons, selects or extra voice cards.
  await expect(page.locator('input, select')).toHaveCount(0);
  await expect(page.locator('[data-voice]')).toHaveCount(Object.keys(voices).length);

  await hookPlaying(page);
  await page.getByTestId('voices-fr').getByTestId('voice-sample').click();
  await expect.poll(async () => (await played(page)).length).toBe(1);
  expect((await played(page))[0]).toMatch(/^\/audio\/fr\/[0-9a-f]{16}\.mp3$/);

  if (testInfo.project.name === 'mobile') {
    fs.mkdirSync(outDir, { recursive: true });
    await page.screenshot({ path: path.join(outDir, 'mobile-admin-voices.png'), fullPage: true });
  }
});

test('Settings has no voice choice', async ({ page }) => {
  await loginAdmin(page);
  await page.goto('/settings');
  await expect(page.getByTestId('settings')).toBeVisible();
  await expect(page.locator('[data-testid*="voice"]')).toHaveCount(0);
});
