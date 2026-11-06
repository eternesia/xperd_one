# Pemetaan BS New 16 → Old Production (Ronde 55, belum di-port)

Sumber: `diff -rq "Xperd One Business Suite New 14" "Xperd One Business Suite New 16"` (New 15 identik dengan New 14). Perbedaan: **137 berkas baru + 48 berkas berubah**,
**30 migrasi baru** (`0028`–`0057`, semuanya plpgsql/RLS), dokumen `README_PRODUCTION.md` (spesifikasi modul Production, 483 baris), `docs/mfg-*.md`
(audit + akseptasi M1–M4, fase 2–3, HPP rata-rata), `QALLING-DOMAIN.md`. Dokumen ini hanya **memetakan**; belum ada kode Old yang diubah.

Aturan Old yang tetap berlaku saat port: **tanpa trigger/stored function/RLS** — semua aturan di `transaction()` + `SELECT … FOR UPDATE` dan pemeriksaan peran di
server (`requireAppAuth`, `canWriteWorkspace`, entitlement); migrasi bernomor idempoten (berikutnya **037**); tabel/kolom baru didaftarkan di `WORKSPACE_TABLES`/`COLS`
(`src/lib/data.functions.ts`) bila dibaca generik; fungsi server lewat `createServerFn`; uang integer, kuantitas `DECIMAL(18,4)`.

## Ringkasan

| # | Kelompok | Isi | Status di Old | Usaha |
|---|---|---|---|---|
| A | **Modul Production** (add-on `manufacturing`) | ±30 tabel `mfg_*`, ±70 fungsi terpagar, 15 submenu, e-sign, audit tak-terhapus, jurnal otomatis | Hanya modul Manufacturing lama 3 submodul (BOM/WO/Biaya) | **Sangat besar** |
| B | ERP: HPP rata-rata aktif + posting atomik + Nota Kredit | Submit/batal dokumen Beli/Jual satu transaksi, pembalikan nilai asli, `acc_credit_memos`, POS atomik, `CancelDocumentDialog`, `SalesLotPicker` | Sebagian (Old punya `movingAverageCosts` & jurnal TS; belum nota kredit/dialog batal) | Besar |
| C | Peran kustom workspace (Custom Roles) | `workspace_custom_roles`, `workspace_members.custom_role_id`, matriks izin per peran, panel di Tim | Belum | Sedang |
| D | Admin | Users per tenant (Detail), Tenancy kolom **Sumber daftar** (`tenants.signup_source`), **Kebijakan media** (batas/kualitas/kompresi), Tebar paginasi 1 halaman/permintaan, editor Kontak situs, editor materi referral | Sebagian (Tebar pager UI, kontak XPERD & referral dibuat dari tampilan live di Ronde 54) | Sedang |
| E | Qalling | URL bersih domain `qalling.id` (rewrite router + redirect 301), komentar pertama + cover video, opsi **Extra 5 akun**, `QallingShowcase`/ikon (sudah), seksi Testimoni (sudah) | Sebagian | Sedang |
| F | Tidak di-port | `types.ts`, `drizzle/*`, `bun.lock`, `.lovable/*`, `routeTree.gen.ts`, tes `*.test.ts` (Old tanpa Vitest) | — | — |

---

## A. Modul Production (manufacturing)

**Konsep** (`README_PRODUCTION.md`): modul penuh untuk formulator pestisida/agrokimia — master data produksi, formulasi/BOM berversi, perintah produksi, issue material per lot (FEFO,
dikoreksi potensi), batch record elektronik, QC (bahan masuk/in-process/rilis), receipt barang jadi, costing aktual, **jurnal otomatis ke Accounting**, traceability maju/mundur,
gate registrasi produk, log limbah B3. Gated entitlement `manufacturing` (fitur `mfg_basic`, atau `legacy`); tanpa entitlement semua rute/RPC menolak (403). Aturan keras: uang integer,
kuantitas `numeric(18,4)`, persentase `numeric(9,6)`, `workspace_id` di tiap tabel, mutasi **idempoten** (`idempotency_key`) dan **append-only** (koreksi = entri pembalik), akun jurnal dari **pemetaan akun**
(bukan hard-coded), nomor dokumen internal transaksional.

