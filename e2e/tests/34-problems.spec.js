import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { ADMIN_LANG, loginAdmin, serverNow, t } from './helpers.js';

// Admin → System → Problems shows the last 14 days; "Acknowledge" hides one problem and
// "Acknowledge all" every problem shown, until the same problem is logged again. The logs are never edited. The spec
// writes its own lines into the e2e log directory and ends with a fresh copy of the line spec 25 looks for (the newest).

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const logDir = process.env.ANZO_E2E_LOG_DIR;
const appLog = path.join(logDir ?? '', 'app.log');
const line = (ms, msg, level = 40) => `${JSON.stringify({ level, time: ms, msg, app: 'anzo' })}\n`;
const latest = () => Math.max(Date.now(), serverNow().getTime());
const row = (page, text) => page.getByTestId('problem').filter({ hasText: text });

test('Problems: 14 days, acknowledge one, acknowledge all, back on a new occurrence', async ({ page }, testInfo) => {
  test.skip(!logDir, 'needs the e2e log directory (scripts/e2e.js)');
  const run = testInfo.project.name;
  const now = latest();
  fs.appendFileSync(appLog, line(now - 20 * 86_400_000, `e2e old problem ${run}`)
    + line(now - 2000, `e2e problem A ${run}`) + line(now - 1000, `e2e problem B ${run}`, 50));
  await loginAdmin(page);
  await page.goto('/admin/system');
  await expect(page.getByTestId('problems-help')).toContainText(t('ops.system.problemsHelp', ADMIN_LANG));
  await expect(row(page, `e2e problem A ${run}`)).toHaveCount(1);
  await expect(row(page, `e2e problem B ${run}`)).toHaveCount(1);
  await expect(row(page, `e2e old problem ${run}`)).toHaveCount(0); // older than 14 days

  if (run === 'mobile') {
    fs.mkdirSync(outDir, { recursive: true });
    await page.getByTestId('system-problems').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(outDir, 'mobile-34-system-problems-ack.png') });
  }
  await row(page, `e2e problem A ${run}`).getByTestId('ack-problem').click();
  await expect(row(page, `e2e problem A ${run}`)).toHaveCount(0);
  await expect(row(page, `e2e problem B ${run}`)).toHaveCount(1);
  await expect(page.getByTestId('problems-help')).toContainText(t('ops.system.acknowledged', ADMIN_LANG, { n: 1 }).slice(2));
  await page.reload();
  await expect(row(page, `e2e problem A ${run}`)).toHaveCount(0); // stored, not just hidden on the page

  await page.getByTestId('ack-all').click();
  await expect(page.getByTestId('no-problems')).toBeVisible();
  await expect(page.getByTestId('problem')).toHaveCount(0);

  // the same problem again (a new occurrence): back on the list
  fs.appendFileSync(appLog, line(latest() + 1000, `e2e problem A ${run}`));
  await page.getByTestId('system-refresh').click();
  await expect(row(page, `e2e problem A ${run}`)).toHaveCount(1);

  // spec 25 (next project) expects its planted line to be the newest problem: a new occurrence of it, last
  const secret = process.env.ANZO_E2E_SESSION_SECRET;
  fs.appendFileSync(path.join(logDir, 'jobs.log'), `${JSON.stringify({ level: 50, time: latest() + 2000, source: 'content-job', msg: 'e2e planted error', error: `SESSION_SECRET=${secret}` })}\n`);
  await page.getByTestId('system-refresh').click();
  await expect(page.getByTestId('problem').first()).toContainText('e2e planted error');
});
