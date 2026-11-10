# Studio AI Qalling: Foto → Video

Status: **fondasi terbangun, NONAKTIF untuk pengguna** (saklar `ai_studio_settings.enabled = 0`).
Selama nonaktif, pengguna tetap melihat tombol "Foto → Video AI · segera" (uji minat, migrasi 068);
Super Admin melihat Studio sungguhan di menu **Media** workspace-nya sendiri (label "uji admin") untuk uji kualitas.

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

## Uang
- 1 kredit = Rp1.000. Potong saldo saat membuat: `wallet_ledger` `usage`, produk `qalling`, kunci `ai-job:<id>`.
- Gagal di penyedia / ditolak / >30 menit / gagal simpan → refund otomatis `refund`, kunci `ai-job:<id>:refund` (tepat sekali).
- Saldo kurang, batas harian, atau kuota penyimpanan penuh → ditolak **sebelum** saldo dipotong.

## Berkas
| Berkas | Isi |
|---|---|
| `db/migrations/069_ai_studio.sql` | `ai_studio_settings`, `ai_jobs`, `crm_media.ai_generated` |
| `src/lib/ai-studio.ts` | Gaya & prompt, tingkat bawaan (model, kredit, tarif), tipe |
| `src/lib/ai-studio-providers.server.ts` | Adaptor fal.ai (queue API) & Atlas Cloud (generateVideo/prediction) |
| `src/lib/ai-studio.server.ts` | Akses, buat pekerjaan + potong kredit, pantau, simpan ke Media, refund |
| `src/lib/ai-studio.functions.ts` | Server function pengguna & Super Admin |
| `src/components/qalling/AiStudio.tsx` | Tombol + dialog Studio di Media (jatuh ke tombol uji minat bila tidak ada akses) |
| `src/routes/app-admin/ai-studio.tsx` | Pengaturan penyedia/harga, laporan pemakaian & margin |
| `src/routes/api/public/jobs/ai-studio.ts` | Endpoint cron (juga jalan tiap menit di scheduler internal) |

## Model bawaan (cek ulang harga resmi sebelum dibuka)
| Tingkat | Model fal.ai | Param gambar | Kredit 5s/10s |
|---|---|---|---|
| Hemat | `fal-ai/wan-25-preview/image-to-video` | `image_url` | 6 / 12 |
| Standar | `fal-ai/kling-video/v3/standard/image-to-video` | `start_image_url` | 15 / 30 |
| Premium | `bytedance/seedance-2.0/fast/image-to-video` | `image_url` | 30 / 60 |

Semua bisa diubah di Super Admin tanpa deploy (termasuk pindah ke Atlas Cloud, mis. `bytedance/seedance-2.0-fast/image-to-video`
dengan param `image`). Parameter khusus model ditambahkan lewat kolom JSON "Parameter tambahan".

## Keputusan yang masih terbuka
1. Penyedia utama (setelah uji kualitas). 2. Tingkat yang dibuka di awal. 3. Siapa yang boleh memakai
(saat ini: semua anggota workspace dengan saldo; belum ada video gratis untuk pengguna baru). 4. Kapan dibuka.
