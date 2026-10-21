import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { orderToken } from '../../server/src/content/grading.js';
export { orderToken } from '../../server/src/content/grading.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalogs = Object.fromEntries(['nl', 'en'].map((l) => [l, JSON.parse(fs.readFileSync(path.join(root, `client/src/i18n/${l}.json`), 'utf8'))]));

/** UI string from client/src/i18n/<lang>.json (default Dutch), so tests follow the i18n files instead of duplicating text. */
export function t(key, lang = 'nl', params = {}) {
  const value = key.split('.').reduce((n, k) => n[k], catalogs[lang]);
  return value.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

/** Text of a pack field as a Dutch-speaking child sees it: target strings as-is, native { nl } objects in Dutch. */
export const txt = (v) => (typeof v === 'string' ? v : v.nl ?? Object.values(v)[0]); // the course's native key (en for Dutch)

// The seeded admin works in English (users.ui_lang); children in Dutch.
export const ADMIN_LANG = 'en';

/** The e2e server's clock (scripts/e2e.js fixes it at 10:00 Amsterdam and lets it run): use it for timestamps sent to it. */
export const serverNow = () => new Date(Date.now() + Number(process.env.ANZO_E2E_CLOCK_OFFSET_MS || 0));
/** Run a page on the server's clock (before navigating): the client's startedAt and "today" agree with the server. */
export const syncClock = (page) => page.clock.install({ time: serverNow() });

export function readManifest() {
  return JSON.parse(fs.readFileSync(path.join(root, 'content/packs/manifest.json'), 'utf8'));
}

/** Pack as authored (with answers) — the API deliberately doesn't send answers to the client. */
export function readPack(file) {
  return JSON.parse(fs.readFileSync(path.join(root, 'content/packs', file), 'utf8'));
}

export function exercisesById(pack) {
  const map = new Map();
  for (const unit of pack.units) for (const lesson of unit.lessons) for (const ex of lesson.exercises) map.set(ex.id, ex);
  return map;
}

/** Interface language of the login screen currently shown (it follows the device, not a user). */
export const loginLang = (page) => page.evaluate(() => document.documentElement.lang);

/**
 * Log in as a learner. Through the API by default (the UI login costs ~1.5 s × ~70 calls per project); the login
 * screen itself is under test in specs 02, 06, 07, 17 and 19, which pass `{ ui: true }`.
 */
export async function loginChild(page, username, password = username, { ui = false } = {}) {
  if (!ui) {
    const res = await page.request.post('/api/auth/login', { data: { username, password } });
    expect(res.ok(), `API login ${username}`).toBe(true);
    await page.goto('/');
    await expect(page.getByTestId('home')).toBeVisible();
    return;
  }
  await page.goto('/login');
  await page.getByTestId(`profile-${username}`).click();
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: t('login.submit', await loginLang(page)) }).click();
  await expect(page.getByTestId('home')).toBeVisible();
}

// The seeded admin password ("admin") must be changed on first login; 07-admin changes it to this.
export const ADMIN_PW = 'beheer-e2e-2026';

/**
 * Log in as admin through the UI. Works in both states of the shared test server: still seeded
 * (the forced change screen appears and is completed with ADMIN_PW) or already changed to ADMIN_PW.
 */
export async function loginAdmin(page, { ui = false } = {}) {
  // already changed: through the API unless the login screen is under test (the forced change always goes through the UI)
  if (!ui && (await page.request.post('/api/auth/login', { data: { username: 'admin', password: ADMIN_PW } })).ok()) {
    await page.goto('/');
    await expect(page.getByTestId('admin')).toBeVisible();
    return;
  }
  const fresh = (await page.request.post('/api/auth/login', { data: { username: 'admin', password: 'admin' } })).ok();
  await page.request.post('/api/auth/logout');
  const password = fresh ? 'admin' : ADMIN_PW;
  await page.goto('/login');
  await page.getByTestId('login-other').click();
  await page.locator('#login-username').fill('admin');
  await page.locator('#login-password').fill(password);
  await page.getByTestId('login').getByRole('button', { name: t('login.submit', await loginLang(page)) }).click();
  await expect(page.getByTestId('admin').or(page.getByTestId('force-password'))).toBeVisible();
  if (await page.getByTestId('force-password').isVisible()) {
    await page.locator('#force-current').fill(password);
    await page.locator('#force-next').fill(ADMIN_PW);
    await page.locator('#force-repeat').fill(ADMIN_PW);
    await page.getByRole('button', { name: t('forcePassword.submit', ADMIN_LANG) }).click();
  }
  await expect(page.getByTestId('admin')).toBeVisible();
}

