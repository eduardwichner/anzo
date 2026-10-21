// Runtime configuration from the environment. systemd provides it via EnvironmentFile=/opt/anzo/.env;
// for `npm start` / `npm run dev` the same .env is loaded here (existing env vars win).
// ANZO_DOTENV=0 skips .env entirely (the e2e runner uses this for an isolated server).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function loadConfig(env = process.env) {
  const envFile = path.join(ROOT_DIR, '.env');
  if (env === process.env && env.ANZO_DOTENV !== '0' && fs.existsSync(envFile)) {
    try {
      process.loadEnvFile(envFile);
    } catch (err) {
      // Unreadable .env (Node reports this as ENOENT or EACCES): rely on the real environment,
      // which systemd fills from EnvironmentFile. A missing SESSION_SECRET still fails below.
      console.warn(`[anzo] could not read ${envFile} (${err.code}); using the process environment only`);
    }
  }

  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  let sessionSecret = env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 32 || sessionSecret.startsWith('change-me')) {
    if (isProduction) {
      throw new Error('SESSION_SECRET must be set to at least 32 random characters in production (see .env.example)');
    }
    sessionSecret = crypto.randomBytes(48).toString('hex'); // dev only: sessions end on restart
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  const dataDir = path.resolve(env.ANZO_DATA_DIR || path.join(ROOT_DIR, 'data'));

  return {
    version: pkg.version,
    nodeEnv,
    isProduction,
    port: Number(env.PORT || 3000),
    host: env.HOST || '0.0.0.0',
    sessionSecret,
    dataDir,
    // Pre-rendered clips (npm run audio:render). A build artifact owned by the code owner, read-only for the service.
    audioDir: path.resolve(env.ANZO_AUDIO_DIR || path.join(ROOT_DIR, 'audio')),
    contentDir: path.resolve(env.ANZO_CONTENT_DIR || path.join(ROOT_DIR, 'content')),
    // the built client; the e2e server serves its own build (client/dist-e2e), so a test run never changes the live app's
    clientDist: env.ANZO_CLIENT_DIST ? path.resolve(env.ANZO_CLIENT_DIST) : path.join(ROOT_DIR, 'client', 'dist'),
    modelsDir: path.join(ROOT_DIR, 'models'),
    logLevel: env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    rootDir: ROOT_DIR,
    // Background jobs (docs/developer/operations.md, "Privilege model"): requests/results/status files shared with the jobs (group anzo-ops).
    spoolDir: path.resolve(env.ANZO_SPOOL_DIR || '/var/spool/anzo'),
    logDir: path.resolve(env.ANZO_LOG_DIR || '/var/log/anzo'),
    backupDir: path.resolve(env.ANZO_BACKUP_DIR || '/var/backups/anzo'),
    // Test-only: apply content corrections in-process instead of queueing them for the job (e2e, ANZO_JOB_RUNNER=stub).
    jobRunner: env.ANZO_JOB_RUNNER === 'stub' ? 'stub' : 'spool',
    loginRateLimit: Number(env.ANZO_LOGIN_RATE_LIMIT || 10),
    // Which peer may set X-Forwarded-For/-Proto (Express "trust proxy"): the reverse proxy's address. Anything else
    // reaching :3000 directly cannot spoof its IP (the login limiter) or HTTPS (the Secure cookie flag).
    trustProxy: trustProxyValue(env.ANZO_TRUST_PROXY),
  };
}

/** ANZO_TRUST_PROXY: comma-separated addresses/subnets or Express names (loopback); default loopback only. */
export function trustProxyValue(raw) {
  const list = String(raw ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return list.length ? list : ['loopback'];
}
