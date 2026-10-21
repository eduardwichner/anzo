import { test, expect } from '@playwright/test';
import { hookPlaying, loginAdmin, played } from './helpers.js';

// A dialogue is read turn by turn in two voices — speaker A in the course's voice, speaker B in its
// dialogue voice — with the current turn highlighted. Runs in desktop, mobile and mobile-webkit.

test('the dialogue plays its turns in sequence, in two voices', async ({ page }) => {
  test.setTimeout(90_000);
  await loginAdmin(page);
  const pub = await (await page.request.get('/api/content/packs/nl-b1')).json();
  const dialogue = pub.units[0].texts.find((x) => x.kind === 'dialogue');
  const urlA = new URL(dialogue.turns[0].audio, 'http://x').pathname;
  const urlB = new URL(dialogue.turns[1].audio, 'http://x').pathname;
  expect(dialogue.turns[0].speaker).toBe('A');
  expect(dialogue.turns[1].speaker).toBe('B');
  expect(urlA).not.toBe(urlB);
  // the two voices are different clips of different voices (Admin → Voices lists the second voice)
  const voices = (await (await page.request.get('/api/admin/voices')).json()).tracks.find((v) => v.track === 'nl');
  expect(voices.dialogue.voice).not.toBe(voices.voice);

  await page.goto('/admin/preview/nl-b1');
  await page.locator(`[data-testid="preview-lesson"][data-lesson-id="${pub.units[0].id}-l02"]`).click();
  await hookPlaying(page);
  await page.getByTestId('text-play').click();
  await expect(page.locator('[data-testid="dialogue-turn"][data-speaker="A"] [data-current="true"]')).toHaveCount(1);
  // A's clip, then (after it ends and a short pause) B's clip in the other voice
  await expect.poll(async () => played(page), { timeout: 30_000 }).toEqual(expect.arrayContaining([urlA, urlB]));
  await expect(page.locator('[data-testid="dialogue-turn"][data-speaker="B"] [data-current="true"]').first()).toBeVisible({ timeout: 10_000 });
  const order = await played(page);
  expect(order.indexOf(urlA)).toBeLessThan(order.indexOf(urlB));
  await page.getByTestId('text-play-stop').click();
});
