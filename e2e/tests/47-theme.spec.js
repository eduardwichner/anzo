import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  ADMIN_LANG, answerB2, deleteUserIfExists, exercisesById, loginAdmin, loginChild, logoutAnywhere, orderToken, readManifest, readPack, t,
} from './helpers.js';

// The dark theme. Settings → Theme (System | Light | Dark, users.theme, migration 021) is saved per account,
// painted before the first frame (public/theme.js) and the login screen follows the device. Then every screen — the
// learner's (login, Home and its sheets, every exercise kind with its result strip, the done screen, practice, profile,
// settings, the family board, a message, the error screen) and the admin's (users, progress, Inbox, Corrections, Record again,
// System, Listen check, the rules page, voices, levels, preview, family, the forced password change) — is audited with
// axe-core's color-contrast rule in light and dark, under each course's accent: 0 violations. Dark screenshots of every
// screen on the phone: e2e/screenshots/mobile-47-dark-*.png.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(ROOT, 'e2e', 'screenshots');
const ACCENTS = ['en', 'fr', 'nl', 'admin'];
const KID = 'e2e-theme';
const ADULT = 'e2e-theme-nl';

const manifest = readManifest();
const packFile = (id) => manifest.tracks.flatMap((tr) => tr.packs).find((p) => p.id === id).file;
const byId = new Map();
for (const tr of manifest.tracks) for (const p of tr.packs) if (p.file) for (const [k, v] of exercisesById(readPack(p.file))) byId.set(k, v);

/**
 * Audit the screen as it is now in light and dark (emulated device setting; accounts follow it with theme "system"), under
 * the given accents (default: the screen's own), and keep a dark phone screenshot. Violations are collected, not thrown,
 * so one run lists every screen that fails.
 */
async function audit(page, testInfo, found, name, { accents, scope, fullPage = true } = {}) {
  const started = Date.now();
  const natural = await page.evaluate(() => document.documentElement.dataset.track);
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const accent of accents ?? [natural]) {
      await page.evaluate((a) => { document.documentElement.dataset.track = a; }, accent);
      // Home's path has ~800 nodes of a few kinds: the first 30 items cover every kind (axe on all of them takes minutes)
      let axe = new AxeBuilder({ page }).withRules(['color-contrast']).exclude('.path-list > li:nth-child(n+31)');
      if (scope) axe = axe.include(scope);
      const { violations, incomplete } = await axe.analyze();
      for (const v of violations) {
        for (const n of v.nodes) found.push(`${testInfo.project.name} · ${name} · ${theme} · ${accent}: ${n.target.join(' ')} — ${n.any.map((a) => a.message).join('; ')}`);
      }
      // axe files short texts (a count "1") as "incomplete" although it measured them: a measured ratio under the
      // threshold is a failure too; an unmeasurable background (an image, a gradient) is not
      for (const v of incomplete) {
        for (const n of v.nodes) {
          const d = n.any.find((a) => a.data?.contrastRatio)?.data;
          if (d && d.contrastRatio < (d.expectedContrastRatio ? Number.parseFloat(d.expectedContrastRatio) : 4.5)) {
            found.push(`${testInfo.project.name} · ${name} · ${theme} · ${accent}: ${n.target.join(' ')} — measured ${d.contrastRatio} (incomplete)`);
          }
        }
      }
    }
    await page.evaluate((a) => { document.documentElement.dataset.track = a; }, natural);
    if (theme === 'dark' && testInfo.project.name === 'mobile') {
      fs.mkdirSync(outDir, { recursive: true });
      // Home and the sheets over it: the screen as seen (the path below is thousands of pixels long)
      await page.screenshot({ path: path.join(outDir, `mobile-47-dark-${name}.png`), fullPage: fullPage && !/home|sheet|message/.test(name) });
    }
  }
  console.log(`[theme] ${name}: ${Date.now() - started} ms`);
}

