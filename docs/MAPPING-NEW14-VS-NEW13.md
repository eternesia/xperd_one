# Pemetaan BS New 14 → Old Production (Ronde 52)

Sumber: `diff -rq "Xperd One Business Suite New 13" "Xperd One Business Suite New 14"` (≈60 berkas berbeda; hanya **2 migrasi
baru**, `0026` dan `0027`, keduanya fungsi plpgsql). Bagian "Hasil Ronde 52" di bawah mencatat apa yang sudah di-port. Status kolom "Status di Old" pada tabel adalah keadaan **sebelum** port (commit `d04bcd4`).

Aturan Old yang tetap berlaku saat port: tanpa trigger/stored function (logika uang & kuota di `transaction()` +
`SELECT … FOR UPDATE`), tabel/kolom lewat migrasi bernomor idempoten (berikutnya **035**), fungsi server lewat
`createServerFn` + `requireAppAuth`, tabel baru didaftarkan di `WORKSPACE_TABLES`/`COLS` (`src/lib/data.functions.ts`).

## Ringkasan

| # | Fitur New 14 | Jenis | Status di Old | Usaha |
|---|---|---|---|---|
| A | Ganti paket Qalling **saat trial** (self-service, Rp0) | Baru | Belum ada | Sedang |
| B | Super Admin → Users: ganti paket Qalling per user/workspace + daftar tunggal terbaru dulu | Baru + ubah | Belum ada | Sedang |
| C | Pengaman posting terjadwal (klaim, status `publishing`, idempotensi, cron, edit terbatas) | Perbaikan | Sebagian (cron sudah ada) | Sedang |
| D | Jam emas WIB pada jadwal posting | Baru | Belum ada | Kecil |
| E | Balasan cepat, Invoice cepat + mini katalog, halaman Profil & Rekening | Baru | Belum ada (kolom profil sudah ada) | Sedang |
| F | Label pipeline berbahasa Indonesia (Tanya Harga … Closing, Batal) | Ubah label | Belum | Kecil |
| G | Kalender / Klien / Laporan / AI / Tim jadi submodul di CRM XPERD + grup menu baru | Struktur | Hanya rute Qalling | Sedang |
| H | Navigasi Qalling: bar bawah mobile, grup default terbuka, menu Profil & Rekening | UI | Belum | Kecil |
| I | Admin: halaman Referral, menu mobile Super Admin, tombol "Muat Konten Default" | UI | Perlu dicek per butir | Kecil |
| J | Kartu jembatan XPERD di beranda Qalling + logo putih tema malam | UI | Belum | Kecil |
| K | Penjualan: edit quotation mengikuti centang Draft | Perbaikan | Belum | Kecil |
| L | URL kembali pembayaran dari `Origin`/`Referer` | Perbaikan | **Sudah setara** (lihat L) | — |
| M | Sinkron Tebar tidak menimpa hasil kirim lokal (`reconcileDelivery`) | Perbaikan | Belum | Kecil (bagian C) |

## Rincian

### A. Ganti paket trial sendiri (Rp0)
- Berkas: `trial-tier.functions.ts`, `trial-tier-rules.ts`, `TrialTierSwitch.tsx`, `AddonTierChoices.tsx`, migrasi `0027`.
- Perilaku: di Billing Qalling, pemilik tenant yang **masih dalam trial berlaku** (`status='trial'`, `starts_at ≤ hari ini ≤ ends_at`,
  zona Asia/Jakarta) melihat tombol "Coba {paket}" pada Lite/Pro/Agency (paket gratis `qalling_free` tidak lagi ditampilkan sebagai pilihan).
  Klik → dialog ringkasan (status Uji coba, tanggal trial berakhir tetap, "Dipotong sekarang Rp0") → konfirmasi → paket berganti.
  Badge paket aktif menjadi "Uji coba" selama trial. Tanggal berakhir, status, harga, dan perpanjangan **tidak berubah**; saldo tidak dipotong.
- Pemeriksaan server (dua tahap: `apply=false` untuk kutipan, `apply=true` untuk terapkan): pemanggil harus pemilik tenant; kunci
  tenant + baris `tenant_addons`; `expectedTierId` harus sama dengan paket saat ini (anti-basi); paket tujuan aktif dan kodenya salah satu
  dari 3 paket; pemakaian (akun, anggota, penyimpanan) harus muat di kuota tujuan (`billing_usage_fits`); opsi tambahan aktif harus
  didukung fitur paket tujuan; tulis audit log (`source: self_service_trial`, `charge: 0`).
