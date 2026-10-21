import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import {
  ADMIN_LANG, answerCurrent, deleteUserIfExists, exercisesById, lessonOver, loginAdmin, loginChild, readManifest, readPack, serverNow, syncClock, t, txt,
} from './helpers.js';

// Practice ("Oefenen"), My mistakes, mascot poses, daily goal ring, badges, profile, sound effects and the
// admin progress report. Two fresh children, deleted again at the end: pia (history through the API) and pim (UI).

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const EN_FILES = readManifest().tracks.find((tr) => tr.id === 'en').packs.filter((p) => p.status === 'available').map((p) => p.file);
const byId = new Map(EN_FILES.flatMap((f) => [...exercisesById(readPack(f))]));
const LESSON = 'en-pre-a1-u01-l01';
const lessonExercises = [...byId.values()].filter((e) => e.id.startsWith(`${LESSON}-`));
const KIDS = { pia: 'pia1', pim: 'pim1' };

const shot = (page, testInfo, name) => {
  if (testInfo.project.name !== 'mobile') return null;
  fs.mkdirSync(outDir, { recursive: true });
  return page.screenshot({ path: path.join(outDir, `mobile-s6-${name}.png`) });
};

function rightAnswer(e) {
  switch (e.type) {
    case 'multiple_choice':
    case 'listen_choose':
      return txt(e.options.find((o) => o.correct).text);
    case 'match_pairs':
      return { mistakes: 0 };
    case 'build_sentence':
      return e.tokens;
    default:
      return e.answer;
  }
}
const wrongAnswer = (e) => (e.type === 'match_pairs' ? { mistakes: 2 } : e.type === 'build_sentence' ? [...e.tokens].reverse() : 'xyz');

async function createKid(page, username) {
  await deleteUserIfExists(page, username);
  const res = await page.request.post('/api/admin/users', {
    data: { username, displayName: username[0].toUpperCase() + username.slice(1), role: 'child', course: { track: 'en' }, uiLang: 'nl', avatar: 'frog', avatarBg: 'mint', password: KIDS[username] },
  });
  expect(res.status()).toBe(201);
}

/** Play the open practice session to its end through the UI. Returns the exercise ids seen. */
async function playPractice(page, { wrongFirst = false } = {}) {
  const seen = [];
  for (let guard = 0; guard < 40; guard++) {
    await expect(page.getByTestId('exercise').or(page.getByTestId('practice-done'))).toBeVisible();
    if (await page.getByTestId('practice-done').isVisible()) return seen;
    const wrong = wrongFirst && seen.length === 0;
    const { id } = await answerCurrent(page, byId, { wrong });
    seen.push(id);
    await page.getByTestId('continue-button').click();
  }
  throw new Error('practice did not finish');
}

