import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { ADMIN_LANG, answerB2, exercisesById, hookPlaying, loginAdmin, orderToken, readPack, t } from './helpers.js';

// Every B2 exercise kind played through the UI in Admin → Levels → Preview on the Dutch B2 pilot
// (nl-b2 unit 1): a gapped text (per-gap feedback, the right sentence shown), a whole-text summary, word formation (the
// stem beside each gap, "right word, other form"), multiple matching, an open cloze (another word that fits), key word
// transformations, a word-formation fill-in and a listening completion; a long text in its own scroll pane on a phone, with
// ⏸ / ▶ and "3 / 19". Runs on desktop, mobile and mobile-webkit; nothing is stored (preview).

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const shot = async (page, testInfo, name) => {
  if (testInfo.project.name !== 'mobile') return;
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `mobile-38-${name}.png`) });
};
const pack = readPack('nl/b2.json');
const unit = pack.units[0];
const byId = exercisesById(pack);
const lessonWith = (type) => unit.lessons.find((l) => l.exercises.some((e) => e.type === type || e.question?.type === type));
const GAPPED = lessonWith('gap_sentence');
const MATCHING = lessonWith('match_texts');
const REVIEW = unit.lessons.find((l) => l.id.endsWith('-review'));
const LISTENING = unit.lessons.find((l) => l.id.endsWith('-listening'));
/** Play the open lesson to the end; `wrongFirst(ex)` = answer that one wrong on its first try; `onShown(ex)` before answering. */
async function playLesson(page, { wrongFirst = () => false, onShown = async () => {}, onResult = async () => {} } = {}) {
  const wrongDone = new Set();
  // the end of a preview lesson is the pack's page again ("Lesson played: n% …", nothing stored)
  const end = page.getByTestId('preview-pack');
  for (let guard = 0; guard < 60; guard++) {
    await expect(page.getByTestId('exercise').or(end)).toBeVisible();
    if (await end.isVisible()) return;
    const ex = byId.get(await page.getByTestId('exercise').getAttribute('data-exercise-id'));
    await onShown(ex);
    const wrong = !wrongDone.has(ex.id) && wrongFirst(ex);
    if (wrong) wrongDone.add(ex.id);
    await answerB2(page, byId, { wrong });
    await onResult(ex, wrong);
    await page.getByTestId('continue-button').click();
  }
  throw new Error('lesson did not finish');
}

const open = async (page, lesson) => {
  await page.goto(`/admin/preview/nl-b2/${lesson.id}`);
  await expect(page.getByTestId('preview-banner')).toHaveText(t('admin.preview.banner', ADMIN_LANG));
};