- Port ke Old: `switchTrialTier` sebagai `transaction()` + `SELECT … FOR UPDATE` pada `tenants`/`tenant_addons`; **cari padanan
  `billing_usage_fits` di Old** (kuota sudah dihitung di entitlements/billing; jangan buat stored function). Uji: trial valid vs kedaluwarsa,
  bukan pemilik, paket basi, kuota terlampaui, opsi tambahan tak didukung, saldo wallet tetap, tanggal berakhir tetap.

### B. Super Admin → Users
- Berkas: `admin-users.functions.ts` (`adminUserQallingPlans`, `adminSwitchUserQallingTier`), `app-admin/users.tsx`, `admin-user-groups.ts`, migrasi `0026`.
- Tombol/dialog "Paket" (ikon Package) per user: pilih workspace milik/diikuti user → pilih paket → konfirmasi. Syarat: admin platform;
  user anggota workspace atau pemilik tenant; paket saat ini harus **aktif atau trial yang berlaku**; kuota tujuan cukup; `expected` harus cocok.
  Menghapus `pending_change`, tanpa potong saldo, menyimpan periode/harga/perpanjangan, tulis audit (`source: superadmin_users`).
  Toast: "Paket Qalling diperbarui tanpa pemotongan saldo".
- Daftar Users: bukan lagi kartu per workspace, tetapi **satu tabel** dengan baris pembatas per workspace; kolom baru **Terdaftar**;
  workspace diurutkan dari yang memiliki user terbaru, user terbaru dulu (`newestWorkspaceGroups`, ada unit test).
  Judul halaman "Pengguna & Paket".
- Catatan: Old sudah punya grup per workspace + hapus akun (Ronde 50). Yang diubah: layout tabel tunggal, kolom Terdaftar, urutan, tombol Paket.

### C. Pengaman posting terjadwal
- Berkas: `post-delivery-rules.ts` (+test), `meta-publish.server.ts`, `meta-social.functions.ts`, `tebar.server.ts`, `tebar.functions.ts`,
  `routes/api/public/hooks/social-publish.ts`, `CrmSocial.tsx`.
- Aturan baru:
  1. `deliveryStatus(results)`: ada `pending` → `publishing`; ada `ok` → `published`; selain itu `failed` (sebelumnya `anyOk ? published : failed`).
  2. Hasil per akun punya flag `pending` (Tebar: target belum `published` dianggap pending) → post tidak ditandai terbit dulu.
  3. Kunci idempotensi Tebar **stabil**: `xperd-{postId}-{profil|default}` (sebelumnya `randomUUID()` → kirim ulang bisa dobel). Respons tanpa `id` → error "jangan kirim ulang".
  4. "Kirim sekarang" mengklaim baris dulu (`draft|scheduled` → `publishing`, bukan sumber Tebar, `external_id` kosong); gagal klaim → "Postingan sudah diproses…".
     Bila publish melempar error, status jadi `failed` dengan `last_error`.
  5. Hook cron: wajib autentikasi, hanya ambil `scheduled`, bukan Tebar, `external_id` null, **cek `scheduled_at ≤ now` lagi saat klaim**,
     error `publishPost` disimpan ke baris (bukan hilang).
  6. UI: ubah/jadwal ulang hanya untuk `draft`/`scheduled` non-Tebar tanpa `external_id`; update bersyarat (`.in(status)`), kalau sudah diproses → error "Muat ulang";
     tombol simpan hanya tampil untuk status itu; `validateScheduleTime` menolak waktu lampau ("Pilih waktu jadwal di masa depan"); "Kirim sekarang" tidak butuh waktu.
  7. Sinkron Tebar (`syncTebarPosts`): post lokal berstatus `scheduled/draft` tidak ditimpa; hasil lokal digabung via `reconcileDelivery`; update bersyarat status.
- Status Old: hook cron sudah ada dengan rahasia `SOCIAL_PUBLISH_SECRET` (GET/POST, `x-webhook-secret`); `Idempotency-Key` masih `randomUUID()`; status akhir
  masih `anyOk`; belum ada klaim/`pending`. `publishDuePosts` perlu diaudit terhadap daftar di atas sebelum diubah.
