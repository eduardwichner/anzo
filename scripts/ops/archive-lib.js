// The weekly full archive (scripts/ops/backup-full.js): what goes in, how many are kept, and the RESTORE.txt it carries.
// Pure, unit-tested (server/test/ops.test.js).

/** Every top-level entry of an archive, with where it comes from. `required` entries must be present. */
export const ARCHIVE_ENTRIES = [
  { path: 'anzo.bundle', from: 'git bundle of the repository, every branch and the full history', required: true },
  { path: 'env', from: '/opt/anzo/.env (SESSION_SECRET and settings)', required: true },
  { path: 'db', from: 'the newest database backup (anzo-YYYYmmdd-HHMMSS.sqlite.gz)', required: true },
  { path: 'content/reference', from: 'the reference PDFs and their extracted text (not in git)', required: false },
  { path: 'local', from: 'the local documents git ignores, when present (LOCAL_DOCS: notes, working papers, reviews)', required: false },
  { path: 'models', from: 'the Piper voices (main and dialogue) and models/manifest.json (no download needed to render again; the audio check\'s Vosk models are left out: scripts/fetch-models.sh)', required: true },
  { path: 'audio', from: 'every rendered clip and audio/manifest.json (no hour of rendering after a restore)', required: true },
  { path: 'RESTORE.txt', from: 'how to restore', required: true },
  { path: 'MANIFEST.json', from: 'what is in this archive: sizes, checksums, commit, date', required: true },
];

/**
 * Files and folders of the repository that git ignores on purpose but a restore needs back: the installation's own notes and
 * the development working papers (never published). Copied into the archive's `local/` when present; never a symlink.
 */
export const LOCAL_DOCS = ['CLAUDE.md', 'docs/gotchas.md', 'docs/README-private.md', 'docs/publishing.md', 'docs/review',
  'content/review', 'content/STATUS.md',
  'server/test/local-notes.test.js'];

export const KEEP = 3;
/** The archives together may take at most this share of the disk … */
export const DISK_SHARE = 0.25;
/** … and must leave at least this much free on it. */
export const MIN_FREE_BYTES = 4 * 1000 ** 3;
/** Free space that must remain after an archive is written (the app, its database and logs keep working). */
export const RESERVE_FREE_BYTES = 1000 ** 3;

const gb = (n) => `${(n / 1000 ** 3).toFixed(2)} GB`;

/**
 * Which archives to keep (newest first by name): the newest 3 while they take at most 25 % of the disk and at least 4 GB
 * stays free once the others are deleted; otherwise 2 under the same budget, otherwise 1 — never fewer than 1 (the newest,
 * just written). `disk` = { totalBytes, freeBytes } measured after the new archive was written.
 * @param archives [{ name, bytes }]
 * @returns {{ keep: string[], remove: string[], note: string|null, budget: object }}
 */
export function retention(archives, { disk, keep = KEEP, share = DISK_SHARE, minFree = MIN_FREE_BYTES } = {}) {
  if (!disk || !(disk.totalBytes > 0)) throw new Error('retention needs the disk size ({ totalBytes, freeBytes })');
  const sorted = [...archives].sort((a, b) => (a.name < b.name ? 1 : -1));
  const sum = (from, to) => sorted.slice(from, to).reduce((s, a) => s + a.bytes, 0);
  const limit = Math.floor(disk.totalBytes * share);
  const fits = (k) => sum(0, k) <= limit && disk.freeBytes + sum(k) >= minFree;
  const want = Math.min(keep, sorted.length);
  let n = want;
  while (n > 1 && !fits(n)) n -= 1;
  let note = null;
  if (n < want) {
    const why = sum(0, want) > limit
      ? `${want} archives would take ${gb(sum(0, want))} (limit ${gb(limit)} = ${Math.round(share * 100)} % of the disk)`
      : `${want} archives would leave ${gb(disk.freeBytes + sum(want))} free (at least ${gb(minFree)})`;
    note = `kept ${n} instead of ${want}: ${why}`;
  }
  if (n === 1 && !fits(1)) note = `${note ? `${note}; ` : ''}the newest archive alone is over the budget`;
  const budget = { diskBytes: disk.totalBytes, limitBytes: limit, minFreeBytes: minFree, keptBytes: sum(0, n), freeAfterBytes: disk.freeBytes + sum(n) };
  return { keep: sorted.slice(0, n).map((a) => a.name), remove: sorted.slice(n).map((a) => a.name), note, budget };
}

