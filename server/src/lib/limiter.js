// Failure counting per key (an account), in memory: the IP limiter (express-rate-limit) cannot stop a guesser who
// changes address, and password checks behind a session (current password, reset confirmation) need a limit too.
// A restart clears it, which is fine: it slows guessing down, it is not an audit trail.

/** limit failures per windowMs per key. blocked(key) → true once `limit` failures fall inside the window. */
export function failureLimiter({ limit, windowMs }) {
  const hits = new Map();
  const recent = (key, now) => {
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length) hits.set(key, list);
    else hits.delete(key);
    return list;
  };
  return {
    blocked: (key, now = Date.now()) => recent(key, now).length >= limit,
    fail(key, now = Date.now()) {
      hits.set(key, [...recent(key, now), now]);
    },
    clear: (key) => hits.delete(key),
  };
}
