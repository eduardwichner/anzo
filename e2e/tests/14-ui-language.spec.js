import { test, expect } from '@playwright/test';
import { exercisesById, loginChild, readPack, t } from './helpers.js';

test('kid1 switches the app to English: Home and a lesson instruction follow at once; then back to Dutch', async ({ page }) => {
  await loginChild(page, 'kid1');
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  await page.getByTestId('settings-link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('settings.title', 'nl'));

  await page.getByTestId('settings-lang-en').click();
  // No reload: the same screen re-renders in English.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('settings.title', 'en'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('settings-lang-en')).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('link', { name: t('app.back', 'en') }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('home.greeting', 'en', { name: 'Sam' }));
  await expect(page.getByTestId('track-name')).toHaveText(t('languages.en', 'en'));
  await expect(page.getByTestId('level-bar')).toHaveAttribute('aria-label', /^Level /);
  await page.getByTestId('level-bar').click();
  await expect(page.getByTestId('level-go').first()).toHaveText(t('levels.goHere', 'en'));
  await page.getByTestId('level-sheet-close').click();

  // The instruction is English; the English question and the Dutch meanings are content and stay.
  const first = readPack('en/pre-a1.json').units[0].lessons[0].exercises[0];
  await page.locator('[data-lesson-id="en-pre-a1-u01-l01"]').click();
  await expect(page.getByTestId('exercise-instruction')).toHaveText(t('exercise.multiple_choice.fromTarget', 'en'));
  await expect(page.getByTestId('mc-question')).toContainText(first.question);
  await expect(page.getByTestId('mc-option').filter({ hasText: /^kat$/ })).toHaveCount(1);
  await expect(page.getByTestId('check-button')).toHaveText(t('lesson.check', 'en'));

  // Stored on the account, not only in this tab.
  expect((await (await page.request.get('/api/auth/me')).json()).user.uiLang).toBe('en');

  await page.getByTestId('quit-lesson').click();
  await page.getByTestId('settings-link').click();
  await page.getByTestId('settings-lang-nl').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('settings.title', 'nl'));
  await page.getByRole('link', { name: t('app.back', 'nl') }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t('home.greeting', 'nl', { name: 'Sam' }));
  expect((await (await page.request.get('/api/auth/me')).json()).user.uiLang).toBe('nl');
});

test('a Dutch lesson shows the Dutch sentence to translate as its own element', async ({ page }) => {
  const byId = exercisesById(readPack('en/pre-a1.json'));
  const build = [...byId.values()].find((e) => e.type === 'build_sentence');
  const sentence = readPack('en/pre-a1.json').units[0].sentences.find((s) => s.id === build.sentenceId);
  const pub = async () => (await page.request.get('/api/content/packs/en-pre-a1')).json();
  await loginChild(page, 'kid1');
  const ex = (await pub()).units[0].lessons.flatMap((l) => l.exercises).find((e) => e.id === build.id);
  expect(ex).toMatchObject({ instruction: 'exercise.build_sentence', native: sentence.native.nl });
  expect(JSON.stringify(await pub())).not.toContain('"prompt"');
});

test('the login screen NL | EN toggle switches at once and is remembered after a reload', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(t('login.title', 'nl'));
  await expect(page.getByTestId('login-lang-nl')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('login-lang-en').click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(t('login.title', 'en'));
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('login-other')).toHaveText(t('login.otherAccount', 'en'));

  await page.reload();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(t('login.title', 'en'));
  await expect(page.getByTestId('login-lang-en')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('login-lang-nl').click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(t('login.title', 'nl'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
});