/** Answer whatever exercise is on screen (vocabulary, B1 texts, B2 kinds). */
async function answerAny(page, { wrong = false } = {}) {
  const section = page.getByTestId('exercise');
  await expect(section).toBeVisible();
  const ex = byId.get(await section.getAttribute('data-exercise-id'));
  const q = ex.question;
  if (ex.type === 'cloze') {
    const inputs = page.getByTestId('cloze-input');
    if (await inputs.count()) {
      for (let i = 0; i < ex.gaps.length; i++) {
        await page.locator(`[data-testid="cloze-gap"][data-gap="${i + 1}"] [data-testid="cloze-input"]`).fill(wrong && i === 0 ? 'xyz' : ex.gaps[i].word);
      }
    } else {
      for (const g of ex.gaps) await page.getByTestId('cloze-option').getByText(g.word, { exact: true }).first().click();
    }
  } else if (ex.type === 'order_paragraphs') {
    const order = wrong ? [...ex.segments].reverse() : ex.segments;
    for (const id of order) await page.locator(`[data-testid="order-part"][data-seg-id="${orderToken(ex.id, id)}"]`).click();
  } else if (['reading', 'dialogue', 'listening'].includes(ex.type) && q && ['mc', 'match_heading'].includes(q.type)) {
    await page.getByTestId('question-option').getByText(q.options[wrong ? (q.correct + 1) % q.options.length : q.correct], { exact: true }).click();
  } else {
    return answerB2(page, byId, { wrong });
  }
  await page.getByTestId('check-button').click();
  await expect(page.getByTestId('result-strip')).toHaveAttribute('data-result', wrong ? 'wrong' : 'correct');
  return ex;
}

/** Play an open lesson (learner or preview) to its end; audit each exercise kind the first time, before and after checking. */
async function tour(page, testInfo, found, seen, { prefix, accents, endId = 'lesson-done', until } = {}) {
  let n = 0;
  for (let guard = 0; guard < 60; guard++) {
    await expect(page.getByTestId('exercise').or(page.getByTestId(endId))).toBeVisible();
    if (await page.getByTestId(endId).isVisible()) return;
    const id = await page.getByTestId('exercise').getAttribute('data-exercise-id');
    const ex = byId.get(id);
    const kind = [ex.type, ex.kind, ex.question?.type, ex.type === 'fill_blank' ? (ex.options ? 'bank' : 'typed') : null].filter(Boolean).join('-');
    const first = !seen.has(kind);
    const wrong = first && n % 2 === 1; // every other new kind answered wrong: both result strips are seen
    if (first) await audit(page, testInfo, found, `${prefix}-${kind}`, { accents });
    await answerAny(page, { wrong });
    if (first) {
      seen.add(kind);
      await audit(page, testInfo, found, `${prefix}-${kind}-${wrong ? 'wrong' : 'right'}`, { accents });
      n += 1;
    }
    if (until && id === until) return;
    await page.getByTestId('continue-button').click();
  }
  throw new Error('the lesson did not end');
}

const report = (found) => expect(found, `contrast violations:\n${found.join('\n')}`).toEqual([]);

async function openPreview(page, packId, lessonId) {
  await page.goto(`/admin/preview/${packId}/${lessonId}`);
  await expect(page.getByTestId('preview-banner')).toBeVisible();
}