- Port ke Old: kolom `results` sudah JSON; tak perlu migrasi. Implementasi klaim lewat `UPDATE … WHERE status IN (…)` dan cek `affectedRows`.
  Pertahankan autentikasi cron Old (rahasia env), jangan ganti ke `authenticateCronRequest` Supabase.

### D. Jam emas WIB
- `golden-hours.ts` (+test): empat jendela — Pagi 07:00–08:30, Siang 12:00–13:00, Sore 16:30–18:00, Malam 19:30–21:00 (WIB, UTC+7);
  `nextGoldenSlot(from, slotId?)` mengembalikan awal jendela berikutnya (hari ini/besok); `toLocalInputValue`.
- UI: di editor Posts, di bawah input "Jadwal posting / Publish at", empat chip "⭐ Pagi 07:00" (EN: "⭐ Morning 07:00") mengisi waktu.
  `aria-label` "Jam emas WIB" / "Golden hours WIB". Port murni UI + berkas util (tanpa DB).

### E. Balasan cepat, Invoice cepat, Profil & Rekening
- Berkas: `QuickReplies.tsx`, `CrmInbox.tsx`, `CrmInteractions.tsx` (komentar), `CrmViews.tsx` (Leads), `routes/qalling.app.profile.tsx`.
- **Balasan cepat** (`QuickReplies`): daftar template `crm_templates` kanal `quick_reply` + `DEFAULT_REPLIES` bawaan; klik mengisi kotak balasan;
  tambah ("Nama template baru" + "Isi pesan") dan hapus milik sendiri. Dipasang di Inbox dan Komentar.
- **Invoice cepat** (`QuickInvoice`): tombol "Invoice cepat" di Inbox dan baris Leads (nama pelanggan/telepon terisi). Dialog: baris produk (nama/qty/harga),
  pilih dari **mini katalog** (`crm_templates` kanal `catalog`, `body` = harga) atau "simpan ke katalog", catatan, ringkasan teks siap WhatsApp
  (`*INVOICE*`, `Kepada`, baris `n. nama xqty @ Rp… = Rp…`, `*Total*`, "Transfer ke" dari `workspaces.bank_info`, catatan), tombol Salin, kirim WA, unduh **PDF** (jsPDF; logo dan rekening workspace).
  Nomor `INV-YYYYMMDD-####`. Bila rekening kosong tampil petunjuk "Isi rekening di Profil & Rekening".
- **Profil & Rekening** `/qalling/app/profile` (menu pengaturan): logo (diperkecil ke ≤400×160 PNG data-URL), nama usaha, WA/telepon, email, alamat, rekening bank, catatan pembayaran bawaan →
  `workspaces`. Hanya admin workspace yang bisa menyimpan ("Hanya admin workspace yang dapat mengubah profil.").
- Status Old: kolom `workspaces.bank_info/doc_footer_note/phone/email/address/logo_url` **sudah ada** (dipakai dokumen ERP); tabel `crm_templates` sudah ada.
  Perlu: cek apakah kolom `channel` menerima nilai baru (`quick_reply`, `catalog`) dan `jspdf` sudah menjadi dependensi; rute profil + guard simpan admin.

### F. Label pipeline
`CRM_STAGES` — id tetap, hanya label: `new` Tanya Harga (EN "New inquiry"), `contacted` Follow Up, `qualified` Konsultasi (EN "Consultation"),
`proposal` Kirim Penawaran (EN "Quote / Invoice sent"), `negotiation` Nego / Tunggu Bayar (EN "Awaiting payment"), `won` Closing (EN "Closing / Deal"), `lost` Batal (EN "Lost").
Dampak: semua teks UI dan **spec e2e Old yang mencari label lama** (Baru, Dihubungi, Terkualifikasi, Penawaran, Negosiasi, Menang, Kalah) harus disesuaikan.
Probabilitas tidak berubah.

### G. Submodul Qalling di CRM XPERD
- `modules.ts`: modul `crm` mendapat submodul baru `calendar` (Kalender), `clients` (Klien & Brand), `reports` (Laporan), `ai` (Integrasi AI & MCP), `team` (Tim & Anggota),
  dan grup menu diatur ulang: **Ringkasan** (Insights, Leads), **Penjualan** (Pipeline, Kontak, Follow Up, Target), **Konten** (Kalender, Posts, Ide, Media, Kampanye),
  **Percakapan** (Inbox, Komentar, Otomasi, Broadcast, WhatsApp Gateway, Template), **Klien & Laporan** (Klien & Brand, Laporan), Tender, **Pengaturan** (Akun Sosial, AI, Tim).
