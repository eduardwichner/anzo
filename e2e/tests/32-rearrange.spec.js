import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { exercisesById, loginAdmin, orderToken, playUntil, readPack } from './helpers.js';

// Placed answers can be rearranged without clearing everything — tap a placed item to select it,
// tap another to swap or an insert marker to move it, the selected one again to send it back; or drag it (mouse, and a
// finger that rests first). Build the sentence, order the paragraphs, a word-bank cloze and a word-bank fill-in. Played
// in Admin → Levels → Preview, which stores nothing. Runs on desktop, mobile and mobile-webkit (playwright.config.js).

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const shot = async (page, testInfo, name) => {
  if (testInfo.project.name !== 'mobile') return;
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `mobile-32-${name}.png`) });
};

const en = readPack('en/pre-a1.json');
const enById = exercisesById(en);
const BUILD = 'en-pre-a1-u01-l03-e12'; // this | is | a | long | snake
const FILL = 'en-pre-a1-u01-l03-e11'; // green, a word bank
const nl = readPack('nl/b1.json');
const nlById = exercisesById(nl);
const CLOZE = 'nl-b1-u01-l01-e06';
const ORDER = 'nl-b1-u01-l01-e07';

/** Answer the text questions of the B1 pilot (right) until `id` is on screen. */
async function textUntil(page, id) {
  for (let guard = 0; guard < 12; guard++) {
    const now = await page.getByTestId('exercise').getAttribute('data-exercise-id');
    if (now === id) return;
    const q = nlById.get(now).question;
    if (q.type === 'true_false_notgiven') await page.locator(`[data-testid="tfng-option"][data-value="${q.answer}"]`).click();
    else await page.getByTestId('question-option').getByText(q.options[q.correct], { exact: true }).click();
    await page.getByTestId('check-button').click();
    await page.getByTestId('continue-button').click();
    await expect(page.getByTestId('exercise')).toBeVisible();
  }
  throw new Error(`${id} never appeared`);
}

const center = async (loc) => {
  const b = await loc.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
};

/** A mouse drag from one point to another (moves past the 5 px threshold first). */
async function mouseDrag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 2, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

/**
 * A finger drag as the browser reports it (pointerType touch): press, rest 300 ms (the app's long press), move, lift.
 * Synthetic pointer events — Playwright has no touch-move API — dispatched where a finger would be. `during` runs before
 * the finger lifts (a mid-drag screenshot).
 */
async function touchDrag(page, from, to, during) {
  await page.evaluate(async ({ from, to }) => {
    const ev = (type, x, y) => new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
    document.elementFromPoint(from.x, from.y).dispatchEvent(ev('pointerdown', from.x, from.y));
    await new Promise((r) => setTimeout(r, 320));
    for (let i = 1; i <= 10; i++) {
      const x = from.x + ((to.x - from.x) * i) / 10;
      const y = from.y + ((to.y - from.y) * i) / 10;
      (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(ev('pointermove', x, y));
      await new Promise((r) => setTimeout(r, 16));
    }
  }, { from, to });
  if (during) await during();
  await page.evaluate(({ to }) => {
    (document.elementFromPoint(to.x, to.y) ?? document.body).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, composed: true, pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: to.x, clientY: to.y, button: 0, buttons: 0 }));
  }, { to });
}

const placed = (page, testId) => page.getByTestId(testId).evaluateAll((els) => els.map((e) => e.textContent.trim()));

async function openBuild(page) {
  await page.goto('/admin/preview/en-pre-a1/en-pre-a1-u01-l03');
  await playUntil(page, enById, BUILD);
}
/** Place the build tiles in this order (by text). */
async function placeTiles(page, words) {
  for (const w of words) await page.getByTestId('bank-token').getByText(w, { exact: true }).click();
}

// page.route must see the pack request (the cloze test gives the cloze a word bank): no service worker in between
test.use({ serviceWorkers: 'block' });