**Menu (15 submodul, ikon per submenu):** Formulasi / BOM (`boms`), Lot & Stok (`lots`), Quality (`quality`), Perintah Produksi (`orders`), Biaya & Jurnal (`accounting`), Traceability & Recall (`traceability`),
Laporan Produksi (`reports`), Log Limbah B3 (`waste`), Pusat Kerja (`work-centers`), Profil Item Produksi (`profiles`), Registrasi Produk (`registrations`), Kode Formulasi (`formulation-codes`),
Pengaturan (`settings`), Peran Produksi (`roles`), Audit Production (`audit`). Rute baru `production.$workspaceId.$section.tsx`; kartu modul "Manufacturing" lama diganti "Production" (`addon: "manufacturing"`, tidak lagi `disabled`).
Dashboard: kartu ringkas (BOM, perintah produksi, barang jadi 6 bulan, lot karantina/kedaluwarsa ≤ 30 hari, inspeksi tertunda, deviasi terbuka, pusat kerja, biaya & selisih) + grafik.
Standar UI: tabel berupa kartu + nomor baris + paginasi + ikon aksi; pencarian di tiap tabel.

**Tahap (migrasi New 16) → isi → padanan Old**

| Tahap | Migrasi | Tabel | Fungsi (plpgsql) yang harus jadi kode server |
|---|---|---|---|
| M0 audit | — (`docs/mfg-audit.md`) | — | Pemetaan pemakaian ulang skema ERP yang ada; **diverifikasi ulang terhadap skema Old** |
| M1 fondasi | 0030–0033, 0035 | `mfg_settings`, `mfg_workspace_roles`, `mfg_item_profiles`, `mfg_formulation_codes`, `mfg_product_registrations`, `mfg_work_centers`, `mfg_routings`, `mfg_routing_ops`, `mfg_cost_rates`, `mfg_number_counters`, `mfg_number_allocations`, `mfg_audit_log` | `mfg_has_entitlement`, `mfg_can_access`, `mfg_save_master` (simpan terpagar), `mfg_master_guard`, `mfg_audit_change` (audit tak bisa UPDATE/DELETE), `mfg_allocate_number` (penomoran), 20 kode formulasi bawaan (CropLife: EC, SC, WP, WG, SL, …) |
| M2 kepatuhan | 0034, 0036 | `mfg_document_links` (SDS/izin/label berversi, unggahan privat, pembacaan bertanda tangan + tercatat) | `mfg_attach_document`, `mfg_registration_valid` (blok produksi/penjualan bila registrasi kedaluwarsa), `mfg_record_document_access` |
| M3 BOM | 0037–0040 | `mfg_boms`, `mfg_bom_versions` (draft→in_review→approved→obsolete, versi approved tak bisa diubah), `mfg_bom_lines`, `mfg_bom_transitions`, `mfg_approval_challenges` | `mfg_save_bom`, `mfg_transition_bom` (pemisahan penyusun/penyetuju, e-sign), `mfg_bom_composition_issues` (komposisi bahan aktif vs `ai_declared`), banding versi + CSV |
| M4 lot | 0041–0044 | `mfg_lots` (perluas lot inventory: status QC, assay, kedaluwarsa), `mfg_lot_selections`, `mfg_warehouse_profiles` | `mfg_save_lot`, `mfg_select_lot` (FEFO, atomik), `mfg_lot_balance`, `mfg_inventory_guard`, integritas GRN (karantina saat terima, kuantitas terposting) |
| M5 mutu | 0045 | `mfg_qc_specs`, `mfg_qc_spec_params`, `mfg_qc_inspections`, `mfg_qc_results`, `mfg_deviations`, `mfg_esign_challenges` | `mfg_save_qc_spec`, `mfg_create_inspection`, `mfg_record_qc_results` (lulus/gagal dihitung server), `mfg_decide_lot`, `mfg_save_deviation`/`mfg_close_deviation` (CAPA), `mfg_verify_esign`/`mfg_consume_esign` |
| M6–M10 eksekusi | 0046 | `mfg_orders`, `mfg_order_materials`, `mfg_order_labor`, `mfg_batch_steps` (eBMR), `mfg_order_outputs`, `mfg_order_costs`, `mfg_order_transitions`, `mfg_lot_genealogy`, `mfg_account_mappings`, `mfg_journal_events` | `mfg_save_order`, `mfg_release_order` (kunci versi BOM), `mfg_issue_material` (kompensasi potensi, override beralasan), `mfg_perform_step`/`mfg_verify_step`, `mfg_log_labor`, `mfg_record_output`, `mfg_compute_order_cost`, `mfg_post_order_journals` + `mfg_retry_journals`/`mfg_reverse_journals` (outbox idempoten), `mfg_sellable_lots` + `mfg_sales_lot_guard` (blok jual lot belum rilis) |
| M11–M12 | 0047–0048 | `mfg_waste_logs` | `mfg_trace_lot` (maju/mundur), `mfg_recall_simulation`, laporan produksi + CSV/cetak (`production-report`, `production-pdf`) |
| Rekonsiliasi | 0053 | — | `mfg_financial_reconciliation` (stok/jurnal produksi vs akuntansi) |

