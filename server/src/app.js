// Express app factory. Importable by tests without listening.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import SqliteStoreFactory from 'better-sqlite3-session-store';
import helmet from 'helmet';
import compression from 'compression';
import { healthRoutes } from './routes/health.js';
import { userRoutes } from './routes/users.js';
import { accountLimiter, authRoutes } from './routes/auth.js';
import { createProxyTracker } from './ops/proxy.js';
import { contentRoutes } from './routes/content.js';
import { progressRoutes } from './routes/progress.js';
import { adminRoutes } from './routes/admin.js';
import { practiceRoutes } from './routes/practice.js';
import { profileRoutes } from './routes/profile.js';
import { courseRoutes } from './routes/courses.js';
import { correctionRoutes } from './routes/corrections.js';
import { reportRoutes } from './routes/reports.js';
import { systemRoutes } from './routes/system.js';
import { familyRoutes } from './routes/family.js';
import { listenRoutes } from './routes/listen.js';
import { rerecordRoutes } from './routes/rerecord.js';
import { sampleRoutes } from './routes/sample.js';
import { UnsupportedExerciseError } from './content/grading.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SqliteStore = SqliteStoreFactory(session);

/**
 * store: the live content (server/src/content/store.js); tests may pass plain `content` and `audio` instead.
 * Routes read ctx.content / ctx.audio per request, so a reload (SIGHUP) takes effect at once.
 */
export function createApp({ db, content, audio, store, config, logger }) {
  const live = store ?? { content, audio, status: () => ({ generation: 1 }) };
  const app = express();
  // Only the configured reverse proxy (ANZO_TRUST_PROXY) may set X-Forwarded-For/-Proto: then req.ip is the real
  // client and req.secure follows X-Forwarded-Proto; a client reaching :3000 directly cannot pretend either.
  app.set('trust proxy', config.trustProxy ?? ['loopback']);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          mediaSrc: ["'self'"],
          manifestSrc: ["'self'"],
          workerSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          // No upgrade-insecure-requests: the bare-IP http:// address must keep working.
        },
      },
    }),
  );

  // gzip JSON (packs are hundreds of KB), JS and CSS; audio/mpeg is not compressible and keeps its ranges.
  app.use(compression());

  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      // Monitoring polls (/api/health every minute, /api/live every 30 s) would fill the log: debug when they succeed.
      const urlPath = req.originalUrl.split('?')[0];
      const poll = res.statusCode < 400 && (urlPath === '/api/health' || urlPath === '/api/live');
      const level = req.originalUrl.startsWith('/api') && !poll ? 'info' : 'debug';
      // ip: which device (behind the trusted proxy, the visitor's LAN address), so an incident shows who stopped reaching
      // the app; audio and static files are debug lines, as before.
      logger[level]({ method: req.method, url: req.originalUrl, status: res.statusCode, ms: Math.round(ms), ip: req.ip }, 'request');
    });
    next();
  });

  // --- API -------------------------------------------------------------------
  const api = express.Router();
  // Writes only from the app's own pages: a browser always sends Origin on a cross-site POST/PATCH/DELETE, so another
  // site (or another app on the LAN) cannot make a logged-in browser act. Requests without Origin (curl, tests) pass.
  api.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.headers.origin) return next();
    let host = null;
    try {
      host = new URL(req.headers.origin).host;
    } catch { /* "null" or garbage */ }
    if (host !== req.headers.host) return res.status(403).json({ error: 'bad_origin' });
    next();
  });
  // API answers are always revalidated (no-cache: an unchanged pack still costs only a 304), and an error is never stored
  // by the browser, a service worker or a proxy (no-store): a refresh after a failure always reaches the server again.
  api.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache');
    const writeHead = res.writeHead;
    res.writeHead = function writeHeadNoStoreOnError(code, ...rest) {
      if (code >= 400) res.setHeader('Cache-Control', 'no-store');
      return writeHead.call(this, code, ...rest);
    };
    next();
  });
  api.use(express.json({ limit: '32kb' }));
  api.use(
    session({
      name: 'anzo.sid',
      secret: config.sessionSecret,
      store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 15 * 60 * 1000 } }),
      resave: false,
      saveUninitialized: false,
      // Every answer extends the login by 30 days: a child who plays is never logged out in the middle of a lesson.
      rolling: true,
      cookie: { maxAge: THIRTY_DAYS_MS, httpOnly: true, sameSite: 'lax', secure: 'auto', path: '/' },
    }),
  );
  const ctx = {
    db,
    config,
    logger,
    accounts: accountLimiter(config),
    proxy: createProxyTracker(config.logDir),
    store: live,
    get content() {
      return live.content;
    },
    get audio() {
      return live.audio;
    },
  };
  api.use(healthRoutes(ctx));
  api.use(userRoutes(ctx));
  api.use(authRoutes(ctx));
  api.use(contentRoutes(ctx));
  api.use(progressRoutes(ctx));
  api.use(practiceRoutes(ctx));
  api.use(profileRoutes(ctx));
  api.use(courseRoutes(ctx));
  api.use(correctionRoutes(ctx));
  api.use(reportRoutes(ctx));
  api.use(systemRoutes(ctx));
  api.use(familyRoutes(ctx));
  api.use(listenRoutes(ctx));
  api.use(rerecordRoutes(ctx));
  api.use(sampleRoutes(ctx));
  api.use(adminRoutes(ctx));
  api.use((req, res) => res.status(404).json({ error: 'not_found' }));
  app.use('/api', api);

  // --- Audio: pre-rendered, content-addressed MP3s (npm run audio:render) ----
  // Only clip files are served; manifest.json (text -> file) stays private because it would reveal
  // what a listening exercise says. Names are content hashes, so they can be cached forever.
  const AUDIO_PATH = /^\/[a-z]{2}\/[0-9a-f]{16}\.mp3$/;
  app.use('/audio', (req, res, next) => (AUDIO_PATH.test(req.path) ? next() : res.status(404).end()));
  app.use(
    '/audio',
    express.static(config.audioDir, {
      fallthrough: false,
      index: false,
      acceptRanges: true,
      setHeaders(res) {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );

  // --- Client (Vite build) ---------------------------------------------------
  const indexHtml = path.join(config.clientDist, 'index.html');
  app.use(
    express.static(config.clientDist, {
      index: false,
      setHeaders(res, filePath) {
        const hashed = filePath.includes(`${path.sep}assets${path.sep}`);
        res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );
  app.get('*', (req, res) => {
    if (!fs.existsSync(indexHtml)) {
      return res.status(503).type('text/plain').send('Client not built. Run: npm run build');
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });

  // --- Errors ----------------------------------------------------------------
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof UnsupportedExerciseError) return res.status(400).json({ error: 'exercise_not_playable' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
    if (err.status === 404 && req.originalUrl.startsWith('/audio')) return res.status(404).end();
    const status = err.status || err.statusCode || 500;
    // A client error (a malformed URL, a body too large) is the client's: info, and only the path. Error lines reach
    // Admin → System and "Copy diagnostics", so text a client chooses never lands there.
    if (status < 500) {
      logger.info({ status, path: req.originalUrl.split('?')[0], type: err.type ?? err.name }, 'client error');
      return res.status(status).json({ error: status === 413 ? 'too_large' : 'bad_request' });
    }
    logger.error({ err, path: req.originalUrl.split('?')[0] }, 'unhandled error');
    res.status(status).json({ error: 'server_error' });
  });

  return app;
}
