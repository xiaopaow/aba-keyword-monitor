#!/usr/bin/env bash
set -euo pipefail

cd /srv/deepaurum/app
git fetch origin main
git checkout main
git pull --ff-only origin main
npm ci
npm run build --workspace @aba/shared
npm run build --workspace @aba/api
npm run build --workspace @aba/web

sudo systemctl restart deepaurum-api deepaurum-web
sudo systemctl reload nginx
sudo systemctl --no-pager --full status deepaurum-api deepaurum-web
