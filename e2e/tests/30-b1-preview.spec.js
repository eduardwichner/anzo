import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { test, expect } from '@playwright/test';
import { ADMIN_LANG, hookPlaying, loginAdmin, loginChild, orderToken, played, readManifest, readPack, t } from './helpers.js';

// The admin plays the Dutch B1 pilot (status preview) in Admin → Levels → Preview — reading (tap a
// glossary word, play the text), dialogue, cloze with finite-verb gaps (per-gap feedback), ordering, listening (the
// transcript after answering) — and nothing is stored; a learner never sees a preview pack.

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const shot = async (page, testInfo, name) => {
  if (testInfo.project.name !== 'mobile') return;
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `mobile-30-${name}.png`) });
};
const pack = readPack('nl/b1.json');
const unit = pack.units[0];
const byId = new Map(unit.lessons.flatMap((l) => l.exercises).map((e) => [e.id, e]));
const TABLES = ['attempts', 'lesson_progress', 'lesson_completions', 'item_strength', 'practice_sessions', 'user_stats'];
const counts = () => {
  const db = new Database(path.join(process.env.ANZO_E2E_DATA_DIR, 'anzo.sqlite'), { readonly: true });
  try {
    return Object.fromEntries(TABLES.map((x) => [x, db.prepare(`SELECT COUNT(*) FROM ${x}`).pluck().get()]));
  } finally {
    db.close();
  }
};

/** Answer the text exercise on screen (wrong: a wrong option / gap / order). Returns the exercise. */
async function answerText(page, { wrong = false } = {}) {
  const section = page.getByTestId('exercise');
  await expect(section).toBeVisible();
  const ex = byId.get(await section.getAttribute('data-exercise-id'));
  if (['reading', 'dialogue', 'listening'].includes(ex.type)) {
    const q = ex.question;
    if (q.type === 'true_false_notgiven') {
      const right = String(q.answer);
      const value = wrong ? ['true', 'false', 'not_given'].find((v) => v !== right) : right;
      await page.locator(`[data-testid="tfng-option"][data-value="${value}"]`).click();
    } else {
      const text = q.options[wrong ? (q.correct + 1) % q.options.length : q.correct];
      await page.getByTestId('question-option').getByText(text, { exact: true }).click();
    }
  } else if (ex.type === 'cloze') {
    const inputs = page.getByTestId('cloze-input');
    for (let i = 0; i < ex.gaps.length; i++) await inputs.nth(i).fill(wrong && i === 0 ? 'fout' : ex.gaps[i].word);
  } else if (ex.type === 'order_paragraphs') {
    const order = wrong ? [...ex.segments].reverse() : ex.segments;
    for (const id of order) await page.locator(`[data-testid="order-part"][data-seg-id="${orderToken(ex.id, id)}"]`).click();
  }
  await page.getByTestId('check-button').click();
  await expect(page.getByTestId('result-strip')).toHaveAttribute('data-result', wrong ? 'wrong' : 'correct');
  return ex;
}

async function openPreviewLesson(page, lessonId) {
  await page.goto('/levels');
  await page.locator('[data-testid="level-row"][data-pack-id="nl-b1"]').getByTestId('level-preview').click();
  await expect(page.getByTestId('preview-pack')).toBeVisible();
  await page.locator(`[data-testid="preview-lesson"][data-lesson-id="${lessonId}"]`).click();
  await expect(page.getByTestId('preview-banner')).toHaveText(t('admin.preview.banner', ADMIN_LANG));
}

