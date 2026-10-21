#!/usr/bin/env bash
# Rebuild Anzo from a full archive (scripts/ops/backup-full.js): the repository from its git bundle, .env, the database,
# the voices, the recordings and the reference files; npm packages, the client build; then the service and its jobs.
#
#   scripts/restore-full.sh <anzo-full-….tar>
#       a fresh Debian 12 machine or container, as a user with sudo: install-system.sh, the repository into /opt/anzo, data into
#       /opt/anzo/data (owner anzo), install-ops.sh (group anzo-ops, spool, logs, sudoers, units, timers), start, and
#       wait for /api/health 200. /opt/anzo must be empty or missing.
#   scripts/restore-full.sh <archive> --target DIR --port N --no-systemd
#       a scratch restore as the current user, no system changes: DIR gets the repository, data/, spool/, logs/;
#       the server starts in the background on 127.0.0.1:N (pid in DIR/anzo.pid, DIR/restart.sh restarts it).
#       Needs Node.js already. Remove DIR afterwards (stop it with: kill "$(cat DIR/anzo.pid)").
set -euo pipefail

ARCHIVE=""
TARGET=/opt/anzo
PORT=3000
SYSTEMD=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --no-systemd) SYSTEMD=0; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    -*) echo "unknown option $1" >&2; exit 2 ;;
    *) ARCHIVE="$1"; shift ;;
  esac
done

started=$(date +%s)
log() { echo "$(date -Iseconds) anzo-restore-full: $*"; }
fail() { log "FAILED: $*"; exit 1; }
[[ -n "$ARCHIVE" && -r "$ARCHIVE" ]] || fail "usage: $0 <anzo-full-….tar> [--target DIR] [--port N] [--no-systemd]"
ARCHIVE="$(readlink -f "$ARCHIVE")"
if [[ -e "$TARGET" && -n "$(ls -A "$TARGET" 2>/dev/null)" ]]; then fail "$TARGET exists and is not empty"; fi

log "1/9 checking the archive"
listing="$(tar -tf "$ARCHIVE")"
for need in anzo.bundle env db/ MANIFEST.json audio/ models/; do
  grep -q "^\(\./\)\?${need}" <<<"$listing" || fail "the archive has no ${need}"
done
work="$(mktemp -d "${TMPDIR:-/tmp}/anzo-restore-work-XXXXXX")"
trap 'rm -rf "$work"' EXIT
tar -xf "$ARCHIVE" -C "$work"
# The units run the content job and the disk check as the developer account (ANZO_DEV_USER: the environment, else the
# archived .env, else anzo-dev); restore as that account.
# shellcheck source=lib/dev-user.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/dev-user.sh"
DEV_USER="$(anzo_dev_user "$work/env")"
if [[ "$SYSTEMD" == 1 && "$(id -un)" != "$DEV_USER" ]]; then fail "run this as the user $DEV_USER (ANZO_DEV_USER: it owns /opt/anzo and runs the content job)"; fi

if [[ "$SYSTEMD" == 1 ]]; then
  command -v git >/dev/null || { sudo apt-get update -y && sudo apt-get install -y git; }
fi
log "2/9 the repository (git bundle, full history) into $TARGET"
mkdir -p "$(dirname "$TARGET")"
[[ -d "$TARGET" ]] || mkdir -p "$TARGET" 2>/dev/null || { sudo mkdir -p "$TARGET" && sudo chown "$(id -un):$(id -gn)" "$TARGET"; }
git clone -q "$work/anzo.bundle" "$TARGET"
git -C "$TARGET" remote remove origin
git -C "$TARGET" log --oneline -1

if [[ "$SYSTEMD" == 1 ]]; then
  log "3/9 system packages, Node.js, user anzo (install-system.sh)"
  SKIP_PLAYWRIGHT=1 "$TARGET/scripts/install-system.sh"
else
  log "3/9 system packages: skipped (--no-systemd; Node $(node -v) is used as it is)"
fi

log "4/9 .env, voices, recordings, reference files, local documents"
cp "$work/env" "$TARGET/.env"
chmod 640 "$TARGET/.env"
cp -a "$work/models/." "$TARGET/models/"
mkdir -p "$TARGET/audio" && cp -a "$work/audio/." "$TARGET/audio/"
if [[ -d "$work/content/reference" ]]; then cp -a "$work/content/reference/." "$TARGET/content/reference/"; fi
# the local documents git ignores (notes, working papers): back in their places
if [[ -d "$work/local" ]]; then cp -a "$work/local/." "$TARGET/"; fi

