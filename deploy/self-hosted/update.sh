#!/usr/bin/env bash
# XPERD — perbarui ke versi terbaru (atau versi di APP_IMAGE).
#   ./update.sh                  # pakai APP_IMAGE dari .env
#   ./update.sh sha-1a2b3c4      # kunci ke versi tertentu
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "Jalankan install.sh lebih dulu." >&2; exit 1; }

if [ -n "${1:-}" ]; then
  sed -i -E "s|^APP_IMAGE=.*$|APP_IMAGE=ghcr.io/eternesia/xperd_one:$1|" .env
fi

echo "▸ Cadangkan database sebelum memperbarui"
mkdir -p backups
set -a; . ./.env; set +a
docker compose exec -T mysql sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines "$MYSQL_DATABASE"' \
  | gzip > "backups/xperd-$(date +%Y%m%d-%H%M%S).sql.gz"
ls -1t backups/*.sql.gz | tail -n +11 | xargs -r rm -f   # simpan 10 cadangan terakhir

echo "▸ Mengunduh image"
docker compose pull web db
echo "▸ Menerapkan migrasi"
docker compose run --rm db
echo "▸ Menjalankan ulang aplikasi"
docker compose up -d web
docker image prune -f >/dev/null
echo "✓ Selesai. Versi baru akan terlihat di Super Admin pusat dalam ±5 menit."