/** Collects every request URL and every audio response, to check what the browser fetched. */
export function recordNetwork(page) {
  const log = { urls: [], audio: [] };
  page.on('request', (req) => log.urls.push(req.url()));
  page.on('response', (res) => {
    if (res.url().includes('/audio/')) log.audio.push({ url: res.url(), status: res.status() });
  });
  return log;
}

/** Record the src of every clip that starts playing on the shared audio element (capture on document). */
export async function hookPlaying(page) {
  await page.evaluate(() => {
    if (window.__played) return;
    window.__played = [];
    document.addEventListener('playing', (e) => window.__played.push(new URL(e.target.currentSrc).pathname), true);
  });
}

export const played = (page) => page.evaluate(() => (window.__played || []).filter((u) => !u.endsWith('/silence.mp3')));

export async function logout(page) {
  await page.getByTestId('settings-link').click();
  await page.getByTestId('logout-button').click();
  await expect(page).toHaveURL(/\/login$/);
}

const exactButton = (page, testId, name) =>
  page.getByTestId(testId).and(page.getByRole('button', { name, exact: true })).first();

/**
 * Answer the exercise currently on screen through the UI.
 * wrong=true gives a deliberately wrong answer. Returns the exercise's type.
 */
export async function answerCurrent(page, byId, { wrong = false, typed } = {}) {
  const section = page.getByTestId('exercise');
  await expect(section).toBeVisible();
  const id = await section.getAttribute('data-exercise-id');
  const ex = byId.get(id);
  switch (ex.type) {
    case 'multiple_choice': {
      const pick = wrong ? ex.options.find((o) => !o.correct) : ex.options.find((o) => o.correct);
      await exactButton(page, 'mc-option', txt(pick.text)).click();
      break;
    }
    case 'match_pairs': {
      if (wrong) {
        await exactButton(page, 'pair-left', ex.pairs[0].left).click();
        await exactButton(page, 'pair-right', txt(ex.pairs[1].right)).click();
      }
      for (const { left, right } of ex.pairs) {
        await exactButton(page, 'pair-left', left).click();
        await exactButton(page, 'pair-right', txt(right)).click();
      }
      break;
    }
    case 'build_sentence': {
      const tokens = wrong ? [...ex.tokens].reverse() : ex.tokens;
      for (const tok of tokens) await exactButton(page, 'bank-token', tok).click();
      break;
    }
    case 'fill_blank': {
      const value = wrong ? (ex.options ? ex.options.find((o) => o !== ex.answer) : 'xyz') : ex.answer;
      if (ex.options) await exactButton(page, 'fill-option', value).click();
      else await page.getByTestId('fill-input').fill(value);
      break;
    }
    case 'listen_choose': {
      const pick = wrong ? ex.options.find((o) => !o.correct) : ex.options.find((o) => o.correct);
      await exactButton(page, 'listen-option', txt(pick.text)).click();
      break;
    }
    case 'listen_type':
      await page.getByTestId('listen-input').fill(typed ?? (wrong ? 'xyz' : ex.answer));
      break;
    default:
      throw new Error(`unexpected exercise type ${ex.type}`);
  }
  await page.getByTestId('check-button').click();
  if (typed === undefined) await expect(page.getByTestId('result-strip')).toHaveAttribute('data-result', wrong ? 'wrong' : 'correct');
  else await expect(page.getByTestId('result-strip')).not.toHaveAttribute('data-result', 'none');
  return { id, type: ex.type };
}

/** Advance through the open lesson, answering correctly, until exercise `id` is on screen. */
export async function playUntil(page, byId, id) {
  for (let guard = 0; guard < 40; guard++) {
    const section = page.getByTestId('exercise');
    await expect(section).toBeVisible();
    if ((await section.getAttribute('data-exercise-id')) === id) return;
    await answerCurrent(page, byId);
    await page.getByTestId('continue-button').click();
  }
  throw new Error(`exercise ${id} never appeared`);
}

/** Play the open lesson to the end, answering correctly. Returns the sequence of exercise ids and types seen. */
export async function playToEnd(page, byId, { wrongIds = new Set() } = {}) {
  const seen = [];
  const answeredWrong = new Set();
  for (let guard = 0; guard < 40; guard++) {
    if (await page.getByTestId('lesson-done').isVisible()) return seen;
    await expect(page.getByTestId('exercise').or(page.getByTestId('lesson-done'))).toBeVisible();
    if (await page.getByTestId('lesson-done').isVisible()) return seen;
    const id = await page.getByTestId('exercise').getAttribute('data-exercise-id');
    const wrong = wrongIds.has(id) && !answeredWrong.has(id);
    if (wrong) answeredWrong.add(id);
    const r = await answerCurrent(page, byId, { wrong });
    seen.push({ ...r, wrong });
    await page.getByTestId('continue-button').click();
  }
  throw new Error('lesson did not finish');
}

