import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import {
  ADMIN_LANG, answerCurrent, deleteUserIfExists, exercisesById, loginAdmin, loginChild, loginLang, logoutAnywhere, playToEnd, playUntil, readManifest,
  readPack, t,
} from './helpers.js';

// Dutch for English speakers. An adult learner with native language English and an English interface sees only
// the Dutch course (lion, Belgian Dutch), starts at A2 with Start and A1 open, hears the clips, gets the "In the
// Netherlands" note, builds a split separable verb in either order, and gets the adult wording next to the flag. A
// Dutch-speaking child is never offered the Dutch course. Self-restoring: the learner is deleted at the end.

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const shot = (page, testInfo, name) => {
  if (testInfo.project.name !== 'mobile') return null;
  fs.mkdirSync(outDir, { recursive: true });
  return page.screenshot({ path: path.join(outDir, `mobile-s9-${name}.png`) });
};
const NL = readManifest().tracks.find((tr) => tr.id === 'nl');
const packs = NL.packs.filter((p) => p.status === 'available').map((p) => readPack(p.file));
const byId = new Map(packs.flatMap((p) => [...exercisesById(p)]));
const pack = (id) => packs.find((p) => p.id === id);
const current = (page) => page.locator('[data-testid="lesson-node"][data-state="current"]');
const USER = 'e2e-dutch';

/** The first lesson of a pack with an exercise matching `pred`: { lesson, exercise }. */
function find(packId, pred) {
  for (const u of pack(packId).units) for (const l of u.lessons) for (const e of l.exercises) if (pred(e, u)) return { lesson: l, exercise: e };
  throw new Error(`no exercise in ${packId}`);
}
const alsoNlIds = new Set(packs.flatMap((p) => p.units.flatMap((u) => u.vocabulary.filter((v) => v.alsoNL).map((v) => v.id))));

async function createLearner(page) {
  await loginAdmin(page);
  await deleteUserIfExists(page, USER);
  const res = await page.request.post('/api/admin/users', {
    data: {
      username: USER, displayName: 'Dee', role: 'child', audience: 'adult', nativeLang: 'en', uiLang: 'en', avatar: 'fox', avatarBg: 'sky',
      password: 'dee-e2e', showOnLogin: false, course: { track: 'nl', startPack: 'nl-a2' },
    },
  });
  expect(res.status()).toBe(201);
  await page.goto('/admin');
  await logoutAnywhere(page);
}

async function loginLearner(page) {
  await page.goto('/login');
  await page.getByTestId('login-other').click();
  await page.locator('#login-username').fill(USER);
  await page.locator('#login-password').fill('dee-e2e');
  await page.getByTestId('login').getByRole('button', { name: t('login.submit', await loginLang(page)) }).click();
  await expect(page.getByTestId('home')).toBeVisible();
}

