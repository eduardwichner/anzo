import { defineConfig, devices } from '@playwright/test';

// npm run test:live — smoke test of an installation through its HTTPS address (the reverse proxy in front of the app):
// ANZO_LIVE_URL, else ANZO_PUBLIC_URL. Read-only: logs in as ANZO_LIVE_USER, never answers exercises, changes no password
// or progress.
// Certificate problems are findings, so HTTPS errors are NOT ignored.
export default defineConfig({
  testDir: './tests',
  testMatch: /99-live-https\.spec\.js/,
  outputDir: './test-results',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.ANZO_LIVE_URL || process.env.ANZO_PUBLIC_URL || 'https://anzo.your-domain.example',
    ignoreHTTPSErrors: false,
    navigationTimeout: 20_000,
    // ANZO_LIVE_FORWARDED_PROTO=https sends the header a reverse proxy would send (for a dry run against the app itself,
    // e.g. ANZO_LIVE_URL=http://localhost:3000: the login cookie is then marked Secure as behind a proxy).
    ...(process.env.ANZO_LIVE_FORWARDED_PROTO ? { extraHTTPHeaders: { 'X-Forwarded-Proto': process.env.ANZO_LIVE_FORWARDED_PROTO } } : {}),
    actionTimeout: 15_000,
    locale: 'nl-NL',
    timezoneId: 'Europe/Amsterdam',
  },
  projects: [{ name: 'live-mobile', use: { ...devices['Pixel 7'], launchOptions: { args: ['--autoplay-policy=user-gesture-required'] } } }],
});
