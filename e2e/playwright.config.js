import { defineConfig, devices } from '@playwright/test';
import { machine } from '../scripts/lib/machine.js';

// a small machine (≤ 4 vCPU or ≤ 4.5 GB) gets twice the time per test and per expectation
const slow = machine().small ? 2 : 1;

// Run through `npm run test:e2e`, which starts the isolated server this config points at.
// Tests share one server and run serially; specs that change state restore it.
// 99-live-https.spec.js runs only through playwright.live.config.js (npm run test:live).

// Strict autoplay: without a user gesture, play() is refused, so the app's audio unlock is really exercised.
const strictAutoplay = { args: ['--autoplay-policy=user-gesture-required'] };

export default defineConfig({
  testDir: './tests',
  testIgnore: /99-live-https\.spec\.js/,
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000 * slow,
  expect: { timeout: 10_000 * slow },
  reporter: [['list']],
  use: {
    baseURL: process.env.ANZO_E2E_BASE_URL || 'http://localhost:3999',
    locale: 'nl-NL',
    timezoneId: 'Europe/Amsterdam',
    // traces cost 5–15 % of the run; re-run a failing spec with ANZO_E2E_TRACE=1
    trace: process.env.ANZO_E2E_TRACE ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: strictAutoplay } },
    // Pixel 7 descriptor with its full screen height, as installed-app (standalone) users see it.
    // Specs about server state or admin screens without a phone layout run on desktop only (−2 min); everything
    // a learner sees runs on both.
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 412, height: 915 }, launchOptions: strictAutoplay },
      testIgnore: [/99-live-https\.spec\.js/, /(01-health|05-levels|06-password|13-users-admin|19-login-language|33-admin-learner)\.spec\.js/] },
    // iOS Safari is where audio unlocking breaks: run the playback specs in WebKit too.
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] }, testMatch: /(10-audio-playback|28-audio-taps|31-dialogue-audio|32-rearrange|35-b1-dutch|38-b2-types)\.spec\.js/ },
  ],
});
