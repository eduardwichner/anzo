import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { answerB2, deleteUserIfExists, exercisesById, hookPlaying, loginAdmin, loginChild, played, readPack, syncClock } from './helpers.js';

// B2 for learners. An adult (Dutch from English, from B2) sees the B2 core on the path with
// the two branch packs after it (optional, marked as branches on the path and in the level sheet) and plays a branch
// lesson to the end; English and French learners (from B1) see B2 right after B1 and play a B2 text lesson to the end
// (gapped text, summary, word formation, open cloze …); a French B2 dialogue plays its turns in two voices. Mobile
// screenshots: the Dutch path with its branches, the level sheet, an English and a French B2 text. Self-restoring: the
// learners are deleted at the end.

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const shot = async (page, testInfo, name) => {
  if (testInfo.project.name !== 'mobile') return;
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `mobile-39-${name}.png`) });
};
const WORK = readPack('nl/b2-work.json');
const EN = readPack('en/b2.json');
const FR = readPack('fr/b2.json');
const byId = new Map([...exercisesById(WORK), ...exercisesById(EN), ...exercisesById(FR)]);
const lessonWith = (unit, type) => unit.lessons.find((l) => l.exercises.some((e) => e.type === type));
const WORK_LESSON = WORK.units[0].lessons[0]; // nl-b2-work-u01-l01: vocabulary of applying for a job
const EN_TEXT = lessonWith(EN.units[0], 'gap_sentence'); // en-b2-u01: the reading text with its B2 kinds
const FR_TEXT = lessonWith(FR.units[6], 'gap_sentence'); // fr-b2-u07: ce que nous jetons
const FR_DIALOGUE_UNIT = FR.units.findIndex((u) => u.lessons.some((l) => l.exercises.some((e) => e.type === 'dialogue')));
const LEARNERS = [
  { username: 'e2e-b2-nl', displayName: 'Dana', password: 'b2nl', nativeLang: 'en', uiLang: 'en', audience: 'adult', course: { track: 'nl', startPack: 'nl-b2' } },
  { username: 'e2e-b2-en', displayName: 'Zoë', password: 'b2en', nativeLang: 'nl', uiLang: 'nl', audience: 'child', course: { track: 'en', startPack: 'en-b1' } },
  { username: 'e2e-b2-fr', displayName: 'Ana', password: 'b2fr', nativeLang: 'nl', uiLang: 'nl', audience: 'child', course: { track: 'fr', startPack: 'fr-b1' } },
];

async function playToEnd(page, onShown = async () => {}) {
  for (let guard = 0; guard < 60; guard++) {
    await expect(page.getByTestId('exercise').or(page.getByTestId('lesson-done'))).toBeVisible();
    if (await page.getByTestId('lesson-done').isVisible()) break;
    const ex = byId.get(await page.getByTestId('exercise').getAttribute('data-exercise-id'));
    await onShown(ex);
    await answerB2(page, byId);
    await page.getByTestId('continue-button').click();
  }
  await expect(page.getByTestId('lesson-done')).toBeVisible();
  await expect(page.getByTestId('done-score')).toContainText('100');
}

async function levelSheetIds(page) {
  await page.getByTestId('level-bar').click();
  return page.getByTestId('level-sheet').getByTestId('level-row').evaluateAll((els) => els.map((e) => e.dataset.packId));
}

test.describe.serial('B2 for learners: Dutch with branches, English and French', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    for (const l of LEARNERS) {
      await deleteUserIfExists(page, l.username);
      const res = await page.request.post('/api/admin/users', {
        data: {
          username: l.username, displayName: l.displayName, role: 'child', audience: l.audience, nativeLang: l.nativeLang, uiLang: l.uiLang,
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

  test('Dutch: the branches follow the B2 core, optional; a branch lesson to the end', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await syncClock(page);
    await loginChild(page, 'e2e-b2-nl', 'b2nl');
    await expect(page.locator('[data-testid="unit-node"][data-pack-id="nl-b2"]').first()).toBeAttached();
    const headings = page.getByTestId('pack-heading');
    const order = await headings.evaluateAll((els) => els.map((e) => [e.dataset.packId, e.dataset.branch]));
    const at = (id) => order.findIndex(([p]) => p === id);
    expect(at('nl-b2-work')).toBeGreaterThan(at('nl-b2'));
    expect(at('nl-b2-study')).toBeGreaterThan(at('nl-b2'));
    for (const id of ['nl-b2-work', 'nl-b2-study']) expect(order[at(id)][1]).toBe('true');
    expect(order[at('nl-b2')][1]).toBe('false');
    await page.locator('[data-testid="pack-heading"][data-pack-id="nl-b2-work"]').scrollIntoViewIfNeeded();
    await shot(page, testInfo, 'nl-b2-branches');
    const ids = await levelSheetIds(page);
    expect(ids.indexOf('nl-b2-work')).toBeGreaterThan(ids.indexOf('nl-b2'));
    for (const id of ['nl-b2-work', 'nl-b2-study']) {
      await expect(page.locator(`[data-testid="level-row"][data-pack-id="${id}"]`)).toHaveAttribute('data-branch', 'true');
    }
    await shot(page, testInfo, 'nl-b2-level-sheet');
    await page.goto(`/lesson/${WORK_LESSON.id}`);
    await playToEnd(page);
  });

  test('English: B2 follows B1; a B2 text lesson (gapped text, summary, word formation, open cloze) to the end', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await syncClock(page);
    await loginChild(page, 'e2e-b2-en', 'b2en');
    const ids = await levelSheetIds(page);
    expect(ids.indexOf('en-b2')).toBe(ids.indexOf('en-b1') + 1);
    await expect(page.locator('[data-testid="level-row"][data-pack-id="en-b2"]')).toHaveAttribute('data-status', 'available');
    await page.goto(`/lesson/${EN_TEXT.id}`);
    await playToEnd(page, async (ex) => { if (ex.type === 'gap_sentence') await shot(page, testInfo, 'en-b2-gapped'); });
  });

  test('French: B2 follows B1; a B2 text lesson to the end, and a dialogue in two voices', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    await syncClock(page);
    await loginChild(page, 'e2e-b2-fr', 'b2fr');
    const ids = await levelSheetIds(page);
    expect(ids.indexOf('fr-b2')).toBe(ids.indexOf('fr-b1') + 1);
    await page.goto(`/lesson/${FR_TEXT.id}`);
    await playToEnd(page, async (ex) => { if (ex.type === 'word_form') await shot(page, testInfo, 'fr-b2-word-form'); });
    const pub = await (await page.request.get('/api/content/packs/fr-b2')).json();
    const text = pub.units[FR_DIALOGUE_UNIT].texts.find((x) => x.kind === 'dialogue');
    const urlA = new URL(text.turns.find((x) => x.speaker === 'A').audio, 'http://x').pathname;
    const urlB = new URL(text.turns.find((x) => x.speaker === 'B').audio, 'http://x').pathname;
    expect(urlA).not.toBe(urlB);
    await page.goto(`/lesson/${lessonWith(FR.units[FR_DIALOGUE_UNIT], 'dialogue').id}`);
    await expect(page.getByTestId('dialogue-turn').first()).toBeVisible();
    await hookPlaying(page);
    await page.getByTestId('text-play').click();
    await expect.poll(async () => played(page), { timeout: 30_000 }).toEqual(expect.arrayContaining([urlA, urlB]));
    await page.getByTestId('text-play-stop').click();
  });
});
