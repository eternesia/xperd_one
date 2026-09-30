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
| 37 | **Uang muka (advance)** customer & supplier + aplikasi ke invoice berikutnya (`advance = down payment`, `application = pemakaian`), dengan pemisahan akun kontrol 2400 / 1500 | `SalesTable.tsx` (`applyAdvanceToInvoice`, kontrol `2400`), `ProcurementTable.tsx` (kontrol `1500`), migration `0015` | 🔵 **dikerjakan** (sisi jual & payment) | `advance_kind` sudah ada di `sls_documents`/`prc_documents` (migration `010`). Helper `availableAdvance` + `applyAdvanceToInvoice` sudah diport; receipt/payment tanpa dokumen sumber otomatis ditandai `advance_kind='advance'` dan jurnalnya memakai 2400/1500. **Pemakaian uang muka ke AP Invoice baru aktif setelah #38** (auto-jurnal AP Invoice), karena di Old `ap_invoice` masih `autoJournal: false` |
| 38 | **Auto-jurnal AP Invoice diaktifkan** (baris jasa/non-persediaan; barang yang sudah dikapitalisasi saat GR dilewati) + jurnal GR/IR `2050`, beban jasa `5200`, PPh dibayar dimuka `1450`, hutang PPh `2200`, uang muka, PPN | `lib/procurement.ts` (`autoJournal: false → true`), `lib/journal.ts` (+454 baris, termasuk `ensureAccounts()`) | ✅ **selesai** | **Keputusan: ikuti New 3.** GR kini `Dr Persediaan / Cr GR/IR 2050` (PPN diakui di AP Invoice); AP Invoice `Dr Persediaan/GR-IR/beban (+PPN Masukan) / Cr Hutang Usaha (net setelah PPh) + Cr Hutang Pajak`. GR **lama** (yang mengkredit 2000) dideteksi `isLegacyGoodsReceipt` (server fn `fetchJournalSourceCredits`) dan barisnya dilewati supaya tidak dobel. Retur pembelian atas GR baru membalik GR/IR, bukan hutang usaha |
| 39 | **COA provisioning tambahan**: 1410 PPN Lebih Bayar, 1450 PPh Dibayar Dimuka, 2050 Hutang Belum Ditagih (GR/IR), 2110 Hutang PPN, 2400 Uang Muka Penjualan, 5200 Beban Jasa & Profesional | `lib/provisioning.server.ts` | ✅ **selesai** | 1450 di `010`, sisanya (1410, 2050, 2110, 2400, 5200) di `011_advances_coa.sql` + `DEFAULT_COA`. Contoh: `db/migrations/011_advances_coa.sql` |
| 40 | **Nilai persediaan pakai moving average nyata** untuk pengeluaran stok. Sebelumnya `unit_cost` diisi `unit_price` baris dokumen (**harga jual**) → HPP & nilai stok salah | `lib/inventory.ts` (`movingAverageCosts()`), `issueStockForDocument()` | 🔵 **dikerjakan** | **Bug costing**; di Old dipakai server fn agregat `fetchMovingAverageCosts` (SUM(value)/SUM(qty) di SQL, `qty > 0`, sampai tanggal dokumen) + fallback `md_items.cost_price`. Dipakai `postSalesMovements` (DO & retur) **dan** `costOfLines` (HPP jurnal DO/retur) |
| 41 | **Item non-persediaan**: tipe item baru `software_license` & `subscription`, kolom `is_stocked` (jasa/lisensi/langganan tidak bikin pergerakan stok), `billing_cycle`, akun beban `expense_account_code` | `lib/master-data.ts` (`NON_STOCK_ITEM_TYPES`), `lib/inventory.ts` (`nonStockedCodes()`), migrations `0013`, `0014` | ✅ **selesai** | Field `reference` (dropdown kategori/satuan), kode otomatis berurutan (ITM/SRV/SFT/SUB/CAT/CUS/SUP/WH), `showWhen` (barcode & min. stok hanya untuk barang), `readOnly` + teks bantuan, dan `is_stocked` diturunkan dari `item_type`. Pergerakan stok item non-persediaan dilewati di `insertMovements`. Kolom baru masuk whitelist `COLS`; `is_stocked` data lama disamakan lewat migration `012`. `expense_account_code` tersedia di skema & dipakai jurnal AP, tapi **belum ada field UI-nya di New 3 juga** |
| 42 | **Kas & Bank: auto-jurnal + storno**. Transaksi kas/bank kini otomatis posting jurnal; "batal" tidak menghapus entri tetapi **memposting jurnal kebalikan** (`JV/REV/...`, audit trail utuh). Ada dialog detail + edit + batal, dan panel jurnal di drawer | `lib/cashbank.ts` (`insertJournal`, `postCbJournal`, `postReversal`, `fetchJournalLines`), `CashBankViews.tsx` (+650) | ✅ **selesai** | Auto-jurnal saat create **sudah ada** sejak batch sebelumnya; yang ditambahkan: `postReversal()` (**storno**), `updateCbTransaction()` (koreksi = balik jurnal lama + jurnal baru), `deleteCbTransaction()` (balik jurnal lalu hapus baris), `fetchJournalLines()`, panel **JournalPanel**, dialog detail, kolom aksi (detail/ubah/batalkan). **Belum**: `recordSettlementCashTransaction()` — mirror otomatis receipt/payment ke buku kas/bank (menyusul) |
| 43 | **Submodul baru "Laporan Kas & Bank"** (mutasi & saldo per akun, ekspor) | `lib/cashbank.ts` (`kind: "reports"`), `CashBankViews.tsx` (`CashBankReportView`), `lib/modules.ts` | ✅ **selesai** | Submodul `reports` + `ReportsView`: ringkasan masuk/keluar/transfer, filter akun/jenis/status/tanggal/pencarian, ekspor **Excel & PDF** (butuh `lib/report-export.ts`, diporting dari #47) |
| 44 | **Impor rekening koran (Excel/CSV)** → auto-match baris ke transaksi tercatat (arah sama, nominal sama, tanggal ±3 hari) lalu menandai buku sudah reconciled | `components/app/CbStatementImport.tsx` (324 baris) | ✅ **selesai** | Diporting ke `src/components/app/CbStatementImport.tsx` (~370 baris) & disambungkan ke submodul Rekonsiliasi (kartu impor muncul setelah memilih satu akun kas/bank). Pakai `xlsx` yang sudah ada |
| 45 | **Subledger AR/AP**: 4 submodul baru — **AR Card, AP Card, AR Aging, AP Aging** (aging alokasi FIFO: pelunasan dialokasikan ke invoice tertua) | `lib/subledger.ts` (`buildCard`, `buildAging`, `partnersOf`), `components/app/SubledgerViews.tsx` (365), `lib/accounting.ts`, `lib/modules.ts` | ✅ **selesai** | `lib/subledger.ts` murni hitungan + baca `sls_documents`/`prc_documents` lewat `listWorkspaceRows` (`inFilters` doc_type, `ranges` doc_date); dokumen `advance_kind='advance'` disaring karena uang muka baru menutup tagihan saat dipakai. UI `SubledgerViews.tsx` (Kartu & Aging) + ekspor Excel/PDF; 4 submodul terdaftar di `accounting.ts`/`modules.ts` dan dispatcher `AccountingViews` |
| 46 | **Kunci periode akuntansi** (`soft`/`hard`) + helper periode | `lib/journal.ts` (`periodOfDate`, `PeriodLockType`), migration `0014` (`acc_period_locks`) | ✅ **selesai** | Tabel `acc_period_locks` (migration `010`) + whitelist `WORKSPACE_TABLES`/`COLS`. **Penegakan di server**: `postJournalEntry` menolak posting bila periode `entry_date` terkunci — jadi semua jalur (dokumen, kas/bank, payroll, jurnal manual) ikut terjaga, bukan hanya UI. UI kelola kunci ada di submodul Tutup Periode (`fetchPeriodLocks`/`lockPeriod`/`unlockPeriod`, badge keras/sementara, peringatan bila periode aktif terkunci) |
| 47 | **Ekspor tabel Excel/PDF** yang dipakai ulang semua layar laporan + komponen UI bersama (skeleton, pagination, search) | `lib/report-export.ts` (`exportTableXlsx`, `exportTablePdf`), `components/app/ui-states.tsx` (240: `PaginationBar`, `TableSkeletonRows`, `PageSkeleton`, `usePagination`, `useSearchFilter`, `SearchInput`, `ReportExportButtons`) | ✅ **selesai** | `lib/report-export.ts` selesai di Ronde 5; `components/app/ui-states.tsx` diporting utuh dan sudah dipakai di halaman **Team & Access**. Layar lain (Manyar/CRM di 3B) bisa menyusul memakai komponen yang sama |
| 48 | **Laporan keuangan formal** siap cetak/PDF/Excel: kop entitas, judul formal, kata periode, catatan mata uang, angka rata kanan, total garis ganda, blok tanda tangan; Neraca disajikan **skontro** (aset kiri, kewajiban+ekuitas kanan) | `lib/financial-statement.ts` (365: `buildStatementHtml`, `printStatement`, `downloadStatementPdf`, `exportStatementXlsx`), `AccountingViews.tsx` (+593) | ✅ **selesai (6 laporan)** | `lib/financial-statement.ts` diporting utuh + `useStatementEntity()` (kop dari profil workspace) dan `StatementActions` (Excel/PDF/Cetak). Tersambung ke **Buku Besar** (debit/kredit/saldo + saldo akhir), **Neraca Saldo**, **Laba Rugi** (multi-step: pendapatan → beban pokok → laba kotor → beban usaha), **Neraca** (skontro), **Arus Kas** (kolom masuk/keluar/bersih + subtotal per aktivitas + kas awal/akhir), **Perubahan Ekuitas** (saldo awal/mutasi/saldo akhir). Jurnal Umum tetap memakai tombol cetak lama |
| 49 | **Dashboard modul** untuk Master Data, Fixed Asset & Tax (ringkasan, grafik, komposisi, top beban) + tombol submodul dihapus dari dashboard | `components/app/ModuleDashboard.tsx` (+376) | ✅ **selesai** | Diporting ke `ModuleDashboard.tsx` Old: grid tombol submodul dihapus, lalu Accounting, Master Data, Fixed Asset, Tax, dan Kas & Bank dilengkapi kartu/grafik tambahan |

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
3. Uji manual UI: pilih PPh 23 di satu baris → pastikan total turun dan jurnal AR berisi Dr 1450; buat DO → pastikan `inv_movements.unit_cost` = rata-rata bergerak, bukan harga jual; buat Sales Receipt tanpa dokumen sumber → pastikan jurnal Cr 2400 dan barisnya ber-`advance_kind='advance'`.
4. Lanjutan 3A sudah **habis**: #47 selesai (ui-states) dan `recordSettlementCashTransaction` selesai. Berikutnya batch **3B CRM/Tender** (#50–57, #62) yang masih menunggu keputusan penyimpanan berkas & kredensial Meta.

### Ronde 10 (terbaru, 2026-09-30) — #47 komponen daftar bersama + settlement kas/bank

| File | Isi |
|---|---|
| `src/components/app/ui-states.tsx` *(baru, diporting utuh dari New 3)* | `ReportExportButtons`, `TableSkeletonRows`, `PageSkeleton`, `paginate`, `Pagination`, `usePagination`, `PaginationBar`, `useSearchFilter`, `SearchInput`, `PAGE_SIZE_OPTIONS`. Tanpa dependensi Supabase, memakai `lib/report-export.ts` Old |
| `src/routes/app/w.$workspaceId.team.tsx` | Daftar anggota kini memakai `SearchInput` + `useSearchFilter` (nama/email/role) + `usePagination`/`PaginationBar` (10/hal) + `PageSkeleton` saat memuat, plus pesan "tidak ada yang cocok" |
| `src/lib/cashbank.ts` | Baru: `SettlementInput` + `recordSettlementCashTransaction()` — mencatat baris `cb_transactions` untuk penerimaan/pembayaran agar saldo rekening yang dipilih bergerak bersama buku besar. **Tidak** memposting jurnal baru (jurnal GL sudah dibuat alur penjualan/pembelian) dan **idempoten** (cek `trx_no` sebelum insert) |
| `src/components/app/SalesTable.tsx` | Pada `sales_receipt` (bukan draf) dipanggil settlement `direction: "in"`, akun kontrol `2400` bila uang muka atau `1200` bila pelunasan piutang; cache `cb-trx`/`cb-accounts`/`cb-dashboard` diinvalidasi |
| `src/components/app/ProcurementTable.tsx` | Pada `purchase_payment` (bukan draf) dipanggil settlement `direction: "out"`, akun kontrol `1500` (uang muka) / `2000` (hutang usaha); invalidasi cache kas yang sama |

Verifikasi: `tsc` 0 error, `build` sukses. Belum: uji manual — buat penerimaan kas dengan akun bank terpilih → pastikan muncul baris di daftar Kas & Bank dan saldo rekening naik; simpan ulang dokumen yang sama → tidak boleh dobel.

### Ronde 9 (2026-09-30) — #44 impor rekening koran & #49 dashboard modul

| File | Isi |
|---|---|
| `src/components/app/CbStatementImport.tsx` *(baru, ~370 baris)* | Baca rekening koran **Excel/CSV** (`toIsoDate`, `toNum`, `pick`, `parseRows`), unduh template, **auto-match** ke transaksi buku (arah sama, selisih nominal ≤ 0,5, jarak tanggal ≤ 3 hari, tanggal terdekat menang, tiap transaksi buku hanya dipakai sekali), `bookDirection()` menangani transfer, lalu `reconcileMatched()` menandai `is_reconciled=1` + `reconciled_at` (via `sqlDateTime()`); 4 kartu ringkasan + tabel hasil match berbadge |
| `src/components/app/CashBankViews.tsx` | Kartu impor disisipkan ke submodul **Rekonsiliasi**: bila akun = `ALL` tampil petunjuk memilih akun, selain itu komponen impor untuk akun tersebut (prop `onBalance`/`onDone` menyegarkan saldo) |
| `src/components/app/ModuleDashboard.tsx` | **Hapus grid tombol submodul** dari dashboard (navigasi ikut sidebar). **Accounting**: ringkasan laba/rugi + neraca, margin bersih, badge "semua jurnal seimbang" (deteksi jurnal tidak seimbang), 5 akun beban terbesar dengan bar share, 6 aktivitas jurnal terbaru. **Master Data**: grid `lg:grid-cols-3` (grafik batang jumlah entri per entitas + pie komposisi + daftar entitas terbesar). **Fixed Asset**: kartu akumulasi penyusutan (5 kartu `xl:grid-cols-5`) + panel **Tren penyusutan** & **Nilai buku per kategori**. **Tax**: kartu dokumen periode berjalan/draf/dilaporkan-disetor + panel **PPN per periode** & **Status dokumen pajak**. **Kas & Bank**: kartu arus kas bersih, kartu bulan berjalan (masuk, keluar, jumlah transaksi, belum rekonsiliasi), panel **Saldo per rekening** & **Mutasi terbaru** (nominal bertanda) |

Verifikasi: `tsc` 0 error, `build` sukses. Belum: uji manual impor berkas rekening koran nyata dan pemeriksaan tampilan dashboard pada data kosong.

### Ronde 8 (terbaru, 2026-09-30) — #48 laporan keuangan formal (tahap 1)

| File | Isi |
|---|---|
| `src/lib/financial-statement.ts` *(baru, disalin utuh dari New 3)* | Tanpa dependensi proyek: `StatementDoc`/`StmtRow`/`StmtSection`, helper tanggal & angka Indonesia (`longDate`, `asOfLabel`, `periodRangeLabel`, `currencyNote`, `acctNumber`), `buildStatementHtml` (kop + judul formal + catatan mata uang + total garis ganda + blok tanda tangan, tata letak **skontro**/stafel), `printStatement`, `downloadStatementPdf` (jsPDF), `exportStatementXlsx` |
| `components/app/AccountingViews.tsx` | Helper `useStatementEntity()` (kop dari profil workspace: nama, NPWP, alamat, telepon, email, logo) dan `StatementActions` (Excel / PDF / Cetak). Tersambung ke **Neraca Saldo** (kolom debit-kredit-saldo + baris JUMLAH), **Laba Rugi** (multi-step + laba kotor + laba bersih periode), **Neraca** (skontro: kolom aset vs liabilitas+ekuitas, tinggi kolom disamakan, catatan otomatis bila belum seimbang) |

Verifikasi: `tsc` 0 error, `build` sukses. Tersambung ke **enam** laporan: Buku Besar, Neraca Saldo, Laba Rugi, Neraca (skontro), Arus Kas, dan Perubahan Ekuitas. **Belum**: uji manual cetak/PDF memastikan kop & blok tanda tangan muncul dan Neraca seimbang.

### Ronde 7 (terbaru, 2026-09-30) — #46 kunci periode akuntansi

| File | Isi |
|---|---|
| `lib/ledger.functions.ts` | `postJournalEntry` memeriksa `acc_period_locks` untuk periode `entry_date` dan **menolak posting** (pesan berbeda untuk `hard lock` vs `soft close`) |
| `lib/journal.ts` | `PeriodLockType`, `periodOfDate()`, `PeriodLock` + `fetchPeriodLocks()`/`lockPeriod()`/`unlockPeriod()` (validasi format `YYYY-MM`) |
| `lib/data.functions.ts` | Whitelist `WORKSPACE_TABLES` + `COLS.acc_period_locks` (tanpa ini kunci tersimpan kosong / query gagal) |
| `components/app/AccountingViews.tsx` | Kartu **Kunci periode** di Tutup Periode: input bulan, jenis (tutup sementara / kunci keras), catatan, daftar kunci + tombol buka, dan peringatan bila periode aktif sedang terkunci |

Verifikasi: `tsc` 0 error, `build` sukses. Belum: uji manual — kunci periode berjalan (hard), coba posting jurnal/document di periode itu (harus ditolak), lalu buka kunci dan pastikan bisa posting lagi.

### Ronde 6 (terbaru, 2026-09-30) — #45 subledger AR/AP (Kartu & Aging)

| File | Isi |
|---|---|
| `src/lib/subledger.ts` *(baru)* | `fetchSubledger()` (via `listWorkspaceRows`: `inFilters` doc_type, `ranges` doc_date, maks 5000 baris), `buildCard()` (mutasi per partner + saldo berjalan), `buildAging()` (bucket belum jatuh tempo / 1–30 / 31–60 / 61–90 / >90 hari, pelunasan dialokasikan **FIFO ke tagihan tertua**), `partnersOf()` |
| `src/components/app/SubledgerViews.tsx` *(baru)* | `SubledgerCardView` (filter periode & partner, 3 ringkasan, tabel mutasi) dan `AgingView` (per tanggal, 6 kartu bucket + tabel per partner dengan baris total), keduanya dengan ekspor **Excel/PDF** |
| `src/lib/accounting.ts`, `src/lib/modules.ts` | 4 submodul baru: `ar-card`, `ap-card`, `ar-aging`, `ap-aging` (sebelum `period-closing`) |
| `src/components/app/AccountingViews.tsx` | dispatcher: 4 case baru ke `SubledgerCardView`/`AgingView` |

Verifikasi: `tsc` 0 error, `build` sukses. Belum: uji manual — bandingkan saldo akhir Kartu Piutang dengan total AR di Neraca, dan pastikan Aging hanya menghitung dokumen tidak `draft`/`cancelled` serta tidak menghitung uang muka yang belum dipakai.

### Ronde 5 (terbaru, 2026-09-30) — #42 storno kas/bank & #43 Laporan Kas & Bank

| Perubahan | Detail |
|---|---|
| `lib/cashbank.ts` | `CbViewKind` + `reports` & entri submodul; helper `buildCbLines()`/`cbMemo()`/`cbRow()` (create dipakai bareng update); `fetchJournalLines()` (baris jurnal satu entri); `postReversal()` (**storno** — jurnal lama dibalik, tidak dihapus); `updateCbTransaction()` (koreksi: balik jurnal lama + posting jurnal baru + update baris tanpa mereset status rekonsiliasi); `deleteCbTransaction()` (balik jurnal lalu hapus baris) |
| `components/app/CashBankViews.tsx` | `JournalPanel` (jurnal yang diposting di detail transaksi), dialog **detail** (field + panel jurnal + tombol Ubah/Batalkan), dialog **koreksi** (form terisi dari transaksi lama, simpan = storno + jurnal baru), dialog **pembatalan** (menegaskan jurnal dibalik, bukan dihapus), kolom **Aksi** (detail/ubah/batalkan), dan `ReportsView` untuk submodul baru |
| `lib/modules.ts` | submodul `reports` ("Laporan Kas & Bank") di modul Cash & Bank |
| `lib/report-export.ts` *(baru)* | `exportTableXlsx` / `exportTablePdf` — dipakai laporan ini, dan menjadi fondasi #47/#48 |

Verifikasi: `tsc` 0 error, `build` sukses. Belum: uji manual — buat transaksi kas → cek panel jurnal di detail → koreksi nominal (jurnal lama harus berstatus dibalik & muncul jurnal baru) → batalkan transaksi (baris hilang, jurnal kebalikan tetap ada di Buku Besar) → ekspor laporan.

### Ronde 4 (terbaru, 2026-09-30) — #41 item non-persediaan

| Perubahan | Detail |
|---|---|
| `lib/master-data.ts` | `FieldType` + `reference`; `MDField` + `refTable`/`showWhen`/`readOnly`/`helpEn`/`helpId`; `MDEntity` + `codePrefix`/`codePrefixByType`; `NON_STOCK_ITEM_TYPES`; entity item: tipe `software_license`/`subscription`, kategori & satuan jadi dropdown master, `billing_cycle`, `is_stocked` read-only; prefix kode untuk items (ITM/SRV/SFT/SUB), categories (CAT), customers (CUS), suppliers (SUP), warehouses (WH) |
| `components/app/MasterDataTable.tsx` | Helper `isVisible()` (field kondisional) dan `ReferenceSelect` (dropdown dari master lain via `listWorkspaceRows`); `prefixOf()`/`nextCode()` (kode berurutan mengikuti tipe item, mis. `ITM-0007`); `setField()` sebagai satu pintu perubahan form (tipe item menentukan `is_stocked`, mematikan min. stok/barcode, dan mengganti prefix kode); dialog memakai `visibleFields`, mendukung `readOnly` + teks bantuan, dan field tersembunyi dikembalikan ke nilai default saat disimpan |
| `lib/inventory.ts` | `nonStockedCodes()` — item jasa/lisensi/langganan dilewati di `insertMovements` (tidak membuat pergerakan stok) |
| `lib/data.functions.ts` | Whitelist `COLS.md_items` + `is_stocked`, `billing_cycle`, `expense_account_code` (**tanpa ini nilainya dibuang tanpa error**) |
| `db/migrations/012_item_stock_flags.sql` | Menyamakan `is_stocked` dengan `item_type` untuk data lama (010 memberi DEFAULT 1 sehingga item jasa ikut tertandai persediaan) |

Verifikasi: `tsc` 0 error, `build` sukses; migration 001–012 di container MariaDB sekali-pakai dan uji data contoh — `goods` → `is_stocked = 1`, `service`/`subscription` → `0`.

### Ronde 3 (terbaru, 2026-09-30) — #38 auto-jurnal AP Invoice + peralihan GR ke GR/IR

**Keputusan user: ikuti New 3** (GR pindah ke GR/IR 2050, PPN Masukan diakui di AP Invoice).

| Perubahan | Detail |
|---|---|
| `journal.ts` | Akun baru `grir` (2050), `serviceExpense` (5200), `whtPayable` (2200). `postGoodsReceiptJournal` → `Dr Persediaan / Cr GR/IR` (tanpa PPN). `postApInvoiceJournal` baru: debet per baris ke GR/IR (barang dari GR), Persediaan (barang tanpa sumber GR) atau akun beban item / 5200 (jasa); + `Dr PPN Masukan`; `Cr Hutang Usaha (net+PPN−PPh)` + `Cr Hutang Pajak (PPh)`. `postPurchaseReturnJournal` menerima `{ goodsReceiptId }` dan membalik GR/IR untuk GR baru. `isLegacyGoodsReceipt()` |
| `ledger.functions.ts` | `fetchJournalSourceCredits({ workspaceId, sourceId })` — total kredit per akun dari jurnal satu dokumen sumber (dasar deteksi GR lama). `fetchMdItems` kini juga mengembalikan `name`, `item_type`, `is_stocked`, `expense_account_code` |
| `procurement.ts` | `ap_invoices.autoJournal: false → true` |
| `ProcurementTable.tsx` | Blok AP Invoice: panggil `postApInvoiceJournal` (mengirim net/PPN/PPh per baris + info sumber GR) lalu `applyAdvanceToInvoice("ap", …)` (#37 efektif penuh di sisi beli). Retur pembelian mengirim `goodsReceiptId` |

**Dampak yang perlu diketahui finance:** setelah deploy, PPN Masukan pembelian barang **tidak lagi muncul di jurnal Goods Receipt**, melainkan di jurnal AP Invoice; hutang ke supplier timbul saat AP Invoice (GR memakai akun perantara 2050). GR yang sudah diposting sebelum perubahan tetap aman: AP Invoice-nya otomatis melewati baris barang tersebut.

Verifikasi: `tsc` 0 error, `build` sukses. Belum: `npm run migrate` + `npm run test:e2e` di DB dev, serta uji manual (GR → AP Invoice → pembayaran) untuk memastikan 2050 bersaldo nol setelah invoice dicatat.

### Ronde 2 (2026-09-30, sebelumnya) — #37 uang muka & #39 selesai

| Item | Isi | Verifikasi |
|---|---|---|
| #37 | `journal.ts`: akun `advanceSales` (2400) & `advancePurchase` (1500); `postReceiptJournal`/`postPaymentJournal` menerima opsi `{ advance }` sehingga receipt/payment tanpa dokumen sumber dijurnal ke akun uang muka; helper `availableAdvance()` (saldo uang muka per partner: `advance` menambah, `application` mengurangi) dan `applyAdvanceToInvoice()` (membuat dokumen settlement `<invoice>-UM` + jurnal: AR Dr 2400/Cr 1200, AP Dr 2000/Cr 1500, lalu status invoice `partial`/`closed`). `SalesTable` memotongkan uang muka otomatis ke AR Invoice baru; `ProcurementTable` menandai purchase payment tanpa dokumen sumber sebagai uang muka | `tsc` 0, `build` sukses |
| #39 | `db/migrations/011_advances_coa.sql` + `DEFAULT_COA`: akun 1410, 2050, 2110, 2400, 5200 untuk workspace lama & baru | migration 001–011 di container MariaDB sekali-pakai: 6 akun ter-backfill, dan statement-nya idempotent saat dijalankan ulang |

#### Keputusan #38 — DISETUJUI (2026-09-30): ikuti New 3

New 3 mengubah jurnal **Goods Receipt**: dulu Dr Persediaan + Dr PPN Masukan / **Cr Hutang Usaha**; sekarang Dr Persediaan / **Cr Hutang Belum Ditagih (GR/IR) 2050** — PPN baru diakui di AP Invoice. Supaya tidak dobel, GR lama yang sudah mengkredit 2000 dideteksi otomatis (`isLegacyGoodsReceipt`) dan barisnya dilewati saat AP Invoice dijurnal.

User memilih **opsi 1 (ikuti New 3)** pada 2026-09-30, jadi peralihan ini sudah dikerjakan — rinciannya di bagian *Ronde 3* di atas. Alternatif yang tidak dipilih: GR tetap seperti semula dan AP Invoice hanya menjurnal baris jasa/non-persediaan (tanpa akun 2050).

