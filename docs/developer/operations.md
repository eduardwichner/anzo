# Operations

Part of the developer docs (`CONTRIBUTING.md` → *Developer docs*). The privilege model, the spool and the background jobs, the
service unit, backups and the full archive, the content job, reports and messages, the System page. What the operator does
with all of this: `docs/operator-guide.md`.

## Privilege model and background jobs
The service (`anzo`) never runs Piper, git, npm or sudo; jobs running as the developer account (`ANZO_DEV_USER`, default `anzo-dev`: it owns the code; the units and the sudoers file in `deploy/` are templates `scripts/ops/render-deploy.sh` fills in) never write `data/`. They talk through
files in the spool. `scripts/install-ops.sh` creates all of this (idempotent; it is also what a restore runs).

```
                     group anzo-ops = { anzo, anzo-dev }
 anzo.service (anzo) ──writes──> /var/spool/anzo/requests/<id>.json      (root:anzo-ops 2770, every subdir too)
   │  reads results/, status/        │ anzo-content-job.path (DirectoryNotEmpty)
   │  SIGHUP = reload content        ▼
   │                         anzo-content-job.service (anzo-dev) ─ YAML → generate → validate/trace → lock → audio
   │                           → tests → git commit → sudo systemctl reload anzo → health + integrity → results/<id>.json
   │ writes status/content.json (after every load: generation, legacy, integrity) — the job waits for it
   ▼
 timers: anzo-integrity (anzo, 03:15) · anzo-disk (anzo-dev, hourly) · anzo-watchdog (root, 2 min, /api/live)
         anzo-backup (anzo, Sun 03:30) · anzo-full-backup (root, Sun 04:00) · anzo-cleanup (root, Sun 05:00)
         → status/<name>.json + /var/log/anzo/<log>  →  Admin → System
```

