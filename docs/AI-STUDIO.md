# Studio AI Qalling: Foto → Video

Status: **NONAKTIF untuk pengguna** (saklar `ai_studio_settings.enabled = 0`).
Selama nonaktif, pengguna tetap melihat tombol "Foto → Video AI · segera" (uji minat, migrasi 068);
Super Admin melihat Studio sungguhan di halaman **/qalling/app/studio** (menu Konten → Studio AI, dan tombol di Media)
dengan label "uji admin".

## Cara mengaktifkan / uji
1. `npm run migrate` (menerapkan `069_ai_studio.sql`).
2. Super Admin → **Studio AI**: isi API key fal.ai (dan/atau Atlas Cloud), cek ID model & harga kredit tiap tingkat.
3. Uji dari Media workspace Super Admin (domain produksi — penyedia mengambil foto lewat URL bertanda tangan
   `APP_PUBLIC_URL`, jadi localhost tidak bisa). Kredit terpotong dari saldo workspace itu; video uji ditandai `uji`
   dan tidak masuk laporan pendapatan.
4. Bila siap: nyalakan **Buka untuk semua pengguna**. Mematikannya kembali langsung menyembunyikan Studio.

## Alur
Pilih foto (JPG/PNG/WebP milik workspace) → gaya (Zoom, Putar 360°, Uap/percikan, Suasana toko, Dipakai model, Bebas)
+ keterangan opsional (diterjemahkan ke Inggris via `LOVABLE_API_KEY` bila ada) → durasi 5/10 detik, rasio 9:16/1:1 →
tingkat Hemat/Standar/Premium (harga kredit tampil) → centang pernyataan hak foto & bukan tokoh publik → proses
di latar belakang → hasil masuk Media folder **Studio AI**, berlabel **AI**, siap dijadwalkan.

## Kredit & harga (migrasi 070)
- Kredit = saldo tersendiri per tenant (`ai_credit_accounts`, buku besar `ai_credit_ledger`, kunci idempotensi unik).
- Paket bawaan (ubah di Super Admin → Studio AI → Paket kredit): 10 kredit Rp25.000, 25 Rp60.000, 50 Rp110.000,
  100 Rp200.000. Kredit tidak hangus.
- Harga video (kredit, 5/10 detik): Hemat 3/6, Standar 5/10, Premium 10/20.
- Cara beli (owner/admin workspace):
  1. **Dari saldo Qalling** — wallet `usage` produk `qalling_ai` + kredit `purchase`, kunci `ai-pack:<uuid>`.
  2. **Bayar langsung QRIS/kartu** — top-up sebesar harga paket persis (boleh di bawah minimum top-up) dengan
     `purchase_intent {kind:"ai_credits", credits, price_idr}`; begitu gateway mengonfirmasi lunas,
     `applyTopupPurchase` → `applyCreditIntent` langsung mengonversi ke kredit (kunci `ai-pack:topup-<id>`).
     Pengguna kembali ke halaman Studio; pembayaran tertunda bisa dicek dari dialog Beli kredit.
- Membuat video memotong kredit (`ai-job:<id>`); gagal/ditolak/>30 menit → kredit kembali tepat sekali.
  Pekerjaan lama (`charge_source = 'wallet'`) di-refund ke saldo Rupiah.
- Kredit kurang, batas harian, atau kuota penyimpanan penuh → ditolak **sebelum** apa pun terpotong.
- Super Admin bisa memberi kredit bonus (atau mengurangi) per email.

## Berkas
| Berkas | Isi |
|---|---|
| `db/migrations/069_ai_studio.sql` | `ai_studio_settings`, `ai_jobs`, `crm_media.ai_generated` |
| `src/lib/ai-studio.ts` | Gaya & prompt, tingkat bawaan (model, kredit, tarif), tipe |
| `src/lib/ai-studio-providers.server.ts` | Adaptor fal.ai (queue API) & Atlas Cloud (generateVideo/prediction) |
| `src/lib/ai-studio.server.ts` | Akses, buat pekerjaan + potong kredit, pantau, simpan ke Media, refund |
| `src/lib/ai-studio.functions.ts` | Server function pengguna & Super Admin |
| `db/migrations/070_ai_credits.sql` | Saldo & buku besar kredit, paket, `ai_jobs.charge_source`, harga baru |
| `src/lib/ai-credits.server.ts` | Entri kredit, beli paket (saldo / niat top-up), bonus, riwayat |
| `src/components/qalling/pages/AiStudioPage.tsx` | Halaman Studio: kontrol, panggung pratinjau, galeri (unduh, jadwalkan), harga, beli kredit |
| `src/components/qalling/AiStudio.tsx` | Tombol di Media → halaman Studio (atau tombol uji minat bila tidak ada akses) |
| `src/routes/app-admin/ai-studio.tsx` | Pengaturan penyedia/harga, laporan pemakaian & margin |
| `src/routes/api/public/jobs/ai-studio.ts` | Endpoint cron (juga jalan tiap menit di scheduler internal) |

## Model bawaan (cek ulang harga resmi sebelum dibuka)
| Tingkat | Model fal.ai | Param gambar | Kredit 5s/10s |
|---|---|---|---|
| Hemat | `fal-ai/wan-25-preview/image-to-video` | `image_url` | 3 / 6 |
| Standar | `fal-ai/kling-video/v3/standard/image-to-video` | `start_image_url` | 5 / 10 |
| Premium | `bytedance/seedance-2.0/fast/image-to-video` | `image_url` | 10 / 20 |

