import { test, expect } from '@playwright/test';
import { exercisesById, hookPlaying, loginChild, played, readPack } from './helpers.js';

// No sequence of taps on any audio control breaks the app (repeated taps on the
// lesson-header speaker). Runs in desktop, mobile and mobile-webkit. Nothing is answered: kid1's progress is untouched.

const pack = readPack('en/pre-a1.json');
const byId = exercisesById(pack);
const LESSON = pack.units[0].lessons[0];

test('rapid taps on every audio control: no page error, the clip plays, the lesson still works after a reload', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const audioRequests = [];
  page.on('request', (r) => r.url().includes('/audio/') && audioRequests.push(r.url()));
  await loginChild(page, 'kid1');
  await hookPlaying(page);
  await page.locator(`[data-lesson-id="${LESSON.id}"]`).click();
  const section = page.getByTestId('exercise');
  await expect(section).toBeVisible();
  const first = byId.get(await section.getAttribute('data-exercise-id'));
  expect(first.type).toBe('multiple_choice');

  // Taps as fast as a child can (and faster): the speaker, the turtle, the tappable word, alternating. `force`: a playing
  // speaker pulses, and Playwright waits for an animated button to stand still — a child does not (on a loaded machine
  // WebKit's slow clip outlasted the wait).
  const tap = { delay: 0, force: true };
  for (let i = 0; i < 20; i += 1) await page.getByTestId('speaker').first().click(tap);
  for (let i = 0; i < 12; i += 1) await page.getByTestId('speaker-slow').first().click(tap);
  for (let i = 0; i < 12; i += 1) await page.getByTestId('word').first().click(tap);
  await page.evaluate(() => {
    const els = ['speaker', 'speaker-slow', 'word'].map((id) => document.querySelector(`[data-testid="${id}"]`)).filter(Boolean);
    for (let i = 0; i < 150; i += 1) els[i % els.length].click();
  });
  // The same clip again restarts it in place: Chromium then serves it from its cache (far fewer loads than taps);
  // WebKit asks for a byte range on every restart whatever the page does, but never more than one per tap.
  const before = audioRequests.length;
  // (not forced: the measured taps keep the pace the limit below was set for)
  for (let i = 0; i < 20; i += 1) await page.getByTestId('speaker').first().click({ delay: 0 });
  await expect.poll(async () => (await played(page)).length).toBeGreaterThan(0);
  // (+2: a load still under way from the burst above may land in this window)
  expect(audioRequests.length - before).toBeLessThanOrEqual(testInfo.project.name === 'mobile-webkit' ? 22 : 9);

  // The exercise still answers to taps, and the speaker plays once more.
  await page.getByTestId('mc-option').first().click();
  await expect(page.getByTestId('check-button')).toBeEnabled();
  await page.reload();
  await expect(page.getByTestId('exercise')).toBeVisible();
  await expect(page.getByTestId('load-error')).toHaveCount(0);
  await page.getByTestId('quit-lesson').click();
  await expect(page.getByTestId('home')).toBeVisible();
  expect(errors).toEqual([]);
});
