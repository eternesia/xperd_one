# OPERATIONS — menjalankan & mengoperasikan Xperd One Old Production

Ringkasan praktis: variabel lingkungan, perintah harian, cron, dan penyimpanan.
Semua nama variabel di bawah **diambil langsung dari kode**, bukan asumsi.

## 1. Variabel lingkungan (`.env`)

| Variabel | Wajib | Dipakai di | Keterangan |
|---|---|---|---|
| `APP_JWT_SECRET` | **ya** (produksi) | `src/lib/auth-jwt.server.ts` | Kunci tanda tangan JWT sesi. Tanpa ini login gagal (`APP_JWT_SECRET is not configured`). Ganti bila pernah bocor → semua sesi lama gugur |
| `MYSQL_HOST` | ya | `src/integrations/mysql/pool.ts`, `scripts/*` | Dev: `127.0.0.1`. Di compose di-override ke `mysql` |
| `MYSQL_PORT` | ya | idem | Dev: `3307` (port host), di dalam container `3306` |
| `MYSQL_USER` / `MYSQL_PASSWORD` | ya | idem | Dev: `xperd` / `xperd` |
| `MYSQL_DATABASE` | ya | idem | Default `xperd` |
| `MYSQL_POOL_SIZE` | tidak | `pool.ts` | Batas koneksi per proses (default `10`) |
| `PORT` | tidak | server Nitro | Port aplikasi (dev `3999` dipakai e2e, compose `3000`) |
| `NODE_ENV` / `APP_ENV` | tidak | `files.server.ts`, `scripts/wipe.mjs` | `production` mengaktifkan cookie `secure` + root storage `/app/storage`; juga memblokir `db:wipe` |
| `STORAGE_DIR` | tidak | `src/lib/files.server.ts` | Menimpa lokasi berkas unggahan (default `./storage` dev, `/app/storage` produksi) |
| `SOCIAL_PUBLISH_SECRET` | **ya** (produksi) | `src/routes/api/public/hooks/social-publish.ts` | Rahasia hook cron auto-publish. Kosong = endpoint publik terbuka |
| `VITE_QALLING_HOSTS` | tidak | `src/lib/qalling.ts` | Daftar host Qalling dipisah koma (default `qalling.id,qalling.net` + `www`). Dipakai redirect host → `/qalling` |
| `APP_PUBLIC_URL` | **ya** (produksi, di balik proxy) | `src/lib/crm-media.server.ts` (`publicOrigin`) | Alamat publik aplikasi tanpa slash, mis. `https://qalling.id`. Dipakai untuk tautan media. Tujuan kembali pembayaran DOKU dan login Google **tidak** memakainya: Redirect URI mengikuti domain yang dipakai pengguna (`X-Forwarded-Host/Proto`), path tetap `/api/public/auth/google/callback`. Kosong = memakai alamat permintaan (di balik proxy bisa berupa alamat internal → Google `redirect_uri_mismatch`) |
| `SUPERADMIN_EMAIL` | tidak | `src/lib/auth-context.server.ts` | Email yang otomatis diberi peran `admin` saat pertama login (default email pemilik repo) |
| `WA_REMINDER_TO` | tidak | `src/lib/reminders.server.ts` | Nomor tujuan notifikasi pengingat WhatsApp (dipisah koma) |

Catatan: `VITE_*` ikut ter-*bundle* ke klien (jangan taruh rahasia di sana).
Rahasia lain **tidak** disimpan di `.env` — dimasukkan lewat UI dan tersimpan di tabel server: token Meta/App Secret
(`crm_meta_settings`, `crm_social_tokens`), Google Client ID/Secret (`platform_auth_settings`), server key Midtrans/DOKU
(`payment_gateways.server_key`), kunci Tebar (`tebar_settings`).

## 2. Perintah harian