**Event jurnal** (outbox, tidak menulis jurnal langsung dari modul): `mfg.material_issued`, `mfg.conversion_applied`, `mfg.fg_received`, `mfg.order_closed`, `mfg.scrap_recorded`, `mfg.lot_qc_changed`, `mfg.registration_expiring`.
Akun: WIP, barang jadi, HPP/COGS, selisih — dari `mfg_account_mappings`.

**Status penerimaan di New 16 sendiri (penting):** roadmap New 16 menandai M1–M4 *foundation* selesai tetapi **belum diterima operasional** (akseptasi M3/M4 diblokir: butuh akun QA dan gateway email;
alur GRN pemasok nyata + posting atomik prosedur + uji konkurensi belum diverifikasi; "Production M10–M11 … belum diterima sebagai selesai"; M12 lanjutan — impor massal, uji beban, timbangan — belum ada).
Artinya kode New 16 untuk Production **belum teruji penuh di sumbernya** dan bagian bertanda **[VERIFIKASI]** (toleransi komposisi, regulasi B3/GHS) butuh keputusan regulatori pengguna.

**Pendekatan port ke Old (usulan)**
1. Migrasi MySQL bernomor (037–04x) per tahap; semua `mfg_*` dengan `workspace_id`, kolom `idempotency_key` unik, tabel audit/transition **tanpa jalur UPDATE/DELETE** di kode (dan tanpa kunci asing yang membolehkan hapus kaskade riwayat).
2. Satu modul server per tahap (`src/lib/production-*.server.ts`): fungsi `transaction()` yang meniru tiap RPC (kunci `FOR UPDATE` pada BOM/lot/order, `SELECT … FOR UPDATE` saldo lot, cek entitlement `manufacturing` + peran `mfg_workspace_roles`, tulis audit dalam transaksi yang sama).
3. Pemakaian ulang yang sudah ada di Old: `inv_movements`/saldo stok, jurnal (`journal.ts`), penomoran, entitlement, `workspaceHasFeature`, penyimpanan berkas (`files.server`), mailer untuk e-sign.
4. UI: port komponen `Production*.tsx` (kartu + paginasi + ikon) dengan server fn Old; rute `production.$workspaceId.$section`.
5. Uji e2e per tahap dengan angka dihitung ulang dari SQL (HPP, saldo lot, jurnal seimbang, pembalikan), uji penolakan lintas workspace/tanpa entitlement, dan uji konkurensi (dua issue lot bersamaan).
6. Urutan: M1 → M2 → M3 → M4 → M5 → M6–M10 (eksekusi + costing + jurnal) → M11–M12; **jangan aktifkan operasional** sebelum rekonsiliasi lulus.

## B. ERP — HPP rata-rata aktif, posting atomik, Nota Kredit

