import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { ADMIN_LANG, exercisesById, loginAdmin, loginChild, playUntil, readManifest, readPack, t } from './helpers.js';
import { loadContent, knownWordsOf } from '../../server/src/content/loader.js';
import { words } from '../../server/src/content/grading.js';

// The result strip marks a dictation's words and says that capitals and full stops do not count; a Dutch
// compound typed as two course words is right (spelling note); "Record again" from an audio report in the Inbox (the e2e
// server's stub runner makes the "new" take at once: the flow, not the audio); the Listen check's numbers at the top (the Audio quality table).
// Lessons are played in Admin → Levels → Preview: nothing is stored.

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const shot = async (page, testInfo, name, fullPage = false) => {
  if (testInfo.project.name !== 'mobile') return;
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `mobile-43-${name}.png`), fullPage });
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const packFile = (id) => readManifest().tracks.flatMap((tr) => tr.packs).find((p) => p.id === id)?.file;
/** The first lesson of a pack with an exercise that `pred` accepts: { lesson, ex, byId }. */
function firstExercise(packId, pred) {
  const pack = readPack(packFile(packId));
  for (const u of pack.units) for (const l of u.lessons) for (const ex of l.exercises) if (pred(ex)) return { lesson: l.id, ex, byId: exercisesById(pack) };
  return null;
}

test.describe('result strip (diagnostics A4 (2)) and Dutch compounds', () => {
  test.beforeEach(async ({ page }) => { await loginAdmin(page); });

  test('a wrong dictation: the wrong word marked, and "capitals and full stops don\'t count"', async ({ page }, testInfo) => {
    // a French dictation of at least three words whose last word is long enough to mistype
    const found = firstExercise('fr-a1-1', (e) => e.type === 'listen_type' && words(e.answer).length >= 3 && /[.!?]$/.test(e.answer));
    expect(found).toBeTruthy();
    await page.goto(`/admin/preview/fr-a1-1/${found.lesson}`);
    await playUntil(page, found.byId, found.ex.id);
    const w = words(found.ex.answer);
    const typed = [...w.slice(0, -1), 'zzz'].join(' '); // lower case, no final mark, the last word wrong
    await page.getByTestId('listen-input').fill(typed);
    await page.getByTestId('check-button').click();
    await expect(page.getByTestId('result-strip')).toHaveAttribute('data-result', 'wrong');
    const marks = page.getByTestId('word-mark');
    await expect(marks).toHaveCount(found.ex.answer.trim().split(/\s+/).filter((x) => /[\p{L}\p{N}]/u.test(x)).length);
    await expect(marks.last()).toHaveAttribute('data-status', 'wrong');
    await expect(marks.first()).toHaveAttribute('data-status', 'ok');
    await expect(page.getByTestId('caps-note')).toHaveText(t('lesson.capsNote', ADMIN_LANG));
    await shot(page, testInfo, 'result-strip-marks');
  });

  test('a contraction typed out is marked right, like the grade', async ({ page }) => {
    // an English dictation with a word like "isn't" before its last word and no other accepted spelling
    const contraction = (x) => /^\p{L}+n't$/u.test(x) && !/^(can't|won't|shan't)$/.test(x);
    const found = firstExercise('en-b1', (e) => e.type === 'listen_type' && !e.acceptAlso && words(e.answer).slice(0, -1).some(contraction));
    expect(found).toBeTruthy();
    await page.goto(`/admin/preview/en-b1/${found.lesson}`);
    await playUntil(page, found.byId, found.ex.id);
    const w = words(found.ex.answer);
    const typed = [...w.slice(0, -1).map((x) => (contraction(x) ? `${x.slice(0, -3)} not` : x)), 'zzz'].join(' ');
    await page.getByTestId('listen-input').fill(typed);
    await page.getByTestId('check-button').click();
    await expect(page.getByTestId('result-strip')).toHaveAttribute('data-result', 'wrong');
    const marks = page.getByTestId('word-mark');
    await expect(marks.last()).toHaveAttribute('data-status', 'wrong');
    await expect(marks.and(page.locator('[data-status="ok"]'))).toHaveCount((await marks.count()) - 1);
    await expect(page.getByTestId('word-extra')).toHaveCount(0);
  });

  test('a Dutch compound typed as two course words is right, with the spelling note', async ({ page }, testInfo) => {
    const content = loadContent({ contentDir: path.join(ROOT, 'content') });
    const known = knownWordsOf(content, 'nl');
    // a dictation with a compound whose two parts are both words of the course
    let split = null;
    const pick = (packId) => firstExercise(packId, (e) => {
      if (e.type !== 'listen_type') return false;
      for (const word of words(e.answer)) {
        for (let i = 3; i <= word.length - 3; i++) {
          if (known.has(word.slice(0, i)) && known.has(word.slice(i))) { split = { word, a: word.slice(0, i), b: word.slice(i) }; return true; }
        }
      }
      return false;
    });
    let found = null; // the first pack with one (pick() records its word in `split`)
    for (const p of ['nl-pre-a1', 'nl-a1', 'nl-a2']) {
      const f = pick(p);
      if (f) { found = [p, f]; break; }
    }
    expect(found, 'a Dutch dictation with a compound of two course words').toBeTruthy();
    const [packId, f] = found;
    await page.goto(`/admin/preview/${packId}/${f.lesson}`);
    await playUntil(page, f.byId, f.ex.id);
    const typed = words(f.ex.answer).map((x) => (x === split.word ? `${split.a} ${split.b}` : x)).join(' ');
    await page.getByTestId('listen-input').fill(typed);
    await page.getByTestId('check-button').click();
    await expect(page.getByTestId('result-strip')).toHaveAttribute('data-result', 'correct');
    await expect(page.getByTestId('word-mark').and(page.locator('[data-status="spelling"]'))).toHaveCount(1);
    await shot(page, testInfo, 'dutch-compound');
  });
});