/**
 * Before the archive is written: it needs about `estimateBytes` (what goes into it) and must leave
 * `reserveBytes` free for the app and the database. If the disk is short, the oldest archives may go first — never the newest
 * one already there, so a failed write never leaves no archive at all. Returns { ok, remove, note, needBytes, freeBytes }.
 */
export function spaceForArchive({ estimateBytes, freeBytes, archives = [], reserveBytes = RESERVE_FREE_BYTES }) {
  const needBytes = estimateBytes + reserveBytes;
  const older = [...archives].sort((a, b) => (a.name < b.name ? 1 : -1)).slice(1).reverse(); // oldest first, the newest kept
  const remove = [];
  let free = freeBytes;
  while (free < needBytes && remove.length < older.length) {
    free += older[remove.length].bytes;
    remove.push(older[remove.length].name);
  }
  if (free < needBytes) {
    return { ok: false, remove: [], needBytes, freeBytes,
      note: `not enough free space for the archive: it needs about ${gb(estimateBytes)} and ${gb(reserveBytes)} must stay free, ${gb(freeBytes)} is free${older.length ? ` (${gb(free)} with the older archives deleted)` : ''}; nothing was written` };
  }
  return { ok: true, remove, needBytes, freeBytes,
    note: remove.length ? `deleted ${remove.length} older archive(s) first to make room (${gb(free - freeBytes)})` : null };
}

/** Top-level entries missing from a `tar -tf` listing (only required ones count). */
export function missingEntries(listing) {
  const names = new Set(listing.map((l) => l.replace(/^\.\//, '').replace(/\/$/, '')));
  const has = (p) => names.has(p) || [...names].some((n) => n.startsWith(`${p}/`));
  return ARCHIVE_ENTRIES.filter((e) => e.required && !has(e.path)).map((e) => e.path);
}

export function restoreText({ file, commit, created }) {
  return `ANZO FULL ARCHIVE — ${created}
Commit: ${commit}

This archive rebuilds Anzo on a new machine with everything the children had: accounts, progress, badges, the lessons,
the voices and the recordings. It holds the configuration file (.env) and the database: keep it private.

Contents
${ARCHIVE_ENTRIES.map((e) => `  ${e.path.padEnd(18)} ${e.from}`).join('\n')}

Restore on a fresh Debian 12 machine or container (2+ vCPU, 2+ GB RAM, 15 GB disk), as the developer account (ANZO_DEV_USER in the archived .env, default anzo-dev) with sudo:

  1. Copy this file to the new machine, e.g. into that account's home: ~/${file}
  2. tar -xf ${file} anzo.bundle && git clone -q anzo.bundle anzo-src     (installs nothing yet)
     (if git is missing: sudo apt-get update && sudo apt-get install -y git)
  3. sudo mkdir -p /opt/anzo && sudo chown "$USER" /opt/anzo
  4. anzo-src/scripts/restore-full.sh ${file}
     It installs the system packages and Node.js, unpacks the repository into /opt/anzo, restores .env, the database,
     the voices, the recordings, the reference files and the local documents, installs the npm packages, builds the app, sets up the
     service, the background jobs and their timers, starts Anzo and waits until /api/health answers 200.
  5. Point the reverse proxy at the new machine's address and open the app.

Try a restore without touching anything (on any machine with Node.js):
  scripts/restore-full.sh ${file} --target /tmp/anzo-restore-test --port 3997 --no-systemd
`;
}