| Path | Owner / mode | Written by |
|---|---|---|
| `/var/spool/anzo/{requests,results,processed,status}` | `root:anzo-ops 2770` | service (requests, status/content+service), jobs (results, status/*) |
| `/var/log/anzo` | `root:anzo-ops 2755` (only root creates or replaces entries: root appends there, and logrotate requires it) | `app.log` + `backup.log` `anzo:anzo 640`; `jobs.log` `anzo-dev:anzo-ops 664`; `watchdog.log`, `full-backup.log` `root:anzo-ops 640` — all pre-created by `install-ops.sh` |
| `/opt/anzo/data` | `anzo:anzo 750` | the service only |
| `/etc/sudoers.d/anzo-jobs` | `root 0440` | the developer account may, without a password: as root, `systemctl reload anzo` and `systemctl restart anzo`; as `anzo`, `sqlite3` on the live database for a `.backup` copy into `/tmp/anzo-integrity-*` (`check:integrity`), on that copy, and `rm -f` of it, plus `sqlite3 -readonly …` (`publish:check`, `audio:check`). Every `sudo -n` in the scripts needs a rule here (`server/test/deploy.test.js` scans for them); the other `sudo` calls (`install-ops.sh`, `ops:restart-check`, `backup:db`, `backup:full`, restores) are interactive and use the account's ordinary sudo |

A shell that was open before `install-ops.sh` added the developer account to `anzo-ops` does not have the group yet: use `sudo` (or
`sg anzo-ops -c …`) to read the spool from it; systemd units get the group at once.

## The service unit

`ProtectSystem=strict` and write access only to `/opt/anzo/data`, `/var/log/anzo` and `/var/spool/anzo`.
`sudo systemctl reload anzo` reloads content (SIGHUP). Changes to `deploy/*`: run `scripts/install-ops.sh` (copies every unit,
the sudoers file and logrotate, `daemon-reload`, enables the timers).

**Backups.** `anzo-backup.timer` (`OnCalendar=Sun 03:30`, `Persistent=true`) starts `anzo-backup.service`
(oneshot, user `anzo`, `ProtectSystem=strict`, writable: `data/` (WAL shm while reading), `/var/backups/anzo`,
`/var/log/anzo`). Output: journal (`journalctl -u anzo-backup`) and `/var/log/anzo/backup.log` (logrotate glob).
`npm run backup:db` (by hand, e.g. before a migration) writes `anzo-manual-YYYYmmdd-HHMMSS.sqlite.gz` with a retention of its
own (newest 10, `--keep-manual`), so manual backups never push the weekly ones (newest 15) out (the System tile and the full
archive use the weekly ones).
`/var/backups/anzo` and `full/` are `root:anzo 750` (archives `root:anzo 640`: root writes there, so nobody else may create
entries), `db/` is `anzo:anzo 750` (the backup job writes it; the full archive reads its newest file with `O_NOFOLLOW`). `systemctl list-timers anzo-backup.timer` shows the next run.
They live on the same disk: a backup of the whole machine (e.g. Proxmox `vzdump`) or a copy elsewhere covers a lost disk. The
full archive (`anzo-full-backup.timer`, Sun 04:00, root, `scripts/ops/backup-full.js`) holds the git bundle, `.env`, the newest
DB backup, `content/reference`, `local/` (the files of `LOCAL_DOCS` in `archive-lib.js` that exist: the installation's notes
and working papers git ignores, copied without following a symlink; `restore-full.sh` puts them back in place), `models/`
(without `models/vosk`: the audio check's recognizers, re-fetched by `fetch-models.sh`), `audio/` — about 1.4 GB. **Room
first**: before `tar` writes anything, `spaceForArchive` (archive-lib.js) estimates the
archive (the work folder + the folders it takes) and requires it plus 1 GB to be free; when short, older archives are deleted
first — never the newest one already there —, and when still short nothing is written (red, with the reason). **Retention is
a budget relative to the disk** (`retention()` in
`scripts/ops/archive-lib.js`, unit-tested): keep the newest 3 while together they take at most 25 % of the disk size and at
least 4 GB stays free once the older ones are deleted; otherwise 2 under the same budget; otherwise 1 — never fewer than 1 (the
archive just written). The disk is measured (`statfs` of the archive folder) after the new archive is written; the status file
records `kept`, `note` and `budget` (disk, limit, kept bytes, free after) and the Backups tile shows them. A container whose
disk is a quota (e.g. a ZFS subvolume) reports the quota as its size, so the budget follows a resize without a code change.
`scripts/restore-full.sh` rebuilds from it (`docs/operator-guide.md` → *Rebuilding Anzo on a new server*; scratch mode
`--target --port --no-systemd`).

## Admin corrections, reports, System page

- **Admin corrections (content job).** The service only queues (`server/src/ops/corrections.js` → spool request); the job
  (`scripts/jobs/content-job-lib.js`) does, per request: preflight (`content/` clean, else paused) → surgical YAML edit (only
  the edited scalars' source ranges change; a vocabulary item whose id was derived from its target gets `id:` written out) /
  `hidden:` entry / undo: the original commit's `content/src` changes reversed (`git apply -R`; packs and lock are rebuilt, lock
  reason `undo of correction #N`, so corrections can be undone in any order) → generate the pack and the levels above → validate → trace (when target text or
  acceptAlso changed) → id lock (a removed locked id rejects; changed items or hidden exercises are locked with
  `admin correction #N: …`; hidden = `retired`) → `audio:render --keep-orphans` → vitest (validate, idlock, generator) →
  commit (author = the admin) → reload + wait for `status/content.json` → `/api/health` → the service's integrity result →
  delete orphan clips → optional push. Any failure: revert/abort, `reset --soft`, restore + clean `content/`, remove new clips,
  restore the manifest, reload the old content. The request file is untrusted (the whole `anzo-ops` group can write the spool):
  `validateRequest` checks every field before anything happens (integer id, known kind, username-shaped author, a pack id with
  a source dir, safe unit/target ids, a 40-hex undo commit). The id-lock step also rejects any locked exercise that changes
  its *type* and any new exercise id (a changed meaning can make the generator build a lesson differently). The integrity
  step rejects only errors that were not there before the correction. A run stops taking new requests after 20 minutes
  (systemd's 30-minute timeout covers one run; the path unit starts the job again while requests wait); a run killed
  midway (timeout, reboot) leaves `status/content-job.json` "running": the next run undoes what it left
  (`recoverInterrupted`: abort a revert, drop its unverified commit, restore `content/`, reload) and records the request
  as rejected ("interrupted"); the System page counts a "running" status older than 35 minutes as stuck. Editable: target, Dutch meaning, acceptAlso (sentence or vocabulary item;
  build exercises keep only reorderings). A new editable field needs `validateEdit`, `editableOf`, `applyEditToText` and the
  editor form. Rejection reasons are plain English for the admin; `detail` is for diagnostics.
- **Record again.** The content job also takes `requests/rerecord-NNNNNN.json` (a second `PathExistsGlob` in
  `anzo-content-job.path`; corrections sort first): `scripts/jobs/rerecord-lib.js`, three phases — *make* (the next take of one
  clip, rendered and checked, then `content/` and `audio/manifest.json` put back: nothing visible changes, corrections are not
  blocked), *keep* (override written, rendered, committed as `audio: record again #N`, reload, health; any failure puts it all
  back and the request returns to review), *drop* (the new file deleted). Results: `results/rerecord-NNNNNN.json`, read by the
  service's result poller (`collectRerecordResults`). A run cut off during a *make* or *keep*: the next run restores `content/`,
  lets `audio:render` rewrite the manifest and reports the request failed. Details: `docs/developer/audio.md` → *Record again*.
- **Reports and messages.** `content_reports` (snapshot = the public exercise as served + latest attempt + correct answer +
  clips), one inbox group per open exercise; `child_messages` shown once (marked shown when Home receives them; Home shows them
  as a sheet). A "fixed" message carries the bug-hunter badge when `user_badges.earned_at` equals its `created_at`.
- **Watchdog** (`scripts/ops/watchdog.js` + `watchdog-lib.js`, root, every 2 minutes): probes `/api/live`; two failures in a
  row → `systemctl reset-failed anzo; systemctl restart anzo`, at most 3 restarts an hour. A failed probe does not count
  (logged at info, `watchdog check skipped`) while systemd reports the unit activating / reloading / deactivating, while it
  is stopped (`systemctl stop` is a person's choice), or within 60 s of its last state change when `NRestarts` did not
  change (a planned `restart`/`reload`, not a crash restart by `Restart=always`), or — **startup grace** — within 5 minutes of the
  process start (`ExecMainStartTimestamp`) of a run that has never answered (`okInvocationId` ≠ its `InvocationID`), unless
  `NRestarts` rose (only a rise is a crash: after a reboot it starts again at 0). Type=simple makes systemd say "active" at exec,
  long before the app listens, and a cold start after a reboot can take minutes (2½ minutes measured on a 4 GB container),
  past the 60 s window: hence the grace. Failures of an earlier run of the service (another `InvocationID`) do not add up.
- **Problems list.** The newest 50 warnings and errors of the last 14 days (`PROBLEM_MAX_AGE_DAYS`); *Acknowledge* (one problem: its
  key, the message with numbers as `#`) and *Acknowledge all* store `problem_acks` rows and hide those entries
  until the same problem is logged again; the diagnostics say how many were left out.
- **System page.** A new tile: a status file written by its job (`writeStatus(spool, name, …)`), a tile in `collectSystem`
  (`level` + `data`), its words in `ops.system.<id>.*` (both locales) and `tileLines` in `System.jsx`. Problems come from
  `LOG_FILES` in `server/src/ops/logs.js` (JSON lines with pino levels, or `<ISO> <source>: … FAILED …` text lines).
- **Data check tile** (`integrity`): `status/integrity.json` from the nightly `check:integrity -- --status` (as `anzo`, no sudo). When
  the lessons in the working tree do not load (an authoring session half-way), it writes `{ ok: true, skipped: true, warnings:
  ['not checked: …'] }` and exits 2: amber, never the previous night's green.
- **Audio check tile** (`audiocheck`): `status/audio-check.json`, written by `npm run audio:check` (authoring time, as
  the developer account; with every flagged file in `flaggedFiles`), combined with the Listen check's latest verdict per
  current file (`liveAudioCheck`, `lib/listen.js`): flagged *now* = a current file whose latest verdict is Bad, or one the
  check flagged for something it measured that nobody has heard OK since; a flag on a file no longer in use is gone. Also
  `flaggedAtCheck`, `heardBad`, explained, failed, the worst three; `unchecked` = clips the content needs beyond those checked
  (rendered since). Amber when not run, anything flagged now or failed, or clips unchecked.
- **Restart check** (`npm run ops:restart-check`, `scripts/ops/restart-check.sh`): clears a start-limit-hit / failed state
  (`systemctl reset-failed`; systemd refuses even a manual restart after `StartLimitBurst` failures), restarts, and proves
  that a new MainPID is the only listener on :3000 and answers `/api/live` and `/api/health`. The service logs a busy port
  (`EADDRINUSE`) and exits for systemd to retry; an uncaught exception is logged (`fatal`) and exits; an unhandled
  rejection is logged and the process carries on; shutdown drops idle keep-alive connections at once, the rest after 2 s.
- **Proxy line** (App tile, `server/src/ops/proxy.js`): every login through the reverse proxy (an `X-Forwarded-*` header) records
  the peer, whether `ANZO_TRUST_PROXY` trusts it and whether the cookie was Secure (`secure: 'auto'` = `req.secure`); the login log
  line carries `forwarded, trusted, secure`. In memory; after a restart the newest such line of `app.log`/`app.log.1` fills it.
  Amber when the peer is not trusted or the cookie was not Secure.
