#!/usr/bin/env bash
# XPERD — pemasangan pertama di server klien.
# Jalankan dari folder ini:  sudo ./install.sh
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "Docker belum terpasang. Pasang dulu: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || die "Plugin 'docker compose' belum terpasang."

rand() { openssl rand -hex "${1:-32}" 2>/dev/null || head -c "${1:-32}" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
setvar() { # setvar KUNCI NILAI — isi hanya bila masih kosong
  local k="$1" v="$2"
  if grep -qE "^${k}=\s*($|#)" .env; then
    sed -i -E "s|^${k}=.*$|${k}=${v}|" .env
  fi
}

if [ ! -f .env ]; then
  say "Membuat .env dari .env.example"
  cp .env.example .env
  chmod 600 .env
fi

say "Mengisi rahasia acak yang masih kosong"
setvar APP_JWT_SECRET "$(rand 32)"
setvar VAULT_ENCRYPTION_KEY "$(rand 32)"
setvar CRON_SECRET "$(rand 24)"
setvar MYSQL_PASSWORD "$(rand 18)"
setvar MYSQL_ROOT_PASSWORD "$(rand 18)"
setvar XPERD_SETUP_CODE "$(rand 6)"

# Periksa isian dari pusat.
for k in APP_PUBLIC_URL XPERD_CONTROL_URL XPERD_INSTANCE_TOKEN XPERD_LICENSE_PUBLIC_KEY; do
  v="$(grep -E "^${k}=" .env | head -1 | cut -d= -f2-)"
  [ -n "$v" ] || die "$k di .env masih kosong. Salin dari Super Admin pusat → Instalasi klien, lalu jalankan lagi."
done

say "Masuk ke registry image (token baca dari XPERD)"
if ! docker pull "$(grep -E '^APP_IMAGE=' .env | cut -d= -f2-)" >/dev/null 2>&1; then
  echo "Image privat: masukkan nama pengguna & token baca (read:packages) yang diberikan XPERD."
  read -rp "Nama pengguna GitHub: " GHU
  read -rsp "Token: " GHT; echo
  echo "$GHT" | docker login ghcr.io -u "$GHU" --password-stdin
fi

say "Mengunduh image"
docker compose pull

say "Menjalankan database"
docker compose up -d mysql

say "Menerapkan skema & data katalog"
docker compose run --rm db

say "Menjalankan aplikasi"
docker compose up -d web

CODE="$(grep -E '^XPERD_SETUP_CODE=' .env | cut -d= -f2-)"
URL="$(grep -E '^APP_PUBLIC_URL=' .env | cut -d= -f2-)"
cat <<MSG

✓ XPERD berjalan di http://127.0.0.1:$(grep -E '^WEB_PORT=' .env | cut -d= -f2- || echo 3000)

Langkah berikutnya:
  1. Arahkan ${URL} ke server ini lewat nginx/Caddy dengan HTTPS (lihat README.md).
  2. Buka ${URL}/setup dan masukkan kode penyiapan:  ${CODE}
  3. Simpan berkas .env di tempat aman (berisi semua rahasia server ini).
MSG