- `entitlements.ts`: peta fitur baru `calendar→publishing`, `clients→publishing`, `reports→insights`, `ai→mcp_api`, `team→publishing`.
- `CrmView` (`CrmViews.tsx`) merutekan id baru ke komponen. Halaman Kalender/Klien/Laporan/AI dipindah dari rute ke
  `components/qalling/pages/*Page.tsx` (rute Qalling tetap ada dan membungkus komponen yang sama); `TeamPage` jadi komponen (`embedded` menyembunyikan tautan "Back to all modules"); rute `/app/w/$id/team` membungkus.
- Menu **Tim & Anggota disembunyikan** di navigasi CRM versi XPERD (`!(crm && team)`); roadmap New 14 mencatat halaman peran untuk user khusus-Qalling hanya menampilkan modul Qalling (tidak terlihat jelas di diff; **verifikasi saat port**).
- `AiPage`: kini memakai izin (`canViewSubmodule("crm","ai")`); bila tak diizinkan tampil "Integrasi AI tidak tersedia pada paket atau izin workspace Anda."
- **Konflik dengan keputusan Old:** MCP sengaja dihapus (Ronde 49) dan item "AI & MCP" dilewati di New 13 (butir K). **Perlu keputusan:** lewati `ai` lagi (rekomendasi) atau tidak.
- Status Old: rute `qalling.app.calendar/clients/reports` sudah ada; belum ada versi di CRM XPERD maupun submodul `team`/`ai`.

### H. Navigasi Qalling
- Grup sidebar default terbuka untuk Penjualan/Konten/Percakapan atau grup yang berisi halaman aktif (sebelumnya semua terbuka); Insights, Leads, AI di atas grup.
- Menu Pengaturan: Akun Sosial, Tim & Anggota (bila fitur ada), **Profil & Rekening**, Tagihan & Saldo, Referral.
- **Bar navigasi bawah mobile** (`md:hidden`, 5 kolom): Beranda, Jadwal (kalender), Posting (tombol bulat utama → `post-scheduler`), Pesan (inbox), Menu (buka sheet). Tombol Menu di header diganti ini; `main` diberi `pb-28` di mobile.
- Hormati status Old: sidebar bisa diciutkan + localStorage `qalling-sidebar-collapsed` (Ronde 50) harus dipertahankan; item AI tidak dipasang.

### I. Admin
- **Referral** (`/app-admin/referral`, di grup Pengaturan): saklar "Program aktif", Komisi (%) 0–100, Maksimal (Rp), Min. top up (Rp); simpan ke `referral_settings` (singleton) —
  galat "Persentase harus 0–100", "Nominal tidak boleh negatif", "Hanya Super Admin yang dapat mengubah pengaturan ini". Old sudah punya tabel `referral_settings` (migrasi 029) dan logika hadiah; **cek apakah halaman admin sudah ada**, kalau belum tambahkan.
- **Menu mobile Super Admin**: `Sheet` kiri dengan tombol Menu, menutup saat tautan diklik (menggantikan deret tautan kecil); `main` tanpa overflow horizontal di layar kecil.
- **Content → "Muat Konten Default"** (situs Qalling): menyisipkan preset hero + 6 fitur (publishing, inbox, automation, crm, reports, ai) yang belum ada (`section/key`), tidak menimpa; konfirmasi dulu; toast "{n} konten default ditambahkan" / galat "Semua konten default sudah ada". Preset fitur `ai` menyebut ChatGPT & Claude via MCP — **sesuaikan** karena MCP dihapus di Old.

### J. Beranda & logo
- `QallingHome`: kartu di bawah "XPERD ERP — Sudah closing? Lanjutkan pembukuan di XPERD." + tombol "Lihat XPERD" (`https://xperd.id`, tab baru).
- `QallingLogo`: dua gambar (terang/gelap); versi putih `qalling-logo-white.png` tampil pada tema malam (CSS `.qalling-logo-light/-dark`, menggantikan latar putih di logo gelap). **Aset PNG putih belum ada di Old** — di New 14 hanya berupa `.asset.json` Lovable; berkas gambar harus diambil/diminta.

