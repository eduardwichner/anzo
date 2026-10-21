import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { deleteUserIfExists, exercisesById, hookPlaying, loginAdmin, loginChild, orderToken, played, readPack, syncClock, t } from './helpers.js';

// Dutch B1 for learners. An adult learner (native English, Dutch from B1) sees B1 after A2 on the
// path, plays a B1 reading lesson (one text, its questions stepped through, then the cloze and the rest) to the end, and
// hears a B1 dialogue in two voices. Self-restoring: the learner is deleted at the end.

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const shot = async (page, testInfo, name) => {
  if (testInfo.project.name !== 'mobile') return;
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `mobile-35-${name}.png`) });
};
const pack = readPack('nl/b1.json');
const byId = exercisesById(pack);
const USER = 'e2e-b1';
const textLesson = (unit, kind) => unit.lessons.find((l) => l.exercises.some((e) => e.type === kind));
const READING = textLesson(pack.units[1], 'reading'); // nl-b1-u02: the job advert
const DIALOGUE_UNIT = pack.units[2]; // nl-b1-u03: the job interview
const DIALOGUE = textLesson(DIALOGUE_UNIT, 'dialogue');

/** Answer the exercise on screen correctly (text questions, cloze, ordering, and the vocabulary types are not needed here). */
async function answerText(page) {
  const ex = byId.get(await page.getByTestId('exercise').getAttribute('data-exercise-id'));
  if (['reading', 'dialogue', 'listening'].includes(ex.type)) {
    const q = ex.question;
    if (q.type === 'true_false_notgiven') await page.locator(`[data-testid="tfng-option"][data-value="${q.answer}"]`).click();
    else await page.getByTestId('question-option').getByText(q.options[q.correct], { exact: true }).click();
  } else if (ex.type === 'cloze') {
    for (const [i, g] of ex.gaps.entries()) await page.getByTestId('cloze-input').nth(i).fill(g.word);
  } else if (ex.type === 'order_paragraphs') {
    for (const id of ex.segments) await page.locator(`[data-testid="order-part"][data-seg-id="${orderToken(ex.id, id)}"]`).click();
  } else throw new Error(`unexpected ${ex.type}`);
  await page.getByTestId('check-button').click();
  await expect(page.getByTestId('result-strip')).toHaveAttribute('data-result', 'correct');
  return ex;
}

test.describe.serial('Dutch B1 for a learner', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    await deleteUserIfExists(page, USER);
    const res = await page.request.post('/api/admin/users', {
      data: {
        username: USER, displayName: 'Bea', role: 'child', audience: 'adult', nativeLang: 'en', uiLang: 'en', avatar: 'owl', avatarBg: 'mint',
        password: 'b1b1', showOnLogin: true, course: { track: 'nl', startPack: 'nl-b1' },
      },
    });
    expect(res.status()).toBe(201);
    await page.close();
  });
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    await deleteUserIfExists(page, USER);
    await page.close();
  });

  test('B1 follows A2 on the path; a reading lesson: one text, its questions stepped through, to the end', async ({ page }, testInfo) => {
    await syncClock(page);
    await loginChild(page, USER, 'b1b1');
    await expect(page.locator('[data-testid="unit-node"][data-pack-id="nl-b1"]').first()).toBeAttached();
    await page.getByTestId('level-bar').click();
    const rows = page.getByTestId('level-sheet').getByTestId('level-row');
    const ids = await rows.evaluateAll((els) => els.map((e) => e.dataset.packId));
    expect(ids.indexOf('nl-b1')).toBe(ids.indexOf('nl-a2') + 1);
    await expect(page.locator('[data-testid="level-row"][data-pack-id="nl-b1"]')).toHaveAttribute('data-status', 'available');
    await page.goto(`/lesson/${READING.id}`);
    const questions = READING.exercises.filter((e) => e.type === 'reading').length;
    await expect(page.getByTestId('question-step')).toHaveText(t('text.questionOf', 'en', { n: 1, total: questions }));
    await shot(page, testInfo, 'b1-reading');
    for (let guard = 0; guard < 30; guard++) {
      if (await page.getByTestId('lesson-done').isVisible()) break;
      await answerText(page);
      await page.getByTestId('continue-button').click();
      await expect(page.getByTestId('exercise').or(page.getByTestId('lesson-done'))).toBeVisible();
    }
    await expect(page.getByTestId('lesson-done')).toBeVisible();
    await expect(page.getByTestId('done-score')).toContainText('100');
  });

  test('a B1 dialogue: the turns in two voices', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await syncClock(page);
    await loginChild(page, USER, 'b1b1');
    const pub = await (await page.request.get('/api/content/packs/nl-b1')).json();
    const text = pub.units[2].texts.find((x) => x.kind === 'dialogue');
    const urlA = new URL(text.turns.find((x) => x.speaker === 'A').audio, 'http://x').pathname;
    const urlB = new URL(text.turns.find((x) => x.speaker === 'B').audio, 'http://x').pathname;
    await page.goto(`/lesson/${DIALOGUE.id}`);
    await expect(page.getByTestId('dialogue-turn').first()).toBeVisible();
    await shot(page, testInfo, 'b1-dialogue');
    await hookPlaying(page);
    await page.getByTestId('text-play').click();
    await expect.poll(async () => played(page), { timeout: 30_000 }).toEqual(expect.arrayContaining([urlA, urlB]));
    await page.getByTestId('text-play-stop').click();
  });
});
