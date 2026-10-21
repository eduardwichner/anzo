#!/usr/bin/env bash
# Prepares a Debian 12 host for Anzo. Safe to re-run.
# Run as the unprivileged user that will develop/test Anzo (it uses sudo where needed),
# so the Playwright browser cache lands in that user's ~/.cache/ms-playwright.
set -euo pipefail

NODE_MAJOR="${NODE_MAJOR:-24}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> apt packages"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  build-essential python3 python3-venv lame sqlite3 poppler-utils git curl ca-certificates gnupg tree logrotate

echo "==> Node.js ${NODE_MAJOR}.x (NodeSource)"
current_major="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)"
if [[ "${current_major}" != "${NODE_MAJOR}" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
else
  echo "Node $(node -v) already installed"
fi

echo "==> system user anzo"
if ! id anzo >/dev/null 2>&1; then
  sudo useradd --system --home /opt/anzo --shell /usr/sbin/nologin anzo
else
  echo "user anzo exists"
fi

echo "==> Playwright Chromium + WebKit (+ OS deps)"
cd "${REPO_DIR}"
if [[ "${SKIP_PLAYWRIGHT:-0}" == "1" ]]; then
  echo "SKIP_PLAYWRIGHT=1, skipping (run again after 'npm run install:all')"
elif [[ -x node_modules/.bin/playwright ]]; then
  # Use the project's pinned Playwright so browser and test runner versions match.
  node_modules/.bin/playwright install --with-deps chromium webkit
else
  npx --yes playwright install --with-deps chromium webkit
fi

echo "==> done: node $(node -v), npm $(npm -v)"