/** Admin API helpers on a page whose context is logged in as admin (loginAdmin). */
export async function adminUsers(page) {
  return (await (await page.request.get('/api/admin/users')).json()).users;
}

export async function deleteUserIfExists(page, username) {
  const user = (await adminUsers(page)).find((u) => u.username === username);
  if (user) expect((await page.request.delete(`/api/admin/users/${user.id}`, { data: { confirmUsername: username } })).status()).toBe(204);
}

/** Log out from any screen that has the gear (children) or from the admin page. */
export async function logoutAnywhere(page) {
  if (await page.getByTestId('admin').isVisible()) await page.getByTestId('logout-button').click();
  else await logout(page);
  await expect(page).toHaveURL(/\/login$/);
}

/** After Continue: wait until the next exercise or the done screen is shown; true when the lesson is over. */
export async function lessonOver(page) {
  await expect(page.getByTestId('exercise').or(page.getByTestId('lesson-done'))).toBeVisible();
  return page.getByTestId('lesson-done').isVisible();
}

/** Answer the B2, text or vocabulary exercise on screen (wrong: a deliberate mistake); byId from exercisesById(pack). Returns the exercise. */
const B2_VOCAB_TYPES = new Set(['multiple_choice', 'match_pairs', 'build_sentence', 'fill_blank', 'listen_choose', 'listen_type']);

export async function answerB2(page, byId, { wrong = false } = {}) {
  const section = page.getByTestId('exercise');
  await expect(section).toBeVisible();
  const ex = byId.get(await section.getAttribute('data-exercise-id'));
  if (B2_VOCAB_TYPES.has(ex.type) && ex.kind !== 'word_form') return (await answerCurrent(page, byId, { wrong })) && ex;
  const q = ex.question;
  if (ex.type === 'gap_sentence') {
    const order = wrong ? [ex.gaps[1], ex.gaps[0], ...ex.gaps.slice(2)] : ex.gaps;
    for (const id of order) await page.locator(`[data-testid="gapped-option"][data-token="${orderToken(ex.id, id)}"]`).click();
  } else if (q?.type === 'match_texts') {
    const rows = page.getByTestId('match-row');
    for (const [i, st] of q.statements.entries()) {
      const p = wrong && i === 0 ? (st.paragraph % q.labels.length) + 1 : st.paragraph;
      await rows.nth(i).locator(`[data-testid="match-label"][data-paragraph="${p}"]`).click();
    }
  } else if (q?.type === 'complete') {
    await page.getByTestId('complete-input').fill(wrong ? 'Brugge' : q.answers[0].toLowerCase());
  } else if (q?.type === 'true_false_notgiven') {
    const right = String(q.answer);
    await page.locator(`[data-testid="tfng-option"][data-value="${wrong ? ['true', 'false', 'not_given'].find((v) => v !== right) : right}"]`).click();
  } else if (q) {
    await page.getByTestId('question-option').getByText(q.options[wrong ? (q.correct + 1) % q.options.length : q.correct], { exact: true }).click();
  } else if (ex.type === 'open_cloze' || ex.type === 'word_form') {
    // gap k is the input in `[data-gap="k+1"]` (the screen shows the gaps in text order, the pack lists them as authored)
    for (const [i, g] of ex.gaps.entries()) {
      const input = page.locator(`[data-testid="cloze-gap"][data-gap="${i + 1}"] [data-testid="cloze-input"]`);
      await input.fill(wrong && i === 0 ? (ex.type === 'word_form' ? g.stem.toLowerCase() : 'xyz') : g.acceptAlso?.[0] ?? g.word);
    }
  } else if (ex.type === 'transform') {
    await page.getByTestId('transform-input').fill(wrong ? 'xyz' : ex.answers[0]);
  } else if (ex.type === 'fill_blank') {
    await page.getByTestId('fill-input').fill(wrong ? ex.stem.toLowerCase() : ex.answer);
  } else throw new Error(`unexpected ${ex.type}`);
  await page.getByTestId('check-button').click();
  await expect(page.getByTestId('result-strip')).toHaveAttribute('data-result', wrong ? 'wrong' : 'correct');
  return ex;
}
