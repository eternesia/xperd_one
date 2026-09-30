# Perbedaan: Xperd One Business Suite New 3 vs Xperd One Old Production

> Tanggal audit: **2026-09-30** · Target: **Xperd One Old Production** (MySQL, TanStack Start, server functions)
> Sumber: **`Xperd One Business Suite New 3`** (ekspor Lovable terbaru, Supabase)
> Status: **belum ada yang di-port** — dokumen ini murni daftar beda + rencana.
> Lanjutan dari: `PARITY-BS-NEW-VS-OLD.md` (Batch 1, item #1–27) dan `SLIPP-HR-PORTING.md` (Batch 2, item #28–35).

## Peran folder di workspace

| Folder | Peran |
|---|---|
| `Xperd One Old Production ` | **Old**: yang jalan di production (MySQL, server fn). Parity terakhir = **New 2** (migration berhenti di `009_hr_addon.sql`) |
| `Xperd One Business Suite` | Snapshot Lovable 24 Agu — dasar Batch 1 (`FEATURE-PORT-MATRIX.md`) |
| `Xperd One Business Suite New` | Batch 1 (sudah diporting penuh) |
| `Xperd One Business Suite New 2` | **Batch 2** — Slipp HR (sudah diporting, lihat `SLIPP-HR-PORTING.md`) |
| `Xperd One Business Suite New 3` | **Batch 3** — dokumen ini. Ekspor terbaru (roadmap terakhir 2026-09-30) |

## Metode

1. `diff -rq` + diff per file antara `New 2/src` dan `New 3/src` (angka di dokumen ini = jumlah baris diff `<` + `>`).
2. Isi `New 3/drizzle/migrations/0004`–`0015` dibaca untuk daftar tabel/kolom baru.
3. Setiap fitur dicek keberadaannya di Old dengan grep (`src/`, `db/`, `e2e/`) — lihat kolom **Old**.
4. Mengikuti aturan porting yang sudah dipakai Batch 1–2: **jangan salin file New mentah** (msh Supabase), port per hunk, data layer → server fn MySQL, jangan tambah trigger DB (keputusan #11).

## Ringkasan 5 menit

| Aspek | Angka |
|---|---|
| Skala diff | **±8.700 baris** (≈4.900 baris file baru + ≈3.800 baris perubahan pada file lama), di luar file generated (`supabase/types.ts` 987 baris, `routeTree.gen.ts` 156 baris) |
| Migration baru | **12** (`0004`–`0015`); New 2 hanya punya `0000`–`0003` |
| Tabel baru | **17** |
| Kolom baru | **±24** di 9 tabel yang sudah ada |
| Dependensi baru | `jszip@^3.10.2` (satu-satunya; dipakai generate DOCX di browser) |
| Item port | **#36–65** (30 item), dibagi 4 grup (A–D) |
| Bisa port tanpa keputusan bisnis | Grup **A** (akuntansi, ±3.900 baris) & **C** (akses/UI, ±900 baris) |
| Butuh keputusan dulu | Grup **B** (storage file + kredensial Meta) & **D** (Omnix, Qalling) |

**Sifat Batch 3:** bukan parity kecil. Ada **1 modul baru (Omnix)**, **5 submodul CRM baru**, **5 submodul akuntansi/kas baru**, plus 2 perbaikan yang menyentuh **kebenaran angka** di dokumen (pajak per baris & nilai persediaan) — dua item itu sebaiknya didahulukan.

---

## A. Akuntansi, dokumen & kas/bank (±3.900 baris) — **prioritas tertinggi**

| # | Perubahan di New 3 | File New (bukti) | Old | Catatan port |
|---|---|---|---|---|
| 36 | **Pajak per baris + withholding (PPh)**. Sebelumnya `tax_amount` mencampur PPN & PPh sehingga total AR/AP salah saat ada potongan PPh. Sekarang tiap baris punya `tax_code` (jenis pajak dari master `md_taxes.tax_type`), header menyimpan `withholding_amount`, dan total = subtotal − diskon + PPN − PPh | `lib/tax.ts` (`LineTaxOption`, `NO_TAX_OPTION`, `isWithholdingTax`, `useLineTaxOptions`); `SalesTable.tsx`; `ProcurementTable.tsx`; migration `0014` | 🔵 **dikerjakan** | Kebutuhan DB: `sls_document_lines.tax_code`, `prc_document_lines.tax_code`, `sls_documents.withholding_amount`, `prc_documents.withholding_amount` — sudah masuk migration `010`. `md_taxes.tax_type` **sudah ada** di Old (`001_schema.sql`). Catatan: label total berubah dari “Pajak” menjadi “PPN” + baris “Potongan PPh” |
| 37 | **Uang muka (advance)** customer & supplier + aplikasi ke invoice berikutnya (`advance = down payment`, `application = pemakaian`), dengan pemisahan akun kontrol 2400 / 1500 | `SalesTable.tsx` (`applyAdvanceToInvoice`, kontrol `2400`), `ProcurementTable.tsx` (kontrol `1500`), migration `0015` | ❌ | Kebutuhan DB: `advance_kind` di `sls_documents` & `prc_documents` |
| 38 | **Auto-jurnal AP Invoice diaktifkan** (baris jasa/non-persediaan; barang yang sudah dikapitalisasi saat GR dilewati) + jurnal GR/IR `2050`, beban jasa `5200`, PPh dibayar dimuka `1450`, hutang PPh `2200`, uang muka, PPN | `lib/procurement.ts` (`autoJournal: false → true`), `lib/journal.ts` (+454 baris, termasuk `ensureAccounts()`) | ❌ | Pola Old sudah punya `postJournalEntry` di `lib/ledger.functions.ts` — pakai itu, jangan pindahkan kode Supabase |
| 39 | **COA provisioning tambahan**: 1410 PPN Lebih Bayar, 1450 PPh Dibayar Dimuka, 2050 Hutang Belum Ditagih (GR/IR), 2110 Hutang PPN, 2400 Uang Muka Penjualan, 5200 Beban Jasa & Profesional | `lib/provisioning.server.ts` | ⚠️ **sebagian** | Hanya **1450** yang sudah diporting (dibutuhkan #36): ditambah ke `DEFAULT_COA` + backfill untuk workspace lama di migration `010` (idempotent, terbukti tidak menduplikasi). Sisa akun mengikuti item #37/#38 |
| 40 | **Nilai persediaan pakai moving average nyata** untuk pengeluaran stok. Sebelumnya `unit_cost` diisi `unit_price` baris dokumen (**harga jual**) → HPP & nilai stok salah | `lib/inventory.ts` (`movingAverageCosts()`), `issueStockForDocument()` | 🔵 **dikerjakan** | **Bug costing**; di Old dipakai server fn agregat `fetchMovingAverageCosts` (SUM(value)/SUM(qty) di SQL, `qty > 0`, sampai tanggal dokumen) + fallback `md_items.cost_price`. Dipakai `postSalesMovements` (DO & retur) **dan** `costOfLines` (HPP jurnal DO/retur) |
| 41 | **Item non-persediaan**: tipe item baru `software_license` & `subscription`, kolom `is_stocked` (jasa/lisensi/langganan tidak bikin pergerakan stok), `billing_cycle`, akun beban `expense_account_code` | `lib/master-data.ts` (`NON_STOCK_ITEM_TYPES`), `lib/inventory.ts` (`nonStockedCodes()`), migrations `0013`, `0014` | ❌ | Kebutuhan DB: `md_items.is_stocked`, `billing_cycle`, `expense_account_code`. Enum Postgres → di MySQL cukup `VARCHAR(20)` |
| 42 | **Kas & Bank: auto-jurnal + storno**. Transaksi kas/bank kini otomatis posting jurnal; "batal" tidak menghapus entri tetapi **memposting jurnal kebalikan** (`JV/REV/...`, audit trail utuh). Ada dialog detail + edit + batal, dan panel jurnal di drawer | `lib/cashbank.ts` (`insertJournal`, `postCbJournal`, `postReversal`, `fetchJournalLines`), `CashBankViews.tsx` (+650) | ❌ | Cek: apakah Old masih `DELETE` entri kas/bank? Kalau ya, ini juga perbaikan audit trail |
| 43 | **Submodul baru "Laporan Kas & Bank"** (mutasi & saldo per akun, ekspor) | `lib/cashbank.ts` (`kind: "reports"`), `CashBankViews.tsx` (`CashBankReportView`), `lib/modules.ts` | ❌ | 1 submodul baru di `cash-bank` |
| 44 | **Impor rekening koran (Excel/CSV)** → auto-match baris ke transaksi tercatat (arah sama, nominal sama, tanggal ±3 hari) lalu menandai buku sudah reconciled | `components/app/CbStatementImport.tsx` (324 baris) | ❌ | Bergantung `xlsx` (sudah ada di Old) |
| 45 | **Subledger AR/AP**: 4 submodul baru — **AR Card, AP Card, AR Aging, AP Aging** (aging alokasi FIFO: pelunasan dialokasikan ke invoice tertua) | `lib/subledger.ts` (`buildCard`, `buildAging`, `partnersOf`), `components/app/SubledgerViews.tsx` (365), `lib/accounting.ts`, `lib/modules.ts` | ❌ | Murni TypeScript + baca `sls_documents`/`prc_documents` → gampang diporting |
| 46 | **Kunci periode akuntansi** (`soft`/`hard`) + helper periode | `lib/journal.ts` (`periodOfDate`, `PeriodLockType`), migration `0014` (`acc_period_locks`) | ❌ | Kebutuhan DB: tabel `acc_period_locks`; validasi kunci dipanggil saat posting |
| 47 | **Ekspor tabel Excel/PDF** yang dipakai ulang semua layar laporan + komponen UI bersama (skeleton, pagination, search) | `lib/report-export.ts` (`exportTableXlsx`, `exportTablePdf`), `components/app/ui-states.tsx` (240: `PaginationBar`, `TableSkeletonRows`, `PageSkeleton`, `usePagination`, `useSearchFilter`, `SearchInput`, `ReportExportButtons`) | ❌ | `xlsx` + `jspdf`/`jspdf-autotable` sudah ada di Old |
| 48 | **Laporan keuangan formal** siap cetak/PDF/Excel: kop entitas, judul formal, kata periode, catatan mata uang, angka rata kanan, total garis ganda, blok tanda tangan; Neraca disajikan **skontro** (aset kiri, kewajiban+ekuitas kanan) | `lib/financial-statement.ts` (365: `buildStatementHtml`, `printStatement`, `downloadStatementPdf`, `exportStatementXlsx`), `AccountingViews.tsx` (+593) | ❌ | Dipakai GL, Trial Balance, Neraca, L/R, Arus Kas, Perubahan Ekuitas |
| 49 | **Dashboard modul** untuk Master Data, Fixed Asset & Tax (ringkasan, grafik, komposisi, top beban) + tombol submodul dihapus dari dashboard | `components/app/ModuleDashboard.tsx` (+376) | ⚠️ | Old punya`ModuleDashboard` versi lama; port bagian ringkasan/grafik saja |

## B. CRM & Tender (±2.500 baris) — **butuh keputusan storage & Meta**

| # | Perubahan di New 3 | File New (bukti) | Old | Catatan port |
|---|---|---|---|---|
| 50 | **Tender Checklist**: daftar dokumen wajib (administratif/teknis/komersial), HPS, deadline, PIC, status, sort order, progress | `components/app/CrmTender.tsx` (482), migrations `0004` (`crm_tenders`, `crm_tender_docs`), `0006` | ❌ | 2 tabel baru; submodul CRM `tenders` |
| 51 | **Pustaka Dokumen** (legal/kualifikasi): unggah sekali, versi, masa berlaku, badge kedaluwarsa, dipakai untuk autofill checklist + ZIP per kategori | `components/app/CrmDocLibrary.tsx` (280), migration `0005` (`crm_doc_library`, `crm_doc_library_versions`) | ❌ | 2 tabel baru; **butuh file storage** (lihat §Infra) |
| 52 | **Template Isian Panitia (DOCX)**: simpan PDF KAK/RKS sumber + formulir DOCX editable; saat diunduh, sistem menempel kop workspace dan mengganti placeholder profil perusahaan **tanpa mengubah file sumber** (JSZip, murni di browser) | `lib/tender-docx.ts` (189, `buildLetterheadedDocx`), `components/app/CrmTenderTemplates.tsx` (238), migration `0006` (`crm_tender_templates`, `crm_tender_template_versions`) | ❌ | `jszip` perlu ditambah ke `package.json` Old; logika DOCX client-side → portable apa adanya |
| 53 | **Kop surat tender** di Settings: unggah gambar A4, toggle alamat/NPWP/telepon/email/garis, preview live | `workspaces.letterhead_config` (migration `0006`), `routes/app/w.$workspaceId.settings.tsx` (+187) | ❌ | Kebutuhan DB: `workspaces.letterhead_config` + whitelist `PCOLS.workspaces` |
| 54 | **Social Accounts multi-akun + Post Scheduler**: banyak akun per platform, jadwal mingguan/bulanan, "Post now", auto-publish | `components/app/CrmSocial.tsx` (682), migrations `0007` (`crm_social_accounts`, `crm_scheduled_posts`), `0008` | ❌ | 2 tabel baru; penjadwalan butuh cron (pola `INTEROP-BOILERPLATE.md`) |
| 55 | **Integrasi Meta App**: App ID/Secret (kolom disembunyikan dari browser), Facebook Login → Pages + Instagram, OAuth `state` nonce, `publishing` claim supaya tidak dobel-publish | `lib/meta-social.functions.ts` (`saveMetaApp`, `startMetaConnect`, `disconnectMeta`, `publishPostNow`), `lib/meta-publish.server.ts`, `routes/api/public/meta/callback.ts`, `routes/api/public/hooks/social-publish.ts`, migration `0008` (`crm_meta_settings`, `crm_social_tokens`) | ❌ | **Keputusan**: butuh Meta App milik user + app di-publish; token hanya boleh dibaca server fn (padanan `service_role`) |
| 56 | **Social Dashboard**: jumlah akun/post, grafik mingguan, per akun, akan publish, kegagalan terakhir | `CrmSocial.tsx` (`SocialDashboardView`) | ❌ | — |
| 57 | **Submodul CRM baru & penataan ulang**: `social-dashboard`, `social-accounts`, `post-scheduler`, `tenders`, `doc-library`; submodul "CRM Dashboard" dihapus (digabung ke dashboard modul); alert dokumen kedaluwarsa ≤30 hari di dashboard; tabel CRM (kontak, broadcast, campaigns, targets, templates) dapat search + pagination | `lib/modules.ts`, `components/app/CrmViews.tsx`, `CrmOutreach.tsx`, `CrmInsights.tsx` | ⚠️ | Old punya 10 submodul CRM (Batch 1); ini mengubah daftarnya → sesuaikan, jangan timpa `modules.ts` mentah |
| 62 | **Panduan pengguna**: 3 entri baru (Tender Checklist, Pustaka Dokumen, Template Isian Panitia) | `lib/guide.ts` | ❌ | 3 baris konten, mudah |

## C. Akses & UI (±900 baris)

| # | Perubahan di New 3 | File New (bukti) | Old | Catatan port |
|---|---|---|---|---|
| 58 | **Izin per submodul**: `workspace_role_access.module_id` kini bisa berupa `module/submodule`; kontrak baru di app context (`workspaceRole`, `canViewModule`, `canViewSubmodule`, `canEditSubmodule`); matriks View/Edit untuk **setiap** dashboard & submodul di Team & Access | `lib/app-context.tsx`, `routes/app/w.$workspaceId.team.tsx` (+503) | ⚠️ | Tabel `workspace_role_access` **sudah ada** di Old + dipakai team.tsx; yang belum = kunci `module/submodule` + UI matriks + penegakan. Perlu memastikan kunci lama tetap kompatibel |
| 59 | **Penegakan izin di route**: modul & submodul menyaring menu sesuai izin, layar "akses dibatasi", mode **view-only** (`fieldset disabled`) saat hanya punya View, cek di halaman dokumen | `routes/app/w.$workspaceId.$moduleId.tsx` (+114), `...$moduleId.index.tsx`, `...$moduleId.$submoduleId.index.tsx` (+43), `...$docId.tsx` | ❌ | Sentuh hampir semua route → kerjakan **setelah** submodul baru selesai |
| 60 | **Master Data lebih pintar**: jenis field `reference` (dropdown dari master terkait), **kode otomatis** berurutan (ITM/SRV/SFT/SUB/CAT), `showWhen` (field muncul tergantung tipe), `readOnly`, teks bantuan | `lib/master-data.ts`, `components/app/MasterDataTable.tsx` (+137) | ❌ | Kode otomatis = perilaku berubah (kode tidak lagi diketik manual) |
| 61 | **Menu modul mobile** jadi hamburger (Sheet) menggantikan baris pill horizontal | `routes/app/w.$workspaceId.$moduleId.tsx` | ❌ | Butuh komponen `sheet` shadcn — cek sudah ada di Old |

## D. Modul/produk baru — **butuh keputusan bisnis**

| # | Perubahan di New 3 | File New (bukti) | Old | Catatan port |
|---|---|---|---|---|
| 63 | **Modul baru Omnix** (add-on): 6 submodul — Koneksi Toko, Transaksi, Pengiriman & Pickup, Laporan, Saldo & Tagihan (Rp25/trx atau paket Rp350rb/20.000 trx), Pengaturan API; top-up dikonfirmasi Super Admin | `components/app/OmnixViews.tsx` (509), `OmnixOps.tsx` (316), `lib/modules.ts`, `routes/app-admin/addons.tsx`, migrations `0010`–`0012` (`omnix_stores`, `omnix_orders`, `omnix_wallets`, `omnix_wallet_ledger`, `omnix_channel_settings`, `omnix_channel_secrets`) | ❌ | **7 tabel**. Logika wallet/charge di New = **trigger + 3 fungsi plpgsql** (`omnix_charge_completed_order`, `omnix_request_topup`, `omnix_review_topup`, `omnix_buy_bundle`) → wajib ditulis ulang jadi server fn MySQL transaksional (pola `adminResetTenantTransactions`) |
| 64 | **Permukaan Qalling standalone**: landing `/qalling`, `/qalling/login`, shell `/qalling/app` (memakai ulang view CRM), workspace aktif pertama; host `qalling.id`/`qalling.net` di-redirect ke `/qalling` | `routes/qalling.index.tsx`, `qalling.login.tsx`, `qalling.app.tsx`, `qalling.app.index.tsx`, `qalling.app.$submoduleId.tsx`, `routes/_site.tsx` | ❌ | Butuh domain khusus + keputusan produk; ±470 baris |
| 65 | **Tag produk tenant/invoice** (`xperd` \| `qalling`): filter produk di Tenancy & Invoices, badge, tombol ganti produk | migration `0009` (`tenants.product`, `invoices.product`), `routes/app-admin/tenancy.tsx`, `routes/app-admin/invoices.tsx` | ❌ | Kebutuhan DB: kolom `product` di `tenants` & `invoices` + `PCOLS` |

---

## Infra khusus New 3 yang **tidak bisa dibawa apa adanya**

1. **Supabase Storage bucket `workspace-files`** — dipakai item #50–52 dan juga lampiran kas/bank di New 3 (`upload`, `download`, `createSignedUrl(300)`). Old **tidak punya object storage**; Batch 1 memakai data URL (`MEDIUMTEXT`) untuk logo & bukti kas keluar. Untuk dokumen tender (batas 20 MB) data URL **tidak realistis** → perlu keputusan: (a) volume/disk + route unduh ber-auth, (b) tabel `files` + simpan di disk dengan guard `isWorkspaceMember`, atau (c) tetap data URL dengan batas ukuran kecil.
2. **Trigger & RPC plpgsql** (Omnix wallet/charge, `updated_at`) → pindah ke server fn transaksional sesuai keputusan #11 (tanpa trigger DB). `updated_at` di MySQL sudah otomatis.
3. **`supabaseAdmin` / `service_role`** (kredensial Meta, publish terjadwal) → di Old jadi kolom terpisah yang hanya dibaca server fn ber-guard, plus cron dengan secret (`CRON_API_SECRET` pola interop).
4. **RLS policy** (`is_workspace_member`, `can_write_workspace`) → padanannya `isWorkspaceMember`/`canWriteWorkspace`/`withWriter` yang sudah ada di server fn Old.
5. **`drizzle/`** → terjemahkan manual ke `db/migrations/010_...sql` (idempotent), lalu `npm run migrate`.

## Kebutuhan DB di Old (MySQL)

**17 tabel baru**

| Grup | Tabel |
|---|---|
| CRM Tender | `crm_tenders`, `crm_tender_docs`, `crm_tender_templates`, `crm_tender_template_versions` |
| CRM Dokumen | `crm_doc_library`, `crm_doc_library_versions` |
| CRM Sosial | `crm_social_accounts`, `crm_scheduled_posts`, `crm_meta_settings`, `crm_social_tokens` |
| Akuntansi | `acc_period_locks` |
| Omnix | `omnix_stores`, `omnix_orders`, `omnix_wallets`, `omnix_wallet_ledger`, `omnix_channel_settings`, `omnix_channel_secrets` |

**Kolom baru pada tabel yang sudah ada**

| Tabel | Kolom |
|---|---|
| `workspaces` | `letterhead_config` |
| `tenants`, `invoices` | `product` (default `xperd`) |
| `md_items` | `is_stocked`, `billing_cycle`, `expense_account_code` |
| `sls_documents`, `prc_documents` | `withholding_amount`, `advance_kind` |
| `sls_document_lines`, `prc_document_lines` | `tax_code` |
| `crm_social_accounts` | `external_id`, `source` |
| `crm_scheduled_posts` | `last_error`, `published_at`, `results` |
| `crm_tender_docs` | `library_doc_id`, `file_path`, `file_name` |
| `omnix_orders` | `courier`, `tracking_no`, `packing_status`, `packed_at`, `picked_up_at` |

**Wajib didaftarkan juga di kode** (kalau tidak, nilai dibuang/query gagal tanpa error yang jelas):
`WORKSPACE_TABLES` **dan** `COLS` di `src/lib/data.functions.ts`; `PCOLS` di `src/lib/platform.functions.ts` untuk `tenants`/`invoices`/`addons`/`workspaces`; SELECT di `src/lib/app-shell.functions.ts` untuk kolom baru `workspaces`.

## Tidak perlu di-port (infra Lovable/Supabase)

- `integrations/supabase/*` (client, `client.server`, `types.ts`), semua RLS policy & helper `is_workspace_member`/`can_write_workspace`.
- `drizzle.config.ts`, `drizzle/`, `drizzle-kit`, `drizzle-orm`, `postgres`.
- `integrations/supabase/previewAuthStorage.ts`, `[.]lovable.oauth.consent.tsx`.
- `src/routeTree.gen.ts` (Old men-generate sendiri), `.lovable/plan/*.md` (dokumen rencana Lovable — boleh dibaca sebagai referensi desain, jangan dicopy ke repo Old).

## Urutan port yang disarankan

| Tahap | Isi | Item | Perkiraan |
|---|---|---|---|
| **3A** | Akuntansi & dokumen dulu (menyentuh kebenaran angka produksi): pajak per baris → nilai persediaan → advance → jurnal & COA → kas/bank auto-jurnal+storno → subledger → kunci periode → ekspor + laporan formal | 36–49 | ±3.900 baris, 3 migration |
| **3B** | CRM/Tender: tentukan strategi storage lebih dulu, lalu Pustaka Dokumen + Tender + DOCX + letterhead + sosial + Meta | 50–57, 62 | ±2.500 baris, 5 migration |
| **3C** | Akses & UI: izin per submodul + penegakan route, Master Data pintar, hamburger mobile, dashboard modul | 58–61, 49 | ±900 baris |
| **3D** | Omnix & Qalling standalone (setelah keputusan bisnis) | 63–65 | ±1.400 baris, 7 tabel |

**Gerbang mutu tiap fase** (sama seperti Batch 1–2): `npx tsc --noEmit` = 0, `npm run build` = 0, `npm run test:e2e` hijau, commit kecil per fase dengan pesan bahasa Indonesia yang menjelaskan akar masalah + cara verifikasi.

## Keputusan yang perlu diambil sebelum mulai

1. **Storage berkas** untuk Pustaka Dokumen / Tender / Template DOCX (volume + route ber-auth vs data URL) — memblokir item #50–52.
2. **Meta App** (kredensial + app publik + cron publish) — memblokir item #54–56.
3. **Omnix**: kapan modul ini diaktifkan & apakah harga/kuota (Rp25/trx, paket Rp350rb) disetujui.
4. **Qalling standalone**: domain mana yang dipakai dan apakah tag produk `qalling` masuk ke billing.
5. **Kode item otomatis** (Master Data): setuju perilakunya berubah (kode tidak lagi diketik manual)?

## Catatan risiko

- **Item #36 dan #40 mengubah angka** pada dokumen yang sudah ada. Setelah port, dokumen lama yang punya PPh atau mutasi stok bisa tampak berubah nilainya saat dihitung ulang → sebaiknya ada halaman/diagnostik untuk menghitung ulang, atau setidaknya catatan rilis.
- **Satu-satunya dependensi baru** (`jszip`) perlu ditambahkan ke `package.json` Old; itu tidak menarik Supabase.
- **Izin per submodul (#58–59)** berpotensi "menyembunyikan" modul bagi user yang sekarang bisa membukanya, karena default bila baris `workspace_role_access` tidak ada = `canView: true`. Pastikan perilaku default (allow) dipertahankan supaya tidak ada regresi akses.
- `supabase/types.ts` (+987 baris) membuat diff terlihat jauh lebih besar daripada kenyataannya — jangan dipakai sebagai dasar estimasi.

---

## Progres Batch 3 — di working tree, **belum di-commit** (2026-09-30)

Fokus sesi ini: **#36 (pajak per baris + withholding PPh)** dan **#40 (nilai persediaan = moving average)**, plus **#39 sebagian** (akun 1450) karena dibutuhkan #36.

### File yang berubah (10) + 2 baru

| File | Isi |
|---|---|
| `db/migrations/010_new3_schema.sql` *(baru)* | 17 tabel baru + kolom baru (termasuk `tax_code`, `withholding_amount`) + backfill COA 1450 |
| `PARITY-BS-NEW3-VS-OLD.md` *(baru)* | dokumen ini |
| `src/lib/tax.ts` | `LineTaxOption` + `NO_TAX_OPTION` + `isWithholdingTax`; `useLineTaxOptions` kini mengembalikan kode & jenis pajak (bukan sekadar tarif) |
| `src/lib/sales.ts`, `src/lib/procurement.ts` | tipe `withholding_amount` (dokumen) & `tax_code` (baris) |
| `src/lib/journal.ts` | akun `prepaidWht` (1450); AR Invoice: Dr Piutang (total) + Dr PPh Dibayar Dimuka; Retur Penjualan: Cr PPh Dibayar Dimuka; `costOfLines` pakai moving average + tanggal dokumen |
| `src/lib/inventory.ts` | `movingAverageCosts()`; `postSalesMovements` menilai stok keluar dengan rata-rata bergerak (bukan harga jual) |
| `src/lib/ledger.functions.ts` | server fn `fetchMovingAverageCosts` (agregat SQL `SUM(value)/SUM(qty)`, `qty > 0`, sampai tanggal) |
| `src/lib/provisioning.server.ts` | COA default + 1450 PPh Dibayar Dimuka |
| `src/lib/data.functions.ts` | whitelist `COLS`: `tax_code` (baris) & `withholding_amount` (dokumen) |
| `src/components/app/SalesTable.tsx`, `ProcurementTable.tsx` | dropdown pajak per baris berbasis kode master, total memisahkan **PPN** dan **Potongan PPh**, simpan `tax_code` + `withholding_amount`, muat ulang saat edit draft |

### Verifikasi yang sudah dilakukan

- `npx tsc --noEmit` → **0 error**.
- `npm run build` → **sukses** (`✓ built`), dan `mysql2` tetap hanya ada di `.output/server/_libs/` (tidak bocor ke bundle klien).
- Migration `010` diuji pada container **MariaDB 11.4 sekali-pakai** (bukan DB dev/prod): `001`–`010` + seluruh seed terpasang tanpa error; 17 tabel & 12 kolom baru terverifikasi lewat `information_schema`; **backfill COA 1450** terbukti menambahkan akun untuk workspace yang sudah ada, dan **tidak menduplikasi** saat dijalankan ulang.
- `eslint`: repo ini **sudah tidak bersih di HEAD** (221 error `prettier/prettier` pada file yang sama sebelum perubahan; 238 sesudah). Perubahan ini menambah 17 deviasi format dan **0 error aturan lain**. `prettier --write` sengaja tidak dijalankan karena akan memformat ulang 500–800 baris per file di luar scope.

### Belum dilakukan (langkah berikutnya)

1. `npm run migrate` di DB dev — container `xperd-mysql-dev` (port 3307) sedang mati, jadi migration belum dijalankan di database nyata.
2. `npm run test:e2e` (butuh app + DB dev hidup).
3. Uji manual UI: pilih PPh 23 di satu baris → pastikan total turun dan jurnal AR berisi Dr 1450; buat DO → pastikan `inv_movements.unit_cost` = rata-rata bergerak, bukan harga jual.
4. Lanjutan 3A: #37 (uang muka) → #38 (auto-jurnal AP, sekalian kredit `Hutang Pajak 2200` untuk withholding sisi beli) → #41–49.

