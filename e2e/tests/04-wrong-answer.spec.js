import { test, expect } from '@playwright/test';
import { answerCurrent, exercisesById, loginChild, playToEnd, readPack, t, txt } from './helpers.js';

const LESSON = 'en-pre-a1-u01-l01';

test('a wrong answer shows the red strip, comes back at the end, and lowers the score', async ({ page }) => {
  const pack = readPack('en/pre-a1.json');
  const byId = exercisesById(pack);
  const exercises = pack.units[0].lessons[0].exercises;
  const firstId = exercises[0].id;

  await loginChild(page, 'kid1');
  await page.locator(`[data-lesson-id="${LESSON}"]`).click();

  await expect(page.getByTestId('exercise')).toHaveAttribute('data-exercise-id', firstId);
  await answerCurrent(page, byId, { wrong: true });
  const strip = page.getByTestId('result-strip');
  await expect(strip).toHaveAttribute('data-result', 'wrong');
  await expect(strip).toContainText(t('lesson.wrong'));
  await expect(page.getByTestId('correct-answer')).toContainText(txt(exercises[0].options.find((o) => o.correct).text));
  await page.getByTestId('continue-button').click();

  // The next exercise is the second one; the wrong one is re-queued at the end.
  await expect(page.getByTestId('exercise')).toHaveAttribute('data-exercise-id', exercises[1].id);
  const seen = await playToEnd(page, byId);
  expect(seen.map((s) => s.id)).toEqual([...exercises.slice(1).map((e) => e.id), firstId]);

  await expect(page.getByTestId('lesson-done')).toBeVisible();
  const score = parseInt(await page.getByTestId('done-score').innerText(), 10);
  expect(score).toBeLessThan(100);
  expect(score).toBe(Math.round((100 * (exercises.length - 1)) / exercises.length));
});
