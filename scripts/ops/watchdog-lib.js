// The watchdog's decision (pure, unit-tested): probe /api/live; two failures in a row → restart; but never more than 3
// restarts within an hour — then stop restarting and report red until the service answers again.
// A failed probe while systemd is (re)starting or reloading anzo on purpose is not a failure: see plannedSkip().
export const FAILURES_BEFORE_RESTART = 2;
export const MAX_RESTARTS_PER_HOUR = 3;
/** After a restart or reload that systemd did not make on its own, failed probes are skipped for this long. */
export const PLANNED_GRACE_MS = 60_000;
/**
 * A fresh run of the service (boot, start, restart) that has not answered once yet gets this long to load its content
 * before failed probes count. Type=simple makes systemd report "active" at exec, long before the app listens: on
 * the first start after a reboot can take minutes (cold disk, every unit starting), past the 60 s above.
 */
export const STARTUP_GRACE_MS = 5 * 60_000;
const BUSY_STATES = ['activating', 'reloading', 'deactivating'];
export const UNIT_PROPERTIES = 'ActiveState,SubState,StateChangeTimestamp,NRestarts,InvocationID,ExecMainStartTimestamp';

/**
 * Parse `systemctl show anzo -p ActiveState,SubState,StateChangeTimestamp,NRestarts,InvocationID,ExecMainStartTimestamp
 * --timestamp=unix`.
 * @returns {{ activeState, subState, stateChangeAt: number|null (ms), nRestarts: number|null, invocationId, execStartAt: number|null (ms) }}
 */
export function parseUnitState(text) {
  const kv = {};
  for (const line of String(text ?? '').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) kv[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  const ms = (v) => { const m = /^@(\d+)$/.exec(v ?? ''); return m ? Number(m[1]) * 1000 : null; };
  const n = Number.parseInt(kv.NRestarts, 10);
  return {
    activeState: kv.ActiveState || null,
    subState: kv.SubState || null,
    stateChangeAt: ms(kv.StateChangeTimestamp),
    nRestarts: Number.isFinite(n) ? n : null,
    invocationId: kv.InvocationID || null,
    execStartAt: ms(kv.ExecMainStartTimestamp),
  };
}

/**
 * Why a failed probe does not count, or null. systemd's view of the unit (null when systemctl is unavailable: never skip):
 * - activating / reloading / deactivating: a start, reload or stop is in progress;
 * - inactive: stopped on purpose (`systemctl stop anzo`) — the watchdog does not undo that;
 * - active, last state change < 60 s ago and NRestarts not raised since the previous check: a planned restart or reload
 *   (`systemctl restart|reload anzo` by an admin or the content job). A crash restarted by systemd itself
 *   (Restart=always) raises NRestarts, so it is not skipped;
 * - active, a run of the service that has never answered (its InvocationID is not the one of the last good probe), its
 *   process started < 5 min ago, NRestarts not raised: still loading after a boot or a start (STARTUP_GRACE_MS). After a
 *   reboot NRestarts starts again at 0, so only a rise counts as a crash.
 */
export function plannedSkip(unit, state, now = Date.now()) {
  if (!unit?.activeState) return null;
  if (BUSY_STATES.includes(unit.activeState)) return `anzo is ${unit.activeState}`;
  if (unit.activeState === 'inactive') return 'anzo is stopped (systemctl stop): not restarting it';
  const crashRestart = unit.nRestarts !== null && Number.isFinite(state.nRestarts) && unit.nRestarts > state.nRestarts;
  const since = unit.stateChangeAt === null ? null : now - unit.stateChangeAt;
  if (unit.activeState === 'active' && !crashRestart && since !== null && since >= 0 && since < PLANNED_GRACE_MS) {
    return `anzo was restarted or reloaded ${Math.round(since / 1000)} s ago (planned)`;
  }
  const sinceStart = unit.execStartAt == null ? null : now - unit.execStartAt;
  const neverAnswered = Boolean(unit.invocationId) && state.okInvocationId !== unit.invocationId;
  if (unit.activeState === 'active' && !crashRestart && neverAnswered && sinceStart !== null && sinceStart >= 0 && sinceStart < STARTUP_GRACE_MS) {
    return `anzo started ${Math.round(sinceStart / 1000)} s ago and has not answered yet (still loading)`;
  }
  return null;
}
const HOUR = 3600_000;
const WEEK = 7 * 24 * HOUR;

/**
 * @param state  { failures, restarts: [{ at, reason }], stopped, lastCheck, lastOk, nRestarts, invocationId, okInvocationId }
 *               (from status/watchdog.json; {} at first)
 * @param probe  { ok: boolean, error?: string }
 * @param unit   parseUnitState(…) of anzo.service, or null
 * @returns {{ state, action: 'none' | 'skip' | 'restart' | 'give-up' | 'recovered', reason?: string }}
 */
export function decide(state, probe, now = Date.now(), unit = null) {
  const at = new Date(now).toISOString();
  const restarts = (state.restarts ?? []).filter((r) => now - new Date(r.at).getTime() < WEEK);
  const seen = unit ? { nRestarts: unit.nRestarts, invocationId: unit.invocationId } : {};
  const base = { ...state, restarts, lastCheck: at, ...seen };
  if (probe.ok) {
    const action = state.stopped || state.failures ? 'recovered' : 'none';
    return { state: { ...base, failures: 0, stopped: false, lastOk: at, okInvocationId: unit?.invocationId ?? state.okInvocationId ?? null }, action };
  }
  const skip = plannedSkip(unit, state, now);
  if (skip) return { state: { ...base, failures: 0 }, action: 'skip', reason: `${skip}; /api/live: ${probe.error}` };
  // Failures count only within one run of the service: a new invocation starts the count again.
  const sameRun = !unit?.invocationId || !state.invocationId || unit.invocationId === state.invocationId;
  const failures = (sameRun ? state.failures ?? 0 : 0) + 1;
  if (failures < FAILURES_BEFORE_RESTART) return { state: { ...base, failures }, action: 'none', reason: probe.error };
  if (state.stopped) return { state: { ...base, failures }, action: 'none', reason: 'stopped restarting (too many restarts)' };
  const lastHour = restarts.filter((r) => now - new Date(r.at).getTime() < HOUR);
  if (lastHour.length >= MAX_RESTARTS_PER_HOUR) {
    return {
      state: { ...base, failures, stopped: true, stoppedAt: at },
      action: 'give-up',
      reason: `${lastHour.length} restarts in the last hour; not restarting again until /api/live answers (${probe.error})`,
    };
  }
  const reason = `/api/live failed ${failures} times in a row (${probe.error})`;
  return { state: { ...base, failures: 0, restarts: [...restarts, { at, reason }] }, action: 'restart', reason };
}
