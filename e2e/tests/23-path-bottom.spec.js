import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { loginChild } from './helpers.js';

// The floating "Huidige les" button must never cover the last lesson of the path: scrolled to the very bottom, the
// last node and its label stay clear of the button on a phone and on a desktop, in both tracks.

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const VIEWPORTS = [{ width: 412, height: 915 }, { width: 1280, height: 800 }];
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const child of ['kid1', 'kid2']) {
  test(`${child}: at the bottom of the path the last lesson is not covered by the current-lesson button`, async ({ page }, testInfo) => {
    await loginChild(page, child);
    for (const vp of VIEWPORTS) {
      await page.setViewportSize(vp);
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      const fab = page.getByTestId('current-lesson-button');
      await expect(fab).toBeVisible();
      const last = page.getByTestId('lesson-node').last();
      const label = page.locator('.lesson-label').last();
      await expect(last).toBeInViewport();
      const fabBox = await fab.boundingBox();
      if (testInfo.project.name === 'mobile') {
        fs.mkdirSync(outDir, { recursive: true });
        await page.screenshot({ path: path.join(outDir, `path-bottom-${child}-${vp.width}x${vp.height}.png`) });
      }
      expect(overlaps(await last.boundingBox(), fabBox), `last node vs button at ${vp.width}×${vp.height}`).toBe(false);
      expect(overlaps(await label.boundingBox(), fabBox), `last label vs button at ${vp.width}×${vp.height}`).toBe(false);
    }
  });
}
