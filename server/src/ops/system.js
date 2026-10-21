// Facts about the running installation that the service may read itself (it never runs git, systemctl or sudo).
import fs from 'node:fs';
import path from 'node:path';
import { dbProblems, staticProblems } from '../routes/health.js';
import { JOB_STALE_MS, readStatus } from './spool.js';
import { lastLines, readAcks, recentProblems, serviceStarts } from './logs.js';
import { openReportCount } from './reports.js';
import { redact } from './diagnostics.js';
import { listenPool, liveAudioCheck } from '../lib/listen.js';

/** The checked-out commit, read from .git directly: { hash, short } or null. */
export function gitCommit(rootDir) {
  try {
    const gitDir = path.join(rootDir, '.git');
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref: ')) return { hash: head, short: head.slice(0, 7) };
    const ref = head.slice(5);
    let hash = null;
    const loose = path.join(gitDir, ref);
    if (fs.existsSync(loose)) hash = fs.readFileSync(loose, 'utf8').trim();
    else {
      const packed = fs.readFileSync(path.join(gitDir, 'packed-refs'), 'utf8');
      hash = packed.split('\n').find((l) => l.endsWith(` ${ref}`))?.split(' ')[0] ?? null;
    }
    return hash ? { hash, short: hash.slice(0, 7), ref } : null;
  } catch {
    return null;
  }
}

// ---- Admin → System -------------------------------------------------------------------------------------------------

const DAY = 86_400_000;
const ago = (iso, now) => (iso ? now - new Date(iso).getTime() : Infinity);
export const DISK_AMBER = 2 * 1024 ** 3;
export const DISK_RED = 1024 ** 3;
const RANK = { green: 0, amber: 1, red: 2 };
const worst = (levels) => levels.reduce((w, l) => (RANK[l] > RANK[w] ? l : w), 'green');

