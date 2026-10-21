#!/usr/bin/env bash
# Restore the Anzo database from a backup made by backup-db.sh.
#
#   sudo scripts/restore-db.sh /var/backups/anzo/db/anzo-YYYYmmdd-HHMMSS.sqlite.gz
#       production: verifies the backup, stops anzo.service, keeps the current database as
#       anzo.sqlite.before-restore-<ts> (plus its -wal/-shm, if any), restores, sets owner anzo:anzo 640,
#       starts the service and waits for /api/health.
#   scripts/restore-db.sh <backup> --data-dir DIR
#       scratch/test: the same file steps in DIR, without touching the service or ownership.
#
# The backup's integrity is checked before anything is stopped or moved; a bad backup changes nothing.
set -euo pipefail
umask 027

DATA_DIR=/opt/anzo/data
SERVICE=anzo
MANAGE_SERVICE=1
BACKUP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --data-dir) DATA_DIR="$2"; MANAGE_SERVICE=0; shift 2 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    -*) echo "unknown option $1" >&2; exit 2 ;;
    *) BACKUP="$1"; shift ;;
  esac
done

log() { echo "$(date -Iseconds) anzo-restore: $*"; }
fail() { log "FAILED: $*"; exit 1; }

[[ -n "$BACKUP" ]] || fail "usage: $0 <backup.sqlite.gz|backup.sqlite> [--data-dir DIR]"
[[ -r "$BACKUP" ]] || fail "backup not readable: $BACKUP"
[[ -d "$DATA_DIR" ]] || fail "data directory does not exist: $DATA_DIR"
if [[ "$MANAGE_SERVICE" == 1 && "$(id -u)" != 0 ]]; then fail "run with sudo (it stops and starts $SERVICE.service)"; fi

DB="$DATA_DIR/anzo.sqlite"
TS="$(date +%Y%m%d-%H%M%S)"
tmp="$(mktemp "$DATA_DIR/.restore.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

# 1. Unpack next to the database (same filesystem, so the final step is an atomic rename) and verify.
case "$BACKUP" in
  *.gz) gzip -dc "$BACKUP" >"$tmp" || fail "cannot decompress $BACKUP" ;;
  *) cp "$BACKUP" "$tmp" ;;
esac
check="$(sqlite3 -bail "$tmp" 'PRAGMA integrity_check;' 2>&1)" || fail "not a readable SQLite database: $check"
[[ "$check" == "ok" ]] || fail "integrity_check of the backup: $check"
users="$(sqlite3 -bail "$tmp" 'SELECT COUNT(*) FROM users;' 2>&1)" || fail "backup has no users table: $users"
log "backup verified: integrity_check=ok users=$users ($BACKUP)"

# 2. Stop the service so nothing writes while the files are swapped.
if [[ "$MANAGE_SERVICE" == 1 ]]; then
  log "stopping $SERVICE"
  systemctl stop "$SERVICE"
fi

# 3. Keep the current database (and any WAL/shared-memory files that belong to it). Until the backup is in place, any
# failure puts the current database back, so the service never starts on an empty one (which would seed admin/admin).
swapped=0
undo_swap() {
  rm -f "$tmp"
  if [[ "$swapped" == 0 && -e "$DB.before-restore-$TS" && ! -e "$DB" ]]; then
    for ext in "" -wal -shm; do [[ -e "$DB.before-restore-$TS$ext" ]] && mv "$DB.before-restore-$TS$ext" "$DB$ext"; done
    log "restore failed: the previous database is back in place"
  fi
}
trap undo_swap EXIT
if [[ -e "$DB" ]]; then
  mv "$DB" "$DB.before-restore-$TS"
  log "kept current database as $DB.before-restore-$TS"
fi
for ext in -wal -shm; do
  if [[ -e "$DB$ext" ]]; then mv "$DB$ext" "$DB.before-restore-$TS$ext"; fi
done

# 4. Put the backup in place.
mv "$tmp" "$DB"
swapped=1
chmod 640 "$DB"
if [[ "$MANAGE_SERVICE" == 1 ]]; then chown anzo:anzo "$DB" "$DB.before-restore-$TS"* 2>/dev/null || chown anzo:anzo "$DB"; fi
log "restored $DB"

# 5. Start the service again and wait until it answers.
if [[ "$MANAGE_SERVICE" == 1 ]]; then
  log "starting $SERVICE"
  systemctl start "$SERVICE"
  # /api/live: the app answers. /api/health is reported, not required: it is 503 for a single missing recording.
  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:3000/api/live >/dev/null 2>&1; then
      health="$(curl -s http://127.0.0.1:3000/api/health || true)"
      log "service answers; health: $health"
      exit 0
    fi
    sleep 1
  done
  fail "$SERVICE did not answer within 30 s (see journalctl -u $SERVICE and /var/log/anzo/app.log)"
fi
log "done (no service managed; --data-dir $DATA_DIR)"