test.describe.serial('Practice, mascots, daily goal, badges, profile, admin report', () => {
  const failed = lessonExercises.filter((e) => e.type === 'multiple_choice').slice(0, 4);

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    await createKid(page, 'pia');
    await createKid(page, 'pim');
    // pia: the first lesson, right first time everywhere; afterwards four of its words answered wrong (first tries)
    // several times, so they are due now and in "My mistakes".
    const kid = (await browser.newContext()).request;
    expect((await kid.post('/api/auth/login', { data: { username: 'pia', password: KIDS.pia } })).ok()).toBe(true);
    for (const e of lessonExercises) {
      const r = await kid.post('/api/progress/attempt', { data: { lessonId: LESSON, exerciseId: e.id, answer: rightAnswer(e), firstTry: true } });
      expect((await r.json()).correct, e.id).toBe(true);
    }
    const done = await kid.post(`/api/progress/lesson/${LESSON}/complete`, {
      data: { firstTryCorrect: lessonExercises.length, total: lessonExercises.length, startedAt: new Date(serverNow().getTime() - 240_000).toISOString() },
    });
    expect(done.ok()).toBe(true);
    for (let k = 0; k < 6; k++) {
      for (const e of failed) await kid.post('/api/progress/attempt', { data: { lessonId: LESSON, exerciseId: e.id, answer: wrongAnswer(e), firstTry: true } });
    }
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    await deleteUserIfExists(page, 'pia');
    await deleteUserIfExists(page, 'pim');
    await page.close();
  });

  test('before the first lesson: practice explains it unlocks later; after 17:00 without a lesson the mascot sleeps', async ({ page }, testInfo) => {
    await page.clock.setFixedTime(new Date('2026-10-02T18:30:00+02:00'));
    await loginChild(page, 'pim', KIDS.pim);
    await expect(page.getByTestId('home-mascot')).toHaveAttribute('data-pose', 'sleeping');
    await expect(page.getByTestId('home-mascot-line')).not.toHaveText('');
    await expect(page.getByTestId('practice-button')).toHaveAttribute('data-unlocked', 'false');
    await page.getByTestId('practice-button').click();
    await expect(page.getByTestId('practice-locked')).toContainText(t('practice.locked'));
    await shot(page, testInfo, 'practice-sheet-locked');
    await page.getByTestId('practice-sheet-close').click();
    await expect(page.getByTestId('practice-sheet')).toHaveCount(0);
  });

  test('daily goal: chosen on first login, the ring fills with the lesson; a perfect lesson shows its badges; sound effects play', async ({ page }, testInfo) => {
    await syncClock(page);
    await loginChild(page, 'pim', KIDS.pim);
    await expect(page.getByTestId('home-mascot')).toHaveAttribute('data-kind', 'otter');
    await expect(page.getByTestId('goal-card')).toBeVisible();
    await page.getByTestId('goal-card').getByTestId('goal-20').click();
    await expect(page.getByTestId('goal-card')).toHaveCount(0);
    const ring = page.getByTestId('goal-ring');
    await expect(ring).toHaveAttribute('data-goal', '20');
    await expect(ring).toHaveAttribute('data-percent', '0');
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, testInfo, 'home');

    // The first lesson through the UI: one wrong answer (encouraging pose), the rest right (happy pose).
    await page.locator(`[data-lesson-id="${LESSON}"]`).click();
    await expect(page.getByTestId('lesson')).toBeVisible();
    const first = await answerCurrent(page, byId, { wrong: true });
    await expect(page.getByTestId('result-mascot')).toHaveAttribute('data-pose', 'encouraging');
    await expect(page.getByTestId('mascot-line')).not.toHaveText('');
    await shot(page, testInfo, 'result-wrong');
    // The low tone plays once the question's clip has finished (speech first).
    await expect.poll(() => page.evaluate(() => window.__anzoSfx ?? [])).toEqual(['wrong']);
    await page.getByTestId('continue-button').click();
    await answerCurrent(page, byId);
    await expect(page.getByTestId('result-mascot')).toHaveAttribute('data-pose', 'happy');
    await shot(page, testInfo, 'result-correct');
    // Sound effects: a chime for right and a low tone for wrong (Web Audio, unlocked by the tap that opened the lesson).
    await expect.poll(() => page.evaluate(() => window.__anzoSfx ?? [])).toEqual(['wrong', 'correct']);
    await page.getByTestId('continue-button').click();
    for (let guard = 0; guard < 30 && !(await lessonOver(page)); guard++) {
      await answerCurrent(page, byId);
      await page.getByTestId('continue-button').click();
    }
    await expect(page.getByTestId('lesson-done')).toBeVisible();
    await expect(page.getByTestId('done-mascot')).toHaveAttribute('data-pose', 'celebrating');
    await expect(page.getByTestId('goal-reached')).toBeVisible();
    // Not perfect (one wrong): the first-lesson badge only.
    await expect(page.getByTestId('new-badge')).toHaveCount(1);
    await expect(page.getByTestId('new-badge')).toHaveAttribute('data-badge-id', 'first-lesson');
    expect(first.type).toBeTruthy();

    // Again, all right: perfect lesson.
    await page.getByTestId('again-button').click();
    for (let guard = 0; guard < 30 && !(await lessonOver(page)); guard++) {
      await answerCurrent(page, byId);
      await page.getByTestId('continue-button').click();
    }
    await expect(page.getByTestId('badge-card')).toBeVisible();
    await expect(page.getByTestId('new-badge')).toHaveAttribute('data-badge-id', 'perfect-lesson');
    await expect(page.getByTestId('badge-card')).toContainText(t('badges.perfect-lesson.title'));
    await expect(page.getByTestId('done-xp')).toHaveText(t('done.xpEarned', 'nl', { n: await page.getByTestId('done-xp').getAttribute('data-value') }));
    expect(await page.evaluate(() => window.__anzoSfx.filter((s) => s === 'done').length)).toBe(2);
    await shot(page, testInfo, 'lesson-done-badge');

    await page.getByTestId('done-continue').click();
    await expect(ring).toHaveAttribute('data-percent', '100');
    await expect(ring).toHaveAttribute('data-reached', 'true');

    // Profile: the badges earned, the rest locked with their condition; today's goal dot.
    await page.getByTestId('home-avatar-link').click();
    await expect(page.getByTestId('profile')).toBeVisible();
    await expect(page.locator('[data-testid="badge"][data-badge-id="perfect-lesson"]')).toHaveAttribute('data-earned', 'true');
    await expect(page.locator('[data-testid="badge"][data-badge-id="first-lesson"]')).toHaveAttribute('data-earned', 'true');
    await expect(page.locator('[data-testid="badge"][data-badge-id="streak-7"]')).toHaveAttribute('data-earned', 'false');
    await expect(page.locator('[data-testid="badge"][data-badge-id="streak-7"]')).toContainText(t('badges.streak-7.condition'));
    await expect(page.getByTestId('goal-day').last()).toHaveAttribute('data-reached', 'true');
    await shot(page, testInfo, 'profile');
  });

  test('sound effects: the Settings switch is stored and stays off after a reload', async ({ page }) => {
    await loginChild(page, 'pim', KIDS.pim);
    await page.goto('/settings');
    const toggle = page.getByTestId('sfx-toggle');
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await expect.poll(async () => (await (await page.request.get('/api/auth/me')).json()).user.soundEffects).toBe(false);
    await page.reload();
    await expect(page.getByTestId('sfx-toggle')).not.toBeChecked();
    // The daily goal can be changed here too.
    await page.getByTestId('settings-goal-picker').getByTestId('goal-50').click();
    await expect.poll(async () => (await (await page.request.get('/api/auth/me')).json()).user.dailyGoal).toBe(50);
    await page.getByTestId('settings-goal-picker').getByTestId('goal-20').click();
    await toggle.check();
    await expect.poll(async () => (await (await page.request.get('/api/auth/me')).json()).user.soundEffects).toBe(true);
  });

  test('"My mistakes" holds the exercises answered wrong', async ({ page }, testInfo) => {
    await loginChild(page, 'pia', KIDS.pia);
    await page.getByTestId('practice-button').click();
    const sheet = page.getByTestId('practice-sheet');
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId('practice-option-mistakes')).toContainText(t('practice.mistakesText', 'nl', { n: failed.length }));
    await shot(page, testInfo, 'practice-sheet');
    await page.getByTestId('practice-start-mistakes').click();
    await expect(page.getByTestId('practice')).toHaveAttribute('data-mode', 'mistakes');
    const ids = failed.map((e) => e.id);
    expect(ids).toContain(await page.getByTestId('exercise').getAttribute('data-exercise-id'));
    await page.getByTestId('quit-lesson').click();
    await expect(page.getByTestId('home')).toBeVisible();
  });

  test('a practice session through the UI: XP and streak update, the due count drops', async ({ page }, testInfo) => {
    await syncClock(page);
    await loginChild(page, 'pia', KIDS.pia);
    const button = page.getByTestId('practice-button');
    await expect(button).toHaveAttribute('data-due', String(failed.length));
    await expect(page.getByTestId('practice-due')).toHaveText(String(failed.length));
    const xpBefore = Number(await page.getByTestId('xp').innerText());
    await button.click();
    await page.getByTestId('practice-start-due').click();
    await expect(page.getByTestId('practice')).toHaveAttribute('data-mode', 'due');
    const seen = await playPractice(page, { wrongFirst: true });
    expect(seen.length).toBeGreaterThanOrEqual(7); // ≥ 6 exercises + the one answered wrong once
    // The due words are practised first (weakest first).
    expect(failed.map((e) => e.items[0])).toEqual(expect.arrayContaining([byId.get(seen[0]).items[0]]));
    await expect(page.getByTestId('practice-done')).toBeVisible();
    await expect(page.getByTestId('done-mascot')).toHaveAttribute('data-pose', 'celebrating');
    const xpEarned = Number(await page.getByTestId('done-xp').getAttribute('data-value'));
    const n = new Set(seen).size;
    expect(xpEarned).toBe(5 * (n - 1) + 2 + 10);
    await expect(page.getByTestId('done-streak')).toHaveText('1');
    await expect(page.getByTestId('new-badge').first()).toHaveAttribute('data-badge-id', 'first-practice');
    await shot(page, testInfo, 'practice-done');
    await page.getByTestId('done-continue').click();
    await expect(page.getByTestId('xp')).toHaveText(String(xpBefore + xpEarned));
    await expect(page.getByTestId('streak')).toHaveText('1');
    await expect(page.getByTestId('streak')).toHaveAttribute('data-active', 'true');
    const after = Number(await page.getByTestId('practice-button').getAttribute('data-due'));
    expect(after).toBeLessThan(failed.length);
  });

  test('admin progress page: chart, accuracy and weakest words for a child with history', async ({ page }, testInfo) => {
    await loginAdmin(page);
    await page.getByTestId('admin-user-pia').click();
    await page.getByTestId('admin-report-link').click();
    await expect(page.getByTestId('admin-progress-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: t('admin.reportTitle', ADMIN_LANG, { name: 'Pia' }) })).toBeVisible();
    await expect(page.getByTestId('xp-bar')).toHaveCount(30);
    const today = page.getByTestId('xp-bar').last();
    expect(Number(await today.getAttribute('data-lessons'))).toBeGreaterThan(0);
    expect(Number(await today.getAttribute('data-practice'))).toBeGreaterThan(0);
    await expect(page.getByTestId('streak-dots').locator('[data-active="true"]')).toHaveCount(1);
    expect(Number(await page.getByTestId('minutes-bar').last().getAttribute('data-minutes'))).toBeGreaterThan(0);
    await expect(page.getByTestId('report-practice')).toHaveText('1');
    const mc = page.locator('[data-testid="accuracy-row"][data-type="multiple_choice"]');
    expect(Number(await mc.getAttribute('data-total'))).toBeGreaterThan(0);
    await expect(mc).toContainText('%');
    const weak = page.getByTestId('weak-item');
    expect(await weak.count()).toBeGreaterThan(0);
    expect(await weak.count()).toBeLessThanOrEqual(20);
    await expect(weak.first()).toHaveAttribute('data-strength', /^[0-5]$/);
    await shot(page, testInfo, 'admin-progress-top');
    await page.getByTestId('report-accuracy').scrollIntoViewIfNeeded();
    await shot(page, testInfo, 'admin-progress-scrolled');
    await page.getByTestId('report-weakest').scrollIntoViewIfNeeded();
    await shot(page, testInfo, 'admin-progress-weakest');
  });
});
