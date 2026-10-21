// Test-only clock. With NODE_ENV=test and ANZO_FAKE_NOW (an ISO instant), the process's clock starts at that
// instant and runs on from there (every `new Date()` and `Date.now()`), so an e2e run never crosses an Amsterdam midnight.
// ANZO_FAKE_NOW_AT (epoch ms) is the real moment the fake instant stands for (default: when the clock is installed), so the
// test runner can compute the same clock (scripts/e2e.js → ANZO_E2E_CLOCK_OFFSET_MS). Ignored unless NODE_ENV=test.
export function installTestClock(env = process.env) {
  if (env.NODE_ENV !== 'test' || !env.ANZO_FAKE_NOW) return null;
  const fake = Date.parse(env.ANZO_FAKE_NOW);
  if (!Number.isFinite(fake)) throw new Error(`ANZO_FAKE_NOW is not a date: ${env.ANZO_FAKE_NOW}`);
  const RealDate = globalThis.Date;
  const at = env.ANZO_FAKE_NOW_AT ? Number(env.ANZO_FAKE_NOW_AT) : RealDate.now();
  const offset = fake - at;
  class OffsetDate extends RealDate {
    constructor(...args) {
      if (args.length) super(...args);
      else super(RealDate.now() + offset);
    }

    static now() {
      return RealDate.now() + offset;
    }
  }
  globalThis.Date = OffsetDate;
  return { offset, uninstall: () => { globalThis.Date = RealDate; } };
}