test.describe.serial('dark theme', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    const page = await (await browser.newContext({ ...testInfo.project.use })).newPage();
    await loginAdmin(page);
    for (const u of [KID, ADULT]) await deleteUserIfExists(page, u);
    const make = (data) => page.request.post('/api/admin/users', { data });
    expect((await make({ username: KID, displayName: 'Kim', role: 'child', uiLang: 'nl', avatar: 'panda', avatarBg: 'mint', password: 'kim-e2e',
      showOnLogin: false, course: { track: 'en' } })).status()).toBe(201);
    expect((await make({ username: ADULT, displayName: 'Ada', role: 'child', audience: 'adult', nativeLang: 'en', uiLang: 'en', avatar: 'owl',
      avatarBg: 'lilac', password: 'ada-e2e', showOnLogin: false, course: { track: 'nl' } })).status()).toBe(201);
    await page.context().close();
  });

  test.afterAll(async ({ browser }, testInfo) => {
    const page = await (await browser.newContext({ ...testInfo.project.use })).newPage();
    await loginAdmin(page);
    for (const u of [KID, ADULT]) await deleteUserIfExists(page, u);
    await page.context().close();
  });

  test('Settings → Theme: System, Light, Dark per account, painted before the first frame; the login screen follows the device', async ({ page }) => {
    // every value data-theme takes from the start of each document: a wrong first paint would show up here
    await page.addInitScript(() => {
      window.__themes = [];
      window.__themeInHead = null; // set by the pre-paint script while <head> is parsed (no <body> yet)
      const note = () => {
        if (window.__themeInHead === null) window.__themeInHead = !document.body;
        window.__themes.push(document.documentElement.getAttribute('data-theme'));
      };
      // the script runs before <html> exists: watch the document, which sees the element's attributes once it is parsed
      new MutationObserver(note).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-theme'] });
    });
    await page.emulateMedia({ colorScheme: 'light' });
    await loginChild(page, KID, 'kim-e2e');
    await page.goto('/settings');
    const toggle = page.getByTestId('settings-theme');
    await expect(toggle.getByRole('button', { name: t('settings.themeSystem'), exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    // System follows the device live
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    // Dark: saved on the account, kept over a light device, on a reload painted dark from the first value on
    await page.getByTestId('settings-theme-dark').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(async () => (await (await page.request.get('/api/auth/me')).json()).user.theme).toBe('dark');
    await page.reload();
    await expect(page.getByTestId('settings')).toBeVisible();
    expect([...new Set(await page.evaluate(() => window.__themes))]).toEqual(['dark']); // never another value first
    expect(await page.evaluate(() => window.__themeInHead)).toBe(true); // painted by public/theme.js, before <body>
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(17, 20, 29)');
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', '#11141d');
    // Light over a dark device
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.getByTestId('settings-theme-light').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.getByTestId('settings')).toBeVisible();
    expect([...new Set(await page.evaluate(() => window.__themes))]).toEqual(['light']); // never another value first
    // Dark again, then log out: the login screen follows the (light) device and the device forgets the account's choice
    await page.getByTestId('settings-theme-dark').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.getByTestId('logout-button').click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('anzo.theme'))).toBeNull();
    await page.reload();
    expect([...new Set(await page.evaluate(() => window.__themes))]).toEqual(['light']); // never another value first
    // logging in again brings the account's choice back
    await loginChild(page, KID, 'kim-e2e');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // an invalid value is refused; back to System
    expect((await page.request.patch('/api/auth/me', { data: { theme: 'purple' } })).status()).toBe(400);
    expect((await page.request.patch('/api/auth/me', { data: { theme: 'system' } })).ok()).toBe(true);
  });

  test('learner screens in light and dark: 0 contrast violations', async ({ page }, testInfo) => {
    test.setTimeout(1_200_000);
    const found = [];
    const seen = new Set();
    // the login screen (the device decides)
    await page.goto('/login');
    await expect(page.getByTestId('login')).toBeVisible();
    await audit(page, testInfo, found, 'login', { accents: ['en'] });
    await page.getByTestId('login-other').click();
    await audit(page, testInfo, found, 'login-other', { accents: ['en'] });

    await loginChild(page, KID, 'kim-e2e');
    await audit(page, testInfo, found, 'home-new', { accents: ACCENTS });
    await page.getByTestId('course-chip').click();
    await expect(page.getByTestId('course-sheet')).toBeVisible();
    await audit(page, testInfo, found, 'course-sheet', { accents: ACCENTS });
    await page.getByTestId('course-sheet-close').click();
    await page.getByTestId('level-bar').click();
    await expect(page).toHaveURL(/\/levels$/);
    await audit(page, testInfo, found, 'level-sheet', { accents: ACCENTS });
    await page.goto('/');

    // a real lesson: every vocabulary kind, both result strips, the report sheet, the done screen with its badge
    const first = readPack(packFile('en-pre-a1')).units[0].lessons[0];
    await page.goto(`/lesson/${first.id}`);
    await expect(page.getByTestId('exercise')).toBeVisible();
    await answerAny(page);
    await page.getByTestId('report-flag').click();
    await expect(page.getByTestId('report-sheet')).toBeVisible();
    await audit(page, testInfo, found, 'report-sheet', { accents: ACCENTS });
    await page.getByTestId('report-close').click();
    await page.getByTestId('continue-button').click();
    await tour(page, testInfo, found, seen, { prefix: 'lesson', accents: ACCENTS });
    await audit(page, testInfo, found, 'lesson-done', { accents: ACCENTS });

    await page.goto('/');
    await expect(page.getByTestId('home')).toBeVisible();
    await audit(page, testInfo, found, 'home', { accents: ACCENTS });
    await page.getByTestId('practice-button').click();
    await expect(page.getByTestId('practice-sheet')).toBeVisible();
    await audit(page, testInfo, found, 'practice-sheet', { accents: ACCENTS });
    await page.getByTestId('practice-start-due').click();
    await expect(page.getByTestId('exercise')).toBeVisible();
    await audit(page, testInfo, found, 'practice', { accents: ACCENTS });
    await page.goto('/profile');
    await expect(page.getByTestId('profile')).toBeVisible();
    await audit(page, testInfo, found, 'profile', { accents: ACCENTS });
    await page.goto('/settings');
    await audit(page, testInfo, found, 'settings', { accents: ACCENTS });
    await page.goto('/family');
    await expect(page.getByTestId('family')).toBeVisible();
    await audit(page, testInfo, found, 'family', { accents: ACCENTS });

    // a one-time message from the grown-ups (mocked: the real flow is spec 25)
    await page.route('**/api/messages', (route) => route.fulfill({ json: { messages: [{ id: 990001, kind: 'fixed', text: t('messages.fixed'), badge: 'bug-hunter' }] } }));
    await page.route('**/api/messages/990001/shown', (route) => route.fulfill({ status: 204, body: '' }));
    await page.goto('/');
    await expect(page.getByTestId('child-message')).toBeVisible();
    await audit(page, testInfo, found, 'child-message', { accents: ACCENTS });
    await page.unrouteAll();

    // the error screen (the account cannot be loaded)
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
    await page.goto('/profile');
    await expect(page.getByTestId('error-retry')).toBeVisible();
    await audit(page, testInfo, found, 'error', { accents: ['en'] });
    await page.unrouteAll();

    // Dutch for English speakers (an adult, English interface): Home and a typed lesson with the Netherlands note
    await page.request.post('/api/auth/logout');
    await loginChild(page, ADULT, 'ada-e2e');
    await audit(page, testInfo, found, 'home-nl', { accents: ['nl'] });
    const nlFirst = readPack(packFile('nl-pre-a1')).units[0].lessons[0];
    await page.goto(`/lesson/${nlFirst.id}`);
    await tour(page, testInfo, found, new Set(), { prefix: 'lesson-nl', accents: ['nl'] });
    report(found);
  });

  test('every exercise kind of B1 and B2 in Admin → Levels → Preview, light and dark, under every accent', async ({ page }, testInfo) => {
    test.setTimeout(900_000);
    const found = [];
    const seen = new Set();
    await loginAdmin(page);
    const tours = [
      ['en-a1', 'en-a1-u01-l01', 'en-a1-u01-l01-e10'],
      ['en-b1', 'en-b1-u01-l01'],
      ['en-b1', 'en-b1-u01-l02'],
      ['en-b1', 'en-b1-u01-review', 'en-b1-u01-review-e02'],
      ['en-b2', 'en-b2-u01-l05'],
      ['en-b2', 'en-b2-u01-review', 'en-b2-u01-review-e01'],
      ['en-b2', 'en-b2-u01-listening', 'en-b2-u01-listening-e01'],
      ['en-b2', 'en-b2-u03-l05', 'en-b2-u03-l05-e01'],
    ];
    for (const [packId, lessonId, until] of tours) {
      await openPreview(page, packId, lessonId);
      await tour(page, testInfo, found, seen, { prefix: 'preview', accents: ACCENTS, endId: 'preview-done', until });
    }
    // a text folded on a phone, opened again with a tap
    if (testInfo.project.name === 'mobile') {
      await openPreview(page, 'en-b1', 'en-b1-u01-l01');
      await answerAny(page);
      await page.getByTestId('continue-button').click();
      await expect(page.getByTestId('text-toggle')).toBeVisible();
      await audit(page, testInfo, found, 'preview-text-folded', { accents: ACCENTS });
    }
    report(found);
  });

  test('admin screens in light and dark: 0 contrast violations', async ({ page }, testInfo) => {
    test.setTimeout(1_200_000);
    const found = [];
    const A = { accents: ['admin'] };
    // a report from the temporary learner for the Inbox
    await loginChild(page, KID, 'kim-e2e');
    const exerciseId = readPack(packFile('en-pre-a1')).units[0].lessons[0].exercises[0].id;
    expect((await page.request.post('/api/reports', { data: { exerciseId, reason: 'audio', note: 'e2e theme' } })).ok()).toBe(true);
    await page.request.post('/api/auth/logout');

    await loginAdmin(page);
    await audit(page, testInfo, found, 'admin', A);
    const users = (await (await page.request.get('/api/admin/users')).json()).users;
    const kid = users.find((u) => u.username === KID);
    await page.goto(`/admin/users/${kid.id}`);
    await expect(page.getByTestId('admin-user-courses')).toBeVisible();
    await audit(page, testInfo, found, 'admin-user', A);
    await page.goto(`/admin/users/${kid.id}/progress`);
    await expect(page.getByTestId('admin-progress-page')).toBeVisible();
    await audit(page, testInfo, found, 'admin-progress', A);
    await page.goto('/admin/users/new');
    await audit(page, testInfo, found, 'admin-user-new', A);
    await page.goto('/admin/inbox');
    await expect(page.getByTestId('inbox-report').first()).toBeVisible();
    await audit(page, testInfo, found, 'inbox', A);
    await page.goto('/admin/corrections');
    await page.getByTestId('corrections-search').fill('cat');
    await expect(page.locator('.result-link').first()).toBeVisible();
    await audit(page, testInfo, found, 'corrections', A);
    await page.locator('.result-link').first().click();
    await expect(page.getByTestId('correction-edit')).toBeVisible();
    await audit(page, testInfo, found, 'correction-edit', A);
    await page.goto('/admin/system');
    await expect(page.getByTestId('system-tiles')).toBeVisible();
    await audit(page, testInfo, found, 'system', A);
    // a Bad clip for the fix queue and a planted Before-release sample, so both are always audited
    const listen = await (await page.request.get('/api/admin/listen')).json();
    if (!listen.queue.waitingClips.length) await page.request.post('/api/admin/listen', { data: { file: listen.next.file, verdict: 'bad', reason: 'other', note: 'e2e theme' } });
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'audio', 'manifest.json'), 'utf8'));
    const [fa, fb] = Object.values(manifest.clips.en.normal).slice(0, 2);
    const sampleFile = path.join(process.env.ANZO_E2E_DATA_DIR, 'spool', 'status', 'audio-sample.json');
    fs.mkdirSync(path.dirname(sampleFile), { recursive: true });
    fs.writeFileSync(sampleFile, JSON.stringify({ name: `e2e-theme-audit-${testInfo.project.name}`, about: 'e2e', rows: [
      { id: 's01', track: 'en', speed: 'normal', text: 'You are not alone: in a survey.', oldFile: fa, newFile: fb, flagsNew: ['onset'] }] }));
    await page.goto('/admin/listen');
    await expect(page.getByTestId('listen-check')).toBeVisible();
    await expect(page.getByTestId('audio-sample')).toBeVisible();
    await page.getByTestId('audio-sample').getByTestId('sample-vote-new').click();
    await expect(page.getByTestId('listen-clip')).toBeVisible();
    await page.getByTestId('listen-bad').click();
    await expect(page.getByTestId('listen-bad-form')).toBeVisible();
    await audit(page, testInfo, found, 'listen-check', A);
    fs.rmSync(sampleFile, { force: true });
    const waiting = page.getByTestId('listen-waiting-clip').first();
    await expect(waiting).toBeVisible();
    {
      await waiting.locator('summary').click();
      await waiting.getByTestId('rerecord-start').click();
      await expect(waiting.getByTestId('rerecord-review')).toBeVisible();
      await audit(page, testInfo, found, 'listen-rerecord-review', A);
      await waiting.getByTestId('rerecord-drop').click();
      await expect(waiting.getByTestId('rerecord-clip')).toHaveAttribute('data-status', 'dropped');
    }
    await page.goto('/admin/rules');
    await page.getByTestId('rules-section').first().locator('summary').click();
    await audit(page, testInfo, found, 'rules', A);
    await page.goto('/admin/voices');
    await expect(page.getByTestId('voices')).toBeVisible();
    await audit(page, testInfo, found, 'voices', A);
    await page.goto('/levels');
    await expect(page.getByTestId('levels')).toBeVisible();
    await audit(page, testInfo, found, 'levels', A);
    await page.goto('/admin/preview/en-b2');
    await expect(page.getByTestId('preview-pack')).toBeVisible();
    await audit(page, testInfo, found, 'preview-pack', A);
    await page.goto('/family');
    await expect(page.getByTestId('family')).toBeVisible();
    await audit(page, testInfo, found, 'admin-family', A);
    await page.goto('/settings');
    await audit(page, testInfo, found, 'admin-settings', A);
    // the forced password change (the seeded admin's first login; mocked here, the real one is spec 07)
    await page.route('**/api/auth/me', async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      await route.fulfill({ response: res, json: { ...body, user: { ...body.user, mustChangePassword: true } } });
    });
    await page.goto('/admin');
    await expect(page.getByTestId('force-password')).toBeVisible();
    await audit(page, testInfo, found, 'force-password', A);
    await page.unrouteAll();
    // close the temporary report again
    await page.request.post(`/api/admin/inbox/${exerciseId}`, { data: { action: 'dismiss' } });
    await page.goto('/admin');
    await logoutAnywhere(page);
    report(found);
  });
});