`docs/purchase-sales-costing-acceptance.md`: (1) rata-rata aktif memutar ulang penerimaan & pengeluaran kronologis termasuk pembalikan nilai asli (bukan rata-rata seumur hidup); (2) form Beli/Jual memakai **satu transaksi**
untuk dokumen, baris, saldo sumber, stok, jurnal, dan pelunasan kas/bank; (3) faktur AR langsung memposting stok/HPP, faktur berumber dokumen tidak menggandakan stok pengiriman; faktur AP langsung bertoko wajib gudang;
(4) pembatalan dokumen terposting menambah pembalikan stok/jurnal bernilai asli, diblokir bila ada dokumen turunan atau penerimaan sudah terpakai; (5) bacaan keuangan dipaginasi (tidak terpotong diam-diam).
Contoh angka akseptasi: terima 100@100, keluar AR 80@300(HPP 100), terima 100@200 → rata-rata 183,333333; batal AR → rata-rata 150.
- Migrasi: `0049` (fondasi stok atomik: `erp_average_cost`, `erp_validate_movement`, `erp_can_edit`, `erp_jline`, `erp_post_journal`), `0050` (`erp_save_document`, `erp_cancel_document`), `0051–0052` (perbaikan enum/variabel), `0053–0054` (`erp_pos_checkout` atomik, kunci struk unik).
- UI: `CancelDocumentDialog` (tanggal + alasan wajib), `SalesLotPicker` (pilih lot FEFO saat jual), perubahan `ProcurementTable`/`SalesTable`/`PosRegister`; menu **Nota Kredit Piutang** (`ar-credit-memo`) dan **Nota Kredit Hutang** (`ap-credit-memo`).
- **Nota Kredit** (`0056`): `acc_credit_memos` (sisi ar/ap, nomor unik per sisi, `posting_key` idempoten, total tak boleh melebihi sisa faktur, tanggal ≥ tanggal faktur, status posted/cancelled, jurnal + jurnal balik): AR → Dr 4100 + Dr 2100(PPN) / Cr 1200; AP → Dr 2000 / Cr 5200 + Cr 1400.
- Port ke Old: **audit dulu** logika posting Old (TS `journal.ts`, `movingAverageCosts`) terhadap daftar di atas; ubah menjadi transaksi tunggal bila belum; jangan menulis ulang jurnal historis pelanggan.

## C. Peran kustom workspace (Custom Roles)

`0055`: `workspace_custom_roles(workspace_id, name 2–60, base_role admin|staff|viewer, permissions jsonb)` + `workspace_members.custom_role_id`; anggota dengan peran kustom mewarisi `base_role` (owner tidak boleh), perubahan `base_role`
merambat ke anggota; `workspace_id` tidak bisa diubah. `app-context`: bila `custom_role_id` ada, izin tampilan/ubah per modul dibaca dari `permissions` (`{ modul: { view, edit } }`, `edit` hanya bila `view`).
UI: tab **Custom Roles** di Tim & Anggota (`CustomRolesPanel`) — buat/ubah/hapus peran, matriks izin, tetapkan ke anggota. Peran Qalling-only hanya melihat modul Qalling.
Port: tabel + kolom (migrasi), sinkronisasi `role` dalam transaksi (tanpa trigger), perluasan `canViewSubmodule`, panel UI, dan uji penegakan (menu & rute berubah, owner ditolak, hapus peran melepas anggota).

## D. Admin

- **Users per tenant** (`users.tsx`): tabel Tenant (jumlah workspace/user, **Detail** membuka user + workspace); pencarian "Cari tenant, email, workspace…". Menggantikan daftar per workspace Ronde 52.
- **Tenancy: Sumber daftar** (`0029`): `tenants.signup_source` (`qalling|xperd|admin`, NULL = tak diketahui), terisi saat daftar (Qalling/XPERD/Super Admin), backfill penanda Qalling historis; label "Web Qalling / Web XPERD / Super Admin / Belum diketahui" (`tenant-source.ts`).
- **Kebijakan media** (`0029`, `MediaUploadSettings`, `media-upload-policy.ts`, `crm-media-compression.ts`): `media_upload_settings` (singleton: foto 5 MB, video 20 MB, kualitas foto 92%, sisi terpanjang 2560 px, kompres foto/video, video 10 Mbps); ditegakkan di pengunggah bersama + MCP + pemeriksaan server; kompresi foto di browser (video fallback audio asli). Di Object Storage → "Unggahan & kualitas media".
- **Tebar**: satu halaman per permintaan (`tebar-account-page.ts`, kursor, 10/25/50/100); penetapan hanya dibaca untuk halaman aktif; pencarian khusus halaman aktif. (UI pager sudah di Old; **backend kursor belum**.)
- **Kontak situs** (`WebsiteContactsEditor`, `website-contacts.ts`): editor untuk kedua situs (`contact` untuk XPERD, `qalling.kontak` untuk Qalling); tautan `mailto:`/`tel:`/`wa.me`/`https`. Old memakai `xperd.kontak` (Ronde 54) → **selaraskan nama section** dan tambah editor Qalling.
- **Materi referral** (`ReferralPromotionEditor/Materials`, `referral-promotion.ts`): sudah dibuat di Ronde 54 dengan penyimpanan poster berbeda (`site_assets`); New 16 mengompres gambar di browser (≤1600 px WebP) dan menyimpannya di `site_content.image_url` sebagai data URL; tautan pribadi disisipkan saat bagikan (`personalizePromotion`).

## E. Qalling