log "5/9 npm packages (npm ci)"
(cd "$TARGET" && npm ci --no-audit --no-fund --loglevel=error)
log "6/9 building the app"
(cd "$TARGET" && npm run -s build >/dev/null)

db_file="$(ls -1 "$work"/db/anzo-*.sqlite.gz | sort | tail -1)"
log "7/9 the database from $(basename "$db_file")"
if [[ "$SYSTEMD" == 1 ]]; then
  sudo install -d -o anzo -g anzo -m 750 "$TARGET/data"
  gunzip -c "$db_file" | sudo -u anzo tee "$TARGET/data/anzo.sqlite" >/dev/null
  sudo chmod 640 "$TARGET/data/anzo.sqlite"
  check="$(sudo -u anzo sqlite3 "$TARGET/data/anzo.sqlite" 'PRAGMA integrity_check;')"
else
  mkdir -p "$TARGET/data"
  gunzip -c "$db_file" > "$TARGET/data/anzo.sqlite"
  check="$(node -e "const D=require('$TARGET/node_modules/better-sqlite3');const d=new D('$TARGET/data/anzo.sqlite',{readonly:true});console.log(d.pragma('integrity_check',{simple:true}))")"
fi
[[ "$check" == "ok" ]] || fail "the restored database fails integrity_check: $check"

if [[ "$SYSTEMD" == 1 ]]; then
  log "8/9 service, background jobs and timers (install-ops.sh), Python tools for audio (fetch-models.sh)"
  sudo chown "$(id -un):anzo" "$TARGET/.env"
  # Timers start only after the app answers: an early watchdog run would record a restart of an app still installing.
  NO_START=1 "$TARGET/scripts/install-ops.sh"
  "$TARGET/scripts/fetch-models.sh" || log "warning: fetch-models.sh failed; the app works, new recordings need it (run it again later)"
  # chmod -R fails on data/ (anzo's, 750): never let that stop the script (set -e) before .env is made private again.
  chmod -R o+rX "$TARGET" 2>/dev/null || true
  chmod 640 "$TARGET/.env"
  sudo systemctl restart anzo
else
  log "8/9 starting the server in the background on 127.0.0.1:$PORT"
  mkdir -p "$TARGET/spool"/{requests,results,processed,status} "$TARGET/logs"
  cat > "$TARGET/restart.sh" <<EOF
#!/usr/bin/env bash
# Scratch restore: (re)start the server; used by hand and by the watchdog test (--restart-cmd).
cd "$TARGET"
if [[ -f anzo.pid ]]; then kill -CONT "\$(cat anzo.pid)" 2>/dev/null || true; kill -9 "\$(cat anzo.pid)" 2>/dev/null || true; fi
PORT=$PORT HOST=127.0.0.1 NODE_ENV=production ANZO_DATA_DIR="$TARGET/data" ANZO_SPOOL_DIR="$TARGET/spool" \\
  ANZO_LOG_DIR="$TARGET/logs" ANZO_BACKUP_DIR="$TARGET/backups" ANZO_AUDIO_DIR="$TARGET/audio" ANZO_CONTENT_DIR="$TARGET/content" \\
  nohup node server/src/index.js >> "$TARGET/logs/app.log" 2>&1 &
echo \$! > anzo.pid
EOF
  chmod +x "$TARGET/restart.sh"
  "$TARGET/restart.sh"
fi

log "9/9 waiting for the app (/api/live), then /api/health"
for i in $(seq 1 60); do
  curl -fsS "http://127.0.0.1:$PORT/api/live" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/api/live" >/dev/null 2>&1 || fail "the app did not answer /api/live within 60 s"
code="$(curl -s -o "$work/health.json" -w '%{http_code}' "http://127.0.0.1:$PORT/api/health" || true)"
if [[ "$SYSTEMD" == 1 ]]; then
  sudo systemctl start anzo-content-job.path anzo-backup.timer anzo-integrity.timer anzo-disk.timer anzo-watchdog.timer \
    anzo-full-backup.timer anzo-cleanup.timer
  # A fresh database backup and archive, so the Backups tile is green from the start.
  sudo -u anzo "$TARGET/scripts/backup-db.sh" >/dev/null || log "warning: the first database backup failed (see /var/log/anzo/backup.log)"
fi
# 503 = the app works but something is missing (e.g. recordings: npm run audio:render); the problems say what.
[[ "$code" == 200 ]] || log "warning: /api/health answered $code: $(cat "$work/health.json" 2>/dev/null)"
log "done in $(( $(date +%s) - started )) s: $(cat "$work/health.json")"
