#!/usr/bin/env bash
# Online backup of the Anzo database (WAL-safe): sqlite3 .backup to a temp file, PRAGMA integrity_check
# on the copy, gzip to <dest>/anzo-YYYYmmdd-HHMMSS.sqlite.gz, keep the newest <keep> backups. A backup made by hand
# (--manual: npm run backup:db, e.g. before a migration) is anzo-manual-YYYYmmdd-HHMMSS.sqlite.gz and has a retention of its
# own (--keep-manual), so a few manual backups never push the weekly ones out.
# Runs as user anzo (systemd: anzo-backup.timer, Sundays 03:30; by hand: npm run backup:db).
# Exits non-zero and logs on any failure.
#
# Options (defaults are production):
#   --db FILE       database to back up            (/opt/anzo/data/anzo.sqlite)
#   --dest DIR      backup directory               (/var/backups/anzo/db)
#   --keep N        number of backups to keep      (15)
#   --manual        a backup made by hand          (off: the weekly timer)
#   --keep-manual N manual backups to keep         (10)
#   --stamp STAMP   timestamp in the file name     (now, YYYYmmdd-HHMMSS; tests pass their own)
#   --log FILE      log file ('' = stdout only)    (/var/log/anzo/backup.log)
set -euo pipefail
umask 027

DB=/opt/anzo/data/anzo.sqlite
DEST=/var/backups/anzo/db
KEEP=15
MANUAL=0
KEEP_MANUAL=10
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG=/var/log/anzo/backup.log

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db) DB="$2"; shift 2 ;;
    --dest) DEST="$2"; shift 2 ;;
    --keep) KEEP="$2"; shift 2 ;;
    --manual) MANUAL=1; shift ;;
    --keep-manual) KEEP_MANUAL="$2"; shift 2 ;;
    --stamp) STAMP="$2"; shift 2 ;;
    --log) LOG="$2"; shift 2 ;;
    *) echo "usage: $0 [--db FILE] [--dest DIR] [--keep N] [--manual] [--keep-manual N] [--stamp YYYYmmdd-HHMMSS] [--log FILE]" >&2; exit 2 ;;
  esac
done

TAG=""
log() {
  local line
  line="$(date -Iseconds) anzo-backup${TAG}: $*"
  echo "$line"
  if [[ -n "$LOG" ]]; then echo "$line" >>"$LOG" 2>/dev/null || true; fi
}
fail() {
  log "FAILED: $*"
  exit 1
}
trap 'fail "command failed at line $LINENO"' ERR

[[ "$MANUAL" == 1 ]] && TAG="[manual]"
[[ "$KEEP" =~ ^[1-9][0-9]*$ ]] || fail "--keep must be a positive integer (got '$KEEP')"
[[ "$KEEP_MANUAL" =~ ^[1-9][0-9]*$ ]] || fail "--keep-manual must be a positive integer (got '$KEEP_MANUAL')"
[[ "$STAMP" =~ ^[0-9]{8}-[0-9]{6}$ ]] || fail "--stamp must look like YYYYmmdd-HHMMSS (got '$STAMP')"
[[ -r "$DB" ]] || fail "database not readable: $DB"
mkdir -p "$DEST"

if [[ "$MANUAL" == 1 ]]; then prefix=anzo-manual-; keep="$KEEP_MANUAL"; else prefix=anzo-; keep="$KEEP"; fi
# a manual run's log lines say so: the Backups tile judges the weekly backups only
target="$DEST/$prefix$STAMP.sqlite.gz"
[[ -e "$target" ]] && fail "backup already exists: $target"

tmp="$(mktemp "$DEST/.anzo-backup.XXXXXX")"
trap 'rm -f "$tmp" "$tmp.gz"' EXIT

sqlite3 -bail "$DB" ".backup '$tmp'" || fail "sqlite3 .backup of $DB failed"
check="$(sqlite3 -bail "$tmp" 'PRAGMA integrity_check;')" || fail "integrity_check could not run on the copy"
[[ "$check" == "ok" ]] || fail "integrity_check on the copy: $check"

gzip -9 -c "$tmp" >"$tmp.gz"
mv "$tmp.gz" "$target"

# Rotation per kind (weekly or manual): file names sort by time; keep the newest $keep of the same kind.
deleted=0
while IFS= read -r old; do
  rm -f -- "$old"
  deleted=$((deleted + 1))
done < <(find "$DEST" -maxdepth 1 -type f -name "${prefix}[0-9]*-[0-9]*.sqlite.gz" -printf '%f\n' | sort -r | tail -n +"$((keep + 1))" | sed "s|^|$DEST/|")

kept="$(find "$DEST" -maxdepth 1 -type f -name "${prefix}[0-9]*-[0-9]*.sqlite.gz" | wc -l)"
log "ok file=$target bytes=$(stat -c %s "$target") integrity=ok kept=$kept deleted=$deleted"