- **URL bersih domain — SELESAI (Ronde 55)** (`qalling-urls.ts`, `router.tsx` rewrite, `start.ts` redirect 301, `QALLING-DOMAIN.md`): di `qalling.id`/`qalling.net` alamat publik tanpa prefiks `/qalling` (`/`, `/register`, `/login`, `/harga`, `/app/...`); rewrite simetris input/output router; `/qalling/*` lama dialihkan 301; URL eksternal (auth, pembayaran, referral) memakai pembantu yang sama; endpoint XPERD/MCP tidak berubah. **Terkait Google OAuth/DOKU/referral Old yang sudah memakai `requestOrigin`.**
- **Komentar pertama + cover video** (`0028`, `post-enhancements.ts`, `CrmSocial`, `meta-publish`/`tebar.server`): kolom `crm_scheduled_posts.first_comment` (≤ 8000) dan `cover_path` (JPG/PNG milik workspace); batas per platform (IG 2200 + ≤ 30 hashtag, FB 8000, TikTok 150); hanya akun Tebar; cover butuh satu video (IG/TikTok/YouTube); hasil komentar disinkronkan terpisah; opsi native tidak tersedia.
- **Extra akun** (`0057`): opsi katalog `qalling_extra_accounts_5` "Extra 5 akun media sosial" Rp50.000, maks 20 (live sudah menampilkannya).
- Lainnya: `ChatGptIcon` (sudah), `QallingShowcase` (sudah), halaman Testimoni (sudah), perubahan kecil `qalling-auth`/`signup`/`provisioning` (isi `signup_source`).

## Keputusan yang dibutuhkan sebelum port

1. **Production**: port penuh bertahap (A) atau hanya kerangka M1–M4 dulu? Modul ini menyentuh stok & jurnal dan belum diterima penuh di sumbernya.
2. **Regulatori/[VERIFIKASI]**: toleransi komposisi bahan aktif, aturan B3/GHS — siapa penanggung jawabnya? Nilai bawaan New 16 dipakai apa adanya?
3. **E-sign persetujuan** memakai email (gateway HTTP): Old sudah punya mailer; apakah persetujuan dua akun lewat email diaktifkan?
4. **HPP/posting atomik (B)**: boleh mengubah logika posting Beli/Jual Old yang sudah berjalan (risiko regresi), dengan audit dulu?
5. **Domain Qalling bersih (E)**: kapan rollout `qalling.id` tanpa `/qalling` (perlu penyesuaian proxy)?

## Urutan port yang disarankan

1. **D + E ringan** (Kebijakan media, Sumber daftar, kursor Tebar, editor Kontak/referral selaras, komentar pertama/cover, opsi Extra akun).
2. **C** Custom Roles.
3. **B** audit & penguatan posting + Nota Kredit + dialog batal + pemilih lot.
4. **A** Production M1 → M12 bertahap, tiap tahap dengan uji e2e dan akseptasi sebelum lanjut.
5. **E besar** URL bersih domain.

## Daftar UI/berkas yang perlu diubah per kelompok (untuk port)

| Kelompok | UI (halaman/komponen) | Server/DB |
|---|---|---|
| A Production | `routes/production.$workspaceId.$section.tsx`, `ProductionView/Dashboard/BomView/LotsView/QualityView/OrdersView/AccountingView/TraceView/ComplianceView/PagedTable/SignDialog/CodeInit`, entri `modules.ts` (15 submodul + ikon), gate `entitlements.ts`/`app-context.tsx` | tabel `mfg_*`, `production*.functions.ts` (BOM, kepatuhan, dashboard, dokumen, e-sign, lot, order, mutu, trace), `production*.ts` (aturan murni), PDF/CSV laporan |
| B ERP | `CancelDocumentDialog`, `SalesLotPicker`, `CreditMemoView` (+2 submenu), `ProcurementTable`, `SalesTable`, `PosRegister`, `AccountingViews`, `ReportingViews`, `ui-states` | `erp-documents.functions.ts`, `inventory-costing.ts`, `inventory.ts`/`accounting.ts`/`subledger.ts`, tabel `acc_credit_memos` |
| C Custom Roles | `TeamPage` (tab Custom Roles), `CustomRolesPanel`, `app-context.tsx` | tabel `workspace_custom_roles`, kolom `workspace_members.custom_role_id` |
| D Admin | `app-admin/users.tsx` (tabel Tenant + Detail), `tenancy.tsx` (Sumber daftar), `storage.tsx` + `MediaUploadSettings`, `tebar.tsx`, `content.tsx` + `WebsiteContactsEditor`, `referral.tsx` + `ReferralPromotionEditor`, `qalling.app.referral.tsx` + `ReferralPromotionMaterials` | `media_upload_settings`, `tenants.signup_source`, `tebar-account-page.ts` (kursor), `crm-media-compression.ts`, `media-upload-policy.ts` |
| E Qalling | `CrmSocial` (komentar pertama + cover), `CrmMedia` (kebijakan unggah), `qalling.app.tsx`, `AddonTierCatalog` | kolom `first_comment`/`cover_path`, `post-enhancements.ts`, `meta-publish.server.ts`, `tebar.server.ts`, opsi `qalling_extra_accounts_5` |