test.describe.serial('Dutch for English speakers', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    const page = await (await browser.newContext({ ...testInfo.project.use })).newPage();
    await createLearner(page);
    await page.context().close();
  });
  test.afterAll(async ({ browser }, testInfo) => {
    const page = await (await browser.newContext({ ...testInfo.project.use })).newPage();
    await loginAdmin(page);
    await deleteUserIfExists(page, USER);
    await page.goto('/admin');
    await logoutAnywhere(page);
    await page.context().close();
  });

  test('Dutch is her course, French for English speakers the one offered; the path starts at A2 with the lion; Start and A1 stay open; a lesson plays with clips', async ({ page }, testInfo) => {
    const clips = [];
    page.on('request', (r) => { if (r.url().includes('/audio/nl/')) clips.push(r.url()); });
    await loginLearner(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('home')).toHaveAttribute('data-track', 'nl');
    await expect(page.getByTestId('course-chip')).toHaveAttribute('data-track', 'nl');
    await expect(page.getByTestId('home-mascot')).toHaveAttribute('data-kind', 'lion');
    const courses = await (await page.request.get('/api/courses')).json();
    expect(courses.courses.map((c) => c.track)).toEqual(['nl']);
    expect(courses.offered.map((c) => c.track)).toEqual(['fr-en']);
    await expect(current(page)).toHaveAttribute('data-lesson-id', /^nl-a2-u01-/);
    await shot(page, testInfo, 'home-lion-chip');

    // The level sheet: Start and A1 below the start level are open, A2 is the current level.
    await page.getByTestId('level-bar').click();
    await expect(page.getByTestId('level-sheet')).toBeVisible();
    await shot(page, testInfo, 'level-sheet');
    await page.getByTestId('level-sheet-close').click();
    const startLesson = pack('nl-pre-a1').units[0].lessons[0].id;
    await page.goto(`/lesson/${startLesson}`);
    await expect(page.getByTestId('exercise')).toBeVisible();
    await page.goto('/');

    await current(page).click();
    await playToEnd(page, byId);
    expect(clips.length).toBeGreaterThan(0);
    await page.getByTestId('done-continue').click();
    await expect(page.getByTestId('home')).toBeVisible();
  });

  test('a split separable verb is built in either order; the "In the Netherlands" note shows after an answer', async ({ page }, testInfo) => {
    await loginLearner(page);
    // A1 u12 "My day": a build whose alternative order moves the particle sentence (Om half acht ga ik weg / Ik ga om half acht weg).
    const { lesson, exercise } = find('nl-a1', (e) => e.type === 'build_sentence' && e.acceptAlso?.length && /\b(op|weg|uit|aan|af|thuis|terug)$/.test(e.answer.replace(/[.!?]$/, '')));
    await page.goto(`/lesson/${lesson.id}`);
    await playUntil(page, byId, exercise.id);
    await shot(page, testInfo, 'build-separable');
    // Build the listed alternative with the given tiles (word order is graded; case and punctuation are not).
    const norm = (w) => w.toLowerCase().replace(/[.,!?]/g, '');
    const left = [...exercise.tokens];
    for (const w of exercise.acceptAlso[0].split(/\s+/)) {
      const k = left.findIndex((tok) => norm(tok) === norm(w));
      await page.getByTestId('bank-token').and(page.getByRole('button', { name: left[k], exact: true })).first().click();
      left.splice(k, 1);
    }
    await page.getByTestId('check-button').click();
    await expect(page.getByTestId('result-strip')).toHaveAttribute('data-result', 'correct');
    await page.getByTestId('continue-button').click();

    // An exercise about a word with a Netherlands form: the note names it after the answer.
    const also = find('nl-a1', (e) => ['multiple_choice', 'fill_blank'].includes(e.type) && e.items.length === 1 && alsoNlIds.has(e.items[0]));
    await page.goto(`/lesson/${also.lesson.id}`);
    await playUntil(page, byId, also.exercise.id);
    await answerCurrent(page, byId);
    await expect(page.getByTestId('also-nl').first()).toBeVisible();
    await shot(page, testInfo, 'also-nl');
  });

  test('the adult wording next to the 🚩 flag', async ({ page }) => {
    await loginLearner(page);
    await current(page).click();
    await answerCurrent(page, byId);
    await page.getByTestId('report-info').click();
    await expect(page.getByTestId('report-info-text')).toHaveText(t('report.infoTextAdult', 'en'));
  });

  test('a Dutch-speaking child is never offered the Dutch course', async ({ page }) => {
    await loginChild(page, 'kid1');
    const courses = await (await page.request.get('/api/courses')).json();
    expect([...courses.courses, ...courses.offered].map((c) => c.track)).not.toContain('nl');
    await page.getByTestId('course-chip').click();
    await expect(page.getByTestId('course-sheet')).toBeVisible();
    // the sheet's list loads a moment later (isVisible does not wait)
    await page.getByTestId('course-add').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (await page.getByTestId('course-add').isVisible()) await page.getByTestId('course-add').click();
    await expect(page.getByTestId('course-add-nl')).toHaveCount(0);
  });

  test('Admin → Voices lists three voices with their samples', async ({ page }, testInfo) => {
    await loginAdmin(page);
    await page.goto('/admin/voices');
    for (const tr of ['en', 'fr', 'nl']) await expect(page.getByTestId(`voices-${tr}`)).toBeVisible();
    await expect(page.getByTestId('voices-nl')).toHaveAttribute('data-voice', /nl_BE/);
    await shot(page, testInfo, 'admin-voices');
    await page.goto('/admin');
    await logoutAnywhere(page);
    expect(ADMIN_LANG).toBe('en');
  });
});