### K. Penjualan
`SalesTable.tsx`: saat membuka dokumen untuk diedit, centang Draft mengikuti status (`setIsDraft(doc.status === "draft")`, bukan selalu true);
menyimpan **mengikuti centang** — hilangkan centang untuk mengajukan, centang untuk tetap draft (sebelumnya quotation yang diedit mempertahankan status dan SO turunan tidak mengubah apa pun). Dokumen non-quotation mempertahankan status. Cek dampak ke spec penjualan Old.

### L. URL kembali pembayaran — tidak perlu di-port
New 14 memisahkan `return-url.server.ts` yang memakai header `Origin`/`Referer` bila alamat permintaan `http://` di balik proxy. Old sudah menyelesaikan masalah yang sama dengan
`requestOrigin()` (`X-Forwarded-Host/Proto`, default https; commit `49615c0`). Hanya fungsi util klien `isAllowedWalletOrigin` yang bisa diambil bila ingin selaras; **tidak ada perubahan perilaku**.

### M. Sinkron Tebar
Bagian dari C (poin 7). Tambahkan `reconcileDelivery` + unit test `post-delivery-rules.test.ts`.

## Tidak di-port
- `src/integrations/supabase/types.ts`, `drizzle/migrations/0026–0027` (plpgsql → ditulis ulang sebagai logika `transaction()`), `routeTree.gen.ts` (otomatis), `roadmap.md`, `AGENTS.md`.
- Aturan baru di AGENTS.md New 14 yang relevan sebagai pedoman: pergantian paket lewat fungsi layanan dengan pemeriksaan kepemilikan, kunci tenant, paket basi, dan kuota (tanpa debit saldo);
  menu/halaman AI dikendalikan `mcp_api` + izin workspace; posting lokal memakai cron per menit terautentikasi dan klaim waktu jatuh tempo.

## Urutan port yang disarankan
1. **F + D + K** (label, jam emas, edit quotation) — kecil, mandiri.
2. **C + M** (pengaman posting) — risiko duplikat kirim; sertakan unit test `post-delivery-rules`.
3. **E** (balasan cepat, invoice cepat, profil) lalu **H + J**.
4. **A + B** (ganti paket trial & admin) — logika uang/kuota, uji menyeluruh.
5. **G + I** (submodul CRM XPERD, admin referral/menu mobile/preset konten).

## Keputusan yang dibutuhkan sebelum port
1. Submodul `ai` (G) dan preset konten fitur `ai` (I): **dilewati** karena MCP dihapus, atau tetap? (rekomendasi: lewati.)
2. Aset logo putih Qalling (J): siapa yang menyediakan berkas PNG?
3. Label pipeline (F) ikut diganti di seluruh Old, termasuk ERP/CRM XPERD, atau hanya tampilan Qalling? (New 14 menggantinya di `crm.ts` sehingga berlaku keduanya.)

## Hasil Ronde 52

Keputusan: submodul/menu **AI & MCP dilewati** (MCP dihapus di Old; preset konten tanpa fitur "ChatGPT & Claude"), label pipeline diganti di
seluruh Old (`CRM_STAGES`), logo putih Qalling **ditunda** (berkas PNG belum tersedia; butir J hanya kartu jembatan XPERD).
Tidak ada migrasi baru (tidak perlu): semua kolom/tabel yang dipakai sudah ada (`crm_templates` kanal baru `quick_reply`/`catalog`,
`workspaces.bank_info` dll., `referral_settings`, `audit_logs`).

