// The e2e server runs on a fixed clock (NODE_ENV=test + ANZO_FAKE_NOW); nothing else ever does.
import { afterEach, describe, expect, it } from 'vitest';
import { installTestClock } from '../src/lib/clock.js';
import { amsterdamDate } from '../src/lib/gamification.js';

let clock = null;
afterEach(() => {
  clock?.uninstall();
  clock = null;
});

describe('test clock', () => {
  it('ignored outside NODE_ENV=test (production never fakes time)', () => {
    expect(installTestClock({ NODE_ENV: 'production', ANZO_FAKE_NOW: '2026-10-02T10:00:00+02:00' })).toBeNull();
    expect(installTestClock({ NODE_ENV: 'test' })).toBeNull();
  });

  it('with NODE_ENV=test: starts at ANZO_FAKE_NOW (relative to ANZO_FAKE_NOW_AT) and runs on', () => {
    const at = Date.now() - 5000;
    clock = installTestClock({ NODE_ENV: 'test', ANZO_FAKE_NOW: '2026-10-02T10:00:00+02:00', ANZO_FAKE_NOW_AT: String(at) });
    const now = Date.now();
    expect(now - Date.parse('2026-10-02T08:00:00Z')).toBeGreaterThanOrEqual(5000);
    expect(now - Date.parse('2026-10-02T08:00:00Z')).toBeLessThan(10_000);
    expect(amsterdamDate(new Date())).toBe('2026-10-02');
    expect(new Date('2020-01-01T00:00:00Z').toISOString()).toBe('2020-01-01T00:00:00.000Z'); // explicit dates untouched
    expect(new Date() instanceof Date).toBe(true);
  });

  it('a malformed ANZO_FAKE_NOW fails loudly', () => {
    expect(() => installTestClock({ NODE_ENV: 'test', ANZO_FAKE_NOW: 'tomorrow' })).toThrow(/not a date/);
  });
});
