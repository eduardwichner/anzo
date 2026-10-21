import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { ADMIN_LANG, loginAdmin, loginChild, t } from './helpers.js';

// Admin → What counts as correct: read-only, from docs/grading-rules.md section 8 (data/grading-rules.json);
// language chips, collapsed sections (phone-first), a search that opens what matches. Read-only: nothing to restore.

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const shot = async (page, testInfo, name) => {
  if (testInfo.project.name !== 'mobile') return;
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `mobile-42-${name}.png`), fullPage: false });
};
const RULES = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/src/data/grading-rules.json'), 'utf8'));
const all = RULES.sections.flatMap((s) => s.rules);

test.describe('rules page', () => {
  test('collapsed headings, a section opened, language chips and search', async ({ page }, testInfo) => {
    await loginAdmin(page);
    await page.getByTestId('admin-rules-link').click();
    await expect(page.getByTestId('grading-rules')).toBeVisible();
    await expect(page.getByRole('heading', { name: t('rules.title', ADMIN_LANG) })).toBeVisible();
    const sections = page.getByTestId('rules-section');
    await expect(sections).toHaveCount(RULES.sections.length);
    // phone-first: only the headings until one is opened
    await expect(page.getByTestId('rules-rule').first()).toBeHidden();
    await shot(page, testInfo, 'rules-collapsed');

    const first = sections.first();
    await first.locator('summary').click();
    await expect(first.getByTestId('rules-rule').first()).toBeVisible();
    await expect(first.getByTestId('rules-rule').first()).toContainText(RULES.sections[0].rules[0].text.en);
    await shot(page, testInfo, 'rules-open');
    await first.locator('summary').click();

    // French: the rules about French or about every language
    await page.locator('[data-testid="rules-lang"][data-lang="fr"]').click();
    const fr = all.filter((r) => r.langs.includes('all') || r.langs.includes('fr'));
    await expect(page.getByTestId('rules-rule')).toHaveCount(fr.length);
    await expect(page.locator('[data-testid="rules-section"][data-section="english"]')).toHaveCount(0);
    await page.locator('[data-testid="rules-lang"][data-lang="all"]').click();

    // search opens the sections with a match
    await page.getByTestId('rules-search').fill('apostrophe');
    const hits = page.getByTestId('rules-rule');
    await expect(hits.first()).toBeVisible();
    // as the page searches: the section title, the rule and its example (a section about apostrophes shows all its rules)
    const matches = RULES.sections.flatMap((s) => s.rules.filter((r) => /apostrophe/i.test(`${s.title.en} ${r.text.en} ${r.example.expected} ${r.example.typed}`)));
    expect(await hits.count()).toBe(matches.length);
    await shot(page, testInfo, 'rules-search');
    await page.getByTestId('rules-search').fill('zzzz-nothing');
    await expect(page.getByTestId('rules-none')).toBeVisible();
  });

  test('a learner cannot open it', async ({ page }) => {
    await loginChild(page, 'kid1');
    await page.goto('/admin/rules');
    await expect(page.getByTestId('grading-rules')).toHaveCount(0);
  });
});

// four answers wrong only by spacing, graded by the server's real grader
// through the admin's preview (nothing is stored), on the real fr-a1-1 dictations.
test('Alex\'s spacing answers are right (preview grading of the real dictations)', async ({ page }) => {
  await loginAdmin(page);
  const cases = [
    ['fr-a1-1-u02-extra-e02', 'Oui,ça va bien'],
    ['fr-a1-1-u02-l02-e13', 'tu as un frere,oui'],
    ['fr-a1-1-u03-l01-e12', '0,1,2,3'],
    ['fr-a1-1-u03-l02-e12', "j ' ai huit ans"],
  ];
  for (const [exerciseId, answer] of cases) {
    const res = await page.request.post('/api/admin/preview/attempt', { data: { exerciseId, answer } });
    expect(res.status(), exerciseId).toBe(200);
    expect((await res.json()).correct, `${exerciseId} "${answer}"`).toBe(true);
  }
});