| # | Butir | Hasil |
|---|---|---|
| A | Ganti paket trial mandiri | **Selesai.** `qalling-tier-switch.server.ts` (`transaction()` + `FOR UPDATE`, tanpa stored function), `trial-tier.functions.ts`, `TrialTierSwitch.tsx`, `AddonTierChoices.tsx`. Pemilik tenant, trial berlaku (Jakarta), paket basi, kuota (`usageFits`, memakai `limits_override`), opsi tambahan, audit `self_service_trial`; periode/harga/status tetap, saldo tetap |
| B | Super Admin → Users | **Selesai.** Dialog "Paket Qalling" (`adminUserQallingPlans`/`adminSwitchUserQallingTier`), satu tabel dengan baris pembatas per workspace, kolom "Terdaftar", urutan terbaru (`admin-user-groups.ts`); audit `superadmin_users`, `pending_change` dibersihkan |
| C, M | Pengaman posting | **Selesai.** `post-delivery-rules.ts` (`deliveryStatus`, `reconcileDelivery`, `validateScheduleTime`), kunci idempotensi Tebar stabil, `pending` Tebar, klaim atomik "Posting sekarang" dan cron (`external_id` null, `scheduled_at ≤ NOW()` saat klaim, galat tersimpan), `saveWorkspaceRow` menolak ubah post yang sudah diproses/Tebar, sinkron Tebar tidak menimpa post lokal. Autentikasi cron Old (`SOCIAL_PUBLISH_SECRET`) dipertahankan |
| D | Jam emas WIB | **Selesai** (`golden-hours.ts` + chip di editor Posts). Draf dengan waktu terpilih mempertahankan waktunya (New 14 menimpanya dengan "sekarang") |
| E | Balasan cepat, Invoice cepat, Profil & Rekening | **Selesai.** `QuickReplies.tsx` (Inbox, Komentar), `QuickInvoice` (Inbox, Leads; PDF jsPDF), `/qalling/app/profile`. Template kanal `quick_reply`/`catalog` disaring dari halaman Message Templates (New 14 mencampurnya) |
| F | Label pipeline | **Selesai** (`crm.ts`); spec pipeline disesuaikan |
| G | Submodul Qalling di CRM XPERD | **Selesai** kecuali `ai`: `calendar`, `clients`, `reports`, `team` + grup menu Ringkasan/Penjualan/Konten/Percakapan/Klien & Laporan/Tender/Pengaturan; halaman dipindah ke `components/qalling/pages/*` dan `TeamPage` (tertanam: tanpa tautan launcher, daftar peran hanya modul CRM); menu Tim disembunyikan di navigasi CRM XPERD |
| H | Navigasi Qalling | **Selesai.** Bar bawah mobile (Beranda/Jadwal/Posting/Pesan/Menu), grup default terbuka, menu Profil & Rekening, Tim & Anggota di Pengaturan. Sidebar ciut + localStorage dipertahankan |
| I | Admin | **Selesai.** `/app-admin/referral` (`getReferralSettings`/`saveReferralSettings`, validasi 0–100 / nominal ≥ 0), menu mobile Super Admin (Sheet), "Muat Konten Default" (tidak menimpa) |
| J | Beranda & logo | Kartu "Lihat XPERD" **selesai**; logo putih tema malam **ditunda** |
| K | Edit quotation mengikuti centang Draft | **Selesai** (`SalesTable.tsx`) |
| L | URL kembali pembayaran | Tidak ada perubahan (sudah setara) |

Spec baru: `post-safeguards`, `quick-tools`, `qalling-tier-switch`, `new14-parity`; spec lama disesuaikan: `crm-pipeline` (label tahap & urutan sidebar),
`new13-parity` (Users satu tabel). Regresi penuh: **88 lulus** sebelum dua penyesuaian spec di atas; keduanya lulus setelahnya.

Belum dites: kirim ke Tebar sungguhan dengan target `pending` (hanya jalur kode; mock Tebar spec saat ini tidak mengirim post), logo putih,
dan unit test murni New 14 (`*.test.ts`) tidak dibawa karena Old tidak memakai Vitest — aturannya diuji lewat e2e.

## Perbandingan live (Ronde 52, akun pelanggan dengan Qalling)

Cara: crawl hanya-baca `xperd-new.lovable.app` (akun pelanggan dengan add-on Qalling) vs Old (akun seeder, add-on legacy) pada 50 halaman
Qalling/CRM + 102 halaman modul ERP (judul, menu, tombol, kolom tabel, input). Kredensial lewat variabel lingkungan, tidak disimpan.