Semua bisa diubah di Super Admin tanpa deploy (termasuk pindah ke Atlas Cloud, mis. `bytedance/seedance-2.0-fast/image-to-video`
dengan param `image`). Parameter khusus model ditambahkan lewat kolom JSON "Parameter tambahan".

## Keputusan yang masih terbuka
1. Penyedia utama (setelah uji kualitas). 2. Tingkat yang dibuka di awal. 3. Siapa yang boleh memakai
(saat ini: semua anggota workspace dengan saldo; belum ada video gratis untuk pengguna baru). 4. Kapan dibuka.

## Desain halaman (migrasi 071)
- Tab **Buat video** dan **Riwayat**. Panel kiri: foto terpilih + 5 terbaru, "Pilih dari Media" (pemilih besar dengan
  pencarian, folder, muat bertahap), gaya, arahan (maks. 500 karakter), format, kualitas; tombol Buat video selalu terlihat.
- **Gaya gerakan**: bawaan diatur di Super Admin → Studio AI → Gaya gerakan bawaan (`ai_studio_settings.styles`: kunci,
  nama, keterangan, prompt Inggris, aktif). Prompt tidak dikirim ke browser pengguna. **Gaya saya** per workspace
  (`ai_user_styles`, maks. 30) = gaya bawaan + arahan tersimpan.
- **Riwayat**: `listAiJobs` berhalaman (12 per muat), filter Selesai/Diproses/Gagal, cari nama foto, gaya, atau arahan.
  Baris "Video terbaru" di tab Buat tidak menampilkan yang gagal.
- **Posting dari Studio**: tombol Posting di panggung dan kartu riwayat → pilih akun (avatar bulat, `AccountPicker`),
  caption, "Posting sekarang" (`publishPostNow`) atau "Jadwalkan"; memakai tabel & mesin posting yang sama dengan menu Posting.
- **Memuat**: garis memuat di atas halaman, placeholder berdenyut untuk foto/kartu, gambar lazy; video hanya diunduh saat
  dibuka di panggung (indikator "Memuat video"), kartu memakai foto sumber sebagai sampul.
- Harga tidak lagi tampil di halaman; tautan "Lihat harga" membuka dialog paket & kredit per video.

## Tingkat Template (migrasi 073) — video tanpa model AI
Foto + teks digabung menjadi video 6 detik 1080p (9:16 atau 1:1) oleh mesin render Remotion di VPS terpisah.
Tidak ada biaya model per video; foto produk tampil persis aslinya. Bawaan 1 kredit per video.

- **Template** (`src/lib/ai-templates.ts`, komposisi di `render-worker/src/templates/`): Promo Harga, Sorotan Produk,
  Cerita Bertahap. Isian: judul (wajib), keterangan, harga/promo, ajakan, warna aksen. Menambah template = tambah
  komposisi di `render-worker` + entri di `ai-templates.ts` dengan kunci yang sama.
- **Alur**: pengguna membuat → kredit dipotong, pekerjaan `ai_jobs` (`provider = 'render'`, `tier = 'template'`) berstatus
  `queued` → mesin render `POST /api/public/render-worker/claim` (Bearer token) → render → `…/complete?job=<id>` (body MP4)
  atau `…/fail`. Hasil masuk Media folder "Studio AI" tanpa label AI.
- **Batas waktu & refund** (`processJob`): antre > 20 menit tanpa mesin render, atau render > 10 menit → gagal + kredit kembali.
- **Saklar**: Super Admin → Studio AI → tab Template. Selama OFF hanya Super Admin yang melihat mode Template.

### Memasang mesin render di VPS
Kebutuhan: Ubuntu + Docker, ±2 vCPU / 4 GB RAM, internet keluar. Tidak perlu domain atau port terbuka.
1. Image dibangun otomatis oleh workflow "Build Render Worker Image" saat `render-worker/` berubah di `master`
   → `ghcr.io/eternesia/xperd_one-render-worker:latest`. Paket GHCR dari repo privat bersifat privat: jadikan publik
   (GitHub → Packages → Package settings → Change visibility; image tidak berisi rahasia), atau `docker login ghcr.io`
   di VPS dengan token GitHub berizin `read:packages`.
2. Pasang Docker di VPS: `curl -fsSL https://get.docker.com | sh`
3. Super Admin → Studio AI → Template → **Buat token mesin render**, salin perintah `docker run …` yang muncul
   (token hanya tampil sekali) dan jalankan di VPS.
4. Status "Terhubung" muncul di tab Template dalam beberapa detik. Log: `docker logs -f qalling-render`.
   Pembaruan: `docker pull …:latest && docker rm -f qalling-render` lalu jalankan lagi perintahnya.

Menambah kapasitas: jalankan perintah yang sama di VPS lain (satu token dipakai bersama; tiap pekerjaan hanya diambil satu mesin).
Uji lokal tanpa Qalling: `cd render-worker && npm ci && node sample.mjs foto.jpg out/`.

Lisensi Remotion: gratis untuk perusahaan sampai 3 orang; 4 orang ke atas wajib Company License
(remotion.dev/license) sebelum fitur dipakai secara komersial.
