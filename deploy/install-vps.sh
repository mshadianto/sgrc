#!/usr/bin/env bash
# Pasang ShariaGuard SGRC Office di VPS (Ubuntu, Node 20+, Caddy dengan conf.d).
# Pakai: sudo bash deploy/install-vps.sh   (jalankan dari folder repo)
set -euo pipefail
APP=/opt/sgrc-office
id sgrc >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin sgrc
mkdir -p "$APP" /var/lib/sgrc-office
rsync -a --delete --exclude node_modules --exclude .next --exclude .env ./ "$APP"/
cd "$APP"
[ -f .env ] || { cp deploy/sgrc.env.example .env; chmod 600 .env; echo ">> Isi $APP/.env lalu jalankan ulang skrip ini."; exit 1; }
npm ci --no-audit --no-fund
set -a; . ./.env; set +a
NEXT_TELEMETRY_DISABLED=1 npm run build
chown -R sgrc:sgrc "$APP" /var/lib/sgrc-office
cp deploy/sgrc-gateway.service deploy/sgrc-studio.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now sgrc-gateway sgrc-studio
systemctl restart sgrc-gateway sgrc-studio
if [ -d /etc/caddy/conf.d ]; then cp deploy/sgrc.caddy /etc/caddy/conf.d/sgrc.caddy && systemctl reload caddy; fi
sleep 3
curl -fsS http://127.0.0.1:18790/health && echo
curl -fsS -o /dev/null -w "Studio HTTP %{http_code}\n" http://127.0.0.1:8113/office || true
