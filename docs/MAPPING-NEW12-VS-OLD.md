# Mapping BS New 12 → Old Production

Sumber: selisih `Xperd One Business Suite New 11` ↔ `New 12` (8 migrasi baru `0017`–`0024`, 55 berkas `src` berbeda, `SCALING.md`,
`roadmap.md`, `AGENTS.md`, 2 dependensi baru). Catatan: situs live `xperd-new.lovable.app` sudah memuat perubahan New 12
(mis. dropdown Inbox "All accounts"), jadi New 12 = acuan perilaku live terbaru.

Legenda status Old: ❌ belum ada · 🟡 sebagian · ✅ sudah setara. Usaha: S (≤½ hari) · M (1–2 hari) · L (>2 hari).
Padanan teknis tetap sama dengan ronde sebelumnya: tabel/RLS/fungsi SQL New 12 → migrasi MySQL + transaksi aplikasi + server function
(`requireAppAuth`); tabel baru harus didaftarkan di `WORKSPACE_TABLES`/`COLS` (`data.functions.ts`).

## A. Pendaftaran, identitas, dan situs Qalling

| # | Fitur baru/berubah di New 12 | Sumber New 12 | Status Old | Rencana port | Usaha |
|---|---|---|---|---|---|
| A1 | Bahasa default **Indonesia** (`en` → `id`) + pengalih ID/EN di situs/auth/shell Qalling | `lib/i18n.tsx`, `QallingPreferences.tsx`, `lib/qalling-copy.ts` (kamus ID→EN ±6 KB) | ❌ default `en`; tanpa kamus | ubah default, salin `qalling-copy.ts`, `QallingPreferences` | S |
| A2 | Mode **terang/malam/sistem** (tersimpan `localStorage qalling-theme`) | `QallingPreferences.tsx`, `styles.css` (+18 baris) | ❌ | salin komponen + CSS | S |
| A3 | **Daftar langsung** nama+email, **tanpa wajib pilih paket** → default **Lite**; `?paket=` tetap dihormati | `qalling-signup-rules.ts` (`resolveSignupTier`), `qalling.daftar.tsx`, `qalling-auth.functions.ts` | ❌ Old mewajibkan pilih paket dulu | ubah validator + halaman daftar (halaman "Pilih paket dulu" dihapus) | S |
| A4 | **Kotak persetujuan wajib** (Terms/Privacy/AUP) — kalimat & 3 dokumen diedit Super Admin; dialog baca dokumen; `terms_accepted_at` dicatat; server menolak tanpa `acceptTerms` | migrasi `0021`, `auth-settings.tsx`, `qalling.daftar.tsx`, `qalling-auth.functions.ts` | ❌ | migrasi: kolom `platform_auth_settings.terms_*`, `registrations.terms_accepted_at`; form admin + dialog | M |
| A5 | Google: trial langsung (tanpa pilih paket/kode); teks panduan BYOK diubah (kunci harus di Auth Cloud) | `auth-settings.tsx`, `qalling.login.tsx` | 🟡 alur Google ada tapi butuh `VITE_GOOGLE_OAUTH_URL` | samakan teks; syarat `acceptTerms` pada `provisionGoogleSignup` | S |
| A6 | Beranda situs: judul/SEO baru "AI Social CRM: Posting via Chat AI, Leads, Pipeline & Automasi", blok `Block` per bagian, tombol "Daftar gratis"/"Selengkapnya", **`QallingStory`** ("A day with Qalling": alur satu hari dari chat AI → closing, tender, laporan, ERP XPERD) | `qalling.index.tsx`, `QallingStory.tsx` (47 teks ID/EN) | ❌ | salin; data lewat server function | M |
| A7 | **Harga & perbandingan fitur satu sumber**: situs & layar upgrade membaca `addon_tiers` + registri label fitur bersama (`QALLING_FEATURE_LABELS`, `TierFeatures`); keadaan memuat/gagal ("Memuat paket…") | `qalling-catalog.ts`, `TierFeatures.tsx`, `QallingSite.tsx`, `AddonTierChoices.tsx`, `AddonTierCatalog.tsx` | 🟡 harga/limit dari DB sudah (Ronde 44) tapi daftar fitur statis | server fn **publik** daftar tier aktif (Lite/Pro/Agency); registri label; refaktor `PricingGrid` | M |
| A8 | Katalog publik tier (policy `anon`: hanya tier aktif Lite/Pro/Agency) | migrasi `0018` | ❌ tak ada RLS di Old | endpoint publik read-only yang memfilter 3 kode tier aktif | S |
| A9 | Font situs Qalling **Poppins** (sebelumnya Manrope) | `styles.css`, `__root.tsx` | ❌ Manrope | ganti font & tautan Google Fonts | S |
| A10 | **Beranda dikelola CMS**: banner + fitur dwibahasa, gambar opsional terkompresi (WebP ≤1600 px, ≤5 MB) di `site_content` section `qalling.hero`/`qalling.features`; editor admin: dropdown section, unggah+pratinjau gambar | `qalling-content.ts`, `app-admin/content.tsx`, `QallingSite.tsx` | 🟡 Website Content per situs sudah (Ronde 47), tanpa dropdown section/gambar | tambah dropdown, unggah gambar (data-URL), render hero/fitur dari CMS | M |
| A11 | Ikon platform sosial asli (IG, FB, TikTok, YouTube, LinkedIn, X, Threads, Telegram, Discord) | `SocialIcon.tsx`, dep `@icons-pack/react-simple-icons` | ❌ ikon generik | tambah dep + komponen; pakai di pairing/akun/kalender/beranda | S |
| A12 | Beranda aplikasi Qalling: ringkasan interaktif berfokus konten (akun per platform, aktivitas publikasi, automasi aktif, paket saat ini); **ringkasan saldo dihapus dari beranda & header** | `QallingHome.tsx` (+437 baris), `qalling.app.tsx` | 🟡 Old masih menampilkan saldo di header/beranda | refaktor `QallingHome`; hitung (count) bukan memuat semua baris; hapus saldo header | M |
| A13 | Kalender: filter **klien**, ikon platform, kueri dibatasi tanggal (maks 2.000 baris) | `qalling.app.calendar.tsx` | ❌ | filter klien + batas baris | S |

