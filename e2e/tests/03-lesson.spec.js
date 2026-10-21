import { test, expect } from '@playwright/test';
import { exercisesById, loginChild, playToEnd, readPack, syncClock } from './helpers.js';

const LESSON = 'en-pre-a1-u01-l01';

test('kid1 completes lesson 1 using every exercise type; progress persists server-side', async ({ page }) => {
  const byId = exercisesById(readPack('en/pre-a1.json'));
  await syncClock(page); // the server's fixed day (scripts/e2e.js): the streak is 1 even across an Amsterdam midnight
  await loginChild(page, 'kid1');

  await page.locator(`[data-lesson-id="${LESSON}"]`).click();
  await expect(page.getByTestId('lesson')).toBeVisible();
  const seen = await playToEnd(page, byId);

  // All six implemented types were answered through the UI (Pre-A1 fill-ins use a word bank; typed ones are A1+).
  expect(new Set(seen.map((s) => s.type))).toEqual(new Set(['multiple_choice', 'match_pairs', 'build_sentence', 'fill_blank', 'listen_choose', 'listen_type']));
  const fills = seen.filter((s) => s.type === 'fill_blank').map((s) => byId.get(s.id));
  expect(fills.every((f) => f.options)).toBe(true);

  await expect(page.getByTestId('lesson-done')).toBeVisible();
  await expect(page.getByTestId('done-score')).toHaveText('100%');
  await expect(page.getByTestId('done-streak')).toHaveText('1');

  await page.getByTestId('done-continue').click();
  const xp = Number(await page.getByTestId('xp').innerText());
  expect(xp).toBeGreaterThan(0);
  await expect(page.getByTestId('streak')).toHaveText('1');
  await expect(page.locator(`[data-lesson-id="${LESSON}"]`)).toHaveAttribute('data-state', 'done');
  await expect(page.locator('[data-lesson-id="en-pre-a1-u01-l02"]')).toHaveAttribute('data-state', 'current');

  await page.reload();
  await expect(page.getByTestId('home')).toBeVisible();
  await expect(page.locator(`[data-lesson-id="${LESSON}"]`)).toHaveAttribute('data-state', 'done');
  expect(Number(await page.getByTestId('xp').innerText())).toBe(xp);
  await expect(page.getByTestId('streak')).toHaveText('1');

  const progress = await (await page.request.get('/api/progress/me')).json();
  expect(progress.lessons[LESSON].times_completed).toBeGreaterThanOrEqual(1);
});
