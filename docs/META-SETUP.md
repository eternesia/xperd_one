# META-SETUP — mengaktifkan integrasi Meta (#55) di Xperd One Old Production

Semua kode integrasi **sudah selesai dan terpasang**; yang tersisa hanya
kredensial App milik Anda. Dokumen ini langkah demi langkah agar aktivasi bisa
dilakukan sekali jalan.

Komponen yang sudah ada:

| Bagian | Berkas |
|---|---|
| Simpan App ID/Secret + verifikasi ke Graph API | `src/lib/meta-social.functions.ts` → `saveMetaApp` |
| Mulai OAuth Facebook Login (`state` nonce disimpan di server) | `startMetaConnect`, `disconnectMeta` |
| Callback OAuth → simpan Page + akun Instagram beserta token | `src/routes/api/public/meta/callback.ts` |
| Publikasi (sekarang / terjadwal) ke Meta | `src/lib/meta-publish.server.ts`, `publishPostNow` |
| Hook cron auto-publish | `src/routes/api/public/hooks/social-publish.ts` |
| Panel UI | `/app/w/<workspace>/crm/social-accounts` (kartu **Meta (Facebook Page & Instagram)**) |

---

## 1. Buat Meta App

1. Buka <https://developers.facebook.com/apps> → **Create App** → tipe **Business**.
2. Catat **App ID** dan **App Secret** (Settings → Basic). App Secret hanya untuk
   server — jangan tempel di chat, isi langsung di `.env`/UI.
3. Tambahkan produk **Facebook Login** lalu isi
   **Facebook Login → Settings → Valid OAuth Redirect URIs** dengan:

   ```
   https://<domain-produksi>/api/public/meta/callback
   ```

   Untuk uji lokal (opsional): `http://localhost:3999/api/public/meta/callback`.
   URL yang dipakai aplikasi dihitung dari origin browser saat tombol *Connect*
   ditekan, jadi pastikan origin itu ada di daftar.
4. App Review → minta izin (permissions) berikut, atau gunakan akun **admin/tester
   App** dulu selama mode Development:
   `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`,
   `instagram_basic`, `instagram_content_publish`.
5. Pastikan Facebook Page yang akan dihubungkan sudah tertaut ke **akun Instagram
   Business/Creator**, karena token IG diambil dari Page (`instagram_business_account`).

## 2. Isi kredensial di aplikasi

Masuk sebagai pemilik/admin workspace → **CRM → Akun Media Sosial** →
kartu **Meta** → isi **App ID** + **App Secret** → **Simpan & Verifikasi**.

- Status berubah menjadi **App terverifikasi** bila App ID/Secret diterima Graph API.
- Bila gagal, pesan dari Meta tampil sebagai `last_error` (contoh: “Invalid OAuth
  access token”, “App ID/Secret ditolak Meta”).
- App Secret **tidak pernah** dikirim ke browser lagi setelah disimpan (nilai
  yang tersimpan diganti placeholder `••••••••`).

## 3. Hubungkan Page & Instagram

Klik **Hubungkan dengan Facebook** → setujui izin → dialihkan kembali ke
`/app/w/<workspace>/crm/social-accounts?meta=ok`:

| Hasil | Arti |
|---|---|
| `ok` | Page (+ IG Business yang tertaut) tersimpan beserta token |
| `nopage` | Login berhasil tetapi tidak ada Page; App masih Development atau izin belum disetujui |
| `cancelled` | Dialog Facebook dibatalkan |
| `error` | Gagal menukar kode/token — detail di pesan `last_error` di kartu Meta |

Token disimpan di `crm_social_tokens` (server-only, tidak masuk lapisan data
generik), akun di `crm_social_accounts` dengan `source='meta'`.

## 4. Publikasi & cron

- **Posting sekarang** di penjadwal memakai `publishPostNow` (langsung).
- **Auto-publish** postingan yang jatuh tempo butuh pemanggil cron eksternal
  (aplikasi ini tidak punya scheduler internal):

  ```bash
  # Setel dulu di .env: SOCIAL_PUBLISH_SECRET=<rahasia-panjang>
  * * * * * curl -fsS -H "x-webhook-secret: $SOCIAL_PUBLISH_SECRET" \
      https://<domain>/api/public/hooks/social-publish >/dev/null
  ```

  Tanpa `SOCIAL_PUBLISH_SECRET`, endpoint itu terbuka — **wajib** diset di produksi
  (diuji: 403 tanpa/wrong secret, 200 dengan secret lewat header atau `?secret=`).

## 5. Cek cepat penjaga endpoint (manual)

Spec e2e khusus Meta sudah dihapus (integrasi Meta ditunda), jadi penjaga
endpoint cukup diperiksa manual dengan `curl`:

```bash
# 1) Hook cron: 403 tanpa secret, 200 dengan secret.
SOCIAL_PUBLISH_SECRET=rahasia-e2e npm start &   # jalankan app dengan secret
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3999/api/public/hooks/social-publish
curl -s -o /dev/null -w "%{http_code}\n" -H "x-webhook-secret: rahasia-e2e" \
  http://127.0.0.1:3999/api/public/hooks/social-publish

# 2) Callback OAuth: state kosong/asing/tanpa baris pengaturan harus 400.
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3999/api/public/meta/callback"
```

Di UI, pastikan kartu Meta hanya menampilkan **App ID** + placeholder
`••••••••` untuk App Secret (nilai tersimpan tidak pernah dikirim ke browser).

## 6. Ketika App sudah siap — langkah uji end-to-end

1. `saveMetaApp` → status `verified` (bukti: badge “App terverifikasi”).
2. Connect → cek di DB: `crm_social_accounts` bertambah (facebook + instagram) dan
   `crm_social_tokens` berisi token.
3. Buat postingan terjadwal 1 menit ke depan dengan media URL **publik** (HTTPS,
   langsung ke berkas gambar) → panggil hook cron → status berubah `published`.
   Catatan penting: Meta mengambil gambar dari URL kita — hosting/CDN harus
   mengizinkan `facebookexternalhit` (kalau 429/403, Meta akan melaporkan
   *“media could not be fetched”*).
4. Uji `disconnectMeta`: akun `source='meta'` dan tokennya terhapus, status turun
   ke `verified` (App tetap tersimpan).
