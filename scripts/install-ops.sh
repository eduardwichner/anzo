#!/usr/bin/env bash
# Sets up Anzo's privilege model and background jobs. Safe to re-run (it converges; it never deletes data).
#   group anzo-ops (anzo + the developer account) · /var/spool/anzo (root:anzo-ops 2770) · /var/log/anzo (root:anzo-ops 2755)
#   /etc/sudoers.d/anzo-jobs · systemd units and timers from deploy/ (rendered by scripts/ops/render-deploy.sh) · logrotate
# Run as the developer account (with sudo), from anywhere. ANZO_DEV_USER (the environment, else .env, else anzo-dev) is that
# account: it owns the code and runs the content job and the disk check.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/dev-user.sh
source "${REPO_DIR}/scripts/lib/dev-user.sh"
DEV_USER="$(anzo_dev_user "${REPO_DIR}/.env")"
RENDERED="$(mktemp -d)"
trap 'rm -rf "${RENDERED}"' EXIT
"${REPO_DIR}/scripts/ops/render-deploy.sh" "${RENDERED}" >/dev/null
SPOOL=/var/spool/anzo
LOGS=/var/log/anzo

echo "==> group anzo-ops (members: anzo, ${DEV_USER})"
getent group anzo-ops >/dev/null || sudo groupadd --system anzo-ops
for u in anzo "${DEV_USER}"; do
  id -nG "$u" | tr ' ' '\n' | grep -qx anzo-ops || sudo usermod -aG anzo-ops "$u"
done

echo "==> spool ${SPOOL} (root:anzo-ops 2770; files keep the group)"
sudo install -d -o root -g anzo-ops -m 2770 "${SPOOL}"
for d in requests results processed status; do sudo install -d -o root -g anzo-ops -m 2770 "${SPOOL}/${d}"; done

echo "==> logs ${LOGS} (root:anzo-ops 2755: only root creates or replaces files there; each log is pre-created)"
# Root writes here (systemd appends app.log; the watchdog, cleanup and the full archive log as root), so nobody else may
# create or replace entries (a planted symlink would redirect root's writes). Not group-writable also keeps logrotate
# willing to rotate. Writers append to their pre-created file.
sudo install -d -o root -g anzo-ops -m 2755 "${LOGS}"
sudo touch "${LOGS}/app.log" "${LOGS}/backup.log"
sudo chown anzo:anzo "${LOGS}/app.log" "${LOGS}/backup.log"
sudo chmod 640 "${LOGS}/app.log" "${LOGS}/backup.log"
sudo touch "${LOGS}/jobs.log" "${LOGS}/watchdog.log" "${LOGS}/full-backup.log"
sudo chown "${DEV_USER}:anzo-ops" "${LOGS}/jobs.log"
sudo chown root:anzo-ops "${LOGS}/watchdog.log" "${LOGS}/full-backup.log"
sudo chmod 664 "${LOGS}/jobs.log"
sudo chmod 640 "${LOGS}/watchdog.log" "${LOGS}/full-backup.log"

echo "==> backups (/var/backups/anzo and full/: root:anzo 750, archives root:anzo 640; db/: anzo 750)"
# The full archive is written by root: its folder is root's alone (no planted symlinks); anzo may read it.
sudo install -d -o root -g anzo -m 750 /var/backups/anzo /var/backups/anzo/full
sudo install -d -o anzo -g anzo -m 750 /var/backups/anzo/db
sudo find /var/backups/anzo/full -maxdepth 1 -type f -name 'anzo-full-*.tar' -exec chown root:anzo {} + -exec chmod 640 {} +

echo "==> /etc/sudoers.d/anzo-jobs"
sudo visudo -cf "${RENDERED}/anzo-jobs.sudoers" >/dev/null
sudo install -o root -g root -m 0440 "${RENDERED}/anzo-jobs.sudoers" /etc/sudoers.d/anzo-jobs

echo "==> systemd units and timers"
units=(anzo.service anzo-backup.service anzo-backup.timer anzo-content-job.path anzo-content-job.service
  anzo-integrity.service anzo-integrity.timer anzo-disk.service anzo-disk.timer anzo-watchdog.service anzo-watchdog.timer
  anzo-full-backup.service anzo-full-backup.timer anzo-cleanup.service anzo-cleanup.timer)
for u in "${units[@]}"; do sudo install -o root -g root -m 0644 "${RENDERED}/${u}" "/etc/systemd/system/${u}"; done
sudo install -o root -g root -m 0644 "${RENDERED}/anzo.logrotate" /etc/logrotate.d/anzo
sudo systemctl daemon-reload
sudo systemctl enable --quiet anzo.service anzo-content-job.path anzo-backup.timer anzo-integrity.timer anzo-disk.timer \
  anzo-watchdog.timer anzo-full-backup.timer anzo-cleanup.timer
if [[ "${NO_START:-0}" != "1" ]]; then
  sudo systemctl start anzo-content-job.path anzo-backup.timer anzo-integrity.timer anzo-disk.timer anzo-watchdog.timer \
    anzo-full-backup.timer anzo-cleanup.timer
fi
echo "==> done. A running anzo service needs a restart to join anzo-ops and see the spool: sudo systemctl restart anzo"