- **Sama:** 78 dari 102 halaman ERP dan hampir semua halaman Qalling/CRM; selisih sisanya hanyalah data (baris contoh, tombol per baris) atau elemen heading.
- **Diperbaiki:** Follow Up kini punya kolom cari ("Cari follow up…"), tombol Pustaka Dokumen "Upload dokumen" (bukan "Unggah dokumen").
- **Sengaja beda:** menu "Integrasi AI & MCP" (MCP dihapus di Old).
- **Live lebih baru dari New 14 (tidak ada di kode New 13/14 maupun Old, perlu zip berikutnya):**
  - Admin → Referral: "Materi Promosi Referral" (teks WA, teks sosial, gambar) dan Qalling → Referral: "Materi Promosi Siap Share" (Salin caption, Bagikan, WhatsApp).
  - Admin → Konten: "Kontak website XPERD" (email, telepon, WhatsApp, alamat, jam layanan, website lain).
  - Modul Manufaktur diganti modul **Production** (Formulasi/BOM, Lot & Stok, Quality, Perintah Produksi, Biaya & Jurnal, Traceability & Recall, Laporan Produksi, Log Limbah B3, Pusat Kerja, Profil Item Produksi, Registrasi Produk, Kode Formulasi, Peran Produksi, Audit Production). Old masih 3 submodul (BOM, Perintah Kerja, Biaya Produksi).
- Katalog paket live (mis. batas akun Lite = 10) hasil edit Super Admin; kode New 14 memakai 5 — mengikuti kode.

## Integrasi AI & MCP (diaktifkan kembali, Ronde 53)

Keputusan berubah: MCP dibangun ulang **tanpa paket Lovable** (`@lovable.dev/mcp-js` tidak dipakai), di atas MySQL Old.

- **Server** `POST /mcp` (Streamable HTTP, respons JSON; `initialize`, `ping`, `tools/list`, `tools/call`; GET/DELETE → 405; CORS terbuka karena token lewat header).
  Kerangka sendiri di `src/lib/mcp/framework.ts` (tool bertipe zod v4 → JSON Schema). 15 tool: 7 ERP baca-saja + Qalling (akun sosial, postingan, draf postingan,
  cari/buat lead, ide, **daftar komentar**, **like komentar** — dua tool terakhir baru di New 14).
- **Hak akses:** setiap tool wajib anggota workspace **dan** fitur paket `mcp_api` (hanya Agency di katalog saat ini); tool tulis juga mengikuti peran tulis workspace.
  `list_workspaces` hanya menampilkan workspace yang paketnya memuat `mcp_api`. Galat internal tidak dibocorkan ke klien.
- **Autentikasi:** (1) token pribadi `xpm_…` dibuat di Qalling → Integrasi AI (hash SHA-256 di `mcp_tokens`, nilai asli tampil sekali, maks 20 aktif, bisa dicabut);
  (2) **OAuth 2.1** untuk ChatGPT/Claude: `/.well-known/oauth-protected-resource` (+ varian `/mcp`), `/.well-known/oauth-authorization-server`, `POST /oauth/register`
  (registrasi klien dinamis, klien publik, redirect HTTPS/localhost), `GET|POST /oauth/authorize` (halaman persetujuan server-side, redirect URI harus terdaftar persis,
  PKCE **S256 wajib**, kode sekali pakai 10 menit), `POST /oauth/token` (access 1 jam, refresh 30 hari dirotasi). Tanpa sesi login → halaman pilihan masuk
  (Qalling Google/kode email atau email+sandi XPERD) lalu kembali ke persetujuan (`next` didukung di `/auth` dan `/qalling/login`, hanya `/oauth/*`).
- **UI:** `/qalling/app/ai` dan submodul `ai` di CRM XPERD (izin `canViewSubmodule` → `mcp_api`): alamat koneksi, panduan ChatGPT/Claude, token pribadi, daftar akses aktif + cabut.
  Menu "Integrasi AI & MCP" di sidebar Qalling (setelah Prospek) dan grup Pengaturan CRM XPERD; preset konten "Terhubung ChatGPT & Claude" dipulihkan.
- **Migrasi 035** (`oauth_clients`, `oauth_codes`, `mcp_tokens`). **Prod:** `npm run migrate`; proxy harus meneruskan `X-Forwarded-Host`/`X-Forwarded-Proto` (URL metadata OAuth mengikuti domain yang dipakai).
- Spec: `e2e/mcp.spec.ts` (401 + metadata, token pribadi di DB hanya hash, protokol, 15 tool, tulis/baca di SQL, validasi, batas paket Pro vs Agency, OAuth lengkap
  termasuk tolak/izinkan, verifier salah, kode sekali pakai, refresh dirotasi, kedaluwarsa, cabut dari UI, alur login → persetujuan).
- Belum diuji dengan klien AI sungguhan (ChatGPT/Claude/Claude Code); hanya klien HTTP uji yang meniru alurnya.
