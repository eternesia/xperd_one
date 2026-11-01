# Pemetaan BS New 13 → Old Production (Ronde 50)

Sumber: `diff -r "Xperd One Business Suite New 12" "Xperd One Business Suite New 13"` (34 file berbeda). Live
`xperd-new.lovable.app` sudah memakai New 13 (halaman admin Users dikelompokkan per workspace, dst.).

| # | Perubahan New 13 | Berkas sumber | Status Old |
|---|---|---|---|
| A | **DOKU Checkout (NON-SNAP) untuk top-up wallet**: form gateway khusus provider (Client ID + Secret Key), tombol "Uji checkout" (sandbox, tak menambah saldo), webhook `wallet-doku` (HMAC atas body mentah + path tetap, nominal & referensi harus cocok, idempoten), tombol "Cek" (status on-demand), checkout diklaim sekali (`topups.checkout_started_at`), `returnPath` hanya ke halaman billing, kunci terenkripsi AES-256-GCM | `DOKU.md`, `wallet/doku.server.ts`, `wallet/return-url.ts`, `payment-gateway.functions.ts`, `wallet-doku.ts`, `wallet.functions.ts`, `WalletPanel.tsx`, `app-admin/payments.tsx`, migrasi 0025 | **Selesai** — Secret Key di `payment_gateways.server_key` (tulis-saja, seperti Midtrans; tanpa env/enkripsi terpisah), Client ID di `merchant_id`; migrasi 033 (`topups.checkout_started_at`) |
| B | Tolak email sekali pakai saat daftar Qalling (daftar baru, aktivasi OTP, provisioning Google baru) memakai daftar domain lokal (`disposable-email-domains`) | `disposable-email.server.ts`, `qalling-auth.functions.ts` | **Selesai** |
| C | Daftar metode pembayaran invoice-langsung hanya `manual_transfer` + `midtrans` (DOKU tidak muncul di sana) | `billing.functions.ts` | **Selesai** |
| D | **Insight multi-akun** (`social-dashboard` → `SocialInsightsView`): ringkasan Tebar `/insights/summary`, perbandingan periode sebelumnya, engagement rate, grafik konten, performa per post | `SocialInsights.tsx`, `social-insights.functions.ts`, `CrmViews.tsx` | **Selesai** |
| E | Template automation (IG komentar/DM, Threads) lewat dialog "Buat automation" | `CrmInteractions.tsx` | **Selesai** |
| F | Media: pilih banyak + hapus terpilih | `CrmMedia.tsx` | **Selesai** |
| G | Posts: tombol sinkron jadi "Sinkronkan"/"Sync", lencana "Tebar" dihapus, teks read-only baru | `CrmSocial.tsx` | **Selesai** |
| H | Admin → Users dikelompokkan per workspace + tombol "Hapus" akun (tidak bisa hapus diri sendiri) | `app-admin/users.tsx`, `admin-users.functions.ts` | **Selesai** |
| I | Admin → Content (Qalling): tombol "+ Banner utama" dan "+ Fitur" | `app-admin/content.tsx` | **Selesai** |
| J | Sidebar Qalling: grup bisa dilipat, sidebar bisa diciutkan (disimpan di localStorage), menu akun/workspace di bawah | `qalling.app.tsx` | **Selesai** |
| K | Item menu "Integrasi AI & MCP" di sidebar | `qalling.app.tsx` | **Dilewati** — MCP sengaja dihapus di Ronde 49 (keputusan pengguna) |

Catatan lintas-Old: tidak ada trigger/stored function — logika uang tetap di `transaction()` + `SELECT … FOR UPDATE`;
tabel/kolom baru lewat migrasi bernomor idempoten (berikutnya **033**) dan terdaftar di `COLS`/`WORKSPACE_TABLES`.

## Hasil Ronde 50

- Semua butir A–J **selesai** dan dites; K dilewati sengaja. Spec baru: `e2e/wallet-doku.spec.ts` (server DOKU tiruan :4596 via
  `DOKU_API_BASE`; HMAC, 401/400, nominal, PENDING/FAILED/SUCCESS, idempoten, "Cek", klaim checkout, tujuan kembali billing,
  kunci tak pernah ke klien) dan `e2e/new13-parity.spec.ts` (email sekali pakai, Users/hapus, Content, template automation,
  hapus media massal, sidebar, Insight dengan mock Tebar: total, selisih periode, engagement rate, performa per post).
- Spec lama disesuaikan: tombol "Buat automation" + "Buat dari awal", placeholder pencarian Users, tunggu kartu Ideas terlihat.
- Perbandingan live (admin, super admin seed): Users kini sama strukturnya. Ditemukan & diperbaiki: Packages menampilkan "Visible0"
  (`is_public_signup` bernilai 0 dirender React) — sekarang `Boolean(Number(...))`.
- Dev: `docker-compose.yml` menambah `DOKU_API_BASE`. **Prod: jalankan `npm run migrate` manual untuk 032 & 033.**

## Ronde 51 — Login Google (Qalling) di Old

New 12/13 memakai Lovable Cloud (`lovable.auth.signInWithOAuth("google")` + Supabase Auth); itu tidak ikut terbawa ke Old, jadi dibangun sendiri:

- `GET /api/public/auth/google/start`: `state` acak di cookie httpOnly (10 mnt) → alihkan ke layar persetujuan Google
  (`openid email profile`, `prompt=select_account`). `GET /api/public/auth/google/callback`: cocokkan `state`, tukar `code`,
  ambil profil (email **harus terverifikasi**), buat/temukan akun (`app_users` tanpa kata sandi + `profiles` + `user_roles`
  `customer`; email sekali pakai untuk akun baru ditolak), terbitkan cookie sesi `xperd_token`, kembali ke `/qalling/login`.
  Trial tenant dibuat setelahnya oleh `provisionGoogleSignup` (alur Daftar + paket tetap sama seperti New 13).
- Kunci diisi Super Admin di Admin → Login & Pendaftaran: **Google Client ID** (terbaca) + **Client Secret** (tulis-saja, kosong =
  pertahankan) di `platform_auth_settings` (migrasi 034); Redirect URI ditampilkan (`<origin>/api/public/auth/google/callback`,
  origin dari `APP_PUBLIC_URL` bila ada). Saklar "Masuk & daftar dengan Google" tetap `google_enabled`.
- Galat kembali ke `/qalling/login?google_error=<kode>` dan tampil sebagai toast (dinonaktifkan, belum dikonfigurasi, dibatalkan,
  state tak valid, gagal tukar kode, email belum terverifikasi, email sekali pakai, akun nonaktif).
- Env hanya untuk uji: `GOOGLE_OAUTH_BASE` (token/userinfo, server→server) dan `GOOGLE_OAUTH_AUTH_BASE` (layar persetujuan, dibuka
  browser). `VITE_GOOGLE_OAUTH_URL` dihapus. Spec: `e2e/qalling-google.spec.ts` (Google tiruan :4595).
- **Prod:** `npm run migrate` untuk 034; isi Client ID/Secret dari Admin; daftarkan Redirect URI di Google Cloud Console.
  Verifikasi dengan Google asli menunggu Client ID/Secret.
