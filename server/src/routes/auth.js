import { Router } from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import {
  BCRYPT_COST, deleteSessions, findUserByUsername, getStats, minPasswordLength, publicUser, setPasswordHash, setPreferences, UI_LANGS,
  validatePreferences,
} from '../lib/users.js';
import { failureLimiter } from '../lib/limiter.js';
import { withActiveTrack } from '../lib/courses.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { proxyFacts } from '../ops/proxy.js';

// Compared against when the username doesn't exist, so response time doesn't reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

/**
 * Wrong passwords per account, whatever the address: 2 × the IP limit per 15 minutes (20 by default). Shared by the
 * login and the password checks behind a session (change password, self-service reset), keyed by user id.
 */
export function accountLimiter(config) {
  return failureLimiter({ limit: 2 * (config.loginRateLimit ?? 10), windowMs: 15 * 60_000 });
}

export function authRoutes(ctx) {
  const { db, config, logger, accounts } = ctx;
  const r = Router();
  // The user as the client sees it: with the course being played (effective, from the content).
  const userJson = (u) => publicUser(withActiveTrack(db, ctx.content, u));

  // Counts failed logins only: 10 wrong passwords per minute per client IP, then 429.
  const loginLimiter = rateLimit({
    windowMs: 60_000,
    limit: config.loginRateLimit,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'too_many_attempts' },
  });

  // uiLang (optional): the language chosen on the login screen for this login. Saved to this account only,
  // and only when the login succeeds.
  r.post('/auth/login', loginLimiter, async (req, res, next) => {
    try {
      const { username, password, uiLang } = req.body || {};
      const user = typeof username === 'string' ? findUserByUsername(db, username.trim()) : null;
      if (user && accounts.blocked(user.id)) {
        logger.warn({ username: user.username, ip: req.ip }, 'login blocked: too many wrong passwords for this account');
        return res.status(429).json({ error: 'too_many_attempts' });
      }
      const ok = await bcrypt.compare(String(password ?? ''), user ? user.password_hash : DUMMY_HASH);
      if (!user || !ok) {
        if (user) accounts.fail(user.id);
        // Only a real account's name is logged: what someone typed (maybe a password in the wrong field) is not.
        logger.info({ username: user ? user.username : null, known: Boolean(user), ip: req.ip, peer: req.socket.remoteAddress }, 'login failed');
        return res.status(401).json({ error: 'invalid_credentials' });
      }
      accounts.clear(user.id);
      let current = user;
      if (UI_LANGS.includes(uiLang) && uiLang !== user.ui_lang) {
        current = setPreferences(db, user.id, { ui_lang: uiLang });
        logger.info({ username: user.username, changed: ['ui_lang'], at: 'login' }, 'preferences changed');
      }
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.userId = user.id;
        req.session.save((err2) => {
          if (err2) return next(err2);
          const proxy = proxyFacts(req);
          ctx.proxy?.noteLogin(proxy);
          logger.info({ username: user.username, ip: req.ip, peer: req.socket.remoteAddress, ...(proxy ? { forwarded: true, trusted: proxy.trusted, secure: proxy.secure } : {}) }, 'login');
          res.json({ user: userJson(current) });
        });
      });
    } catch (err) {
      next(err);
    }
  });

  r.post('/auth/logout', (req, res, next) => {
    if (!req.session) return res.status(204).end();
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('anzo.sid', { path: '/' });
      res.status(204).end();
    });
  });

  r.get('/auth/me', requireAuth(db), (req, res) => {
    res.json({ user: userJson(req.user), stats: getStats(db, req.user.id) });
  });

  // Own settings: interface language and avatar (takes effect immediately in the client).
  r.patch('/auth/me', requireAuth(db), (req, res) => {
    const { values, errors } = validatePreferences(req.body);
    if (errors) return res.status(400).json({ error: 'invalid_preferences', fields: errors });
    const user = setPreferences(db, req.user.id, values);
    logger.info({ username: user.username, changed: Object.keys(values) }, 'preferences changed');
    res.json({ user: userJson(user) });
  });

  r.post('/auth/password', requireAuth(db), async (req, res, next) => {
    try {
      const { current, next: nextPassword } = req.body || {};
      if (accounts.blocked(req.user.id)) return res.status(429).json({ error: 'too_many_attempts' });
      if (!(await bcrypt.compare(String(current ?? ''), req.user.password_hash))) {
        accounts.fail(req.user.id);
        return res.status(400).json({ error: 'wrong_current_password' });
      }
      const min = minPasswordLength(req.user.role);
      if (typeof nextPassword !== 'string' || nextPassword.length < min) {
        return res.status(400).json({ error: 'password_too_short', min });
      }
      setPasswordHash(db, req.user.id, await bcrypt.hash(nextPassword, BCRYPT_COST), { mustChange: false });
      // Every other device is logged out (a lost or shared tablet); this one stays logged in.
      const loggedOut = deleteSessions(db, req.user.id, req.sessionID);
      logger.info({ username: req.user.username, loggedOut }, 'password changed');
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return r;
}
