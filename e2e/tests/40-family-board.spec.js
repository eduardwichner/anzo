import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { ADMIN_LANG, loginAdmin, loginChild, t } from './helpers.js';

// The family board: the Home card and the full view (this week, every account shown, the family
// goal, the own switch in Settings, the admin's hide and goal); Admin → Audio lab: sample rows with ▶ current / ▶ variant and
// one vote per row. Self-restoring: the goal goes back to 500, every account back on the board, the vote taken back.
// The crown needs last week's XP, which a spec cannot write: its rules are unit-tested (server/test/family.test.js); the
// crown screenshot is the real board with one member's `crown` set by page.route (named "-crown-mock").

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const shot = async (page, testInfo, name) => {
  if (testInfo.project.name !== 'mobile') return;
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `mobile-40-${name}.png`), fullPage: false });
};
const boardOf = async (page) => (await page.request.get('/api/family')).json();

test.describe.serial('family board', () => {
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    await page.request.put('/api/admin/family', { data: { goal: 500 } });
    const { users } = await (await page.request.get('/api/admin/users')).json();
    for (const u of users.filter((x) => x.boardHidden)) await page.request.patch(`/api/admin/users/${u.id}`, { data: { boardHidden: false } });
    await page.close();
    const child = await browser.newPage();
    await loginChild(child, 'kid1');
    await child.request.patch('/api/auth/me', { data: { showOnBoard: true } });
    await child.close();
  });

  test('Home shows the family card; the board lists everyone by this week\'s XP with the family goal', async ({ page }, testInfo) => {
    await loginChild(page, 'kid1');
    const card = page.getByTestId('family-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText(t('family.title'));
    const board = await boardOf(page);
    await expect(card.getByTestId('family-goal')).toHaveAttribute('data-target', String(board.goal.target));
    // everyone up to five; a bigger family: the top five and "+N more"
    await expect(card.getByTestId('family-mini')).toHaveCount(Math.min(5, board.members.length));
    await expect(card.getByTestId('family-mini-more')).toHaveCount(board.members.length > 5 ? 1 : 0);
    if (board.members.length > 5) await expect(card.getByTestId('family-mini-more')).toHaveText(t('family.moreMembers', 'nl', { n: board.members.length - 5 }));
    await card.scrollIntoViewIfNeeded();
    await shot(page, testInfo, 'family-card');

    await card.click();
    await expect(page).toHaveURL(/\/family$/);
    const rows = page.getByTestId('family-row');
    await expect(rows).toHaveCount(board.members.length);
    // sorted by XP, ranks shared on a tie, the goal bar is the sum
    const xps = await rows.evaluateAll((els) => els.map((e) => Number(e.dataset.xp)));
    expect(xps).toEqual([...xps].sort((a, b) => b - a));
    expect(Number(await page.getByTestId('family-goal').getAttribute('data-xp'))).toBe(xps.reduce((s, x) => s + x, 0));
    const me = page.locator('[data-testid="family-row"][data-me="true"]');
    await expect(me).toHaveAttribute('data-name', 'Sam');
    await expect(me.locator('.family-day')).toHaveCount(7);
    await expect(me.locator('.family-day[data-today="true"]')).toHaveCount(1);
    await expect(page.getByText(t('family.resets'))).toBeVisible();
    await expect(page.getByTestId('family-crown-legend')).toHaveCount(0); // no crown this week, nothing to explain
    await shot(page, testInfo, 'family-board');

    // the crown, drawn on the real board (one member's crown set in the answer: last week cannot be written by a spec)
    await page.route('**/api/family', async (route) => {
      const res = await route.fetch();
      const json = await res.json();
      json.members[0].crown = true;
      await route.fulfill({ response: res, json });
    });
    await page.reload();
    await expect(page.getByTestId('family-crown')).toHaveCount(1);
    await expect(page.getByTestId('family-crown')).toContainText(t('family.crown'));
    await expect(page.getByTestId('family-crown-legend')).toHaveText(t('family.crownLegend'));
    await shot(page, testInfo, 'family-board-crown-mock');
    await page.unroute('**/api/family');

    // a family of seven on Home's card: the top five and "+2 more" — members added to the real answer
    await page.route('**/api/family', async (route) => {
      const res = await route.fetch();
      const json = await res.json();
      const base = json.members[0];
      const extra = ['Ada', 'Bo', 'Cas', 'Dirk', 'Eva', 'Fien'].map((name, i) => ({ ...base, id: 9000 + i, displayName: name, me: false, crown: false, xp: 5, rank: 99 }));
      json.members = [...json.members, ...extra].slice(0, 7);
      await route.fulfill({ response: res, json });
    });
    await page.goto('/');
    const card7 = page.getByTestId('family-card');
    await expect(card7.getByTestId('family-mini')).toHaveCount(5);
    await expect(card7.getByTestId('family-mini-more')).toHaveText(t('family.moreMembers', 'nl', { n: 2 }));
    await card7.scrollIntoViewIfNeeded();
    await shot(page, testInfo, 'family-card-seven-mock');
    await page.unroute('**/api/family');
  });

  test('Settings: "Show me on the family board" takes the learner off the board and back', async ({ page }) => {
    await loginChild(page, 'kid1');
    await page.goto('/settings');
    const sw = page.getByTestId('board-setting');
    await expect(sw).toBeChecked();
    await expect(page.getByText(t('settings.showOnBoard'))).toBeVisible();
    await sw.uncheck();
    await expect.poll(async () => (await boardOf(page)).viewer.shown).toBe(false);
    await page.goto('/family');
    await expect(page.getByTestId('family-not-shown')).toContainText(t('family.offSelf'));
    await expect(page.locator('[data-testid="family-row"][data-me="true"]')).toHaveCount(0);
    await page.goto('/settings');
    await page.getByTestId('board-setting').check();
    await expect.poll(async () => (await boardOf(page)).viewer.shown).toBe(true);
  });

  test('the admin sets the family goal and hides an account (Admin → Users)', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'server state: desktop only');
    await loginAdmin(page);
    await page.getByTestId('admin-family-link').click();
    await expect(page.getByTestId('family')).toBeVisible();
    await page.getByTestId('family-goal-input').fill('20');
    await page.getByTestId('family-goal-save').click();
    // the browser's own range check stops it (min 50); the server refuses it too (400, unit-tested)
    expect(await page.getByTestId('family-goal-input').evaluate((el) => el.validity.rangeUnderflow)).toBe(true);
    await expect(page.getByTestId('family-goal')).toHaveAttribute('data-target', '500');
    expect((await page.request.put('/api/admin/family', { data: { goal: 20 } })).status()).toBe(400);
    await page.getByTestId('family-goal-input').fill('200');
    await page.getByTestId('family-goal-save').click();
    await expect(page.getByTestId('family-goal')).toHaveAttribute('data-target', '200');

    const { users } = await (await page.request.get('/api/admin/users')).json();
    const kid2 = users.find((u) => u.username === 'kid2');
    await page.goto(`/admin/users/${kid2.id}`);
    const onBoard = page.getByTestId('user-onBoard');
    await expect(onBoard).toBeChecked();
    await onBoard.uncheck();
    await page.getByTestId('user-save').click();
    await expect.poll(async () => (await boardOf(page)).members.some((m) => m.displayName === 'Alex')).toBe(false);
    await page.goto(`/admin/users/${kid2.id}`);
    await page.getByTestId('user-onBoard').check();
    await page.getByTestId('user-save').click();
    await expect.poll(async () => (await boardOf(page)).members.some((m) => m.displayName === 'Alex')).toBe(true);
  });
});

test.describe('no Audio lab', () => {
  test('neither the admin nor a learner reaches it; the admin page has no lab tool', async ({ page }) => {
    await loginAdmin(page);
    await expect(page.getByTestId('admin-rules-link')).toBeVisible();
    await expect(page.getByTestId('admin-lab-link')).toHaveCount(0);
    expect((await page.request.get('/api/admin/lab')).status()).toBe(404);
    await page.goto('/admin/lab');
    await expect(page.getByTestId('audio-lab')).toHaveCount(0);
  });
});
