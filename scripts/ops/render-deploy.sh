#!/usr/bin/env bash
# Renders the templates in deploy/ (systemd units and timers, the sudoers file, logrotate) for this installation into
# OUTDIR: @DEV_USER@, @DEV_GROUP@ and @DEV_HOME@ become the developer account (ANZO_DEV_USER: the environment, else .env,
# else anzo-dev), its primary group and its home. scripts/install-ops.sh installs what this renders.
#   scripts/ops/render-deploy.sh OUTDIR
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../lib/dev-user.sh
source "${REPO_DIR}/scripts/lib/dev-user.sh"
OUT="${1:?usage: render-deploy.sh OUTDIR}"
DEV_USER="$(anzo_dev_user "${REPO_DIR}/.env")"
getent passwd "${DEV_USER}" >/dev/null || { echo "render-deploy: the account ${DEV_USER} does not exist (ANZO_DEV_USER)" >&2; exit 1; }
DEV_GROUP="$(id -gn "${DEV_USER}")"
DEV_HOME="$(getent passwd "${DEV_USER}" | cut -d: -f6)"
mkdir -p "${OUT}"
for f in "${REPO_DIR}"/deploy/*; do
  sed -e "s|@DEV_USER@|${DEV_USER}|g" -e "s|@DEV_GROUP@|${DEV_GROUP}|g" -e "s|@DEV_HOME@|${DEV_HOME}|g" "${f}" > "${OUT}/$(basename "${f}")"
done
if grep -l '@DEV_[A-Z]*@' "${OUT}"/* >/dev/null 2>&1; then echo "render-deploy: a placeholder is left" >&2; exit 1; fi
echo "${DEV_USER}"