## Hasil port Ronde 56 (bagian yang sudah dikerjakan)

Migrasi baru: **037** (sumber daftar tenant, `media_upload_settings`, `crm_scheduled_posts.first_comment/cover_path`, opsi `qalling_extra_accounts_5`, section kontak XPERD → `contact`),
**038** (`workspace_custom_roles` + `workspace_members.custom_role_id`), **039** (`acc_credit_memos`). Dependensi baru: `mediabunny` (kompresi video di browser).

| Butir | Hasil |
|---|---|
| D · Sumber daftar | **Selesai.** `tenants.signup_source` (`qalling`/`xperd`/`admin`; NULL = tak diketahui) diisi di pendaftaran Qalling (OTP & Google), pendaftaran XPERD, setup awal, dan tenant buatan Super Admin (server menimpa nilai dari form); kolom "Sumber daftar" di Tenancy; backfill penanda Qalling historis |
| D · Kebijakan media | **Selesai.** `media_upload_settings` (default foto 5 MB, video 20 MB, kualitas 92, sisi 2560, Mbps 10); form di Object Storage; pengunggah Media memvalidasi + mengompres foto/video **setelah** unggah dikirim dan tidak pernah memakai hasil yang lebih besar; server menegakkan batas foto/video pada setiap baris `crm_media` (kebijakan berlaku untuk semua paket) dan MCP `create_idea` mengikutinya |
| D · Tebar kursor | **Selesai.** Satu halaman upstream per permintaan (`listTebarAccountPage`), tumpukan kursor di UI (prev/next, 10/25/50/100), penetapan hanya dibaca untuk halaman aktif, pencarian khusus halaman aktif, tabel Akun/Platform/Workspace |
| D · Kontak situs | **Selesai.** Editor untuk **kedua** situs (XPERD `contact`, Qalling `qalling.kontak`: email, telepon, WhatsApp, alamat, jam, website); footer/Kontak Qalling menampilkan telepon/alamat/jam/website bila diisi |
| D · Referral/poster | Tetap versi Ronde 54 (poster di `site_assets`, ≤ 5 MB, magic byte); New 16 mengompres ke WebP ≤ 1600 px di browser dan menyimpan data-URL di `site_content` — **sengaja berbeda** |
| E · Komentar pertama + cover | **Selesai.** Kolom `first_comment`/`cover_path`; validasi server (≤ 8000 karakter, cover = gambar JPG/PNG milik workspace; pengganti trigger); `post-enhancements.ts` (batas per platform, ≤ 30 hashtag IG, cover butuh satu video); opsi target Tebar (`first_comment`, `cover_media_id`), hasil komentar dibaca dari respons dan ditampilkan di composer; `MediaPickerDialog` mode gambar-saja/1 pilihan; kartu sambung Tebar dengan petunjuk platform + YouTube; tautan sambung headless (Agency) dengan fallback |
| E · Extra akun | **Selesai** (opsi katalog `qalling_extra_accounts_5`, Rp50.000, maks 20) |
| E · URL bersih domain | **Selesai** (Ronde 55) |
| C · Custom Roles | **Selesai.** CRUD oleh owner/admin (`custom-roles.functions.ts`), izin View/Edit per modul/submodul (edit hanya bila view, menu tak dicentang ditolak eksplisit), anggota mewarisi level dasar (disinkronkan di transaksi), perubahan level dasar merambat, hapus peran melepas anggota, owner tidak bisa memakai peran kustom, `getWorkspaceAccess` memakai izin peran kustom; tab "Custom Roles" + pilihan peran di tabel Users |
| B · Nota Kredit | **Selesai.** `credit-memo.functions.ts` (transaksi tunggal, idempoten `posting_key`, sisa faktur, tanggal ≥ faktur, periode terkunci, nomor unik, jurnal AR: Dr 4100 + Dr 2100 / Cr 1200, AP: Dr 2000 / Cr 5200 + Cr 1400, batal = jurnal pembalik); menu **Nota Kredit Piutang/Hutang** di Akuntansi |
| B · HPP aktif, posting atomik, batal, lot jual, POS | **Selesai (Ronde 57).** Migrasi **047**; `erp-posting.server.ts` (+ `erp-document.functions.ts`): (1) HPP rata-rata **aktif** = replay kronologis (tanggal, dibuat, id), pembalikan bernilai asli, `fetchMovingAverageCosts` ikut; (2) Beli/Jual disimpan lewat **satu transaksi** (dokumen, baris, saldo sumber, stok, jurnal, kas/bank, uang muka otomatis) dengan kunci posting idempoten (`posting_key`) dan kunci baris workspace `FOR UPDATE`; gagal di mana pun = tidak ada sisa; (3) Faktur AR langsung memposting stok + HPP, faktur bersumber DO tidak menggandakan stok, faktur AP langsung berbarang wajib gudang (+ stok masuk); backdate stok diblokir demi HPP yang sudah diposting; (4) POS atomik: faktur AR langsung + penerimaan, kunci penerimaan diturunkan berbeda, pilihan "Pilih kas / bank"; (5) `CancelDocumentDialog` (alasan + tanggal; pembalik stok bernilai asli, jurnal pembalik `reverses_journal_id`, mutasi kas pembalik, pemulihan sumber, uang muka otomatis ikut dibatalkan, turunan aktif memblokir) dan `SalesLotPicker` (hanya workspace berentitlement `manufacturing`); (6) `assertLotSellable` + tiket FEFO dipasang pada pengeluaran lot di penjualan, item berprofil produksi wajib lot, GRN item berprofil → lot karantina dalam transaksi yang sama. Spec: `erp-atomic` |

