// The spool (/var/spool/anzo, root:anzo-ops 2770): how the service and the background jobs talk without either running
// the other's commands. The service writes correction requests; the content job (the developer account) writes results;
// scheduled jobs and the service write small status files. Every write is atomic (temp file + rename).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SPOOL_DIRS = ['requests', 'results', 'processed', 'status'];

export function spoolPaths(spoolDir) {
  return Object.fromEntries(SPOOL_DIRS.map((d) => [d, path.join(spoolDir, d)]));
}

/** Create the subdirectories when the spool itself exists and is writable (install creates them; tests use a temp dir). */
export function ensureSpool(spoolDir) {
  for (const dir of Object.values(spoolPaths(spoolDir))) fs.mkdirSync(dir, { recursive: true, mode: 0o2770 });
}

/** The content job's TimeoutStartSec is 30 min: a 'running' status older than this belongs to a killed job. */
export const JOB_STALE_MS = 35 * 60_000;

/**
 * Write JSON atomically. The temp file has an unguessable name and is created exclusively ('wx': fails on an existing
 * file or symlink), because root jobs (watchdog, cleanup, full archive) write in group-writable spool directories:
 * a planted symlink must never make root write elsewhere. rename() replaces a symlink at `file` itself, never its target.
 */
export function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomBytes(8).toString('hex')}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 1)}\n`, { mode: 0o664, flag: 'wx' });
  fs.renameSync(tmp, file);
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export const statusFile = (spoolDir, name) => path.join(spoolDir, 'status', `${name}.json`);
export const writeStatus = (spoolDir, name, data) => writeJsonAtomic(statusFile(spoolDir, name), { ...data, writtenAt: new Date().toISOString() });
export const readStatus = (spoolDir, name) => readJson(statusFile(spoolDir, name));