```bash
# dev: DB + dev server via compose
docker compose up -d --wait mysql      # MySQL 8.4 (container xperd-mysql-dev, port 3307)
npm run migrate                        # db/migrations/*.sql (idempoten, dicatat di db_apply_log)
npm run seed                           # db/seeds/*.sql (idempoten)
npm run seed -- --force                # jalankan ulang semua seed (tetap tanpa duplikasi)
npm run db:setup                       # migrate + seed dalam satu langkah
npm run db:wipe -- --yes               # hapus SEMUA tabel (ditolak bila APP_ENV=production)
npm run db:reset                       # wipe + migrate + seed
npm run dev                            # vite dev server
npm run build && npm start             # build produksi + jalankan Nitro
npm run test:e2e                       # Playwright (butuh app berjalan di 127.0.0.1:3999)
```

Urutan seed penting: `000_dev_bootstrap.sql` berjalan **sebelum**
`001_core_seed.sql`, sedangkan seed yang butuh katalog (`packages`, `addons`)
harus bernama setelahnya (contoh: `001f_dev_tenant_package_addons.sql`).

## 3. Produksi

```bash
# 1) di mesin build
docker build -f Dockerfile.prod -t xperd-one:latest .
# 2) di server (dengan .env produksi: APP_JWT_SECRET, MYSQL_*, SOCIAL_PUBLISH_SECRET, ...)
docker compose -f docker-compose.prod.yml up -d
```

Container `web` menjalankan `migrate` lalu `seed` sebelum start, sehingga
migrasi ikut naik saat deploy. Port aplikasi di-bind ke localhost
(`127.0.0.1:${WEB_PORT}`) — nginx/Caddy di depan sebagai TLS + router host
(tempatkan `server_name qalling.id` → `/qalling` di sana; redirect klien di
`__root.tsx` hanya jaring pengaman).

**Cron auto-publish** (wajib bila memakai penjadwal postingan sosial):

```cron
* * * * * curl -fsS -H "x-webhook-secret: $SOCIAL_PUBLISH_SECRET" http://127.0.0.1:3000/api/public/hooks/social-publish >/dev/null
```

## 4. CI

`.github/workflows/test.yml` menjalankan urutan yang sama seperti di lokal pada
DB **kosong** (service container MySQL 8.4): `tsc --noEmit` → `npm run build` →
`npm run db:setup` → install Chrome → Playwright. DB selalu baru agar celah
fixture (mis. tenant tanpa paket atau add-on yang belum di-seed) gagal keras dan
tidak berubah menjadi spec yang ter-skip tanpa disadari. Workflow lain
(`build.yml`, `deploy*.yml`) tetap mengurus build & deploy image.

## 5. Berkas & cadangan

- Berkas unggahan (pustaka dokumen, lampiran tender, bukti kas keluar, logo,
  kop surat) disimpan di `STORAGE_DIR` — dev `./storage`, produksi volume
  `local-storage` di `/app/storage`. **Backup volume ini bersama DB.**
- Backup DB: `docker compose exec mysql mysqldump -uxperd -pxperd xperd > backup.sql`.
- `db_apply_log` mencatat migration/seed yang sudah diterapkan; jangan dihapus
  sembarangan atau `migrate` akan mencoba menerapkan ulang file lama.

## 6. Sebelum mengubah kode

- Tabel & kolom baru untuk lapisan data generik **wajib** ditambahkan ke
  `WORKSPACE_TABLES` + `COLS` (`src/lib/data.functions.ts`) atau `PCOLS`
  (`src/lib/platform.functions.ts`). Tanpa itu nilai dibuang **senyap**.
- Logika uang/status: gunakan transaksi MySQL di lapisan aplikasi
  (`transaction()` + `SELECT … FOR UPDATE`). **Tidak ada trigger/fungsi DB.**
- Tanggal/waktu selalu lewat `sqlDateTime()` (`src/lib/datetime.ts`) — MySQL
  menolak string ISO.
- Jalankan `npx tsc --noEmit`, `npm run build`, dan `npm run test:e2e` sebelum
  commit.