**Beda sadar dari Old lama / New 16 (Ronde 57):** biaya penerimaan = nilai bersih baris (setelah diskon) × kurs / qty (dulu harga satuan tanpa diskon/kurs); retur pembelian keluar dengan HPP rata-rata dan selisih ke 5200; retur penjualan memakai HPP pengeluaran asal; nomor dokumen penjualan kini unik per jenis (tabel penjualan tak punya kunci unik di DB); POS menghasilkan 2 dokumen (faktur AR + penerimaan), bukan 3 (DO + faktur + penerimaan) seperti Old lama dan sama seperti New 16; faktur AR/AP kini punya kolom Gudang di formulir; penerimaan/pembayaran wajib rekening kas/bank berpemetaan GL (POS boleh kosong → akun 1010 tanpa mutasi kas). Klien tidak lagi menjurnal sendiri (fungsi `post*Journal` di `journal.ts`/`inventory.ts` tidak dipakai UI lagi).
| A · Production (M1–M12) | **Belum** (butuh keputusan regulatori/e-sign; belum diterima penuh di sumbernya) |

Spec: `new16-light` (sumber daftar, kebijakan media, komentar pertama + cover, pager Tebar kursor dengan Tebar tiruan), `custom-roles`, `credit-memo`; `landing-referral-promo` diperluas (kontak Qalling).

## Hasil Ronde 57 (Production)

Modul **Production** (add-on `manufacturing`) diporting bertahap ke modul `manufacturing` Old (15 submenu, bukan rute terpisah; tautan lama `/production/…` diarahkan). Migrasi `040`–`046`; ringkasan modul, akses, tabel, dan butir [VERIFIKASI] ada di `docs/PRODUCTION.md`.

| Tahap | Cakupan | Migrasi |
|---|---|---|
| M1 | Fondasi: pengaturan + penomoran, peran produksi, kode formulasi (20 bawaan), pusat kerja, audit tak-terhapus, gerbang entitlement | 040 |
| M2–M3 | Kepatuhan (profil item, registrasi, dokumen) dan BOM berversi | 041–042 |
| M4–M5 | Lot & stok FEFO, mutu (QC, deviasi, e-sign) | 043–044 |
| M6–M10 | Perintah produksi, eksekusi, biaya, jurnal | 045 |
| M11–M12 | Traceability maju/mundur + simulasi recall, laporan produksi (CSV/PDF/Excel), log limbah B3, dasbor, editor fitur tier `mfg_*` | 046 |

