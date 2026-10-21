import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { ADMIN_LANG, loginAdmin, t } from './helpers.js';

// In the browser (Admin → Listen check): a Bad clip of the fix queue shows its reason and note and
// leaves the queue with "Heard OK now"; Record again shows Old / New with Keep new, Keep old and "Neither — try again" (the stub
// runner: Neither drops the take and the clip stays); the *Before release* sample (a spool file planted in the e2e server's
// spool with two real recordings) — play, note, vote, change the vote, the progress line. The verdicts and votes stay in the
// e2e server's temporary database; the planted sample is removed at the end.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(ROOT, 'e2e', 'screenshots');
const shot = async (page, testInfo, name) => {
  if (testInfo.project.name !== 'mobile') return;
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `mobile-48-${name}.png`), fullPage: true });
};
const sampleFile = () => path.join(process.env.ANZO_E2E_DATA_DIR, 'spool', 'status', 'audio-sample.json');
const stateOf = async (page) => (await page.request.get('/api/admin/listen')).json();

test.describe.serial('the Listen check: fix queue and Before release', () => {
  test.afterAll(() => fs.rmSync(sampleFile(), { force: true }));

  test('the fix queue: the reason and note, Heard OK now; Record again: Old / New and Neither — try again', async ({ page }, testInfo) => {
    await loginAdmin(page);
    // two Bad clips with a note (the e2e server's temporary database)
    let state = await stateOf(page);
    for (const note of ['not enough pause after the ":"', 'OK sounds like "okkhiei"']) {
      state = await (await page.request.post('/api/admin/listen', { data: { file: state.next.file, verdict: 'bad', reason: 'other', note } })).json();
    }
    const waiting = state.queue.waiting;
    await page.goto('/admin/listen');
    const entry = page.locator('[data-testid="listen-waiting-clip"]').filter({ hasText: t('listen.reason.other', ADMIN_LANG) }).first();
    await entry.locator('summary').click();
    await expect(entry.getByTestId('listen-waiting-note')).toContainText(/okkhiei|pause after/);
    // Record again: Old and New, the verdict shown, three choices; Neither keeps the clip in the queue
    await entry.getByTestId('rerecord-start').click();
    await expect(entry.getByTestId('rerecord-review')).toBeVisible();
    await expect(entry.getByText(t('ops.rerecord.old', ADMIN_LANG), { exact: true })).toBeVisible();
    await expect(entry.getByText(t('ops.rerecord.new', ADMIN_LANG), { exact: true })).toBeVisible();
    await expect(entry.getByTestId('rerecord-verdict-note')).toBeVisible();
    await expect(entry.getByTestId('rerecord-keep')).toHaveText(t('ops.rerecord.keepNew', ADMIN_LANG));
    await expect(entry.getByTestId('rerecord-drop')).toHaveText(t('ops.rerecord.keepOld', ADMIN_LANG));
    await shot(page, testInfo, 'rerecord-review');
    await entry.getByTestId('rerecord-neither').click();
    await expect(entry.getByTestId('rerecord-clip')).toHaveAttribute('data-status', 'dropped');
    expect((await stateOf(page)).queue.waiting).toBe(waiting);
    // Heard OK now: one fewer in the queue — and an open Bad form for the clip on top starts again
    const file = await entry.getAttribute('data-file');
    await page.getByTestId('listen-bad').click();
    await page.getByTestId('listen-note').fill('typed for the clip that was on top');
    const top = await page.getByTestId('listen-clip').getAttribute('data-file');
    await entry.getByTestId('listen-heard-ok').click();
    await expect(page.locator(`[data-testid="listen-waiting-clip"][data-file="${file}"]`)).toHaveCount(0);
    if ((await page.getByTestId('listen-clip').getAttribute('data-file')) !== top) await expect(page.getByTestId('listen-bad-form')).toHaveCount(0);
    await expect(page.locator(`[data-testid="listen-waiting-clip"][data-file="${file}"]`)).toHaveCount(0);
    expect((await stateOf(page)).queue.waiting).toBe(waiting - 1);
  });

  test('Before release: Old / New, a note and a vote per row, the progress line', async ({ page }, testInfo) => {
    await loginAdmin(page);
    await page.goto('/admin/listen');
    await expect(page.getByTestId('audio-sample')).toHaveCount(0); // no sample: no card
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'audio', 'manifest.json'), 'utf8'));
    const [a, b] = Object.values(manifest.clips.en.normal).slice(0, 2);
    fs.mkdirSync(path.dirname(sampleFile()), { recursive: true });
    fs.writeFileSync(sampleFile(), JSON.stringify({ name: `e2e-fix-queue-${testInfo.project.name}`, about: 'e2e sample', rows: [
      { id: 's01', track: 'en', speed: 'normal', text: 'You are not alone: in a survey last term.', oldFile: a, newFile: b, flagsNew: ['onset'] },
      { id: 's02', track: 'en', speed: 'slow', text: 'Mia: I started an apprenticeship.', oldFile: b, newFile: a },
    ] }));
    await page.reload();
    const card = page.getByTestId('audio-sample');
    await expect(card.getByRole('heading', { name: t('sample.title', ADMIN_LANG) })).toBeVisible();
    await expect(card.getByTestId('sample-progress')).toHaveText(t('sample.progress', ADMIN_LANG, { voted: 0, total: 2 }));
    const row1 = card.locator('[data-testid="sample-row"][data-row="s01"]');
    await expect(row1.getByTestId('sample-old')).toBeVisible();
    await expect(row1.getByTestId('sample-new')).toBeVisible();
    await row1.getByTestId('sample-note').fill('better pause');
    await row1.getByTestId('sample-vote-new').click();
    await expect(row1).toHaveAttribute('data-vote', 'new');
    await shot(page, testInfo, 'before-release');
    const row2 = card.locator('[data-testid="sample-row"][data-row="s02"]');
    await row2.getByTestId('sample-vote-neither').click();
    await expect(card.getByTestId('sample-done')).toBeVisible();
    await row2.getByTestId('sample-vote-old').click();
    await expect(row2).toHaveAttribute('data-vote', 'old');
    const s = (await (await page.request.get('/api/admin/audio-sample')).json()).sample;
    expect(s).toMatchObject({ voted: 2, rows: [{ vote: 'new', note: 'better pause' }, { vote: 'old' }] });
  });
});