/** Newest database backup (file name carries the time) and the last line of backup.log. */
function dbBackup(config, now) {
  const dir = path.join(config.backupDir, 'db');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => /^anzo-\d{8}-\d{6}\.sqlite\.gz$/.test(f)).sort();
  } catch { /* not readable or missing */ }
  const newest = files[files.length - 1];
  let at = null;
  let bytes = null;
  if (newest) {
    const m = newest.match(/anzo-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
    try {
      const st = fs.statSync(path.join(dir, newest));
      at = st.mtime.toISOString();
      bytes = st.size;
    } catch {
      at = m ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`).toISOString() : null;
    }
  }
  // the last line about a weekly backup: manual runs (npm run backup:db) are tagged and never decide the tile
  const last = lastLines(config.logDir, 'backup.log', 50).filter((l) => !/anzo-backup\[manual\]:/.test(l)).at(-1) ?? null;
  const failed = last ? /FAILED/.test(last) : false;
  const level = !newest || failed || ago(at, now) > 8 * DAY ? 'red' : 'green';
  return { level, file: newest ?? null, at, bytes, count: files.length, lastLine: last, failed };
}

/**
 * The Problems list: the last 14 days, without acknowledged ones (until they occur again), redacted like the diagnostics
 * (log lines can carry anything). { problems: [{ key, time, level, source, message, raw }], acknowledged }
 */
export function problemsView(db, config, now = Date.now()) {
  const { problems, acknowledged } = recentProblems(config.logDir, { now, acks: readAcks(db) });
  const secrets = [config.sessionSecret];
  return { problems: problems.map((p) => ({ ...p, message: redact(p.message, { secrets }), raw: redact(p.raw, { secrets }) })), acknowledged };
}

/**
 * Clips whose file was written after the last full audio check (recorded again, a lexicon change, audio:fix): they replaced
 * a file, so the count of clips does not show them. Cached per audio object and check time.
 */
const changedCache = new WeakMap();
export function clipsChangedSince(audio, audioDir, checkedAt) {
  const at = Date.parse(checkedAt ?? '');
  if (!audio?.clips || !audioDir || Number.isNaN(at)) return 0;
  const hit = changedCache.get(audio);
  if (hit?.at === at) return hit.n;
  let n = 0;
  for (const c of audio.clips) {
    try {
      if (fs.statSync(path.join(audioDir, c.file)).mtimeMs > at) n += 1;
    } catch { /* a missing file is the Content tile's business */ }
  }
  changedCache.set(audio, { at, n });
  return n;
}

/** Everything the System page shows: tiles (level + data; the client words them) and the newest problems. */
export function collectSystem({ db, config, store, proxy: proxyTracker }, { now = Date.now(), withProblems = true } = {}) {
  const { content, audio } = store;
  const spool = config.spoolDir;
  const service = readStatus(spool, 'service');
  const restart = readStatus(spool, 'restart');
  const startedAt = new Date(now - process.uptime() * 1000).toISOString();
  const restartReason = restart && Math.abs(new Date(restart.at).getTime() - new Date(startedAt).getTime()) < 5 * 60_000 ? restart : null;

  const proxy = proxyTracker?.last() ?? null;
  const health = [...dbProblems(db), ...staticProblems({ content, audio })];
  const st = store.status?.() ?? {};
  const contentLevel = audio.missing || st.lockProblems?.length || st.lastReload?.ok === false ? 'amber' : 'green';

  const backup = dbBackup(config, now);
  const archive = readStatus(spool, 'archive');
  const archiveLevel = !archive ? 'amber' : !archive.ok ? 'red' : ago(archive.at, now) > 8 * DAY ? 'amber' : 'green';

  let disk = null;
  try {
    const s = fs.statfsSync('/');
    disk = { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize };
  } catch { /* unknown */ }
  const diskLevel = !disk ? 'amber' : disk.freeBytes < DISK_RED ? 'red' : disk.freeBytes < DISK_AMBER ? 'amber' : 'green';

  const integrity = readStatus(spool, 'integrity');
  const integrityLevel = !integrity ? 'amber' : !integrity.ok ? 'red' : integrity.skipped || ago(integrity.writtenAt, now) > 2 * DAY ? 'amber' : integrity.warnings?.length ? 'amber' : 'green';

  const job = readStatus(spool, 'content-job');
  const queued = db.prepare("SELECT id, created_at FROM content_corrections WHERE status = 'queued' ORDER BY id").all();
  const lastDone = db.prepare("SELECT id, status, result_reason, finished_at FROM content_corrections WHERE status IN ('applied', 'rejected') ORDER BY id DESC LIMIT 1").get();
  // A job "running" for longer than its systemd timeout (30 min) was killed: as stuck as one that never started.
  const jobDead = job?.state === 'running' && ago(job.startedAt, now) > JOB_STALE_MS;
  const stuck = (queued.length && ago(queued[0].created_at, now) > 15 * 60_000 && job?.state !== 'running') || jobDead;
  const jobLevel = stuck ? 'red' : lastDone?.result_reason === 'The content job failed unexpectedly.' ? 'amber' : 'green';

  const watchdog = readStatus(spool, 'watchdog');
  const restarts7d = (watchdog?.restarts ?? []).filter((r) => ago(r.at ?? r, now) < 7 * DAY);
  const watchdogLevel = !watchdog ? 'amber' : watchdog.stopped ? 'red' : ago(watchdog.lastCheck, now) > 10 * 60_000 ? 'amber' : restarts7d.length ? 'amber' : 'green';

  // npm run audio:check (authoring time) leaves its result here; clips rendered since then are counted as not checked. The
  // tile shows the current state: that result combined with the latest Listen-check verdict per current file.
  const audioCheck = readStatus(spool, 'audio-check');
  const unchecked = audioCheck
    ? Math.max(0, (audio.expected ?? 0) - (audioCheck.clips ?? 0), clipsChangedSince(audio, config.audioDir, audioCheck.checkedAt)) : null;
  let live = null;
  if (audioCheck) {
    try {
      live = liveAudioCheck(audioCheck, db.prepare('SELECT * FROM listen_checks ORDER BY id').all(), listenPool(content, audio));
    } catch { /* no verdicts table (a test database): the check's own numbers */ }
  }
  const flaggedNow = live ? live.flagged : audioCheck?.flagged ?? 0;
  const audioCheckLevel = !audioCheck || flaggedNow || audioCheck.failed || unchecked ? 'amber' : 'green';

  const openReports = openReportCount(db);
  const oldestOpen = db.prepare("SELECT MIN(created_at) FROM content_reports WHERE status = 'open'").pluck().get();
  const reportsLevel = oldestOpen && ago(oldestOpen, now) > 7 * DAY ? 'amber' : 'green';

  const tiles = [
    // Proxy: amber when the last login through the reverse proxy came from a peer ANZO_TRUST_PROXY does not name, or its
    // cookie was not Secure (the app then cannot tell HTTPS from HTTP behind the proxy).
    { id: 'app', level: proxy && (!proxy.trusted || proxy.secure === false) ? 'amber' : 'green',
      data: { version: config.version, commit: gitCommit(config.rootDir)?.short ?? null, startedAt, uptimeS: Math.round(process.uptime()), restartReason, pid: service?.pid ?? process.pid, proxy } },
    { id: 'health', level: health.length ? 'red' : 'green', data: { ok: !health.length, problems: health } },
    { id: 'content', level: contentLevel, data: { packs: [...content.packs.keys()], audioMissing: audio.missing, generation: st.generation ?? 1, loadedAt: st.loadedAt ?? null, lastReload: st.lastReload ?? null, lockProblems: st.lockProblems ?? [] } },
    { id: 'backups', level: worst([backup.level, archiveLevel]), data: { db: backup, archive: archive ?? null } },
    { id: 'disk', level: diskLevel, data: disk ?? {} },
    { id: 'integrity', level: integrityLevel, data: integrity ? { at: integrity.writtenAt, ok: integrity.ok, errors: integrity.errors, warnings: integrity.warnings, info: integrity.info } : null },
    { id: 'jobs', level: jobLevel, data: { queued: queued.length, stuck: Boolean(stuck), job: job ?? null, last: lastDone ? { id: lastDone.id, status: lastDone.status, reason: lastDone.result_reason, at: lastDone.finished_at } : null } },
    { id: 'watchdog', level: watchdogLevel, data: watchdog ? { lastCheck: watchdog.lastCheck, lastOk: watchdog.lastOk, restarts7d: restarts7d.length, restarts: restarts7d, stopped: Boolean(watchdog.stopped) } : null },
    { id: 'reports', level: reportsLevel, data: { open: openReports, oldestOpen } },
    { id: 'audiocheck', level: audioCheckLevel, data: audioCheck ? {
      at: audioCheck.checkedAt, clips: audioCheck.clips, flagged: flaggedNow, flaggedAtCheck: audioCheck.flagged,
      heardBad: live?.heardBad ?? 0, explained: audioCheck.explained ?? 0, failed: audioCheck.failed ?? 0, unchecked,
      worst: live ? live.worst : (audioCheck.worst ?? []).slice(0, 3).map((w) => ({ track: w.track, text: w.text, flags: w.flags })),
    } : null },
  ];
  return {
    level: worst(tiles.map((t) => t.level)),
    tiles,
    // Log lines can carry anything: the page gets them redacted like the diagnostics.
    ...(withProblems ? problemsView(db, config, now) : {}),
    restarts: { watchdog: restarts7d, serviceStarts: withProblems ? serviceStarts(config.logDir, new Date(now - 7 * DAY).toISOString()) : [] },
  };
}
