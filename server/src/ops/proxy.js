// The last login that came through the reverse proxy (Admin → System, the App tile's "Proxy" line): the peer that forwarded
// it, whether that peer is the trusted one (ANZO_TRUST_PROXY: only then are X-Forwarded-For/-Proto believed) and whether
// the session cookie was marked Secure (secure: 'auto' = the request counted as HTTPS). Kept in memory; after a restart the
// newest such `login` line of app.log (then app.log.1) fills it.
import fs from 'node:fs';
import path from 'node:path';

const plain = (addr) => String(addr ?? '').replace(/^::ffff:/, '');

/** What a login request tells about the proxy: null when it did not come through one (no X-Forwarded-* header). */
export function proxyFacts(req) {
  if (!req.headers['x-forwarded-for'] && !req.headers['x-forwarded-proto']) return null;
  const peer = plain(req.socket.remoteAddress);
  const trustFn = req.app.get('trust proxy fn');
  return { peer, trusted: Boolean(trustFn?.(req.socket.remoteAddress, 0)), secure: Boolean(req.secure) };
}

/** The newest proxied login in the log lines (oldest first), or null. Older lines may lack trusted/secure. */
export function lastProxyLoginInLines(lines) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].includes('"login"')) continue;
    let e;
    try {
      e = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (e.msg !== 'login' || !e.peer) continue;
    const forwarded = e.forwarded ?? (e.ip !== e.peer); // older lines: a trusted proxy's login has ip ≠ peer
    if (!forwarded) continue;
    return { at: new Date(e.time).toISOString(), peer: plain(e.peer), trusted: e.trusted ?? true, secure: e.secure ?? null };
  }
  return null;
}

export function createProxyTracker(logDir) {
  let last = null;
  let scanned = false;
  return {
    noteLogin(facts, now = new Date()) {
      if (facts) last = { at: now.toISOString(), ...facts };
    },
    last() {
      if (!last && !scanned && logDir) {
        scanned = true;
        for (const f of ['app.log', 'app.log.1']) {
          let text = '';
          try {
            text = fs.readFileSync(path.join(logDir, f), 'utf8');
          } catch { /* missing or unreadable */ }
          last = lastProxyLoginInLines(text.split('\n'));
          if (last) break;
        }
      }
      return last;
    },
  };
}
