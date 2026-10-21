import { test, expect } from '@playwright/test';
import { loginChild, readManifest, t } from './helpers.js';

test('the level sheet shows the manifest rows with Beschikbaar / Binnenkort / Later', async ({ page }) => {
  const track = readManifest().tracks.find((tr) => tr.id === 'en');
  await loginChild(page, 'kid1');
  await page.getByTestId('level-bar').click();
  await expect(page.getByTestId('level-sheet')).toBeVisible();

  const rows = page.getByTestId('level-row');
  await expect(rows).toHaveCount(track.packs.length);
  // a preview pack (Admin → Levels → Preview) is a "later" row for a learner
  const shown = (p) => (p.status === 'preview' ? 'roadmap' : p.status);
  for (const [i, pack] of track.packs.entries()) {
    const row = rows.nth(i);
    await expect(row).toHaveAttribute('data-pack-id', pack.id);
    await expect(row).toHaveAttribute('data-status', shown(pack));
    await expect(row.getByTestId('level-badge')).toHaveText(t(`levels.${shown(pack)}`));
    await expect(row).toContainText(pack.cefr);
  }
  for (const status of ['available', 'planned', 'roadmap']) {
    await expect(page.getByText(t(`levels.${status}`), { exact: true })).toHaveCount(track.packs.filter((p) => shown(p) === status).length);
  }
  await expect(rows.first().getByTestId('level-percent')).toBeVisible();
});