## B. Paket freelancer/agensi (migrasi `0024`)

| # | Fitur | Sumber New 12 | Status Old | Rencana port | Usaha |
|---|---|---|---|---|---|
| B1 | **Klien & Brand**: kelompok klien per workspace (nama, warna), tetapkan akun sosial ke klien; halaman `/qalling/app/clients` | `crm_client_groups`, `crm_social_accounts.client_group_id`, `qalling.app.clients.tsx` | ❌ | migrasi tabel + kolom (FK komposit `(id, workspace_id)`); daftarkan di `WORKSPACE_TABLES`/`COLS`; halaman | M |
| B2 | **Laporan performa per klien** (7/30/90 hari: terbit, terjadwal, gagal, komentar, leads baru) + ekspor **PDF & Excel** | `qalling.app.reports.tsx` (`xlsx`, `jspdf-autotable`) | ❌ (dep jspdf/xlsx sudah ada) | halaman + server fn agregasi | M |
| B3 | **Referral**: kode per tenant, klaim saat daftar (hanya ≤7 hari, belum pernah top-up), komisi wallet otomatis saat **top-up pertama dibayar** (default 10%, maks Rp100.000, min top-up Rp50.000), halaman `/qalling/app/referral` | `referral_settings`, `referral_codes`, `referrals`, fungsi `referral_my_code/claim`, trigger `topups_referral_reward`, `qalling.app.referral.tsx` | ❌ (`voucher` sudah jadi jenis ledger Old) | 3 tabel; di Old **tanpa trigger** → panggil di `walletSettleTopup` dalam transaksi yang sama (ledger `voucher`, idem `referral:<tenant>`); klaim lewat query `?ref=` saat signup | L |
| B4 | Editor pengaturan referral untuk Super Admin | — (roadmap: **belum dibuat di New 12**) | ❌ | opsional; sederhana bila diminta | S |
| B5 | Tombol **WhatsApp** pada baris Leads (pesan "Halo {nama}, …") | `CrmViews.tsx` | ❌ | tambah tautan `wa.me` | S |
| B6 | Menu aplikasi: Klien & Brand, Laporan, Referral | `qalling.app.tsx` | ❌ | tambah item nav | S |

## C. Inbox, komentar, dan automasi

