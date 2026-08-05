#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=/srv/deepaurum
REPO_URL=https://github.com/xiaopaow/aba-keyword-monitor.git

sudo apt-get update
sudo apt-get install -y ca-certificates curl git nginx mysql-server certbot python3-certbot-nginx

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'Number(process.versions.node.split(`.`)[0])')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

sudo install -d -o ubuntu -g ubuntu -m 0755 \
  "$APP_ROOT" \
  "$APP_ROOT/config" \
  "$APP_ROOT/backups" \
  "$APP_ROOT/imports"

if [ ! -d "$APP_ROOT/app/.git" ]; then
  git clone "$REPO_URL" "$APP_ROOT/app"
fi

cd "$APP_ROOT/app"
git fetch origin main
git checkout main
git pull --ff-only origin main
npm ci
npm run build --workspace @aba/shared
npm run build --workspace @aba/api
npm run build --workspace @aba/web

sudo cp deploy/systemd/deepaurum-api.service /etc/systemd/system/
sudo cp deploy/systemd/deepaurum-web.service /etc/systemd/system/
sudo cp deploy/nginx/deepaurum.conf /etc/nginx/sites-available/deepaurum
sudo ln -sfn /etc/nginx/sites-available/deepaurum /etc/nginx/sites-enabled/deepaurum
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t

sudo systemctl daemon-reload
sudo systemctl enable mysql nginx deepaurum-api deepaurum-web

echo "Bootstrap complete. Create /srv/deepaurum/config/api.env and web.env before starting the app services."
