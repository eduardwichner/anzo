import { test, expect } from '@playwright/test';
import { answerCurrent, exercisesById, hookPlaying, loginChild, played, playUntil, readPack, t } from './helpers.js';

const LESSON = 'en-pre-a1-u01-l01';
// A generated listen_type of unit 1 whose answer has a word of 5+ letters (for "Bijna!") and a short word (exact).
const PACK = readPack('en/pre-a1.json');
const { lesson: LT_LESSON, ex: LT } = PACK.units[0].lessons.flatMap((l) => l.exercises.map((ex) => ({ lesson: l.id, ex })))
  .find(({ ex }) => ex.type === 'listen_type' && /\b[a-z]{5,}\b/i.test(ex.answer) && /\b[a-z]{3,4}\b/i.test(ex.answer));
const WORDS = LT.answer.split(' ');
const longIdx = WORDS.findIndex((w) => w.replace(/\W/g, '').length >= 5);
const shortIdx = WORDS.findIndex((w, i) => i !== longIdx && /^[a-z]{3,4}$/i.test(w.replace(/\W/g, '')));
const withWord = (i, f) => WORDS.map((w, k) => (k === i ? f(w) : w)).join(' ');
const WRONG = withWord(shortIdx, (w) => w.replace(/([a-z])(\W*)$/i, (m, c, p) => `${c === 'x' ? 'y' : 'x'}${p}`));
const ALMOST = withWord(longIdx, (w) => w.slice(0, 2) + w.slice(3));

test('listen_type grading: missing full stop is fine, a long-word typo gets "Bijna!", a short-word typo is wrong', async ({ page }) => {
  const byId = exercisesById(PACK);
  await loginChild(page, 'kid1');
  await page.goto(`/lesson/${LT_LESSON}`);
  await playUntil(page, byId, LT.id);

  // Wrong: a word under 5 letters must be exact. The exercise comes back at the end.
  await answerCurrent(page, byId, { typed: WRONG });
  const strip = page.getByTestId('result-strip');
  await expect(strip).toHaveAttribute('data-result', 'wrong');
  await expect(page.getByTestId('correct-answer')).toContainText(LT.answer);
  await expect(page.getByTestId('result-speaker')).toBeVisible(); // 🔊 for the correct answer
  await page.getByTestId('continue-button').click();

  // Almost: one letter off a word of 5+ letters -> correct, with the spelling shown.
  await expect(page.getByTestId('exercise')).toHaveAttribute('data-exercise-id', LT.id);
  await answerCurrent(page, byId, { typed: ALMOST });
  await expect(strip).toHaveAttribute('data-result', 'correct');
  await expect(page.getByTestId('spelling-note')).toHaveText(`${t('lesson.spelling')} ${LT.answer}`);
  await page.getByTestId('continue-button').click();
  await expect(page.getByTestId('lesson-done')).toBeVisible();

  // Again, now without the final punctuation: plainly correct, no note.
  await page.getByTestId('again-button').click();
  await playUntil(page, byId, LT.id);
  await answerCurrent(page, byId, { typed: LT.answer.replace(/[.!?]$/, '') });
  await expect(strip).toHaveAttribute('data-result', 'correct');
  await expect(page.getByTestId('spelling-note')).toHaveCount(0);
});

test('Settings → Play words automatically: off means no auto-play, the 🔊 still plays; on again restores it', async ({ page }) => {
  await loginChild(page, 'kid1');
  await page.goto('/settings');
  const setting = page.getByTestId('autoplay-setting');
  await expect(setting).toBeChecked();
  await expect(page.getByTestId('settings-autoplay')).toContainText(t('settings.autoplay'));
  await setting.uncheck();
  await expect(setting).not.toBeChecked();
  await page.reload();
  await expect(page.getByTestId('autoplay-setting')).not.toBeChecked(); // stored with the account
  expect((await (await page.request.get('/api/auth/me')).json()).user.autoplay).toBe(false);

  // The lesson header has no speaker toggle any more; nothing auto-plays while the setting is off.
  await page.goto('/');
  await hookPlaying(page);
  await page.locator(`[data-lesson-id="${LESSON}"]`).click();
  await expect(page.getByTestId('exercise')).toBeVisible();
  await expect(page.getByTestId('autoplay-toggle')).toHaveCount(0);
  await page.waitForTimeout(1500);
  expect(await played(page)).toEqual([]);
  // A manual tap always plays.
  await page.getByTestId('speaker').first().click();
  await expect.poll(async () => (await played(page)).length).toBeGreaterThan(0);

  // Restore the default for the other specs.
  await page.getByTestId('quit-lesson').click();
  await page.goto('/settings');
  await page.getByTestId('autoplay-setting').check();
  await expect(page.getByTestId('autoplay-setting')).toBeChecked();
});