test.describe.serial('record again (Admin → Inbox, an audio report)', () => {
  // a listening exercise of the first English lesson: its report card has the answer's recordings
  const found = firstExercise('en-pre-a1', (e) => e.type === 'listen_choose');

  test('kid1 reports the sound; the admin records it again, hears old and new, keeps the new one', async ({ page }, testInfo) => {
    await loginChild(page, 'kid1');
    const sent = await page.request.post('/api/reports', { data: { exerciseId: found.ex.id, reason: 'audio', note: 'e2e: sounds odd' } });
    expect([200, 201]).toContain(sent.status());
    await loginAdmin(page);
    await page.goto('/admin/inbox');
    const card = page.getByTestId(`inbox-group-${found.ex.id}`);
    await expect(card).toBeVisible();
    const panel = card.getByTestId('rerecord');
    await expect(panel).toBeVisible();
    const normal = panel.getByTestId('rerecord-clip').and(page.locator('[data-speed="normal"]'));
    await normal.getByTestId('rerecord-start').click();
    await expect(normal).toHaveAttribute('data-status', 'review');
    await expect(normal.getByTestId('rerecord-old')).toBeVisible();
    await expect(normal.getByTestId('rerecord-new')).toBeVisible();
    await normal.scrollIntoViewIfNeeded();
    await shot(page, testInfo, 'record-again-review');
    await normal.getByTestId('rerecord-keep').click();
    await expect(normal).toHaveAttribute('data-status', 'kept');
    await expect(normal.getByTestId('rerecord-status')).toHaveText(t('ops.rerecord.status.kept', ADMIN_LANG));
    // the slow one: keep the old
    const slow = panel.getByTestId('rerecord-clip').and(page.locator('[data-speed="slow"]'));
    await slow.getByTestId('rerecord-start').click();
    await slow.getByTestId('rerecord-drop').click();
    await expect(slow).toHaveAttribute('data-status', 'dropped');
    await shot(page, testInfo, 'record-again-done');
    // restore: the report closed (no message)
    const closed = await page.request.post(`/api/admin/inbox/${encodeURIComponent(found.ex.id)}`, { data: { action: 'dismiss' } });
    expect(closed.status()).toBe(200);
  });

  test('a learner cannot ask for it', async ({ page }) => {
    await loginChild(page, 'kid1');
    expect((await page.request.post('/api/admin/rerecord', { data: { file: 'en/0000000000000000.mp3' } })).status()).toBe(403);
  });
});

test.describe('Listen check: the numbers at the top', () => {
  // The last round's pooled lines became the permanent Audio quality table (spec 44 tests it in full)
  test('the Audio quality table and the fix line', async ({ page }, testInfo) => {
    await loginAdmin(page);
    await page.goto('/admin/listen');
    const quality = page.getByTestId('audio-quality');
    await expect(quality).toBeVisible();
    await expect(page.getByTestId('listen-pooled')).toHaveCount(0);
    const s = await (await page.request.get('/api/admin/listen')).json();
    await expect(quality.getByTestId('quality-fixing')).toHaveText(t('quality.fixing', ADMIN_LANG, s.quality.fixing));
    await shot(page, testInfo, 'listen-quality-top');
  });
});