test.describe.serial('B2 exercise kinds (Dutch B2 pilot, admin preview)', () => {
  test('gapped text, summary, the stepped questions on a long text, word formation', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await loginAdmin(page);
    await open(page, GAPPED);
    await playLesson(page, {
      wrongFirst: (ex) => ex.type === 'gap_sentence' || ex.type === 'word_form',
      onShown: async (ex) => {
        if (ex.type === 'gap_sentence') {
          await expect(page.getByTestId('gapped-slot')).toHaveCount(ex.gaps.length);
          await expect(page.getByTestId('gapped-option')).toHaveCount(ex.gaps.length + ex.extra.length);
          await shot(page, testInfo, 'b2-gapped-text');
        }
        if (ex.question?.type === 'summary') {
          await expect(page.getByTestId('exercise-instruction')).toHaveText(t('exercise.reading.summary', ADMIN_LANG));
          await expect(page.getByTestId('question-text')).toHaveCount(0);
          // a long text: on a phone it scrolls in its own pane and the question stays in view
          const text = page.getByTestId('text');
          if (testInfo.project.name !== 'desktop') {
            await expect(text).toHaveAttribute('data-bounded', 'true');
            await expect(page.getByTestId('question-option').first()).toBeInViewport();
          }
          await shot(page, testInfo, 'b2-long-text-summary');
          // the text read aloud: progress, ⏸ holds it, ▶ goes on
          await hookPlaying(page);
          await text.getByTestId('text-play').click();
          await expect(text.getByTestId('text-play-progress')).toHaveText(/^1 \/ \d+$/);
          await text.getByTestId('text-play-pause').click();
          await expect(text.getByTestId('text-play-resume')).toBeVisible();
          await text.getByTestId('text-play-resume').click();
          await expect(text.getByTestId('text-play-pause')).toBeVisible();
          await text.getByTestId('text-play-stop').click();
          await expect(text.getByTestId('text-play')).toBeVisible();
        }
        if (ex.type === 'word_form') {
          await expect(page.getByTestId('cloze-stem')).toHaveCount(ex.gaps.length);
          await expect(page.getByTestId('cloze-stem').first()).toHaveText(ex.gaps[0].stem);
          await shot(page, testInfo, 'b2-word-form');
        }
      },
      onResult: async (ex, wrong) => {
        if (ex.type === 'gap_sentence' && wrong) {
          await expect(page.locator('[data-testid="gapped-gap"][data-result="wrong"]')).toHaveCount(2);
          await expect(page.getByTestId('gapped-expected').first()).toBeVisible();
          await shot(page, testInfo, 'b2-gapped-text-result');
        }
        if (ex.type === 'word_form' && wrong) await expect(page.getByTestId('cloze-form-note').first()).toHaveText(t('text.formNote', ADMIN_LANG));
      },
    });
    await expect(page.getByTestId('preview-pack')).toBeVisible();
  });

  test('multiple matching (per-row feedback) and an open cloze', async ({ page }, testInfo) => {
    await loginAdmin(page);
    await open(page, MATCHING);
    await playLesson(page, {
      wrongFirst: (ex) => ex.question?.type === 'match_texts',
      onShown: async (ex) => {
        if (ex.question?.type === 'match_texts') {
          await expect(page.getByTestId('match-row')).toHaveCount(ex.question.statements.length);
          await expect(page.getByTestId('paragraph-label')).toHaveText(ex.question.labels); // each short text under its name
          await expect(page.getByTestId('check-button')).toBeDisabled(); // every statement needs its person first
          await shot(page, testInfo, 'b2-match-texts');
        }
        if (ex.type === 'open_cloze') {
          await expect(page.locator('.cloze-hint')).toHaveCount(0); // no hints
          await shot(page, testInfo, 'b2-open-cloze');
        }
      },
      onResult: async (ex, wrong) => {
        if (ex.question?.type === 'match_texts' && wrong) {
          await expect(page.locator('[data-testid="match-row"][data-result="wrong"]')).toHaveCount(1);
          await expect(page.getByTestId('match-expected')).toHaveText(ex.question.labels[ex.question.statements[0].paragraph - 1]);
        }
      },
    });
  });

  test('the review: key word transformations (a wrong one shows a right answer) and word-formation fill-ins', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await loginAdmin(page);
    await open(page, REVIEW);
    let shown = 0;
    await playLesson(page, {
      wrongFirst: (ex) => ex.type === 'transform' && ex.id === REVIEW.exercises.find((e) => e.type === 'transform').id,
      onShown: async (ex) => {
        if (ex.type === 'transform' && !shown++) {
          await expect(page.getByTestId('transform-key')).toHaveText(ex.key);
          await expect(page.getByTestId('transform-from')).toHaveText(ex.from);
          await shot(page, testInfo, 'b2-transform');
        }
        if (ex.type === 'fill_blank' && ex.kind === 'word_form') await expect(page.getByTestId('fill-stem')).toHaveText(ex.stem);
      },
      onResult: async (ex, wrong) => {
        if (ex.type === 'transform' && wrong) {
          await expect(page.getByTestId('transform-correct')).toContainText(ex.answers[0]);
          await shot(page, testInfo, 'b2-transform-result');
        }
      },
    });
  });

  test('listening: a completion typed (accents and case free), then the transcript', async ({ page }, testInfo) => {
    await loginAdmin(page);
    await open(page, LISTENING);
    await playLesson(page, {
      onShown: async (ex) => {
        if (ex.question?.type === 'complete') {
          await expect(page.getByTestId('complete-input')).toBeVisible();
          await shot(page, testInfo, 'b2-listening-complete');
        }
      },
    });
  });
});
