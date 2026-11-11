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
| `MYSQL_MAX_PREPARED` | tidak | `pool.ts` | Cache prepared statement per koneksi (default `200`; bawaan mysql2 16000 dapat menghabiskan `max_prepared_stmt_count` MySQL) |
| `PORT` | tidak | server Nitro | Port aplikasi (dev `3999` dipakai e2e, compose `3000`) |
| `NODE_ENV` / `APP_ENV` | tidak | `files.server.ts`, `scripts/wipe.mjs` | `production` mengaktifkan cookie `secure` + root storage `/app/storage`; juga memblokir `db:wipe` |
| `STORAGE_DIR` | tidak | `src/lib/files.server.ts` | Menimpa lokasi berkas unggahan (default `./storage` dev, `/app/storage` produksi) |
| `SOCIAL_PUBLISH_SECRET` | **ya** (produksi) | `src/routes/api/public/hooks/social-publish.ts` | Rahasia hook cron auto-publish. Kosong = endpoint publik terbuka |
| `CRON_SECRET` | **ya** (produksi) | `src/lib/cron-auth.server.ts` | Rahasia cron perpanjangan langganan (`/api/public/jobs/subscription-renewal`); kosong → memakai `SOCIAL_PUBLISH_SECRET`, keduanya kosong → endpoint menjawab 403 |
| `VITE_QALLING_HOSTS` | tidak | `src/lib/qalling.ts` | Daftar host Qalling dipisah koma (default `qalling.id,qalling.net` + `www`). Dipakai redirect host → `/qalling` |
| `APP_PUBLIC_URL` | **ya** (produksi, di balik proxy) | `src/lib/crm-media.server.ts` (`publicOrigin`) | Alamat publik aplikasi tanpa slash, mis. `https://qalling.id`. Dipakai untuk tautan media. Tujuan kembali pembayaran DOKU dan login Google **tidak** memakainya: Redirect URI mengikuti domain yang dipakai pengguna (`X-Forwarded-Host/Proto`), path tetap `/api/public/auth/google/callback`. Kosong = memakai alamat permintaan (di balik proxy bisa berupa alamat internal → Google `redirect_uri_mismatch`) |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | tidak | `src/lib/form-guard.server.ts` | Cloudflare Turnstile untuk form kontak xperd.id/contact (gratis, dash.cloudflare.com → Turnstile → tambah situs `xperd.id`). Keduanya harus diisi agar aktif. Tanpa ini form tetap terlindungi oleh token sekali pakai, honeypot, dan batas 5 kiriman/jam per IP & 3/hari per email. Batas per IP butuh proxy meneruskan IP asli: `proxy_set_header X-Real-IP $remote_addr;` |
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

**Penjadwalan.** Sejak scheduler internal (`src/lib/scheduler.server.ts`), auto-publish (tiap menit) dan email notifikasi (tiap jam) berjalan otomatis di dalam aplikasi; cron di bawah menjadi opsional (aman dipakai bersamaan). Matikan scheduler internal dengan `SCHEDULER_DISABLED=1`. Perpanjangan langganan dari saldo juga berjalan tiap jam di scheduler internal.

**Penjadwalan (cron) — opsional untuk auto-publish.** Aplikasi tidak punya scheduler internal; dua endpoint
dipanggil cron eksternal di server (crontab host atau container cron). Rahasia dikirim lewat header
`x-cron-secret` atau `x-webhook-secret` (atau `?secret=`):

| Tugas | Endpoint | Rahasia | Interval |
|---|---|---|---|
| Auto-publish postingan sosial terjadwal (Qalling), maks 25 per panggilan | `GET/POST /api/public/hooks/social-publish` | `SOCIAL_PUBLISH_SECRET` (kosong = **terbuka**, isi di produksi) | tiap menit |
| Perpanjangan langganan ERP dari saldo (tenant yang opt-in), maks 25 per panggilan | `POST /api/public/jobs/subscription-renewal` | `CRON_SECRET` (atau `SOCIAL_PUBLISH_SECRET`); tanpa rahasia = 403 | tiap jam |
| Studio AI: periksa pekerjaan video di penyedia (fal/Atlas), simpan hasil ke Media, refund yang gagal/kedaluwarsa. Juga berjalan tiap menit di scheduler internal | `POST /api/public/jobs/ai-studio` | sama seperti di bawah | tiap menit |
| Email notifikasi: pengingat trial (7/3/1/0 hari), saldo kurang untuk perpanjangan, bukti pembayaran (topup/perpanjangan), ringkasan posting mingguan. Idempoten (tabel `email_notifications`, kunci unik). Juga dijalankan otomatis oleh job perpanjangan di atas; endpoint ini hanya bila ingin jadwal terpisah | `POST /api/public/jobs/billing-notifications` | sama seperti di atas | tiap jam |