| # | Fitur | Sumber New 12 | Status Old | Rencana port | Usaha |
|---|---|---|---|---|---|
| C1 | **DM ke Leads (Pro)**: simpan percakapan jadi lead (kode lead berikutnya, cegah duplikat via `lead_id`), lencana "Tersimpan di Leads"; paket non-Pro melihat tombol terkunci | migrasi `0021` (`crm_conversations.lead_id`), `inbox-lead.functions.ts`, `CrmInbox.tsx` | ❌ | kolom + server fn (cek fitur `crm` via `workspaceHasFeature`, izin tulis) | S–M |
| C2 | **Automasi kaya**: aksi `reply` / `comment_to_dm`, balasan publik, **tombol link** (judul ≤20 karakter, https), **pelacak klik** (`/l/$ruleId` → 302, hitung klik, abaikan bot), **wajib follow** (ajakan, tombol, retry), **auto-like** komentar; validasi lintas-bidang | migrasi `0017`, `0023`; `automation-payload.ts` (+test); `CrmInteractions.tsx`; `l.$ruleId.ts` | ❌ aturan Old hanya keyword → balasan | kolom baru `crm_automation_rules` (+`external_id`) & `crm_social_comments.liked_at`; rute `/l/$ruleId` (ganti RPC `crm_record_automation_click` dengan `UPDATE … click_count = click_count + 1`); UI aturan | L |
| C3 | Pengiriman Meta native untuk automasi baru: balasan privat komentar (Instagram: 1 per komentar), balasan publik setelah DM, cek "apakah pengguna follow" sebelum kirim, DM dengan tautan pelacak (`PUBLIC_APP_ORIGIN`) | `social-interactions.server.ts` (+67 baris) | ❌ | perluas `dispatchSocialAutomation` + helper Graph; **uji dengan server tiruan Meta** (seperti `e2e/crm-interactions`) | L |
| C4 | **Like komentar** manual & massal (tombol Like/Disukai, ringkasan "n disukai, m dilewati") hanya platform yang mendukung | `social-interactions.functions.ts`, `likeCommentsCore`, `CrmInteractions.tsx` | ❌ | server fn + tombol | M |
| C5 | **Mesin sosial hibrid**: akun `source=tebar` → komentar/DM/automasi lewat **API Tebar** (header profil = workspace id, sinkron saat halaman dibuka — pull, belum webhook push); `source=meta` → Graph native; satu UI untuk keduanya | `tebar-interactions.server.ts` (`syncTebarInteractions`, balas komentar, kirim pesan, buat/ubah/hapus automasi, auto-like), `social-interactions.functions.ts` | ❌ Old hanya Tebar untuk **akun & posting** (Ronde 40) | **pihak ketiga → salin kode**; ganti Supabase client dengan `execute`; tabel `crm_conversations/messages/social_comments` Old sudah ada (Ronde 39) | L |
| C6 | Dropdown Inbox "All accounts" (filter per akun), muat konversi dari Meta **atau** Tebar | `CrmInbox.tsx`, `meta-inbox.functions.ts` | 🟡 "All Meta accounts" | ubah label + sumber | S |
| C7 | Tool MCP baru: `qalling_list_comments`, `qalling_like_comments` | `lib/mcp/tools/…`, `mcp/index.ts`, `.lovable/mcp/manifest.json` | 🟡 6 tool Ronde 45 | tambah 2 tool (tetap terbentur autentikasi MCP Old yang belum jalan) | S |

## D. Media dan Billing

| # | Fitur | Sumber New 12 | Status Old | Rencana port | Usaha |
|---|---|---|---|---|---|
| D1 | **Folder media** (nama 1–60 karakter, buat folder, pindah/unggah ke folder) + **urutan** (baru/lama/nama/ukuran) | migrasi `0022` (`crm_media.folder`), `CrmMedia.tsx` | ❌ | kolom `folder` + indeks; UI folder & sort; update `COLS` | M |
| D2 | **Unduh PDF invoice** bermerek A4 (LUNAS/BELUM DIBAYAR/…; merek "XPERD" di Billing ERP, "Qalling" di aplikasi Qalling) | `invoice-pdf.ts`, `billing.tsx`, `qalling.app.billing.tsx` | ❌ (Old punya `doc-pdf.ts` untuk dokumen, bukan invoice langganan) | salin `invoice-pdf.ts` (jsPDF sudah ada); tombol "PDF" per baris invoice | S |
| D3 | Webhook Midtrans membalas **500 "Retry later"** bila perpanjangan gagal setelah saldo masuk (penyedia mencoba ulang) | `wallet-midtrans.ts` | 🟡 Old menelan galat (`.catch(() => undefined)`) | balas 500 bila `renewTenant` melempar; pastikan settle idempoten (sudah, kunci ledger) | S |

