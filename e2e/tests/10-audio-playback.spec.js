// Audio playback: runs in desktop, mobile (Chromium with a strict autoplay policy) and mobile-webkit.
import { test, expect } from '@playwright/test';
import { answerCurrent, exercisesById, hookPlaying, lessonOver, loginChild, played, playUntil, readPack, recordNetwork, txt } from './helpers.js';

const LESSON = 'en-pre-a1-u01-l01';

async function publicPack(page) {
  return (await page.request.get('/api/content/packs/en-pre-a1')).json();
}

// The review lesson of unit 1 asks one English sentence as a multiple-choice question (generated content: found by shape).
const REVIEW = 'en-pre-a1-u01-review';
function sentenceQuestion(pack) {
  const unit = pack.units[0];
  const targets = new Set(unit.sentences.map((x) => x.target));
  const ex = unit.lessons.find((l) => l.id === REVIEW).exercises.find((e) => e.type === 'multiple_choice' && targets.has(e.question));
  const sentence = unit.sentences.find((x) => x.target === ex.question);
  const word = ex.question.split(' ').map((w) => w.replace(/[^A-Za-z']/g, '')).sort((a, b) => b.length - a.length)[0];
  return { ex, sentence, word: word.toLowerCase() };
}

test('a lesson with both listening types is completed through the UI; clips load and no URL reveals an answer', async ({ page }) => {
  const pack = readPack('en/pre-a1.json');
  const byId = exercisesById(pack);
  const net = recordNetwork(page);
  await loginChild(page, 'kid1');
  await page.locator(`[data-lesson-id="${LESSON}"]`).click();

  const seen = new Set();
  for (let i = 0; i < 40 && !(await lessonOver(page)); i++) {
    await expect(page.getByTestId('exercise').or(page.getByTestId('lesson-done'))).toBeVisible();
    if (await page.getByTestId('lesson-done').isVisible()) break;
    const type = await page.getByTestId('exercise').getAttribute('data-type');
    seen.add(type);
    if (type.startsWith('listen_')) {
      await page.getByTestId('listen-play').click(); // replay by hand as well as the auto-play
    }
    // listen_type without the final full stop: still correct.
    const id = await page.getByTestId('exercise').getAttribute('data-exercise-id');
    await answerCurrent(page, byId, type === 'listen_type' ? { typed: byId.get(id).answer.replace(/[.!?]$/, '') } : {});
    await expect(page.getByTestId('result-strip')).toHaveAttribute('data-result', 'correct');
    await page.getByTestId('continue-button').click();
  }
  await expect(page.getByTestId('lesson-done')).toBeVisible();
  expect(seen).toEqual(new Set(['multiple_choice', 'match_pairs', 'build_sentence', 'fill_blank', 'listen_choose', 'listen_type']));

  const clips = net.audio.filter((a) => /\/audio\/en\/[0-9a-f]{16}\.mp3$/.test(a.url));
  expect(clips.filter((a) => [200, 206].includes(a.status)).length).toBeGreaterThan(0);
  // 0 = the browser cancelled an in-flight media load because a newer clip started (WebKit does this).
  for (const a of clips) expect([0, 200, 206, 304], a.url).toContain(a.status);

  // No request (audio or API) may contain an answer: listened texts, correct options, typed answers.
  const lesson = pack.units[0].lessons[0];
  const secrets = new Set();
  for (const ex of lesson.exercises) {
    if (ex.answer) secrets.add(ex.answer);
    for (const o of ex.options ?? []) if (o.correct) secrets.add(txt(o.text));
  }
  for (const s of pack.units[0].sentences) secrets.add(s.target);
  for (const url of net.urls) {
    const decoded = decodeURIComponent(url).toLowerCase();
    for (const secret of secrets) {
      if (secret.length < 3) continue;
      expect(decoded.includes(secret.toLowerCase()), `${url} contains "${secret}"`).toBe(false);
    }
  }
});

test('the tap that opens a lesson unlocks audio (question auto-plays); tapping a word plays that word', async ({ page }) => {
  await loginChild(page, 'kid1');
  const pub = await publicPack(page);
  const byId = exercisesById(readPack('en/pre-a1.json'));
  const ex = pub.units[0].lessons[0].exercises;
  await hookPlaying(page);

  await page.locator(`[data-lesson-id="${LESSON}"]`).click();
  // First exercise: "cat" in English — read aloud without any further tap (autoplay policy requires the unlock).
  await expect(page.getByTestId('exercise')).toHaveAttribute('data-exercise-id', ex[0].id);
  await expect.poll(() => played(page)).toContain(ex[0].audio);

  // An English sentence question (review lesson): tap its longest word.
  const { ex: q, word } = sentenceQuestion(readPack('en/pre-a1.json'));
  await page.goto(`/lesson/${REVIEW}`);
  await hookPlaying(page); // a new document: hook the audio element again
  await playUntil(page, byId, q.id);
  await page.getByTestId('mc-question').getByTestId('word').filter({ hasText: new RegExp(`^${word}$`, 'i') }).click();
  await expect.poll(() => played(page)).toContain(pub.wordAudio[word]);
});

test('the turtle plays the slow clip, a different file from the normal one', async ({ page }) => {
  await loginChild(page, 'kid1');
  const pub = await publicPack(page);
  const byId = exercisesById(readPack('en/pre-a1.json'));
  const { ex: q, sentence: authored } = sentenceQuestion(readPack('en/pre-a1.json'));
  const sentence = pub.units[0].lessons.find((l) => l.id === REVIEW).exercises.find((e) => e.id === q.id);
  const clips = pub.units[0].sentences.find((x) => x.id === authored.id);
  expect(sentence.audio).toBe(clips.audio);
  expect(sentence.audioSlow).toBe(clips.audioSlow);
  expect(sentence.audio).not.toBe(sentence.audioSlow);

  await hookPlaying(page);
  await page.goto(`/lesson/${REVIEW}`);
  await hookPlaying(page);
  await playUntil(page, byId, sentence.id);
  const question = page.getByTestId('mc-question');
  await question.getByTestId('speaker').click();
  await expect.poll(async () => (await played(page)).at(-1)).toBe(sentence.audio);
  await question.getByTestId('speaker-slow').click();
  await expect.poll(async () => (await played(page)).at(-1)).toBe(sentence.audioSlow);
});
