import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { deleteUserIfExists, exercisesById, hookPlaying, loginAdmin, loginChild, orderToken, played, readPack, syncClock, t } from './helpers.js';

// English and French B1 for learners. A learner of English (from Flyers) and a learner of French
// learner (French from A2) see B1 right after their A2 level on the path and in the level sheet, and play a B1 text
// lesson to the end (one text, its questions stepped through, the cloze, the ordering); the English B1 dialogue plays in
// two voices. Mobile screenshots: English B1 reading and dialogue, a French B1 cloze, both level sheets. Self-restoring:
// both learners are deleted at the end.

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const shot = async (page, testInfo, name) => {
  if (testInfo.project.name !== 'mobile') return;
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `mobile-36-${name}.png`) });
};
const EN = readPack('en/b1.json');
const FR = readPack('fr/b1.json');
const byId = new Map([...exercisesById(EN), ...exercisesById(FR)]);
const textLesson = (unit, kind) => unit.lessons.find((l) => l.exercises.some((e) => e.type === kind));
const EN_READING = textLesson(EN.units[1], 'reading'); // en-b1-u02: a new girl at school (t03)
const EN_DIALOGUE = textLesson(EN.units[2], 'dialogue'); // en-b1-u03: the school play (t04)
const FR_READING = textLesson(FR.units[1], 'reading'); // fr-b1-u02: l'amitié (t03), with a cloze
const LEARNERS = [
  { username: 'e2e-b1-en', displayName: 'Zoë', password: 'b1en', course: { track: 'en', startPack: 'en-a2' } },
  { username: 'e2e-b1-fr', displayName: 'Ana', password: 'b1fr', course: { track: 'fr', startPack: 'fr-a2' } },
];

/** Answer the text exercise on screen correctly. */
async function answerText(page, onCloze) {
  const ex = byId.get(await page.getByTestId('exercise').getAttribute('data-exercise-id'));
  if (['reading', 'dialogue', 'listening'].includes(ex.type)) {
    const q = ex.question;
    if (q.type === 'true_false_notgiven') await page.locator(`[data-testid="tfng-option"][data-value="${q.answer}"]`).click();
    else await page.getByTestId('question-option').getByText(q.options[q.correct], { exact: true }).click();
  } else if (ex.type === 'cloze') {
    if (onCloze) await onCloze();
    for (const [i, g] of ex.gaps.entries()) await page.getByTestId('cloze-input').nth(i).fill(g.word);
  } else if (ex.type === 'order_paragraphs') {
    for (const id of ex.segments) await page.locator(`[data-testid="order-part"][data-seg-id="${orderToken(ex.id, id)}"]`).click();
  } else throw new Error(`unexpected ${ex.type}`);
  await page.getByTestId('check-button').click();
  await expect(page.getByTestId('result-strip')).toHaveAttribute('data-result', 'correct');
}

async function playToEnd(page, onCloze) {
  for (let guard = 0; guard < 40; guard++) {
    if (await page.getByTestId('lesson-done').isVisible()) break;
    await answerText(page, onCloze);
    await page.getByTestId('continue-button').click();
    await expect(page.getByTestId('exercise').or(page.getByTestId('lesson-done'))).toBeVisible();
  }
  await expect(page.getByTestId('lesson-done')).toBeVisible();
  await expect(page.getByTestId('done-score')).toContainText('100');
}

async function levelSheetHasB1After(page, track) {
  await page.getByTestId('level-bar').click();
  const rows = page.getByTestId('level-sheet').getByTestId('level-row');
  const ids = await rows.evaluateAll((els) => els.map((e) => e.dataset.packId));
  expect(ids.indexOf(`${track}-b1`)).toBe(ids.indexOf(`${track}-a2`) + 1);
  await expect(page.locator(`[data-testid="level-row"][data-pack-id="${track}-b1"]`)).toHaveAttribute('data-status', 'available');
}

test.describe.serial('English and French B1 for learners', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    for (const l of LEARNERS) {
      await deleteUserIfExists(page, l.username);
      const res = await page.request.post('/api/admin/users', {
        data: {
          username: l.username, displayName: l.displayName, role: 'child', audience: 'child', nativeLang: 'nl', uiLang: 'nl',
          avatar: 'owl', avatarBg: 'mint', password: l.password, showOnLogin: true, course: l.course,
        },
      });
      expect(res.status()).toBe(201);
    }
    await page.close();
  });
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    for (const l of LEARNERS) await deleteUserIfExists(page, l.username);
    await page.close();
  });

  test('English: B1 follows Flyers (A2); a B1 reading lesson, questions stepped through, to the end', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await syncClock(page);
    await loginChild(page, 'e2e-b1-en', 'b1en');
    await expect(page.locator('[data-testid="unit-node"][data-pack-id="en-b1"]').first()).toBeAttached();
    await levelSheetHasB1After(page, 'en');
    await shot(page, testInfo, 'en-level-sheet');
    await page.goto(`/lesson/${EN_READING.id}`);
    const questions = EN_READING.exercises.filter((e) => e.type === 'reading').length;
    await expect(page.getByTestId('question-step')).toHaveText(t('text.questionOf', 'nl', { n: 1, total: questions }));
    await shot(page, testInfo, 'en-b1-reading');
    await playToEnd(page);
  });

  test('English: a B1 dialogue plays its turns in two voices', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await syncClock(page);
    await loginChild(page, 'e2e-b1-en', 'b1en');
    const pub = await (await page.request.get('/api/content/packs/en-b1')).json();
    const text = pub.units[2].texts.find((x) => x.kind === 'dialogue');
    const urlA = new URL(text.turns.find((x) => x.speaker === 'A').audio, 'http://x').pathname;
    const urlB = new URL(text.turns.find((x) => x.speaker === 'B').audio, 'http://x').pathname;
    expect(urlA).not.toBe(urlB);
    await page.goto(`/lesson/${EN_DIALOGUE.id}`);
    await expect(page.getByTestId('dialogue-turn').first()).toBeVisible();
    await shot(page, testInfo, 'en-b1-dialogue');
    await hookPlaying(page);
    await page.getByTestId('text-play').click();
    await expect.poll(async () => played(page), { timeout: 30_000 }).toEqual(expect.arrayContaining([urlA, urlB]));
    await page.getByTestId('text-play-stop').click();
  });

  test('French: B1 follows A2; a B1 reading lesson with its cloze, to the end', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await syncClock(page);
    await loginChild(page, 'e2e-b1-fr', 'b1fr');
    await expect(page.locator('[data-testid="unit-node"][data-pack-id="fr-b1"]').first()).toBeAttached();
    await levelSheetHasB1After(page, 'fr');
    await shot(page, testInfo, 'fr-level-sheet');
    expect(FR_READING.exercises.some((e) => e.type === 'cloze')).toBe(true);
    await page.goto(`/lesson/${FR_READING.id}`);
    await playToEnd(page, () => shot(page, testInfo, 'fr-b1-cloze'));
  });
});