Deviasi M11–M12 dari New 16: gerbang pakai seksi menu sendiri (`traceability`, `reports`, `waste`, `dashboard`) alih-alih `lots`/`orders`/`settings`; Traceability & Recall wajib fitur `mfg_trace`; log limbah mengunci tanggal/kode/jumlah/satuan setelah dicatat (New 16 membolehkan ubah semua kolom lewat audit); PDF memakai kop `workspaces.name/legal_name/address` (kolom telepon/email tidak ada di Old).

## Ronde 58 — MCP BS New 17 (15 → 17 tool)

Diff New 17 vs New 16 pada `src/lib/mcp`: `qalling_create_post_draft` diganti **`qalling_create_post`** (draft / carousel hingga 10 lampiran / terjadwal),
tool baru **`qalling_list_media`** dan **`qalling_publish_post_now`** (pratinjau → konfirmasi → antre), `qalling_list_posts` (status `publishing`, `media_count`),
instruksi server baru. Port ke Old (MySQL, tanpa Lovable/Supabase): `mcp/qalling-rules.ts` (skema input, waktu jadwal, target akun, CDN media yang diizinkan, izin per bagian),
`mcp/qalling-media.ts` (media_ids pustaka + impor media_urls dengan kebijakan unggah/kuota, `redirect: error`, tanpa host sembarang), `assertQallingSection` di `mcp/db.ts`
(anggota + fitur `mcp_api` **dan** `publishing` + Role Access/peran kustom `crm`, `crm/ai`, `crm/<bagian>` + hak tulis), tiga tool, `index.ts` (versi 1.1.1).
Aturan: Meta native 1 gambar, carousel/video untuk akun Tebar, carousel hanya gambar, akun harus terhubung, Instagram/TikTok/YouTube/Pinterest butuh media saat dikirim.
`publish_post_now` mengubah post menjadi `scheduled` pada waktu sekarang dengan compare-and-set; pengiriman dilakukan **cron social-publish** (wajib berjalan, lihat OPERATIONS.md).
Tidak dibawa: `requireOAuthClientClaim` (khusus penerbit OAuth Supabase; server OAuth Old sendiri menerbitkan token), tes `qalling-rules.test.ts` (Old tanpa Vitest — dicakup `e2e/mcp-posts.spec.ts`).
Belum teruji: impor sukses `media_urls` dari CDN nyata (host dibatasi ke CDN publik; penolakan host lain/http/port diuji).

## Ronde 59 — MCP BS New 18 (v1.2.0)

New 18 vs New 17 hanya berbeda di MCP: tool ke-18 `qalling_upload_media` (url CDN yang diizinkan **atau** `file_base64` + `mime_type`, nama opsional, satu berkas per panggilan, hasil `media_id` untuk `qalling_create_post`). Instruksi server diperbarui dan versi menjadi 1.2.0.
Old: `src/lib/mcp/tools/qalling-upload-media.ts` + helper bersama `storeMedia` di `qalling-media.ts` (kuota tier, kebijakan unggah Super Admin, penyimpanan file lokal, baris `crm_media`; pembersihan bila insert gagal). Dilindungi seperti tool Qalling lain (`mcp_api` + izin bagian `media` tulis). Uji: `e2e/mcp-posts.spec.ts`, `e2e/mcp.spec.ts` (18 nama).

## Ronde 60 — Production BS New 19

Migrasi `048_production_new19.sql`. Disamakan dari New 19:
- Sidebar Production bernomor (1. Setup · Profil Item … 6. Laporan Produksi); panduan 4 langkah di halaman Quality.
- Biaya konversi per unit hasil di Profil Item (`conv_labor_per_unit`, `conv_other_per_unit`): masuk ke biaya order (`other_cost`), standar, dan jurnal baru J4 (`other_applied`); J5C memuat biaya lain.
- Lot & Stok: kolom Qty on hand, panel Rekonsiliasi stok vs lot, tombol Inisiasi lot dari stok eksisting. Item bahan BOM juga terkendali lot.
- Stok keluar manual selalu memakai HPP rata-rata (kolom biaya dikunci). GRN/retur beli memakai akun persediaan hasil pemetaan per item (selisih ke 1300).
- Mode uji `MFG_ESIGN_DEMO=1`: kode tanda tangan/persetujuan BOM tampil di layar (JANGAN diaktifkan di produksi).