## E. Super Admin dan infrastruktur

| # | Fitur | Sumber New 12 | Status Old | Rencana port | Usaha |
|---|---|---|---|---|---|
| E1 | **Pengelompokan menu Settings** di Super Admin (`SETTINGS` list, grup aktif mengikuti path) | `app-admin.tsx` (+118 baris) | 🟡 menu bergrup Ronde 47, tanpa grup Settings | restrukturisasi nav | S |
| E2 | **Storage eksternal**: pengaturan S3/R2/Wasabi/Spaces/B2 (endpoint HTTPS resmi saja, tanpa path/kredensial/redirect, bucket valid), rahasia tak pernah dikembalikan (hanya `has_*_key`), **uji koneksi** signed HEAD (`aws4fetch`); **tidak memindahkan berkas lama** | migrasi `0019`, `platform-storage.functions.ts`, `platform-infrastructure-rules.ts` (+test), `app-admin/storage.tsx` | ❌ berkas Old di volume lokal (`STORAGE_DIR`) | tabel `platform_storage_settings` + halaman konfigurasi/uji (dep `aws4fetch`). **Aktivasi/cutover tidak ada di New 12** (butuh adapter privat + migrasi objek) | M |
| E3 | Hardening skala: indeks daftar/kuota (`crm_scheduled_posts`, `crm_social_accounts`, `crm_conversations`, `crm_messages`, `crm_media`), indeks bulanan posting & pemakaian media | migrasi `0018`, `0020` | ❌ | indeks MySQL (indeks fungsional bulan → kolom generated atau cukup `(workspace_id, scheduled_at)`) | S |
| E4 | `workspace_id` akun/media/posting **tidak boleh diubah** setelah insert | migrasi `0020` (trigger) | ❌ tanpa trigger (aturan Old) | tolak `workspace_id` di jalur update `saveWorkspaceRow` (sudah dikecualikan dari kolom update) + uji | S |
| E5 | Beranda/kalender dibatasi tanggal & 2.000 baris; widget CRM memakai count | `QallingHome`, `calendar` | 🟡 Old memuat ≤1.000 | samakan batas, gunakan `countWorkspaceRows` | S |
| E6 | Dokumen `SCALING.md` (batas yang diakui: perlu load test staging, antrean/outbox webhook, dsb.) | `SCALING.md` | — | salin sebagai catatan | S |

## F. Belum selesai di New 12 sendiri (jangan diporting)

Google BYOK (kunci harus di Auth Cloud), aktivasi storage eksternal/MinIO, verifikasi rilis dengan sesi login nyata, uji kapasitas ribuan
pengguna, webhook push Tebar, editor pengaturan referral Super Admin, metrik jangkauan/impression asli.

## Urutan port yang disarankan

1. **A1–A5, A9, A12–A13, B6** — pendaftaran/terms/bahasa/tema + shell aplikasi (paling terlihat pengguna).
2. **B1–B3, B5** — klien, laporan, referral (migrasi `028_…` dst.).
3. **C1, C4, D1, D2, D3, E1, E3–E5** — perbaikan menengah dan kecil.
4. **A6–A8, A10–A11** — situs publik (Story, CMS beranda, ikon, katalog publik).
5. **C2, C3, C5, C7** — automasi kaya + mesin hibrid Tebar (terbesar, butuh server tiruan Tebar/Meta untuk e2e).
6. **E2** — konfigurasi storage eksternal (hanya UI+uji; tanpa cutover).

## Dampak migrasi/seed (mengikuti aturan produksi: migrate/seed manual)

Migrasi Old baru yang diperlukan (urutan setelah `027`): `028` terms & lead_id & folder & click/automation kolom,
`029` klien/referral, `030` storage settings, `031` indeks. Tidak ada seed baru (referral_settings default dibuat lewat `INSERT IGNORE` di migrasi).