test.describe.serial('B1 pilot in Admin → Levels → Preview', () => {
  let before;
  test.beforeAll(() => { before = counts(); });

  test('reading: the text with a glossary popover and sentence-by-sentence audio, its questions, the cloze, the ordering', async ({ page }, testInfo) => {
    await loginAdmin(page);
    await page.goto('/levels');
    // available, and the admin plays any level in Admin → Levels → Preview
    const status = readManifest().tracks.find((x) => x.id === 'nl').packs.find((p) => p.id === 'nl-b1').status;
    await expect(page.locator('[data-testid="level-row"][data-pack-id="nl-b1"]')).toHaveAttribute('data-status', status);
    await openPreviewLesson(page, `${unit.id}-l01`);
    await hookPlaying(page);
    const text = page.getByTestId('text');
    await expect(text).toHaveAttribute('data-text-id', 'nl-b1-t01');
    await expect(page.getByTestId('text-paragraph')).toHaveCount(unit.texts[0].paragraphs.length);
    // a glossary word: its meaning in the popover
    await page.getByTestId('gloss-word').first().click();
    await expect(page.getByTestId('word-popover')).toContainText('local newspaper');
    await shot(page, testInfo, 'reading-popover');
    // ▶ reads the text sentence by sentence: the current sentence is highlighted
    await page.getByTestId('text-play').click();
    await expect(page.locator('[data-testid="text-seg"][data-current="true"]')).toHaveCount(1);
    await expect.poll(async () => (await played(page)).length).toBeGreaterThan(0);
    await page.getByTestId('text-play-stop').click();
    await expect(page.locator('[data-testid="text-seg"][data-current="true"]')).toHaveCount(0);
    // one screen per text: "Question 1 of 5" with a dot per question; the text stays the same element between questions
    const questions = unit.texts[0].questions.length;
    await expect(page.getByTestId('question-step')).toHaveText(t('text.questionOf', ADMIN_LANG, { n: 1, total: questions }));
    await expect(page.getByTestId('step-dot')).toHaveCount(questions);
    await expect(page.locator('[data-testid="step-dot"][data-state="current"]')).toHaveCount(1);
    await page.getByTestId('text').evaluate((el) => { el.dataset.mark = 'same'; });
    const wide = testInfo.project.name === 'desktop';
    if (wide) {
      // side by side: the text on the left, the question on the right; nothing folds
      const textBox = await page.locator('.text-block-text').boundingBox();
      const qBox = await page.locator('.text-block-question').boundingBox();
      expect(qBox.x).toBeGreaterThan(textBox.x + textBox.width - 1);
      await expect(page.getByTestId('text-toggle')).toBeHidden();
    } else {
      await expect(page.getByTestId('text')).toHaveAttribute('data-open', 'true');
      await shot(page, testInfo, 'text-question-1');
    }
    await answerText(page);
    await page.getByTestId('continue-button').click();
    await expect(page.getByTestId('question-step')).toHaveText(t('text.questionOf', ADMIN_LANG, { n: 2, total: questions }));
    await expect(page.getByTestId('text')).toHaveAttribute('data-mark', 'same');
    await expect(page.locator('[data-testid="step-dot"][data-state="right"]')).toHaveCount(1);
    if (!wide) {
      // on a phone the text folds to a "Show text" bar after the first question, and opens again with one tap
      await expect(page.getByTestId('text')).toHaveAttribute('data-open', 'false');
      await expect(page.getByTestId('text-paragraph')).toHaveCount(0);
      await expect(page.getByTestId('text-toggle')).toHaveText(t('text.show', ADMIN_LANG));
      await shot(page, testInfo, 'text-question-2-folded');
      await page.getByTestId('text-toggle').click();
      await expect(page.getByTestId('text-paragraph')).toHaveCount(unit.texts[0].paragraphs.length);
      await shot(page, testInfo, 'text-question-2-open');
    }

    let clozeSeen = false;
    for (let guard = 0; guard < 20; guard++) {
      if (await page.getByTestId('preview-pack').isVisible()) break;
      const id = await page.getByTestId('exercise').getAttribute('data-exercise-id');
      const ex = byId.get(id);
      if (ex.type === 'cloze' && !clozeSeen) {
        clozeSeen = true;
        await expect(page.locator('[data-testid="cloze-gap"][data-kind="finite_verb"]')).toHaveCount(3);
        await answerText(page, { wrong: true });
        // per-gap feedback: the first gap wrong with the expected word, the others right
        await expect(page.locator('[data-testid="cloze-gap"][data-gap="1"]')).toHaveAttribute('data-result', 'wrong');
        await expect(page.locator('[data-testid="cloze-gap"][data-gap="1"]').getByTestId('cloze-expected')).toHaveText(ex.gaps[0].word);
        await expect(page.locator('[data-testid="cloze-gap"][data-gap="2"]')).toHaveAttribute('data-result', 'right');
        await shot(page, testInfo, 'cloze-feedback');
      } else {
        if (ex.type === 'order_paragraphs') await shot(page, testInfo, 'ordering');
        await answerText(page);
      }
      await page.getByTestId('continue-button').click();
      await expect(page.getByTestId('exercise').or(page.getByTestId('preview-pack'))).toBeVisible();
    }
    // the wrong cloze came back and the lesson ended in the lesson list, with the first-try score
    await expect(page.getByTestId('preview-done')).toBeVisible();
    expect(clozeSeen).toBe(true);
  });

  test('dialogue: chat bubbles with the speakers\' names', async ({ page }, testInfo) => {
    await loginAdmin(page);
    await openPreviewLesson(page, `${unit.id}-l02`);
    await expect(page.getByTestId('dialogue-turn')).toHaveCount(8);
    await expect(page.locator('[data-testid="dialogue-turn"][data-speaker="A"]').first()).toContainText('Karim');
    await expect(page.locator('[data-testid="dialogue-turn"][data-speaker="B"]').first()).toContainText('Lien');
    await shot(page, testInfo, 'dialogue');
    await answerText(page);
  });

  test('listening: one player per text, its questions stepped; the transcript once every question of the text is answered', async ({ page }, testInfo) => {
    await loginAdmin(page);
    await openPreviewLesson(page, `${unit.id}-review`);
    await expect(page.getByTestId('listening-player')).toBeVisible();
    await expect(page.getByTestId('text')).toHaveCount(0);
    await expect(page.getByTestId('show-transcript')).toHaveCount(0);
    const n = unit.texts[0].listeningQuestions.length;
    await expect(page.getByTestId('question-step')).toHaveText(t('text.questionOf', ADMIN_LANG, { n: 1, total: n }));
    await shot(page, testInfo, 'listening-before');
    for (let i = 1; i < n; i++) {
      await answerText(page);
      await expect(page.getByTestId('show-transcript')).toHaveCount(0); // later questions would be given away
      await page.getByTestId('continue-button').click();
      await expect(page.getByTestId('question-step')).toHaveText(t('text.questionOf', ADMIN_LANG, { n: i + 1, total: n }));
    }
    await answerText(page);
    await page.getByTestId('show-transcript').click();
    await expect(page.getByTestId('transcript')).toBeVisible();
    await expect(page.locator('[data-testid="transcript"] .text-translation').first()).toBeVisible();
    await shot(page, testInfo, 'listening-after');
  });

  test('nothing the admin played was stored', () => {
    expect(counts()).toEqual(before);
  });

  // Every level of the manifest is available, so no pack is in preview or on the roadmap: a learner sees
  // only available packs and never the Preview button (the preview → roadmap rule itself: server/test/api.test.js).
  test('a learner never sees a pack that is not available', async ({ page }) => {
    await loginChild(page, 'kid1');
    const tracks = (await (await page.request.get('/api/content/tracks')).json()).tracks;
    expect(tracks.find((x) => x.id === 'en').packs.every((p) => p.status === 'available')).toBe(true);
    await page.goto('/levels');
    await expect(page.locator('[data-testid="level-row"][data-pack-id="en-b2"]')).toHaveAttribute('data-status', 'available');
    await expect(page.getByTestId('level-preview')).toHaveCount(0);
  });
});
