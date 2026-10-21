import { findUserById } from '../lib/users.js';

/**
 * 401 unless the session belongs to an existing user; sets req.user. An admin who must still replace a seeded or reset
 * password reaches only `/auth/*` (me, password, logout) — also his learner routes wait for it; children are
 * never blocked.
 */
export function requireAuth(db) {
  return (req, res, next) => {
    const id = req.session?.userId;
    const user = id ? findUserById(db, id) : null;
    if (!user) return res.status(401).json({ error: 'unauthenticated' });
    // the full path: a router mounted with r.use('/x', …) sees req.path without its mount
    if (user.role === 'admin' && user.must_change_password && !/^\/api\/auth\//.test(req.originalUrl.split('?')[0])) {
      return res.status(403).json({ error: 'must_change_password' });
    }
    req.user = user;
    next();
  };
}