```cron
* * * * * curl -fsS -H "x-webhook-secret: $SOCIAL_PUBLISH_SECRET" http://127.0.0.1:3000/api/public/hooks/social-publish >/dev/null
0 * * * * curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" http://127.0.0.1:3000/api/public/jobs/subscription-renewal >/dev/null
```

Tanpa cron pertama, postingan yang dijadwalkan **tidak terbit otomatis** (tombol "Post now" tetap jalan); tanpa cron
kedua, perpanjangan otomatis dari saldo tidak berjalan. Modul **Production tidak butuh cron**: semua aksi (order, jurnal,
stok, lot) berjalan dari tindakan pengguna; pengecekan registrasi kedaluwarsa dihitung saat dipakai.
Cek cepat: panggil endpoint dengan rahasia yang benar → `200` dan JSON hasil; tanpa rahasia → `403`.

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

## Domain Qalling (qalling.id) tanpa prefiks `/qalling`

Aplikasi menangani qalling.id sendiri: router menerjemahkan alamat publik bersih (`/`, `/harga`, `/login`, `/register`, `/app/...`) ke rute internal `/qalling/*` dan sebaliknya
(`src/lib/qalling-urls.ts`, `rewrite` di `src/router.tsx`), baik di server (SSR) maupun klien (hydration). Domain XPERD tidak berubah.

**Proxy cukup meneruskan permintaan apa adanya** (jangan menulis ulang path), dengan `Host`/`X-Forwarded-Host` = domain publik dan `X-Forwarded-Proto: https`:

```nginx
server {
  server_name qalling.id www.qalling.id;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

> **Hapus** aturan lama `rewrite ^/(.*)$ /qalling/$1` / redirect `/qalling` di proxy. Penulisan ulang di proxy membuat SSR memuat halaman Qalling sementara browser berada di `/harga` → hydration crash
> (React #418 / "Invariant failed" / layar kosong); dengan perbaikan ini aturan itu justru menyebabkan redirect berulang.
> Opsional setelah rewrite proxy dihapus: `QALLING_LEGACY_REDIRECT=1` mengalihkan permanen `qalling.id/qalling/*` → alamat bersih. Host tambahan: `VITE_QALLING_HOSTS` (saat build).
> Daftarkan Redirect URI Google dan tujuan kembali DOKU dengan alamat bersih domain (mis. `https://qalling.id/api/public/auth/google/callback`) — tidak berubah.



### Email notifikasi billing

- Wajib: gateway email platform aktif (Resend/Brevo/SendGrid). Jika belum, job menjawab `skipped: email_gateway_not_configured` dan tidak ada yang ditandai terkirim.
- `PUBLIC_APP_ORIGIN` menentukan tautan di email (default `https://qalling.id`).
- Migrasi `051_email_notifications.sql` membuat `email_notifications` dan `notification_prefs`. Invoice yang lunas sebelum fitur aktif tidak dikirimi email susulan (penanda `invoice-receipts-start`).
- Pemilik akun dapat mematikan pengingat trial, bukti pembayaran, dan ringkasan mingguan di Qalling → Tagihan & Saldo. Peringatan saldo kurang dan perpanjangan gagal selalu dikirim.
- Email invoice berisi rincian dan tautan; PDF tetap diunduh dari halaman tagihan (gateway tidak mendukung lampiran).

### Batas ukuran unggahan di proxy

Nginx secara bawaan menolak body >1 MB (`413 Request Entity Too Large`) sebelum permintaan sampai ke aplikasi. Unggahan Media Qalling sekarang dikirim berpotongan ±512 KB sehingga tetap lolos, tetapi bila ingin unggahan lain (dokumen, bukti, MCP `file_base64`) bebas dari batas ini, tambahkan di blok server proxy:

```nginx
client_max_body_size 64m;
```

Potongan sementara disimpan di `<STORAGE_DIR>/.chunk-uploads` dan dibersihkan otomatis setelah 1 jam bila unggahan terbengkalai.
