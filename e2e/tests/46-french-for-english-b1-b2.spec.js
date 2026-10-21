import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { answerB2, deleteUserIfExists, exercisesById, loginAdmin, loginChild, logoutAnywhere, orderToken, readPack, t } from './helpers.js';

// French for English speakers B1 and B2 released: an English-speaking learner (an account made and deleted here,
// start level B1) plays the first B1 text lesson — the French text, English title, the questions, the cloze with English
// hints, the ordering — and sees each sentence's English once the questions are answered; then, from start level B2, the
// first B2 lesson with English meanings, and a key word transformation that shows its English meaning after checking.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(ROOT, 'e2e', 'screenshots');
const shot = async (page, testInfo, name) => {
  if (testInfo.project.name !== 'mobile') return;
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `mobile-46-${name}.png`) });
};
const B1 = readPack('fr-en/b1.json');
const B2 = readPack('fr-en/b2.json');
const byId = new Map([...exercisesById(B1), ...exercisesById(B2)]);
const current = (page) => page.locator('[data-testid="lesson-node"][data-state="current"]');
const USER = 'e2e-fe19';
const PW = 'fen-e2e-19';
const T01 = B1.units[0].texts[0]; // fe-b1-t01, the neighbourhood party

/** Answer the B1 text exercise on screen correctly (questions, cloze, ordering). */
async function answerText(page) {
  const ex = byId.get(await page.getByTestId('exercise').getAttribute('data-exercise-id'));
  if (['reading', 'dialogue', 'listening'].includes(ex.type)) {
    const q = ex.question;
    if (q.type === 'true_false_notgiven') await page.locator(`[data-testid="tfng-option"][data-value="${q.answer}"]`).click();
    else await page.getByTestId('question-option').getByText(q.options[q.correct], { exact: true }).click();
  } else if (ex.type === 'cloze') {
    // typed at B1, each gap hinted in English (the meaning, or the infinitive and the English tense)
    for (const g of ex.gaps) expect(Object.keys(g.hint)).toEqual(['en']);
    for (const [i, g] of ex.gaps.entries()) await page.getByTestId('cloze-input').nth(i).fill(g.word);
  } else if (ex.type === 'order_paragraphs') {
    for (const id of ex.segments) await page.locator(`[data-testid="order-part"][data-seg-id="${orderToken(ex.id, id)}"]`).click();
  } else throw new Error(`unexpected ${ex.type}`);
  await page.getByTestId('check-button').click();
  await expect(page.getByTestId('result-strip')).toHaveAttribute('data-result', 'correct');
  return ex;
}

test.describe.serial('French for English speakers, B1 and B2', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    await deleteUserIfExists(page, USER);
    expect((await page.request.post('/api/admin/users', {
      data: { username: USER, displayName: 'Fern', role: 'child', audience: 'adult', nativeLang: 'en', uiLang: 'en', avatar: 'fox', avatarBg: 'sky',
        password: PW, showOnLogin: false, course: { track: 'fr-en', startPack: 'fe-b1' } },
    })).status()).toBe(201);
    await page.close();
  });
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    await deleteUserIfExists(page, USER);
    await page.close();
  });

  test('B1: a French text lesson with English title, hints and, after the questions, English translations', async ({ page }, testInfo) => {
    await loginChild(page, USER, PW);
    await page.goto('/');
    await expect(page.getByTestId('home')).toHaveAttribute('data-track', 'fr-en');
    await expect(current(page)).toHaveAttribute('data-lesson-id', 'fe-b1-u01-l01');
    await current(page).click();
    const text = page.getByTestId('text').first();
    await expect(text.locator('.text-title')).toHaveText(T01.title.en);
    await expect(text.locator('.text-title')).toHaveAttribute('lang', 'en');
    await expect(text.locator('[data-testid="text-seg"]').first()).toContainText(T01.paragraphs[0][0].target);
    await shot(page, testInfo, 'b1-text');
    let translated = false;
    for (let guard = 0; guard < 20; guard++) {
      if (await page.getByTestId('lesson-done').isVisible()) break;
      await answerText(page);
      // on a phone the text folds after the first question: open it to see the translations
      const toggle = page.getByTestId('text-toggle').first();
      if (await toggle.isVisible() && (await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
      const tr = page.locator('.text-translation').first();
      if (!translated && await tr.isVisible()) {
        await expect(tr).toHaveText(T01.paragraphs[0][0].native.en);
        await expect(tr).toHaveAttribute('lang', 'en');
        translated = true;
        await shot(page, testInfo, 'b1-translation');
      }
      await page.getByTestId('continue-button').click();
      await expect(page.getByTestId('exercise').or(page.getByTestId('lesson-done'))).toBeVisible();
    }
    await expect(page.getByTestId('lesson-done')).toBeVisible();
    await expect(page.getByTestId('done-score')).toContainText('100');
    expect(translated).toBe(true);
    await page.getByTestId('done-continue').click();
    await expect(page.locator('[data-lesson-id="fe-b1-u01-l01"]')).toHaveAttribute('data-state', 'done');
    await logoutAnywhere(page);
  });

  test('B2: the first lesson in English meanings; a key word transformation shows its English meaning after checking', async ({ page }, testInfo) => {
    await loginAdmin(page);
    const user = (await (await page.request.get('/api/admin/users')).json()).users.find((u) => u.username === USER);
    expect((await page.request.put(`/api/admin/users/${user.id}/courses/fr-en`, { data: { startPack: 'fe-b2' } })).status()).toBe(200);
    await logoutAnywhere(page);

    await loginChild(page, USER, PW);
    await page.goto('/');
    await expect(current(page)).toHaveAttribute('data-lesson-id', 'fe-b2-u01-l01');
    await current(page).click();
    const first = byId.get(await page.getByTestId('exercise').getAttribute('data-exercise-id'));
    expect(first.type).toBe('multiple_choice');
    const right = first.options.find((o) => o.correct).text.en;
    await expect(page.getByTestId('mc-option').filter({ hasText: new RegExp(`^${right.replace(/[()]/g, '\\$&')}$`) })).toHaveCount(1);
    await shot(page, testInfo, 'b2-lesson');
    for (let guard = 0; guard < 40; guard++) {
      if (await page.getByTestId('lesson-done').isVisible()) break;
      await answerB2(page, byId);
      await page.getByTestId('continue-button').click();
      await expect(page.getByTestId('exercise').or(page.getByTestId('lesson-done'))).toBeVisible();
    }
    await expect(page.getByTestId('lesson-done')).toBeVisible();

    // the review lesson opens with the unit's key word transformations (transformsFirst)
    await page.goto('/lesson/fe-b2-u01-review');
    const ex = byId.get(await page.getByTestId('exercise').getAttribute('data-exercise-id'));
    expect(ex.type).toBe('transform');
    await expect(page.getByTestId('transform-meaning')).toHaveCount(0); // not before checking
    await answerB2(page, byId);
    await expect(page.getByTestId('transform-meaning')).toContainText(t('transform.meaning', 'en'));
    await expect(page.getByTestId('transform-meaning').locator('[lang="en"]')).toHaveText(ex.native.en);
    await shot(page, testInfo, 'b2-transform');
  });
});
