import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { answerCurrent, exercisesById, lessonOver, loginAdmin, loginChild, playUntil, readPack } from './helpers.js';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');

test('mobile screenshots of every screen and exercise type', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'screenshots are taken in the mobile project only');
  fs.mkdirSync(outDir, { recursive: true });
  const shot = (name) => page.screenshot({ path: path.join(outDir, `mobile-${name}.png`) });

  await page.goto('/login');
  await expect(page.getByTestId('profile-kid1')).toBeVisible();
  await shot('login');

  await loginChild(page, 'kid2');
  await shot('home');

  // Alex's first French lesson covers every type (A1.1 fill-ins are word banks; the typed one comes from French A1 below).
  const byId = exercisesById(readPack('fr/a1-1.json'));
  await page.locator('[data-lesson-id="fr-a1-1-u01-l01"]').click();
  const taken = new Set();
  for (let i = 0; i < 30 && !(await lessonOver(page)); i++) {
    const section = page.getByTestId('exercise');
    await expect(section).toBeVisible();
    const type = await section.getAttribute('data-type');
    const id = await section.getAttribute('data-exercise-id');
    const ex = byId.get(id);
    const key = type === 'fill_blank' ? (ex.options ? 'fill-blank-bank' : 'fill-blank-typed') : type.replace('_', '-');
    if (!taken.has(key) && i > 0) {
      await shot(`exercise-${key}`);
      taken.add(key);
    }
    const wrong = i === 0; // the first exercise is answered wrong once to capture the red strip
    await answerCurrent(page, byId, { wrong });
    const resultKey = wrong ? 'result-wrong' : 'result-correct';
    if (!taken.has(resultKey)) {
      await shot(resultKey);
      taken.add(resultKey);
    }
    await page.getByTestId('continue-button').click();
  }
  await expect(page.getByTestId('lesson-done')).toBeVisible();
  await shot('lesson-done');
  await page.getByTestId('done-continue').click();

  if (!taken.has('fill-blank-typed')) {
    const a1 = readPack('fr/a1.json');
    const a1ById = exercisesById(a1);
    const typedLesson = a1.units[0].lessons.find((l) => l.exercises.some((e) => e.type === 'fill_blank' && !e.options));
    const typed = typedLesson.exercises.find((e) => e.type === 'fill_blank' && !e.options);
    await page.goto(`/lesson/${typedLesson.id}`);
    await playUntil(page, a1ById, typed.id);
    await shot('exercise-fill-blank-typed');
    taken.add('fill-blank-typed');
    await page.goto('/');
  }

  await page.getByTestId('level-bar').click();
  await expect(page.getByTestId('level-sheet')).toBeVisible();
  await shot('levels');

  await loginAdmin(page);
  await page.getByTestId('voices-link').click();
  await expect(page.getByTestId('voices-en')).toBeVisible();
  await shot('voices');

  expect([...taken]).toEqual(expect.arrayContaining([
    'multiple-choice', 'match-pairs', 'build-sentence', 'fill-blank-bank', 'fill-blank-typed', 'listen-choose', 'listen-type',
  ]));
});