test.describe.serial('rearranging placed answers', () => {
  test.beforeEach(async ({ page }) => { await loginAdmin(page); });

  test('build the sentence — tap: select, swap, move to a marker, send back', async ({ page }, testInfo) => {
    await openBuild(page);
    const tokens = enById.get(BUILD).tokens;
    // no giveaway on the tiles as shown: no punctuation, no capital on the sentence's first word
    for (const text of await page.getByTestId('bank-token').allTextContents()) expect(text, text).not.toMatch(/[.,!?;:]|^\p{Lu}/u);
    // the last word first, then the others: "snake this is a long"
    await placeTiles(page, [tokens[4], ...tokens.slice(0, 4)]);
    await expect(page.getByTestId('insert-marker')).toHaveCount(6);
    await page.getByTestId('answer-token').nth(0).click();
    await expect(page.getByTestId('answer-token').nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('arrange-hint')).toBeVisible();
    // the markers on either side of the selected word move nothing: they stay inactive
    await expect(page.locator('[data-testid="insert-marker"].is-active')).toHaveCount(4);
    await shot(page, testInfo, 'rearrange-selected');
    await page.locator('[data-testid="insert-marker"][data-arrange-gap="5"]').click(); // to the end
    expect(await placed(page, 'answer-token')).toEqual(tokens);
    // swap two, swap back
    await page.getByTestId('answer-token').nth(1).click();
    await page.getByTestId('answer-token').nth(3).click();
    expect(await placed(page, 'answer-token')).toEqual([tokens[0], tokens[3], tokens[2], tokens[1], tokens[4]]);
    await page.getByTestId('answer-token').nth(3).click();
    await page.getByTestId('answer-token').nth(1).click();
    expect(await placed(page, 'answer-token')).toEqual(tokens);
    // the selected word tapped again goes back to the bank
    await page.getByTestId('answer-token').nth(4).click();
    await page.getByTestId('answer-token').nth(4).click();
    await expect(page.getByTestId('answer-token')).toHaveCount(4);
    await page.getByTestId('bank-token').getByText(tokens[4], { exact: true }).click();
    // keyboard: select the first word, move it one place to the right and back with the arrow keys
    await page.getByTestId('answer-token').nth(0).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');
    expect(await placed(page, 'answer-token')).toEqual([tokens[1], tokens[0], ...tokens.slice(2)]);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Escape');
    expect(await placed(page, 'answer-token')).toEqual(tokens);
    // the tiles carry no punctuation: the sentence's final mark is shown after the built sentence
    expect(tokens.some((tok) => /[.!?,]/.test(tok))).toBe(false);
    await expect(page.getByTestId('build-end')).toHaveText(enById.get(BUILD).answer.match(/[.!?]+$/)[0]);
    await shot(page, testInfo, 'build-end');
    await page.getByTestId('check-button').click();
    await expect(page.getByTestId('result-strip')).toHaveAttribute('data-result', 'correct');
  });

  test('build the sentence — drag with the mouse and with a finger', async ({ page }, testInfo) => {
    await openBuild(page);
    const tokens = enById.get(BUILD).tokens;
    await placeTiles(page, [tokens[1], tokens[0], ...tokens.slice(2)]); // "is this a long snake"
    // mouse: drag "is" to just after "This"
    const is = await center(page.getByTestId('answer-token').nth(0));
    const thisBox = (await center(page.getByTestId('answer-token').nth(1))).box;
    await mouseDrag(page, is, { x: thisBox.x + thisBox.width - 3, y: thisBox.y + thisBox.height / 2 });
    expect(await placed(page, 'answer-token')).toEqual(tokens);
    // a drag dropped outside the answer line changes nothing
    const a = await center(page.getByTestId('answer-token').nth(2));
    await mouseDrag(page, a, { x: a.x, y: a.y + 400 });
    expect(await placed(page, 'answer-token')).toEqual(tokens);
    // finger: "snake." to the front (rest, then move), and back to the end
    const snake = await center(page.getByTestId('answer-token').nth(4));
    const first = (await center(page.getByTestId('answer-token').nth(0))).box;
    await touchDrag(page, snake, { x: first.x + 3, y: first.y + first.height / 2 }, async () => {
      await expect(page.locator('[data-testid="insert-marker"][data-target="true"]')).toHaveCount(1);
      await expect(page.locator('[data-testid="answer-token"][data-dragging="true"]')).toHaveCount(1);
      await shot(page, testInfo, 'rearrange-dragging');
    });
    expect(await placed(page, 'answer-token')).toEqual([tokens[4], ...tokens.slice(0, 4)]);
    // a quick finger movement without resting is a scroll, not a drag
    const s2 = await center(page.getByTestId('answer-token').nth(0));
    await page.evaluate(({ x, y }) => {
      const ev = (type, yy) => new PointerEvent(type, { bubbles: true, pointerId: 12, pointerType: 'touch', isPrimary: true, clientX: x, clientY: yy, button: 0, buttons: 1 });
      document.elementFromPoint(x, y).dispatchEvent(ev('pointerdown', y));
      window.dispatchEvent(ev('pointermove', y + 40));
      window.dispatchEvent(ev('pointercancel', y + 40)); // the browser took the gesture over for scrolling
    }, s2);
    expect(await placed(page, 'answer-token')).toEqual([tokens[4], ...tokens.slice(0, 4)]);
    const last = (await center(page.getByTestId('answer-token').nth(4))).box;
    await touchDrag(page, s2, { x: last.x + last.width - 3, y: last.y + last.height / 2 });
    expect(await placed(page, 'answer-token')).toEqual(tokens);
    await page.getByTestId('check-button').click();
    await expect(page.getByTestId('result-strip')).toHaveAttribute('data-result', 'correct');
  });

  test('word-bank fill-in: tap the filled gap to empty it; drag a word onto the gap', async ({ page }) => {
    await page.goto('/admin/preview/en-pre-a1/en-pre-a1-u01-l03');
    await playUntil(page, enById, FILL);
    const ex = enById.get(FILL);
    const wrong = ex.options.find((o) => o !== ex.answer);
    await page.getByTestId('fill-option').getByText(wrong, { exact: true }).click();
    await expect(page.getByTestId('fill-blank')).toHaveText(wrong);
    await page.getByTestId('fill-blank').click();
    await expect(page.getByTestId('check-button')).toBeDisabled();
    await mouseDrag(page, await center(page.getByTestId('fill-option').getByText(ex.answer, { exact: true })), await center(page.getByTestId('fill-blank')));
    await expect(page.getByTestId('fill-blank')).toHaveText(ex.answer);
    await page.getByTestId('check-button').click();
    await expect(page.getByTestId('result-strip')).toHaveAttribute('data-result', 'correct');
  });

  test('ordering — tap to swap, drag to move', async ({ page }) => {
    const segments = nlById.get(ORDER).segments.map((id) => orderToken(ORDER, id));
    const openOrder = async () => {
      await page.goto('/admin/preview/nl-b1/nl-b1-u01-l01');
      await textUntil(page, nlById.get(CLOZE).id);
      for (const [i, g] of nlById.get(CLOZE).gaps.entries()) await page.getByTestId('cloze-input').nth(i).fill(g.word);
      await page.getByTestId('check-button').click();
      await page.getByTestId('continue-button').click();
      await expect(page.locator(`[data-testid="exercise"][data-exercise-id="${ORDER}"]`)).toBeVisible();
    };
    const order = () => page.getByTestId('order-placed').evaluateAll((els) => els.map((e) => e.dataset.segId));
    const part = (id) => page.locator(`[data-testid="order-part"][data-seg-id="${id}"]`);

    await openOrder();
    for (const id of [segments[1], segments[0], ...segments.slice(2)]) await part(id).click();
    await page.getByTestId('order-placed').nth(0).click();
    await page.getByTestId('order-placed').nth(1).click();
    expect(await order()).toEqual(segments);
    await page.getByTestId('check-button').click();
    await expect(page.getByTestId('result-strip')).toHaveAttribute('data-result', 'correct');

    await openOrder();
    // the third part placed second: drag it up above the second one (a phone screen holds only a few paragraphs)
    for (const id of [segments[0], segments[2], segments[1], ...segments.slice(3)]) await part(id).click();
    await page.getByTestId('order-placed').nth(2).scrollIntoViewIfNeeded();
    const second = (await center(page.getByTestId('order-placed').nth(1))).box;
    await mouseDrag(page, await center(page.getByTestId('order-placed').nth(2)), { x: second.x + second.width / 2, y: second.y + 6 });
    expect(await order()).toEqual(segments);
    await page.getByTestId('check-button').click();
    await expect(page.getByTestId('result-strip')).toHaveAttribute('data-result', 'correct');
  });

  test('word-bank cloze — tap a filled gap then another to swap; drag a gap onto another and a word onto a gap', async ({ page }) => {
    // The B1 pilot's cloze is typed; a word bank (as below B1) is given to it here, as the server sends one for A2 texts.
    const cloze = nlById.get(CLOZE);
    const words = cloze.gaps.map((g) => g.word);
    await page.route('**/api/content/packs/nl-b1', async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      for (const u of body.units) for (const l of u.lessons) for (const e of l.exercises) if (e.id === CLOZE) e.options = [...words, 'werd', 'had'];
      await route.fulfill({ response: res, json: body });
    });
    const openCloze = async () => {
      await page.goto('/admin/preview/nl-b1/nl-b1-u01-l01');
      await textUntil(page, CLOZE);
      await expect(page.getByTestId('cloze-option').first()).toBeVisible();
    };
    const slots = () => page.getByTestId('cloze-slot').evaluateAll((els) => els.map((e) => e.textContent.trim()));
    const option = (w) => page.getByTestId('cloze-option').getByText(w, { exact: true });

    await openCloze();
    const swapped = [words[1], words[0], ...words.slice(2)];
    for (const w of swapped) await option(w).click(); // the first two the wrong way round
    await page.getByTestId('cloze-slot').nth(0).click();
    await expect(page.getByTestId('arrange-hint')).toBeVisible();
    await page.getByTestId('cloze-slot').nth(1).click();
    expect(await slots()).toEqual(words);
    // a bank word replaces the word of the selected gap; the gap tapped twice empties it
    await page.getByTestId('cloze-slot').nth(2).click();
    await option('had').click();
    expect((await slots())[2]).toBe('had');
    await page.getByTestId('cloze-slot').nth(2).click();
    await page.getByTestId('cloze-slot').nth(2).click();
    expect((await slots())[2]).toBe('…');
    await option(words[2]).click();
    await page.getByTestId('check-button').click();
    await expect(page.getByTestId('result-strip')).toHaveAttribute('data-result', 'correct');

    await openCloze();
    // a word onto the last gap (the one nearest the bank: both on screen)
    const lastGap = words.length - 1;
    // (the bank in the middle of the screen: the last gap just above it, neither under the sticky Check bar)
    await page.getByTestId('cloze-option').first().evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await mouseDrag(page, await center(option(words[lastGap])), await center(page.getByTestId('cloze-slot').nth(lastGap)));
    expect((await slots())[lastGap]).toBe(words[lastGap]);
    for (const w of swapped.slice(0, lastGap)) await option(w).click(); // fills the empty gaps in order
    expect(await slots()).toEqual(swapped);
    // a finger drags the first gap's word onto the second gap: they swap
    // both gaps on screen and away from the edges where a drag scrolls the page — the top, and the band above the sticky
    // Check bar: the first gap near the top
    await page.evaluate(() => {
      const [a] = [...document.querySelectorAll('[data-testid="cloze-slot"]')].map((e) => e.getBoundingClientRect());
      window.scrollBy(0, a.top - 80);
    });
    // WebKit settles the page a moment after the last gap was filled and the scroll: measure then (without tracing the
    // drag started in that moment and missed its target)
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 150)))));
    await touchDrag(page, await center(page.getByTestId('cloze-slot').nth(0)), await center(page.getByTestId('cloze-slot').nth(1)));
    expect(await slots()).toEqual(words);
    await page.getByTestId('check-button').click();
    await expect(page.getByTestId('result-strip')).toHaveAttribute('data-result', 'correct');
  });
});
