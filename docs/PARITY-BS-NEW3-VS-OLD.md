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
| Bisa port tanpa keputusan bisnis | Grup **A** (akuntansi, ±3.900 baris) & **C** (akses/UI, ±900 baris) — **keduanya sudah diimplementasikan (Ronde 1–11)** |
| Butuh keputusan dulu | Grup **B** (storage file + kredensial Meta) & **D** (Omnix, Qalling) |
| Status akhir (2026-09-30) | **Semua item #36–65 sudah terimplementasi.** Satu-satunya yang belum diverifikasi end-to-end adalah uji Meta dengan App nyata (#55) — **ditunda atas keputusan pemilik produk**; kode, penjaga endpoint, dan runbook-nya sudah siap (`META-SETUP.md`) |

**Sifat Batch 3:** bukan parity kecil. Ada **1 modul baru (Omnix)**, **5 submodul CRM baru**, **5 submodul akuntansi/kas baru**, plus 2 perbaikan yang menyentuh **kebenaran angka** di dokumen (pajak per baris & nilai persediaan) — dua item itu sebaiknya didahulukan.

---

## A. Akuntansi, dokumen & kas/bank (±3.900 baris) — **prioritas tertinggi**

| # | Perubahan di New 3 | File New (bukti) | Old | Catatan port |
|---|---|---|---|---|
| 36 | **Pajak per baris + withholding (PPh)**. Sebelumnya `tax_amount` mencampur PPN & PPh sehingga total AR/AP salah saat ada potongan PPh. Sekarang tiap baris punya `tax_code` (jenis pajak dari master `md_taxes.tax_type`), header menyimpan `withholding_amount`, dan total = subtotal − diskon + PPN − PPh | `lib/tax.ts` (`LineTaxOption`, `NO_TAX_OPTION`, `isWithholdingTax`, `useLineTaxOptions`); `SalesTable.tsx`; `ProcurementTable.tsx`; migration `0014` | ✅ **selesai** (Ronde 1) | Kebutuhan DB: `sls_document_lines.tax_code`, `prc_document_lines.tax_code`, `sls_documents.withholding_amount`, `prc_documents.withholding_amount` — sudah masuk migration `010`. `md_taxes.tax_type` **sudah ada** di Old (`001_schema.sql`). Catatan: label total berubah dari “Pajak” menjadi “PPN” + baris “Potongan PPh” |
| 37 | **Uang muka (advance)** customer & supplier + aplikasi ke invoice berikutnya (`advance = down payment`, `application = pemakaian`), dengan pemisahan akun kontrol 2400 / 1500 | `SalesTable.tsx` (`applyAdvanceToInvoice`, kontrol `2400`), `ProcurementTable.tsx` (kontrol `1500`), migration `0015` | ✅ **selesai** (Ronde 2) | `advance_kind` sudah ada di `sls_documents`/`prc_documents` (migration `010`). Helper `availableAdvance` + `applyAdvanceToInvoice` sudah diport; receipt/payment tanpa dokumen sumber otomatis ditandai `advance_kind='advance'` dan jurnalnya memakai 2400/1500. **Pemakaian uang muka ke AP Invoice baru aktif setelah #38** (auto-jurnal AP Invoice), karena di Old `ap_invoice` masih `autoJournal: false` |
| 38 | **Auto-jurnal AP Invoice diaktifkan** (baris jasa/non-persediaan; barang yang sudah dikapitalisasi saat GR dilewati) + jurnal GR/IR `2050`, beban jasa `5200`, PPh dibayar dimuka `1450`, hutang PPh `2200`, uang muka, PPN | `lib/procurement.ts` (`autoJournal: false → true`), `lib/journal.ts` (+454 baris, termasuk `ensureAccounts()`) | ✅ **selesai** | **Keputusan: ikuti New 3.** GR kini `Dr Persediaan / Cr GR/IR 2050` (PPN diakui di AP Invoice); AP Invoice `Dr Persediaan/GR-IR/beban (+PPN Masukan) / Cr Hutang Usaha (net setelah PPh) + Cr Hutang Pajak`. GR **lama** (yang mengkredit 2000) dideteksi `isLegacyGoodsReceipt` (server fn `fetchJournalSourceCredits`) dan barisnya dilewati supaya tidak dobel. Retur pembelian atas GR baru membalik GR/IR, bukan hutang usaha |
| 39 | **COA provisioning tambahan**: 1410 PPN Lebih Bayar, 1450 PPh Dibayar Dimuka, 2050 Hutang Belum Ditagih (GR/IR), 2110 Hutang PPN, 2400 Uang Muka Penjualan, 5200 Beban Jasa & Profesional | `lib/provisioning.server.ts` | ✅ **selesai** | 1450 di `010`, sisanya (1410, 2050, 2110, 2400, 5200) di `011_advances_coa.sql` + `DEFAULT_COA`. Contoh: `db/migrations/011_advances_coa.sql` |
| 40 | **Nilai persediaan pakai moving average nyata** untuk pengeluaran stok. Sebelumnya `unit_cost` diisi `unit_price` baris dokumen (**harga jual**) → HPP & nilai stok salah | `lib/inventory.ts` (`movingAverageCosts()`), `issueStockForDocument()` | ✅ **selesai** (Ronde 1) | **Bug costing**; di Old dipakai server fn agregat `fetchMovingAverageCosts` (SUM(value)/SUM(qty) di SQL, `qty > 0`, sampai tanggal dokumen) + fallback `md_items.cost_price`. Dipakai `postSalesMovements` (DO & retur) **dan** `costOfLines` (HPP jurnal DO/retur) |
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
| 50 | **Tender Checklist**: daftar dokumen wajib (administratif/teknis/komersial), HPS, deadline, PIC, status, sort order, progress | `components/app/CrmTender.tsx` (482), migrations `0004` (`crm_tenders`, `crm_tender_docs`), `0006` | ✅ **selesai** (Ronde 12 + 15) | Ditambah (Ronde 15): unggah berkas per dokumen, ambil dari pustaka + "Isi otomatis dari pustaka", simpan berkas tender ke pustaka, dan dokumen tertaut pustaka selalu memakai berkas/expiry terbaru. **Belum**: template DOCX & paket ZIP (#52) |
| 51 | **Pustaka Dokumen** (legal/kualifikasi): unggah sekali, versi, masa berlaku, badge kedaluwarsa, dipakai untuk autofill checklist + ZIP per kategori | `components/app/CrmDocLibrary.tsx` (280), migration `0005` (`crm_doc_library`, `crm_doc_library_versions`) | ✅ **selesai** (Ronde 15) | Porting ke Old dengan **disk lokal** (server fn unggah + rute unduh `/api/workspace-files`): kategori, pencarian, filter, 3 kartu ringkasan, unggah/ganti versi + riwayat versi, badge kedaluwarsa, `matchLibrary` untuk autofill. **Belum**: ekspor ZIP per kategori (menunggu #52/`jszip`) |
| 52 | **Template Isian Panitia (DOCX)**: simpan PDF KAK/RKS sumber + formulir DOCX editable; saat diunduh, sistem menempel kop workspace dan mengganti placeholder profil perusahaan **tanpa mengubah file sumber** (JSZip, murni di browser) | `lib/tender-docx.ts` (189, `buildLetterheadedDocx`), `components/app/CrmTenderTemplates.tsx` (238), migration `0006` (`crm_tender_templates`, `crm_tender_template_versions`) | ✅ **selesai** (Ronde 16) | `jszip` ditambahkan ke Old; `lib/tender-docx.ts` disalin utuh (murni client-side) dan `CrmTenderTemplates.tsx` diporting dengan berkas disk + rute unduh. Tombol **Unduh paket (ZIP)** di detail tender menggabungkan berkas checklist + DOCX ber-kop per kategori |
| 53 | **Kop surat tender** di Settings: unggah gambar A4, toggle alamat/NPWP/telepon/email/garis, preview live | `workspaces.letterhead_config` (migration `0006`), `routes/app/w.$workspaceId.settings.tsx` (+187) | ✅ **selesai** (Ronde 12) | Kolom JSON `workspaces.letterhead_config` sudah ada (migration 010) + ditambahkan ke `PCOLS.workspaces` dan query shell; gambar A4 dinormalisasi ke 1240×1754 lalu disimpan sebagai data URL (Old tanpa object storage) |
| 54 | **Social Accounts multi-akun + Post Scheduler**: banyak akun per platform, jadwal mingguan/bulanan, "Post now", auto-publish | `components/app/CrmSocial.tsx` (682), migrations `0007` (`crm_social_accounts`, `crm_scheduled_posts`), `0008` | ✅ **selesai** (Ronde 14) | Diporting ke `src/components/app/CrmSocial.tsx` Old: akun manual multi-platform, penjadwal kalender minggu/bulan, dialog postingan (caption, media URL, akun tujuan, status), "Post now", dan auto-publish via hook cron `/api/public/hooks/social-publish` (butuh cron eksternal + `SOCIAL_PUBLISH_SECRET`) |
| 55 | **Integrasi Meta App**: App ID/Secret (kolom disembunyikan dari browser), Facebook Login → Pages + Instagram, OAuth `state` nonce, `publishing` claim supaya tidak dobel-publish | `lib/meta-social.functions.ts` (`saveMetaApp`, `startMetaConnect`, `disconnectMeta`, `publishPostNow`), `lib/meta-publish.server.ts`, `routes/api/public/meta/callback.ts`, `routes/api/public/hooks/social-publish.ts`, migration `0008` (`crm_meta_settings`, `crm_social_tokens`) | ⚠️ **kode selesai; uji Meta nyata ditunda** (Ronde 14 + 21) | Semua server fn & rute ada. Ronde 21 menambah penjaga yang **bisa diuji tanpa App** (spec `e2e/meta-guards.spec.ts` — **dihapus di ronde 23** setelah uji Meta ditunda), plus runbook `META-SETUP.md` yang memuat cara cek manual endpoint (403/200 hook, 400 callback) dan langkah uji akhir dengan App nyata, yang **ditunda** atas keputusan pemilik produk (2026-09-30) |
| 56 | **Social Dashboard**: jumlah akun/post, grafik mingguan, per akun, akan publish, kegagalan terakhir | `CrmSocial.tsx` (`SocialDashboardView`) | ✅ **selesai** (Ronde 14) | 6 kartu statistik, batang per-minggu (8 minggu), batang per-akun, jadwal berikutnya, gagal terbaru, badge status Meta |
| 57 | **Submodul CRM baru & penataan ulang**: `social-dashboard`, `social-accounts`, `post-scheduler`, `tenders`, `doc-library`; submodul "CRM Dashboard" dihapus (digabung ke dashboard modul); alert dokumen kedaluwarsa ≤30 hari di dashboard; tabel CRM (kontak, broadcast, campaigns, targets, templates) dapat search + pagination | `lib/modules.ts`, `components/app/CrmViews.tsx`, `CrmOutreach.tsx`, `CrmInsights.tsx` | ✅ **selesai** (Ronde 12–16) | Kelima submodul baru terdaftar & berfungsi; search + pagination Kontak/Broadcast/Kampanye/Target/Template; alert dokumen kedaluwarsa ≤30 hari di dasbor CRM. Catatan: New 3 ternyata **masih** memakai submodul `dashboard` CRM — Old juga, jadi tidak ada yang dihapus |
| 62 | **Panduan pengguna**: 3 entri baru (Tender Checklist, Pustaka Dokumen, Template Isian Panitia) | `lib/guide.ts` | ✅ **selesai** (Ronde 12–16) | Ketiga topik punya panduan bilingual (Tender Checklist 3 langkah, Pustaka Dokumen 3 langkah, Template Isian Panitia 3 langkah) |

## C. Akses & UI (±900 baris)

| # | Perubahan di New 3 | File New (bukti) | Old | Catatan port |
|---|---|---|---|---|
| 58 | **Izin per submodul**: `workspace_role_access.module_id` kini bisa berupa `module/submodule`; kontrak baru di app context (`workspaceRole`, `canViewModule`, `canViewSubmodule`, `canEditSubmodule`); matriks View/Edit untuk **setiap** dashboard & submodul di Team & Access | `lib/app-context.tsx`, `routes/app/w.$workspaceId.team.tsx` (+503) | ✅ **selesai** | Server fn baru `getWorkspaceAccess` (peran + izin, pemilik tenant = owner); `app-context.tsx` menyediakan `workspaceRole`/`accessLoading`/`canView*`/`canEdit*`; matriks Role Access jadi accordion per modul **dan** per submodul. Kunci lama (`module` saja) tetap kompatibel — submodul tanpa baris izin = boleh (default true) |
| 59 | **Penegakan izin di route**: modul & submodul menyaring menu sesuai izin, layar "akses dibatasi", mode **view-only** (`fieldset disabled`) saat hanya punya View, cek di halaman dokumen | `routes/app/w.$workspaceId.$moduleId.tsx` (+114), `...$moduleId.index.tsx`, `...$moduleId.$submoduleId.index.tsx` (+43), `...$docId.tsx` | ✅ **selesai** | Shell modul: gerbang `canViewModule` + spinner saat memuat izin + menu samping memfilter submodul; layar submodul: layar "Akses submodul dibatasi", pita "hanya lihat", isi dibungkus `<fieldset disabled>`; halaman dokumen ikut memeriksa izin; launcher & pencarian topbar menyaring modul/submodul |
| 60 | **Master Data lebih pintar**: jenis field `reference` (dropdown dari master terkait), **kode otomatis** berurutan (ITM/SRV/SFT/SUB/CAT), `showWhen` (field muncul tergantung tipe), `readOnly`, teks bantuan | `lib/master-data.ts`, `components/app/MasterDataTable.tsx` (+137) | ✅ **selesai** (Ronde 4) | Sudah diporting bersama #41: `FieldType`+`reference`/`refTable`, `showWhen`, `readOnly`, `helpEn/helpId`, `codePrefix`/`codePrefixByType`, `ReferenceSelect`, `isVisible`, kode otomatis |
| 61 | **Menu modul mobile** jadi hamburger (Sheet) menggantikan baris pill horizontal | `routes/app/w.$workspaceId.$moduleId.tsx` | ✅ **selesai** | Baris pill diganti header + `Sheet` hamburger (menu "Semua Modul", Dasbor, dan submodul yang boleh dilihat); komponen `sheet` sudah ada di Old |

## D. Modul/produk baru — **butuh keputusan bisnis**

| # | Perubahan di New 3 | File New (bukti) | Old | Catatan port |
|---|---|---|---|---|
| 63 | **Modul baru Omnix** (add-on): 6 submodul — Koneksi Toko, Transaksi, Pengiriman & Pickup, Laporan, Saldo & Tagihan (Rp25/trx atau paket Rp350rb/20.000 trx), Pengaturan API; top-up dikonfirmasi Super Admin | `components/app/OmnixViews.tsx` (509), `OmnixOps.tsx` (316), `lib/modules.ts`, `routes/app-admin/addons.tsx`, migrations `0010`–`0012` (`omnix_stores`, `omnix_orders`, `omnix_wallets`, `omnix_wallet_ledger`, `omnix_channel_settings`, `omnix_channel_secrets`) | ✅ **ronde 18** | **7 tabel**. Logika wallet/charge di New = **trigger + 3 fungsi plpgsql** (`omnix_charge_completed_order`, `omnix_request_topup`, `omnix_review_topup`, `omnix_buy_bundle`) → sudah ditulis ulang jadi server fn MySQL transaksional **tanpa trigger** (`src/lib/omnix.functions.ts`, lihat ronde 18) |
| 64 | **Permukaan Qalling standalone**: landing `/qalling`, `/qalling/login`, shell `/qalling/app` (memakai ulang view CRM), workspace aktif pertama; host `qalling.id`/`qalling.net` di-redirect ke `/qalling` | `routes/qalling.index.tsx`, `qalling.login.tsx`, `qalling.app.tsx`, `qalling.app.index.tsx`, `qalling.app.$submoduleId.tsx`, `routes/_site.tsx` | ✅ **ronde 20** | Selesai tanpa menunggu keputusan tunai: host diatur lewat `VITE_QALLING_HOSTS`/reverse proxy (lihat ronde 20) |
| 65 | **Tag produk tenant/invoice** (`xperd` \| `qalling`): filter produk di Tenancy & Invoices, badge, tombol ganti produk | migration `0009` (`tenants.product`, `invoices.product`), `routes/app-admin/tenancy.tsx`, `routes/app-admin/invoices.tsx` | ✅ **ronde 19** | Kolom `product` sudah ada di migration **010**; yang kurang hanya whitelist `PCOLS` + UI (lihat ronde 19) |

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

## Progres Batch 3 — commit `3bf1dbf` … `9b431a6` (2026-09-30)

Semua pekerjaan grup **A** dan **C** sudah di-commit & di-push ke `origin/master`
(`3bf1dbf`, `3da1365`, `609a8c1`, `d3b5148`, `fc21235`, `889c81b`, `58a476c`,
`327e274`, `ec113ee`, `ce87c2f`, `9b431a6`). Ronde 1 memulai dengan fokus
**#36 (pajak per baris + withholding PPh)** dan **#40 (nilai persediaan = moving
average)**, plus **#39 sebagian** (akun 1450) karena dibutuhkan #36.

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
4. Lanjutan 3A sudah **habis**: #47 selesai (ui-states) dan `recordSettlementCashTransaction` selesai. Batch **3C (akses & UI) juga selesai** (#58, #59, #60, #61), dan batch **3B (CRM & Tender) kini selesai** kecuali #55 yang butuh App Meta milik user. Berikutnya batch **3D**: Omnix (#63), Qalling standalone (#64), tag produk tenant/invoice (#65) — ketiganya butuh keputusan bisnis.

### Ronde 34 (2026-10-12) — menutup sisa selisih pasca add-on aktif (paginasi, `#`, dasbor Omnix, tabel Omnix/HR)

Lanjutan metode live-first dari daftar “Sisa selisih setelah add-on aktif” di
Ronde 33. Setiap item dibuktikan dulu lewat dump DOM (`scripts/audit-page-detail.mjs`)
sebelum diubah, supaya tidak ada perbaikan atas dasar artefak alat audit.

| # | Selisih (live vs Old) | Perbaikan di Old |
|---|---|---|
| 1 | `crm/contacts`, `crm/follow-ups`, `crm/targets`: live punya kolom **`#`** | kolom `#` + `pager.start + i + 1` ditambahkan (colSpan ikut naik) |
| 2 | Toolbar paginasi: tombol prev/next live punya `aria-label` **“Previous page/Next page”**, dan live tetap menampilkan “Showing 0-0 of 0” saat data kosong | `Pagination` (ui-states) diberi `aria-label` dan `PaginationBar` **selalu dirender** (early-return `total === 0` dihapus) — berlaku untuk semua tabel, bukan hanya CRM |
| 3 | `omnix` (index modul): live = dasbor **“Omni-channel Dashboard”**, Old = placeholder “Phase 4” | `OmnixDashboard` diporting dari BS New 10 (kicker `OMNIX`, strip saldo + peringatan saldo menipis, 5 KPI: toko terhubung/order berjalan/order selesai/penjualan kotor/bersih setelah fee, kartu “Sales per channel” ber-progress bar + baris “Omnix fees charged”) dan dipasang di rute index modul |
| 4 | `omnix/orders`: live `Date|Channel|Order No.|Buyer|Gross|**Net**|Status|**Omnix fee**` + tombol **“New order”**; Old `…|Gross|**Fee**|Status|` + tombol “Add order” | kolom `Net` ditambah, `Omnix fee` dipindah ke kanan Status, label tombol jadi **“New order”**; sel status ikut aturan live: setelah tertagih/dibatalkan berubah jadi **badge** (tidak bisa diubah lagi) |
| 5 | `omnix/wallet`: live `Date|Type|Note|**Status**|Amount|Balance`, tombol preset **Rp 50.000/100.000/350.000/1.000.000** + **“Top up”** + **“Buy from balance”**; Old urutan berbeda, tanpa preset, label “Submit request”/“Buy bundle” | urutan kolom disamakan, tombol preset top up ditambah, label diselaraskan |
| 6 | `hr/payroll`: header hidup **“Number”** (Old “Run”), tombol **“Run payroll”** (Old “Process payroll”), aksi baris **“Open”** | ketiganya diselaraskan; aksi baris `Open` ditambah di samping ikon hapus (fungsi Old yang tetap dipertahankan) |
| 7 | `hr/tax-bpjs`: live `Employee|NPWP|PTKP / TER|Taxable gross|PPh 21|BPJS employee|BPJS company`, judul **“BPJS & PPh 21 Recap”** | kolom NPWP + Taxable gross ditambah, urutan disamakan, judul diubah, baris total mengikuti kolom baru. Tombol “Print payslips” **tetap** (fitur Old yang tidak ada di live) |
| 8 | `hr` (dasbor) menampilkan periode **“January 2000”** | **bukan bug kode**: ada baris `hr_payroll_runs` periode `2000-01` (`PAY/200001`) sisa fixture e2e `e2e/hr-payroll.spec.ts` yang tidak terhapus karena run sebelumnya terputus. Baris itu dibersihkan dari DB dev; kode default periode dashboard (`new Date()`) sudah benar |
| 9 | `crm/doc-library`: laporan awal menyebut live = tabel, Old = grid kartu | **selisih palsu**: kode Old (`CrmDocLibrary.tsx`) **sudah** memakai tabel yang sama (`# | Document | Category | Number | Valid until | Status | File`) + `PaginationBar`; yang terlihat di dump kemarin adalah *empty state* karena workspace dev belum punya satu dokumen pun. Dibuktikan dengan menyemai fixture 2 dokumen → **header, isi baris, KPI, dan filter kategori identik** dengan live, lalu fixture dihapus. Spec baru `e2e/crm-doc-library.spec.ts` menjaga bukti ini (fixture via SQL, dibersihkan di akhir) |
| 10 | Spec `e2e/accounting-fx-documents.spec.ts` gagal (`dialog` tidak menutup) | **bukan regresi kode**: db dev berisi akun kas/bank `2011 · Test` (buatan uji manual) dengan `gl_account_code = NULL`; karena kode `2011` paling awal, picker memilih opsi **pertama** = akun itu dan submit ditolak guard *“Select a cash/bank account with a GL mapping first”*. Helper `pick()` di spec kini menerima `optionRe` dan memilih akun **yang punya mapping** (`Bank Operasional`), bukan opsi pertama |

#### Bukti verifikasi

- `npx tsc --noEmit` → **0 error**; `npm run build` → **sukses**.
- Dump DOM ulang (`ROUTES="omnix,omnix/orders,omnix/wallet,hr,hr/payroll,hr/tax-bpjs,crm/contacts,crm/targets,crm/follow-ups"`):
  **semua header kini identik** dengan live. Sisa beda hanya **tambahan milik Old**
  (kolom aksi `""`, kolom `Net`, tombol `Print payslips`, tombol hapus) — jadi
  Old = superset, bukan kehilangan fitur.
- `npx playwright test` → **46 lulus / 0 gagal** (45 + spec `crm-doc-library`).
  Ekspektasi spec disesuaikan dengan label baru (`New order`, `Top up`,
  `Run payroll`), dan picker akun kas/bank spec FX tidak lagi bergantung pada
  opsi pertama.

> **Catatan metode:** `scripts/audit-page-detail.mjs` memotong daftar tombol dengan
> `.slice(-18)`, sehingga halaman berdata banyak (mis. `omnix/orders`) tampak
> “tidak punya tombol header”. Jangan simpulkan selisih hanya dari daftar tombol —
> cek teks halaman atau grep labelnya. **Pelajaran kedua:** halaman yang merender
> tabel hanya bila ada data (mis. `crm/doc-library`) akan terbaca “tanpa header”
> saat workspace uji kosong — semai fixture dulu sebelum menyimpulkan ada selisih
> layout, dan buat spec yang mengunci bukti itu.

### Ronde 31 (2026-10-12) — **Audit Trail**, tab Settings, tanda wajib master data & tab **Workspace Access**

Ronde ini menutup selisih yang ditemukan dengan **pola live-first**: setiap
perubahan dibandingkan dengan `https://xperd-one.lovable.app` (kredensial sama,
metode di [`PARITY-METHOD-LIVE-FIRST.md`](PARITY-METHOD-LIVE-FIRST.md)) — bukan
dengan cara membaca kode ekspor Lovable.

| # | Selisih yang ditemukan | Perbaikan di Old |
|---|---|---|
| 1 | New 8/10 menulis jejak audit tiap perubahan data (`audit_logs`); Old tidak punya | `db/migrations/015_audit_trail.sql` — tabel `audit_logs` (workspace, table_name, record_id, action, doc_ref, changed_fields/old_data/new_data JSON, actor_id, actor_email, created_at) + 3 indeks. **Tanpa trigger**: baris ditulis lapisan aplikasi |
| 2 | — (lanjutan) | `src/lib/audit.functions.ts` (18 tabel teraudit, `auditDocRef`, `auditChangedFields` yang mengabaikan `updated_at`, `listAuditLogs` dengan filter tabel/aksi/pencarian/tanggal + paginasi, hanya untuk owner/admin) dan `logAudit()` di `data.functions.ts` yang dipanggil `saveWorkspaceRow`, `deleteWorkspaceRow`, `upsertWorkspaceRows` (snapshot `before` = `SELECT *`) |
| 3 | — (UI) | `src/components/app/AuditTrailView.tsx`: tabel #/Waktu/Pengguna/Aksi/Data/Referensi/Kolom berubah + dialog detail “Kolom / Sebelum / Sesudah”, `data-testid="audit-trail-view"` |
| 4 | Live punya **tab Audit Trail di halaman Settings** | `src/routes/app/w.$workspaceId.settings.tsx` dibungkus `Tabs` (`settings-tab-general`, `settings-tab-audit`) |
| 5 | Live memberi tanda wajib `Code *` pada field read-only hasil otomatis; Old menyembunyikannya (`f.required && !f.readOnly`) | `MasterDataTable.tsx` menampilkan asterisk untuk semua field `required` (ditemukan lewat `audit-dialog-parity` modul master-data: live `Code *` vs Old `Code`) |
| 6 | Live punya **tab `Workspace Access`** di halaman Team (matriks user × workspace); tidak terlihat di `parity-report.md` karena halaman `/team` sudah ✅ | `AccessMatrixPanel.tsx` + server fn `getAccessMatrix`/`setWorkspaceAccess` + tab ketiga di `w.$workspaceId.team.tsx` |

#### Tab Workspace Access — hasil pembandingan langsung dengan live

Dibandingkan dengan membuka halaman lalu mengklik tiap `[role="tab"]` (skrip
sekali pakai, dihapus setelah dipakai):

| | live | Old (sebelum) | Old (sesudah) |
|---|---|---|---|
| Tab | `Users \| Workspace Access \| Role Access` | `Users \| Role Access` | `Users \| Workspace Access \| Role Access` |
| Header tabel | `No \| Pengguna \| <nama workspace…>` | tidak ada | `No \| Pengguna \| <nama workspace…>` |
| Baris pemilik | `Ibrahim` + badge `Pemilik` + sel `Semua akses` | — | idem |
| Sel user biasa | select peran `Tidak ada akses / Admin / Staff / Viewer` | — | idem |

Temuan penting: **label panel itu Bahasa Indonesia walaupun UI sekitarnya
berbahasa Inggris** (`# | User | Joined | Role | Actions`). Karena itu komponen
Old sengaja **tidak** memakai `useI18n` untuk panel ini — parity menuntut salinan
apa adanya. Server fn-nya mengikuti semantik New 10 persis: tidak bisa mengubah
akses sendiri, pemilik tenant (dari `tenants.owner_id`, **bukan**
`workspaces.owner_id`) selalu boleh dan tidak bisa diubah, target harus anggota
perusahaan yang sama, dan peran `owner` tidak bisa diubah dari sini.

#### Verifikasi Ronde 31

- `npx tsc --noEmit` → **0 error**; `npm run build` → **sukses**;
  `npm run migrate` → `015_audit_trail.sql` diterapkan (tabel 12 kolom).
- `audit-dialog-parity.mjs --module` untuk procurement, sales, accounting,
  fixed-asset, tax, reporting → **18 ✅ struktur form sama, 0 ⚠️**.
- Suite e2e **44 lulus / 0 gagal** (42 → 44), termasuk spec baru:
  - `e2e/audit-trail.spec.ts` — buat item master data lewat UI → baris audit
    `INSERT`; ubah lewat UI → baris `UPDATE` + daftar kolom berubah; tab Audit
    Trail menampilkan jejaknya; fixture dibersihkan.
  - `e2e/team-workspace-access.spec.ts` — 3 tab dengan urutan & label seperti
    live; baris pemilik terkunci (`Semua akses`, tanpa select); ubah peran user
    uji `Staff → Viewer` tersimpan di DB dan tetap setelah reload; pilihan
    “Tidak ada akses” mencabut keanggotaan.

### Ronde 33 (2026-10-12) — modul add-on **XPro** diporting apa adanya dari BS New 10

Temuan penting pembuka ronde: **add-on di live DNICORP sudah aktif semua** (dulu
terkunci). Verifikasi langsung ke 40 halaman add-on: `40 AKTIF · 0 terkunci`, jadi
CRM/Slipp HR/Omnix/XPro sekarang **bisa dibandingkan dengan live**, bukan hanya
dengan kode ekspor.

Perbandingan form add-on vs live (skrip `audit-dialog-parity.mjs --module …`):

| Modul | Form “New” |
|---|---|
| CRM (14 submodul) | ✅ 7 sama · 0 beda |
| Slipp HR (7) | ✅ 4 sama · 0 beda |
| Omnix (6) | ✅ `stores` sama; `orders` tombol live **disabled** (saldo wallet Rp 0) |
| **XPro (4)** | ⛔ **belum ada di Old** → diporting di ronde ini |
| Manufacturing (4) | kedua sisi “Phase 4 / Being prepared” ✅ |
| Maintenance | Backup & Restore ada di kedua sisi ✅ |

#### Yang diporting (XPro fase 1 + 2, `XproViews.tsx` + `XproDetail.tsx`)

| Berkas | Isi |
|---|---|
| `db/migrations/016_xpro.sql` *(baru)* | 9 tabel: `prj_projects`, `prj_milestones`, `prj_budget_lines`, `prj_billings`, `prj_members`, `prj_tasks`, `prj_expenses`, `prj_documents`, `prj_progress_reports` + baris katalog add-on `xpro` (Rp750.000/bulan). `COLLATE=utf8mb4_unicode_ci` supaya FK ke `workspaces.id` cocok |
| `src/lib/data.functions.ts` | 9 tabel didaftarkan di **dua** tempat (`WORKSPACE_TABLES` + `COLS`) |
| `src/lib/modules.ts` | modul `xpro` (ikon `Briefcase`, tone violet, `addon: "xpro"`) + submodul `projects`, `milestones`, `budget`, `billing` |
| `src/components/app/XproViews.tsx` *(baru)* | dasbor proyek (KPI kontrak/RAB/ditagih, grafik recharts, kesehatan proyek, daftar tugas) + Projects & Contracts, Milestones & Tasks (bobot %), RAB per kategori, Progress Billing & BAST |
| `src/components/app/XproDetail.tsx` *(baru)* | detail proyek 7 tab: Tasks, Gantt (skala hari/minggu/bulan), Team, Expenses (realisasi vs RAB), Documents (unggah/unduh), Progress reports (cetak LPP), Invoices & payments |
| `src/routes/app/w.$workspaceId.$moduleId.index.tsx`, `…$submoduleId.index.tsx` | dispatch dasbor & layar submodul XPro |

Perilaku yang dipertahankan **sama persis** dengan referensi:

- progres fisik proyek = Σ(bobot × progres) / Σ(bobot);
- BAST hanya bisa *Approve* bila sudah ada **laporan progres disetujui**;
- **“Issue AR” membuat draft AR Invoice sebesar nilai BAST neto retensi, TANPA
  jurnal** (posting terjadi saat invoice di-submit di Sales) — sesuai permintaan
  pemilik produk: “tiru New 10 seperti apa adanya”;
- nilai uang (kontrak, RAB, tagihan) hanya tampil untuk owner/admin; peran lain
  hanya melihat progres & tugasnya sendiri.

Satu-satunya penyesuaian lapisan data: Supabase → server fn MySQL Old
(`listWorkspaceRows`/`saveWorkspaceRow`/`deleteWorkspaceRow`) dan Supabase Storage →
`uploadWorkspaceFile` + `/api/workspace-files`.

Verifikasi: `tsc` 0 error; `npm run build` sukses; `npm run migrate` menerapkan
`016_xpro.sql` (9 tabel + katalog add-on); perbandingan DOM live ↔ Old untuk
`xpro`, `xpro/projects|milestones|budget|billing` **header tabel & label sama**;
spec baru `e2e/xpro.spec.ts` membuktikan BAST 20% × Rp100.000.000 − retensi 5% =
**Rp19.000.000** jadi draft AR (1 baris) **tanpa entri jurnal**, plus 7 tab detail
proyek ada. Suite e2e **45 lulus / 0 gagal** (44 + spec XPro). Add-on XPro
diaktifkan untuk tenant **dev** lewat fixture (`tenant_addons`, catatan
`dev fixture XPro`) — bukan bagian migrasi, karena add-on adalah langganan
berbayar.

> **Pelajaran dari spec Omnix:** harga add-on XPro (Rp **750.000**) membuat locator
> lama di `e2e/omnix.spec.ts` salah sasaran — filternya hanya `hasText: /50[.\s]?000/`
> sehingga baris **katalog** “XPro Rp 750.000” ikut cocok (substring `50.000`) dan
> `.first()` mengambil baris yang tidak punya tombol *Setujui* (spec lalu timeout).
> Perbaikannya: saring juga `has: button “Setujui”`. Pelajaran umum — **jangan
> memfilter baris hanya dengan pola nominal**; ikutkan kontrol yang khas baris itu.

#### Sisa selisih setelah add-on aktif (bahan Ronde 34)

Laporan parity setelah rekam ulang kedua sisi: **74 ✅ · 42 ⚠️ · 0 ❌ · 0 🎫**
(add-on tidak lagi terkunci). Dari 42 ⚠️, yang **bukan** celah tetap sama seperti
Ronde 31/32 (live kosong → `empty`, logo, launcher, `team`, nomor dokumen, dst.),
sedangkan kandidat celah **nyata** yang baru terbaca karena add-on sudah aktif:

| Halaman | Temuan | Tindakan |
|---|---|---|
| `crm` (index modul) | live menampilkan **dasbor CRM nyata**; Old masih placeholder “Phase 4” | ✅ diperbaiki di ronde ini: rute index modul kini memakai `CrmDashboardView` (komponen yang sudah ada, dipakai submodul `crm/dashboard`) |
| `omnix` (index modul) | live punya dasbor “Omni-channel Dashboard” (saldo, order, gross sales, fee); Old masih placeholder “Phase 4” | ⛔ perlu port dasbor Omnix dari BS New 10 |
| `crm/leads`, `contacts`, `targets`, `templates`, `follow-ups`, `campaigns`, `doc-library`, `tenders`, `broadcast` | live memakai **paginasi + kolom `#`** (dan sebagian filter combobox) yang belum ada di Old | perlu disamakan setelah dibuktikan dengan dump DOM — **sebagian besar ditutup di Ronde 34** (`contacts`/`targets`/`follow-ups` dapat `#` + paginasi; `doc-library` ternyata **sudah** tabel = selisih palsu) |
| `omnix/orders` | live punya kolom **Net / Omnix fee** dan tombol “New order” (disabled saat saldo 0) | perlu disamakan |
| `omnix/wallet` | live punya tombol preset **Top up Rp 50.000…Rp 1.000.000** + “Buy from balance” | perlu disamakan |
| `hr/payroll`, `hr/tax-bpjs` | judul live “Payroll” / “BPJS & PPh 21 Recap”; Old “Payroll & Payslips” / “BPJS & PPh 21” | perlu disamakan |
| `hr` (dasbor) | Old menampilkan periode **“January 2000”** padahal live “September 2026” | periksa default periode dasbor payroll (indikasi bug, bukan sekadar data) |

### Ronde 32 (2026-10-12) — parity **aksi per baris & halaman detail dokumen** vs live

Lanjutan metode live-first (Ronde 31): setelah UI daftar + form “New” sama,
lapisan berikutnya diuji — **apa yang terjadi saat aksi baris diklik** (detail,
ubah, cetak). Alat baru: `scripts/audit-row-actions.mjs` (aman untuk live: tombol
destruktif tidak pernah diklik; baris empty-state dikecualikan; id & nomor dokumen
dinormalisasi; beda yang sah karena status ditandai ℹ️ bukan ⚠️). Rincian aturan →
[`PARITY-METHOD-LIVE-FIRST.md`](PARITY-METHOD-LIVE-FIRST.md) §11.

| Hasil | Halaman |
|---|---|
| ✅ aksi baris + dialog/halaman detail + tombol + tampilan cetak sama | `master-data/items`, `master-data/customers`, `sales/sales-orders`, `sales/delivery-orders`, `sales/ar-invoices`, `procurement/purchase-orders`, `procurement/goods-receipts`, `accounting/journals`, `inventory/stock-in|stock-out|transfers|stock-opname`, `fixed-asset/assets`, `cash-bank/cash-in` |
| ℹ️ sama (beda hanya karena status dokumen) | `procurement/purchase-requests` — baris dev Old masih `draft`, jadi `Edit draft`/`Delete` tampil; di BS New 10 pun dua tombol itu hanya untuk `status === "draft"` |
| 🎫 belum bisa dibanding (salah satu sisi kosong / add-on terkunci) | `sales/quotations`, `sales/pos`, `crm/leads`, `hr/employees`, `cash-bank/cash-out` |

**Celah nyata yang ditemukan: tidak ada** pada lapisan ini (0 ⚠️). Agar halaman
yang kosong di dev tetap bisa dibanding, dokumen dev disalin sementara menjadi
jenis/status yang sama dengan live (`reference = 'PARITY-TEMP'`), dibandingkan,
lalu dihapus lagi — data dev sudah kembali persis seperti semula (28 quotation,
1 sales order, 1 delivery order, 1 purchase request).

Verifikasi: `tsc` 0 error (tidak ada perubahan kode aplikasi di ronde ini); bukti
mentah `audit/row-actions-parity.json`.

### Ronde 31 (2026-10-12) — **Audit Trail + parity live-first** (`xperd-one.lovable.app`)

Ronde ini memakai cara kerja baru yang diminta pemilik produk: **setiap modul
dibandingkan dengan aplikasi live (UI *dan* behaviour, kredensial sama)**, bukan
dengan membayangkan kode ekspor Lovable. Metodenya didokumentasikan terpisah di
[`PARITY-METHOD-LIVE-FIRST.md`](PARITY-METHOD-LIVE-FIRST.md).

#### 1. Fitur baru: Audit Trail (dari BS New 8/10)

| Berkas | Isi |
|---|---|
| `db/migrations/015_audit_trail.sql` | tabel `audit_logs` (workspace, tabel, record, aksi, `doc_ref`, `changed_fields`/`old_data`/`new_data` JSON, aktor, waktu) + 3 indeks + FK. **Tanpa trigger** — barisnya ditulis lapisan aplikasi (aturan repo: logika uang/status di `transaction()`, bukan di DB) |
| `src/lib/audit.functions.ts` *(baru)* | `AUDITED_TABLES` (18 tabel), `REF_COLUMNS`/`auditDocRef()` (referensi dokumen yang dibaca manusia), `auditChangedFields()` (mengabaikan `updated_at`), `listAuditLogs` (hanya owner/admin; filter tabel/aksi/pencarian/rentang tanggal + paginasi) |
| `src/lib/data.functions.ts` | `logAudit()` dipanggil dari `saveWorkspaceRow` (INSERT/UPDATE dengan snapshot `before`), `deleteWorkspaceRow`, dan `upsertWorkspaceRows` |
| `src/components/app/AuditTrailView.tsx` *(baru)* | tab Audit Trail: pencarian, filter, tabel (Waktu/Pengguna/Aksi/Data/Referensi/Kolom berubah), dialog detail **Field / Sebelum / Sesudah** |
| `src/routes/app/w.$workspaceId.settings.tsx` | halaman Settings kini bertab: **General \| Audit Trail** (parity live) |
| `e2e/audit-trail.spec.ts` *(baru)* | buat item → tercatat `INSERT`; ubah item → tercatat `UPDATE` + daftar kolom berubah; dialog detail memuat nilai sebelum/sesudah; fixture dibersihkan lewat SQL |

#### 2. Fitur baru: tab **Workspace Access** (matriks user × workspace)

Live punya 3 tab di halaman Team & Access: `Users | Workspace Access | Role Access`.
Tab kedua (matriks siapa boleh membuka workspace mana) **tidak ada** di Old — dan
tidak akan pernah terlihat di `parity-report.md` karena halaman `/team` sudah ✅.

| Berkas | Isi |
|---|---|
| `src/lib/team.functions.ts` | `getAccessMatrix` (tenant + workspace + anggota + `manageable`) dan `setWorkspaceAccess` (`admin`/`staff`/`viewer`/`none`). Semantik persis BS New 10: tidak boleh mengubah akses sendiri; pemilik tenant selalu boleh; selain itu harus owner/admin di workspace itu; target harus bagian perusahaan; peran `owner` tidak bisa diubah dari sini; `none` = hapus keanggotaan |
| `src/components/app/AccessMatrixPanel.tsx` *(baru)* | kartu “Matriks Akses Workspace” + pencarian + tabel user × workspace: badge `Pemilik` (Crown) & `Semua akses` untuk pemilik, badge peran untuk sel terkunci, `Select` peran untuk sel yang boleh diubah |
| `src/routes/app/w.$workspaceId.team.tsx` | tab ketiga `workspace-access` (urutan sama dengan live) + `TabsList` 3 kolom |
| `e2e/team-workspace-access.spec.ts` *(baru)* | urutan tab, header tabel, baris pemilik terkunci, ubah peran via UI → tersimpan di DB, `Tidak ada akses` menghapus keanggotaan (fixture ditambah/dihapus lewat SQL agar idempoten) |

**Temuan penting (jangan “dirapikan”):** label panel ini di live **Bahasa Indonesia
hardcoded** (`No | Pengguna | Pemilik | Semua akses | Tidak ada akses`) walau tab
lain di halaman yang sama berbahasa Inggris. Komponen Old sengaja **tidak** memakai
`useI18n` supaya sama persis dengan live.

#### 3. Perbaikan parity hasil perbandingan DOM (bukan dugaan)

| Halaman | Temuan dari live | Perbaikan |
|---|---|---|
| `master-data/items`, `master-data/exchange-rates` | label field wajib yang read-only tetap `Code *` (`required=true, readonly=true`) | `MasterDataTable.tsx`: tanda `*` mengikuti `required` saja (dulu `required && !readOnly`) |
| `accounting/period-closing` | judul “Period lock”, deskripsi “Once a month is locked…”, opsi **“Hard lock (final)”**, label form **Month / Lock type**, badge **“Hard lock”**, aksi baris **“Reopen”** (teks), dan tabel riwayat **selalu tampil** dengan empty state “No locked period yet.” | semua disamakan; tabel kini selalu dirender (dulu hanya bila ada kunci) |
| `cash-bank/cash-in`, `cash-out`, `transfers` | kolom aksi **tanpa judul** (`<TableHead className="w-28" />`) | header “Actions” dihapus (perilaku tombol tidak berubah) |

#### 4. Hasil perbandingan per modul (Ronde 30–31)

- Form/dialog (`scripts/audit-dialog-parity.mjs`): master-data **10/10 sama**,
  procurement/sales/cash-bank/inventory sama, accounting/fixed-asset/tax/reporting
  **18 ✅ 0 ⚠️**.
- Halaman (`scripts/audit-parity.mjs report`): **116 halaman** — 63 ✅ · 17 ⚠️ ·
  0 ❌ · 36 🎫 add-on. Setelah Ronde 31, sisa ⚠️ yang tersisa adalah **bukan celah**:
  beda **data** (live kosong: POS/quotations/inventory dashboard/settings logo/
  launcher trial) dan artefak pengumpul sidik jari (tombol `aria-label` vs `title`,
  `Dismiss` bawaan Lovable, nomor dokumen otomatis). Dua pengecualian yang nyata
  (period-closing & kolom aksi kas/bank) sudah diperbaiki di §3.

Verifikasi: `npx tsc --noEmit` **0 error**, `npm run build` sukses, `npm run migrate`
(015 diterapkan), suite e2e **44 lulus / 0 gagal** (40 sebelumnya + audit-trail +
workspace-access + …).

### Ronde 29 (2026-10-08) — **multi-currency & revaluasi kurs** dari BS New 8

Keputusan pemilik produk: *“pokoknya samakan dengan Xperd One Business Suite New 8
yang terbaru”* → seluruh rantai fitur valas New 8 diporting apa adanya (bukan
dibuat aturan baru). Ini melengkapi sisa terakhir selisih modul Akuntansi
(Ronde 28) dan master data.

| Bagian New 8 | Status di Old |
|---|---|
| `db/migrations/0018_multi_currency_master.sql` — tabel `md_currencies`, `md_exchange_rates` | ✅ `db/migrations/014_multi_currency.sql` (MySQL; idempoten `CREATE TABLE IF NOT EXISTS` + `WHERE NOT EXISTS`) |
| `0019_document_exchange_rate.sql` — `exchange_rate` pada dokumen penjualan & pembelian | ✅ kolom `DECIMAL(18,6) DEFAULT 1` di `sls_documents`/`prc_documents` |
| `lib/currency.ts` — `fetchCurrencies`, `fetchBaseCurrency`, `getExchangeRate`, `toBaseAmount`, `formatCurrency` | ✅ diporting; data lewat server fn (`listWorkspaceRows`), bukan Supabase |
| `components/app/CurrencyFields.tsx` (mata uang + kurs, auto-isi dari Master Kurs, boleh ditimpa) | ✅ diporting + `data-testid` (`doc-currency`, `doc-exchange-rate`) |
| `CurrencyFields` di form Sales & Procurement | ✅ Sales (semua kecuali Delivery Order) & Procurement (semua) |
| `postJournal()` mengonversi baris dokumen ke mata uang dasar (`toBaseLines`) | ✅ di `lib/journal.ts` (`toBaseLines`, pembulatan sen ditempel ke baris terbesar) |
| Selisih kurs **realisasi** saat pelunasan (`postPaymentJournal`/`postReceiptJournal` memakai kurs invoice untuk membersihkan hutang/piutang, kurs tanggal bayar untuk kas) | ✅ idem, plus opsi `invoiceRate` |
| `lib/fx-revaluation.ts` + `FxRevaluationView.tsx` + submodule `accounting/fx-revaluation` | ✅ server fn `previewFxRevaluation`/`postFxRevaluation` (satu transaksi MySQL: penjagaan periode, duplikat, akun COA, jurnal revaluasi **+ jurnal balik otomatis** keesokan hari) |
| Submodule master `currencies` & `exchange-rates` (+ field tipe `date` di master data) | ✅ `modules.ts`, `master-data.ts`, dukungan field tanggal di `MasterDataTable.tsx` |
| COA `4900/4910` (laba) & `6900/6910` (rugi) selisih kurs | ✅ `DEFAULT_COA` + backfill migrasi 014 |
| `subledger.ts`: nilai buku = total valas × kurs dokumen + label `USD 1.000,00 @ 15.850` | ✅ diporting (kartu AR/AP & aging) |
| `doc-print.ts`: `fxRows` (kurs + ekuivalen mata uang dasar) | ✅ diporting |
| `cashbank.ts`: rekening valas mencatat saldonya dalam mata uang rekening (`foreignAmount`/`currency`) | ✅ `recordSettlementCashTransaction` + dikirim dari form Sales/Procurement |

#### Aturan uang yang dipakai (persis New 8, semua di level aplikasi — tanpa trigger)

```text
Dokumen valas: total dokumen tetap dalam mata uang dokumen.
  Jurnal = setiap baris × kurs dokumen (toBaseLines), pembulatan sen ke baris terbesar.
Pelunasan valas (realisasi):
  payable/piutang dibersihkan = jumlah valas × kurs INVOICE
  kas masuk/keluar            = jumlah valas × kurs tanggal bayar
  selisih > 0 → Kr 4900 Laba Selisih Kurs   |  selisih < 0 → Dr 6900 Rugi Selisih Kurs
Revaluasi kurs akhir periode (kurs penutupan; fallback kurs transaksi bila kosong):
  piutang & kas/bank valas : diff = (nilai valas × kurs penutupan) − nilai buku
  hutang valas             : kenaikan nilai bergerak di sisi KREDIT
  laba belum terealisasi → Kr 4910 ; rugi belum terealisasi → Dr 6910
  jurnal revaluasi (JV/FXR/<YYYYMM>) + jurnal BALIK otomatis keesokan hari
  (JV/FXR-REV/<YYYYMM>) dibuat dalam satu transaksi yang sama.
  Ditolak bila: periode (revaluasi/balik) terkunci, periode sudah pernah diposting,
  tidak ada selisih, atau akun 4910/6910 belum ada di COA.
```

#### Verifikasi

- `npx tsc --noEmit` → **0 error**; `npm run build` → **sukses**; `npm run migrate` →
  migrasi `014_multi_currency.sql` diterapkan (9 mata uang + 4 akun FX di-backfill
  untuk workspace lama; kolom kurs ada di kedua tabel dokumen).
- Suite e2e **41 lulus / 0 gagal** (39 sebelumnya + 2 spec valas baru).
- **Uji uang nyata** (DB dev; angka harapan dihitung ulang dengan SQL):
  - `e2e/accounting-fx-documents.spec.ts` — AR Invoice **1.000 USD @ 15.000** (kurs
    terisi otomatis dari Master Kurs) → jurnal `Dr 1200 15.000.000 / Cr 4000 15.000.000`
    (mata uang dasar); Receipt **1.000 USD @ 15.500** → `Dr 1010 15.500.000 /
    Cr 1200 15.000.000 / Cr 4900 500.000` (selisih kurs realisasi).
  - `e2e/accounting-fx-revaluation.spec.ts` — piutang valas 1.000 USD (kurs buku
    15.000, kurs penutupan 16.000) → selisih 1.000.000; posting menghasilkan
    `Dr 1200 1.000.000 / Cr 4910 1.000.000` plus jurnal balik **2000-10-01**
    (kebalikan) sehingga saldo 1200 kembali ke 15.000.000 dan 4910 kembali 0;
    periode yang sudah diposting tidak bisa diposting ulang.
  - Semua fixture uji dibersihkan lagi dari DB dev.

**Catatan:** migrasi repo ini dijalankan sekali oleh runner (`db_apply_log`), jadi
`ALTER TABLE … ADD COLUMN` tidak perlu penjaga `IF NOT EXISTS` (sama seperti
migrasi 007/010/012 yang sudah ada).

### Ronde 30 (2026-10-12) — perbaikan penomoran transaksi kas/bank dari **BS New 10**

`Xperd One Business Suite New 10` (=== New 8 + XPro fase 2) juga memperbaiki satu
bug di kas/bank: nomor transaksi dihitung dari **jumlah baris**
(`count(trx_type) + 1`), sehingga jurnal koreksi/storno ikut terhitung dan — lebih
serius — **menghapus satu baris membuat nomor berikutnya dipakai ulang** sehingga
bentrok dengan nomor yang masih ada (`trx_no` juga kunci idempotensi
`recordSettlementCashTransaction`). New 10 mengambil **nomor tertinggi** bulan
berjalan lalu +1.

| Berkas | Perubahan |
|---|---|
| `src/lib/cashbank.ts` | **`peekNextTrxNumber(workspaceId, prefix)`** — baca transaksi bulan berjalan lewat `listWorkspaceRows`, ambil sekuens tertinggi, kembalikan `prefix/YYYYMM/NNNN` berikutnya |
| `src/components/app/CashBankViews.tsx` | pembuatan transaksi memakai `peekNextTrxNumber` (bukan `countWorkspaceRows` + `nextTrxNumber`) |
| `e2e/cash-bank-trx-number.spec.ts` *(baru)* | regresi: buat 3 kas masuk → hapus yang tengah → buat 1 lagi → nomor baru = tertinggi + 1, tidak ada nomor ganda (fixture dibersihkan) |

Verifikasi: `tsc` 0 error, `build` sukses, spec baru lulus. Analisis lengkap New 10
vs Old ada di [`PARITY-BS-NEW10-VS-OLD.md`](PARITY-BS-NEW10-VS-OLD.md).

### Ronde 28 (2026-10-08) — modul **Akuntansi**: tutup buku PPN (SPT Masa PPN) dari **BS New 8**

Fokus permintaan pemilik produk: *samakan UI dan behaviour modul Akuntansi dengan
BS New 8.* Perbandingan dilakukan berkas-per-berkas (`AccountingViews.tsx`,
`lib/journal.ts`, `lib/accounting.ts`, `lib/subledger.ts`, `lib/financial-statement.ts`,
`lib/modules.ts`) antara Old dan `Xperd One Business Suite New 8`.

**Hasil perbandingan:** hanya tiga hal yang berbeda, dua sudah ditutup di ronde ini:

| Selisih New 8 | Status |
|---|---|
| **`VatClosingPanel` + `previewVatClosing`/`postVatClosing`** (baru) | ✅ **diporting** — panel di layar Tutup Periode + aturan uang di server (lihat di bawah) |
| **Orientasi cetak laporan Arus Kas & Perubahan Ekuitas**: `orientation: "landscape"` **dihapus** oleh New 8 (jadi portrait/default) | ✅ **diporting** — dua baris `orientation` dihapus dari `AccountingViews.tsx` (Laba Rugi, Neraca, Buku Besar, Neraca Saldo tetap landscape) |
| **`fx-revaluation`** (submodule Akuntansi baru) + master `currencies`/`exchange-rates` + kolom mata uang di dokumen/subledger | 🔜 **belum** — satu kesatuan fitur multi-currency; butuh keputusan pemilik produk (lihat catatan) |

**Yang ternyata sudah setara** (tidak perlu diubah): `PeriodLockPanel` New 8 ≡
panel kunci periode Old (#46 — field Bulan/Jenis/Catatan + tabel kunci yang sama;
New 8 hanya memindahkannya jadi komponen sendiri), `StatementActions` +
`useStatementEntity` (#48) ≡ `ReportActions` (dan `ReportActions` di New 8 **tidak
dipakai sama sekali** — dead code), `lib/financial-statement.ts` **identik**
100%, penjaga periode terkunci di server (`postJournalEntry` Old ≡
`assertPeriodOpen` New 8), serta `ensureAccounts`/`postSystemJournal` New 8 yang
padanannya sudah ada di Old (COA di-seed `provisioning.server.ts`; penulisan
jurnal per modul).

#### Aturan uang tutup PPN (diporting apa adanya dari New 8)

Semua di **level aplikasi dalam satu transaksi MySQL** (`transaction()` di
`src/lib/ledger.functions.ts`) — **tanpa trigger/stored function**, sesuai aturan
repo:

```text
periode = YYYY-MM, tanggal tutup = hari terakhir bulan itu
vatIn   = max(0,  saldo 1400 PPN Masukan   s.d. tanggal tutup)   # debit − kredit
vatOut  = max(0, −saldo 2100 PPN Keluaran  s.d. tanggal tutup)
carried = max(0,  saldo 1410 PPN Lebih Bayar s.d. tanggal tutup)  # kompensasi bulan lalu
net     = vatOut − vatIn − carried

jurnal (entry_no JV/PPN-<periode>, source_type vat_closing, is_auto=1):
  Dr 2100 PPN Keluaran        vatOut
  Kr 1400 PPN Masukan         vatIn
  Kr 1410 PPN Lebih Bayar     carried
  net > 0  → Kr 2110 Hutang PPN        net          (kurang bayar)
  net < 0  → Dr 1410 PPN Lebih Bayar   −net         (lebih bayar, dikompensasi)
```

Penjagaan: periode **terkunci (soft/hard)** ditolak (`SELECT … FOR UPDATE` pada
`acc_period_locks`), satu periode hanya boleh ditutup **sekali** (`alreadyClosed`),
tidak ada saldo PPN → ditolak, dan **keempat akun harus ada di COA workspace**
kalau tidak → pesan jelas (bukan posting ke akun kosong).

#### File yang berubah

| File | Isi |
|---|---|
| `src/lib/ledger.functions.ts` | server fn baru **`previewVatClosing`** (hitung 1400/2100/1410 + deteksi sudah ditutup) & **`postVatClosing`** (satu transaksi: cek kunci, cek duplikat, cek akun, tulis entri + baris), plus `VAT_CLOSING_ACCOUNTS`, `lastDayOfPeriod()`, tipe `VatClosingPreview` |
| `src/lib/journal.ts` | akun `vatOverpaid` (1410) & `vatPayable` (2110); wrapper klien `previewVatClosing()` / `postVatClosing()` + re-export tipe |
| `src/components/app/AccountingViews.tsx` | komponen **`VatClosingPanel`** di layar Tutup Periode (pemilih bulan, 4 kartu angka, tombol *Posting tutup PPN* → *Sudah ditutup*), `data-testid` panel VAT & panel kunci periode; 2 × `orientation: "landscape"` dihapus (parity cetak) |
| `e2e/accounting-vat-closing.spec.ts` *(baru)* | spec uang: fixture jurnal PPN di MySQL dev + UI, harapan dihitung ulang dari SQL, 3 skenario (kurang bayar / lebih bayar / kompensasi lebih bayar lama) + 2 penjagaan (tanpa saldo, periode terkunci), membersihkan dirinya sendiri |

#### Verifikasi

- `npx tsc --noEmit` → **0 error**; `npm run build` → **sukses**.
- Suite e2e **39 lulus / 0 gagal** (38 sebelumnya + spec tutup PPN).
- **Uji uang nyata** (lewat UI, DB dev, angka harapan dihitung independen dengan SQL):
  - kurang bayar 550.000 → jurnal `Dr 2100 1.650.000 / Kr 1400 1.100.000 / Kr 2110 550.000` (balance), saldo 1400 & 2100 jadi **0**, 2110 = −550.000;
  - lebih bayar 1.000.000 → `Dr 2100 1.000.000 / Kr 1400 2.000.000 / Dr 1410 1.000.000`, saldo 1410 = +1.000.000;
  - kompensasi bulan berikutnya → `Dr 2100 500.000 / Kr 1400 200.000 / Kr 1410 1.000.000 (kompensasi) / Dr 1410 700.000`, saldo 1410 tinggal 700.000;
  - periode terkunci → posting ditolak & **tidak ada** jurnal yang terbentuk; tutup dua kali → tombol mati + tetap hanya satu jurnal per periode.
  - Semua fixture uji dihapus kembali dari DB dev (9 jurnal).

**Belum diporting (butuh keputusan pemilik produk): multi-currency + revaluasi
kurs (`fx-revaluation`).** Ini bukan satu panel, melainkan satu rangkaian:
master `currencies` & `exchange-rates`, kolom mata uang/kurs/`foreign_amount` pada
dokumen (`sls_documents`, `prc_documents`) dan subledger, `lib/currency.ts`,
`CurrencyFields.tsx`, `lib/fx-revaluation.ts`, `FxRevaluationView.tsx`, serta
migration `0018`/`0019` New 8. Yang harus diputuskan lebih dulu: **sumber kurs**
(manual/API), **akun selisih kurs (laba/rugi)**, dan **periode revaluasi** —
menyentuh perhitungan jurnal sehingga wajib disetujui pemilik produk
(`DEVELOPMENT_GUIDE.md` §2).

### Ronde 26 (2026-10-01) — update roles/teams dari **BS New 4**

Versi baru (`Xperd One Business Suite New 4`) memuat perubahan di area peran/tim.
Perbandingan folder New 3 → New 4 (migrasi `drizzle/0016`–`0017`, `app-context`,
`team.tsx`, `w.$workspaceId.index.tsx`, `journal.ts`, `ProcurementTable.tsx`) lalu
dipetakan ke Old:

| Update New 4 | Status di Old |
|---|---|
| **Halaman Team hanya untuk owner/admin** — staff/viewer melihat layar “Access restricted” | ✅ **diporting**: penjaga di `src/routes/app/w.$workspaceId.team.tsx` memakai `workspaceRole`/`accessLoading` dari app context |
| **Kartu utilitas launcher** (Team, Settings, Billing, Backup) disembunyikan untuk non-manager | ✅ **diporting**: `LAUNCHER_UTILITIES.filter(() => isManager)` di `src/routes/app/w.$workspaceId.index.tsx` |
| **Anggota yang diundang tidak memiliki tenant** → tenant diambil dari workspace tempat ia menjadi anggota (sebelumnya `tenant = null` sehingga batas paket/add-on salah) | ✅ **sudah setara**: `getAppShellData` Old sejak awal menyeleksi tenant `owner_id = ? OR EXISTS (workspace_members …)`, jadi fix New 4 tidak perlu apa-apa lagi |
| **RLS `0016`** (anggota tenant boleh membaca baris tenant) & **`0017`** (rekan satu workspace saling boleh membaca profil) | ✅ **sudah setara secara aturan**: Old tidak memakai RLS; pembacaan lewat server fn — `getAppShellData` (tenant) dan `listProfilesByIds` (profil, cukup keanggotaan workspace, bukan hanya admin) |
| `__root.tsx` (`ErrorComponentProps`), versi `@tanstack/*`, `supabase/types.ts` | ⏭️ tidak relevan untuk Old (berkas generated/versi router) |
| **`journal.ts` + `ProcurementTable.tsx`**: PPh 21/23 pada AP Invoice kini diposting ke akun hutang **per jenis pajak** (`md_taxes.account_code`, nama “Hutang PPh 23”) alih-alih satu akun `whtPayable` global | 🔜 **belum diporting** (perubahan akuntansi terpisah) — lihat catatan di bawah |

**Verifikasi:** `tsc` 0 error, `npm run build` sukses, suite e2e **38 lulus /
0 gagal**. Spec `team-role-enforcement` diperluas: user `viewer` tidak melihat
kartu menu `/team`, `/settings`, `/billing`, `/maintenance` dan halaman
`/app/w/<ws>/team` menampilkan “Access restricted”, sementara owner/admin tetap
bisa mengelola tim & mengubah matriks izin.

**Belum diporting (dilaporkan, menunggu keputusan):** pemisahan akun hutang PPh
per jenis pajak pada AP Invoice (`journal.ts` + `ProcurementTable.tsx` New 4).
Old masih mengkredit satu akun `2200 Hutang Pajak` untuk seluruh PPh pada AP
Invoice; data `md_taxes.account_code` sudah tersedia sehingga perubahan ini bisa
diporting menyusul (butuh verifikasi jurnal + tes).

### Ronde 25 (2026-09-30) — menyamakan halaman Team & Access dengan versi Lovable

Pertanyaan pemilik produk: “halaman `/app/w/<ws>/team` sudah sama seperti di
xperd-one-lovable?” Jawabannya **belum sepenuhnya**. Perbandingan berkas
(`diff` team.tsx Old vs New 3) menemukan dua celah yang lalu ditutup:

| Celah di Old | Penutup |
|---|---|
| Tidak ada cara memberi akses ke **user tenant yang sudah ada** (hanya bisa membuat akun baru) | Server fn baru di `src/lib/team.functions.ts`: **`listTenantUsers`** (user tenant + keanggotaan tiap workspace) & **`addExistingUserToWorkspace`** (validasi user memang milik tenant yang sama, lalu `INSERT … ON DUPLICATE KEY UPDATE role`), keduanya berpenjaga owner/admin |
| Bentuk halaman berbeda: Old memakai kartu inline + daftar kartu anggota, New 3 memakai dialog + tabel | `src/routes/app/w.$workspaceId.team.tsx` diselaraskan: tautan **“Module launcher”**, tombol **Give access** & **Create user** di header kartu “Workspace users”, daftar anggota sebagai **tabel** (#, User, Joined, Role, Actions) + skeleton + paginasi, serta dialog **Create user / Give workspace access / Edit user**, dan meta `head()` halaman |

**Verifikasi fitur “Give access” end-to-end** (dengan fixture sementara yang
dihapus lagi setelah uji): dibuat workspace kedua + satu user tenant di
dalamnya, lalu dari workspace demo admin membuka *Give access* → dropdown
menampilkan user tersebut → *Grant access* → toast sukses dan user muncul di
tabel anggota; dibuktikan juga lewat DB (`workspace_members` berisi user itu di
kedua workspace) sebelum fixture dibersihkan.

**Layout & UI kini juga disamakan** (bukan hanya fitur): wrapper halaman memakai
`mx-auto max-w-5xl px-4 py-8 sm:px-5 sm:py-10` seperti New 3 — sebelumnya halaman
Team **tidak punya padding sama sekali** sehingga isinya menempel ke tepi layar —
plus jarak `mt-3` pada blok judul, `Tabs` `mt-6`, `TabsList`
`grid w-full grid-cols-2 sm:w-fit`, dan `TabsContent` `pt-4`. Hasilnya diverifikasi
dengan tangkapan layar sungguhan (tab Users: tautan *Module launcher* → judul →
tab → kartu “Workspace users” dengan tombol *Give access*/*Create user*, kotak
cari, tabel `#/User/Joined/Role/Actions` + paginasi; tab Role Access: akordeon per
modul; dialog *Create user* & *Give workspace access*) dan pengukuran DOM
(`max-width: 1024px`, padding `40px 20px`, lebar tabel 982px).

**Perbedaan yang tersisa memang disengaja** (adaptasi arsitektur, bukan fitur
yang hilang):

- Old memakai server fn MySQL (`listTenantUsers`, `addExistingUserToWorkspace`,
  `getWorkspaceAccess`) alih-alih Supabase admin client; `getWorkspaceAccess`
  sendiri tidak ada di New 3 karena di sana izin dibaca langsung dari klien.
- Snapshot New 3 (`Xperd One Business Suite New 3`) dipakai sebagai acuan; repo
  itu tidak dijalankan lagi, jadi perbandingan dilakukan pada kode.

**Verifikasi:** `tsc` 0 error, `npm run build` sukses, suite e2e **38 lulus /
0 gagal**. Kedua spec Team (`team-roles`, `team-role-enforcement`) diperbarui ke
UI baru (dialog + tabel) dan tetap hijau.

### Ronde 24 (2026-09-30) — perbaikan "menu Team & Roles tidak ke-update"

Laporan pengguna: halaman **Team & Access** tidak pernah menampilkan/menyimpan
perubahan peran, sehingga menu tidak ikut berubah. Ditelusuri dengan menjalankan
aplikasi sungguhan (bukan membaca kode): panel **Role Access** berhenti di
`Loading…` dan konsol browser menampilkan
`Error: Unknown column 'code' in 'order clause'`.

**Akar masalah.** Lapisan data generik (`listWorkspaceRows`) memakai
`ORDER BY \`code\`` sebagai default, padahal **31 dari 88 tabel** di whitelist
`COLS` tidak punya kolom `code` (`workspace_role_access`, `cb_transactions`,
`sls_documents`, `crm_scheduled_posts`, `omnix_stores`, …). Untuk tabel seperti
itu query selalu gagal → daftar/panel kosong atau berhenti di state loading.
Ini juga menjelaskan mengapa izin yang tersimpan tidak pernah terlihat.

| File | Perubahan |
|---|---|
| `src/lib/data.functions.ts` | Kolom urut default kini dipilih dari kolom yang **benar-benar ada**: `orderBy` eksplisit → `code` → `created_at` → `id`. Semua pemanggil (termasuk yang belum punya `orderBy`) langsung ikut aman |
| `src/routes/app/w.$workspaceId.team.tsx` | `orderBy: "created_at"` eksplisit pada pemuatan matriks; tambahan `data-testid` per modul (`role-access-module-<id>`) dan per baris izin (`role-access-line-<key>`) + `aria-label` pada tiap checkbox (`<key>:<role>:view|edit`) |
| `src/components/ui/checkbox.tsx`, `switch.tsx` | **Bug ARIA**: nilai TINYINT MySQL (1/0) diteruskan mentah ke Radix sehingga `aria-checked="1"`/`"0"` — tidak valid, dibaca sebagai unchecked oleh pembaca layar & alat uji. Kini dinormalisasi ke boolean (nilai `undefined`/uncontrolled dan `"indeterminate"` tetap diteruskan) |
| `e2e/team-roles.spec.ts` *(baru)* | Matriks Role Access harus termuat (regresi "Loading…" selamanya), memuat modul baru (CRM, Omnix), lalu ubah→simpan→muat ulang→tetap tersimpan, ditutup dengan mengembalikan nilai semula |
| `e2e/team-role-enforcement.spec.ts` *(baru)* | Rantai penuh #58/#59: admin membuat user `viewer` → mencabut akses modul **Tax** (dashboard + 4 submodul) → kartu Tax hilang dari launcher viewer, dan membuka `/app/w/<ws>/tax` ditolak ("Module access restricted"); **lalu peran anggota diubah lewat dropdown (Viewer → Admin) dan dipastikan tetap tersimpan setelah halaman dimuat ulang**; selesai itu izin dikembalikan dan anggota dihapus |

**Verifikasi:** `tsc` 0 error, `npm run build` sukses, dan suite e2e **38 lulus /
0 gagal** (2,6 menit) — termasuk seluruh spec akuntansi, dokumen, CRM, Omnix,
Qalling, dan HR yang ikut memakai lapisan data yang sama. Kedua spec baru juga
dijalankan **dua kali berturut-turut (`--repeat-each=2`) → 4 lulus** sehingga
terbukti idempoten. DB dev dikembalikan ke kondisi setara default (matriks
tersimpan dengan nilai bawaan, satu anggota owner).

Yang sudah dipastikan bekerja di `/app/w/<workspace>/team`: tautan menu dari
launcher, daftar anggota, buat/ubah/hapus anggota beserta **ubah peran lewat
dropdown** (tersimpan setelah reload), matriks Role Access (muat, ubah, simpan),
dan penegakan izin ke menu + rute modul untuk user berperan `viewer`.

### Ronde 23 (2026-09-30) — hapus spec uji Meta (integrasi Meta ditunda)

Atas permintaan pemilik produk, `e2e/meta-guards.spec.ts` dihapus karena
integrasi Meta (#55) ditunda. Penjaga endpoint tetap ada di kode dan cara
memeriksanya secara manual dipindahkan ke `META-SETUP.md` §5 (curl untuk hook
cron 403/200 dan callback OAuth 400, plus cek panel UI tidak membocorkan token).

### Ronde 22 (2026-09-30) — uji **instalasi bersih** (migrate + seed + e2e di DB kosong)

Selama ini seluruh verifikasi dilakukan pada DB dev yang sudah terisi bertahap,
sehingga fixture yang hilang tidak terlihat. Ronde ini mengulang seluruh alur di
**container MySQL 8.4 sekali-pakai** (port 3309, DB `xperd_fresh`):

| Langkah | Hasil |
|---|---|
| `docker run mysql:8.4` + `npm run migrate` | **13 migrasi** (001–013) terpasang dari nol pada DB kosong |
| `npm run seed` | **11 seed** terpasang; 73 tabel; `addons` berisi qalling/slipp_hr/omnix; wallet Omnix + produk tenant/invoice terisi |
| `npm run migrate` & `npm run seed` ulang | “up to date”, “nothing to do” — tidak ada duplikasi |
| `npm run seed -- --force` | semua seed dapat dijalankan ulang tanpa error & tanpa menambah baris (2 tenant, 2 invoice, 1 baris ledger) |
| **e2e pertama** | **4 gagal** — celah fixture yang selama ini tersembunyi |

**Empat kegagalan itu memang celah fixture, bukan regresi kode:**

1. `admin-tenancy` — `000_dev_bootstrap.sql` berjalan **sebelum** `001_core_seed.sql`,
   jadi saat itu tabel `packages` masih kosong → `package_id` tenant demo NULL →
   kolom Package menampilkan “—”.
2. `qalling-standalone` + 4 spec CRM — add-on **`qalling` belum pernah diberikan
   lewat seed**; di DB dev add-on itu ada karena aktivasi manual, jadi spec CRM
   selama ini ter-*skip* diam-diam (“CRM add-on (qalling) is not assigned”).
3. `draft-delete` & `draft-edit` — bergantung pada dokumen `QUO/...` yang dulu
   terbentuk **kebetulan** dari e2e CRM (konversi lead → penawaran).

**Dua seed baru** (dijalankan setelah `001_core_seed.sql` sehingga katalog
`packages`/`addons` sudah ada):

| File | Isi |
|---|---|
| `db/seeds/001f_dev_tenant_package_addons.sql` | Mengaitkan tenant demo ke paket `one-professional` + mengaktifkan add-on `qalling`. Catatan penting: variabel MySQL berkolase `utf8mb4_general_ci` sedangkan `tenants.id` `utf8mb4_unicode_ci` → perbandingan butuh `COLLATE utf8mb4_unicode_ci`, jika tidak muncul `ER_CANT_AGGREGATE_2COLLATIONS` |
| `db/seeds/001g_dev_quotation_fixture.sql` | Satu penawaran **draft** (`QUO/E2E/9001`) + satu barisnya untuk e2e dokumen draft |

**Hasil e2e pada DB bersih:** **38 lulus + 1 skip / 0 gagal** — identik dengan
hasil di DB dev, termasuk 4 spec CRM yang kini benar-benar berjalan (tidak lagi
skip) dan `draft-delete`/`draft-edit` yang kini berdiri sendiri tanpa bergantung
pada data sisa run lain. Container uji dihapus setelah selesai; seed baru juga
sudah diterapkan ke DB dev agar keduanya seragam.

### Ronde 21 (2026-09-30) — #55 penjaga endpoint Meta + runbook aktivasi

Integrasi Meta membutuhkan App ID/Secret milik user, tetapi bagian yang **bisa
diverifikasi tanpa kredensial** ternyata belum diuji sama sekali (rute publik,
rahasia hook, kebocoran token). Ronde ini menutupnya tanpa memalsukan apa pun:

| File | Isi |
|---|---|
| `e2e/meta-guards.spec.ts` *(baru — **dihapus di ronde 23** atas permintaan pemilik produk setelah #55 ditunda)* | 3 tes: (1) hook cron `/api/public/hooks/social-publish` → 403 tanpa secret, `403` untuk secret salah, `200` lewat header `x-webhook-secret` maupun `?secret=`; (2) `/api/public/meta/callback` menolak `state` kosong, `state` asing, dan `state` berbentuk benar tetapi tanpa baris pengaturan (semuanya 400); (3) panel Meta di UI hanya menampilkan App ID + placeholder secret dan **tidak** merender access token apa pun |
| `META-SETUP.md` *(baru)* | Runbook aktivasi: membuat App (tipe Business, redirect URI OAuth, daftar scope minimum, syarat Page tertaut IG Business), mengisi & memverifikasi kredensial di UI, membaca hasil callback (`ok`/`nopage`/`cancelled`/`error`), cron auto-publish + `SOCIAL_PUBLISH_SECRET`, dan urutan uji akhir (verifikasi → connect → publish terjadwal → disconnect) |

Verifikasi: spec dijalankan dua mode — tanpa secret (mode dev: endpoint 200, tes
1 otomatis *skip* setelah memastikan tidak error) dan dengan
`SOCIAL_PUBLISH_SECRET=rahasia-e2e` (jalur 403/200 terbukti; **3 lulus**). Full
suite e2e: **38 lulus + 1 skip (tes hook mode dev) / 0 gagal**.

Sisa #55 hanya bagian yang memang butuh App Meta milik user: verifikasi App
ID/Secret nyata, OAuth Facebook Login, dan publish ke Page/Instagram.

### Ronde 20 (2026-09-30) — #64 permukaan Qalling standalone (`/qalling`)

Qalling kini punya permukaan sendiri tanpa header/footer situs XPERD, tetapi
**memakai ulang view CRM** yang sudah ada (bukan duplikasi kode):

| File | Isi |
|---|---|
| `src/lib/qalling.ts` *(baru)* | `DEFAULT_QALLING_HOSTS` (`qalling.id`/`qalling.net` + `www`), `qallingHosts()` (bisa ditimpa env **`VITE_QALLING_HOSTS`**, dipisah koma), `isQallingHost()`, `isQallingPath()` |
| `src/routes/qalling.index.tsx` *(baru)* | Landing publik (hero, 6 fitur, CTA), header Qalling sendiri; memakai `useI18n().pick()` agar bilingual seperti halaman publik lain |
| `src/routes/qalling.login.tsx` *(baru)* | Form login khusus Qalling (`#email`/`#password`) → `loginAppUser` (cookie httpOnly) + `emitAuthChange()`, dialihkan ke `/qalling/app` bila sesi sudah ada |
| `src/routes/qalling.app.tsx` *(baru)* | Shell aplikasi: `ThemeProvider` + `AppProvider` (konteks yang sama dengan app utama), penjaga sesi (tanpa sesi → `/qalling/login`), panel bila workspace belum ada, **gerbang add-on `qalling`** (petunjuk Buka Billing), menu = submodul CRM yang diizinkan peran (#59), tombol keluar |
| `src/routes/qalling.app.index.tsx`, `qalling.app.$submoduleId.tsx` *(baru)* | Dasbor → `CrmDashboardView`; submodul → `CrmView` (menolak submodul tak dikenal / tanpa izin) |
| `src/routes/__root.tsx` | `beforeLoad`: host `qalling.*` → `/qalling` (jaring pengaman di klien; pemetaan utama tetap **reverse proxy produksi**, mis. nginx `server_name qalling.id` → `/qalling`) |
| `e2e/qalling-standalone.spec.ts` *(baru)* | Landing, penjaga sesi, login, lalu membuka submodul CRM dari shell Qalling |

Catatan: harga/kuota serta keputusan komersial Qalling **tidak** diperlukan untuk
membuat permukaan ini — submodul CRM & add-on `qalling` sudah ada sejak batch 3B,
jadi `#64` bisa dikerjakan tanpa menunggu keputusan domain (domain cukup diatur
lewat env/proxy).

**Verifikasi:** `tsc` 0 error, `npm run build` sukses (route tree teregenerasi:
`/qalling/`, `/qalling/login`, `/qalling/app`, `/qalling/app/$submoduleId`), suite
e2e **36 lulus / 0 gagal** (2,1 menit).

### Ronde 19 (2026-09-30) — #65 tag produk tenant/invoice (XPERD vs Qalling)

Kolom `tenants.product` & `invoices.product` sudah ada sejak migration **010**
(ronde 1) tetapi belum dipakai: UI Old tidak punya filter maupun tanda produk,
sehingga tenant/invoice XPERD dan Qalling bercampur.

| File | Isi |
|---|---|
| `src/lib/platform.functions.ts` | Tambah `product` ke `PCOLS.tenants` & `PCOLS.invoices`. Tanpa ini `adminSave` akan **membuang** nilai `product` secara senyap (whitelist kolom) |
| `src/routes/app-admin/tenancy.tsx` | Filter **Semua produk / XPERD ERP / Qalling** di sebelah filter status; badge produk di sel tenant yang sekaligus tombol **Ganti produk** (`changeProduct` → `adminSave` + toast); filter ikut memakai `t.product ?? "xperd"` agar tenant lama (NULL) tetap terbaca sebagai XPERD |
| `src/routes/app-admin/invoices.tsx` | Deret tombol filter produk berjumlah (`Semua (n)`, `XPERD ERP (n)`, `Qalling (n)`), kartu statistik & tabel mengikuti filter, badge produk per invoice; invoice manual mewarisi produk tenant terpilih dan invoice auto-generate mewarisi produk tenant-nya |
| `e2e/admin-product-tag.spec.ts` *(baru)* | Spec idempoten: badge produk dibaca → ditukar → difilter (produk baru tampil, produk lama menyembunyikan) → dikembalikan ke nilai semula; ditambah pemeriksaan tombol filter & badge di halaman Invoices |

Catatan: tanpa filter, invoice baru otomatis ber-`product` tenant-nya, jadi tidak
ada invoice yang tertinggal ber-`xperd` saat tenant dipindah ke Qalling.

### Ronde 18 (2026-09-30) — #63 Omnix: saldo & biaya transaksi di level aplikasi (tanpa trigger DB)

**Keputusan arsitektur (permintaan eksplisit user):** JANGAN pakai trigger/fungsi
PostgreSQL. Trigger New 3 `omnix_charge_completed_order` diterjemahkan menjadi
server fn `omnixSetOrderStatus` yang menjalankan seluruh logika uang **di level
aplikasi** dalam **satu transaksi MySQL** (`transaction()` + `SELECT … FOR UPDATE`
pada baris dompet), sehingga perilakunya sama: tidak ada celah saldo minus, dan
bahkan bila dua request menyelesaikan pesanan yang sama bersamaan, hanya satu yang
menagih karena baris dompet & pesanan dikunci.

| File | Isi |
|---|---|
| `src/lib/omnix.ts` *(baru)* | Konstanta bisnis: 7 kanal (`OMNIX_CHANNELS` + pid/pub/sec), status pesanan/packing, `OMNIX_FEE_PER_ORDER = 25`, `OMNIX_BUNDLE` (Rp350.000 → kuota 20.000 selama 30 hari), `OMNIX_MIN_TOPUP = 10.000`, `packLabel()`, `isBundleActive()` |
| `src/lib/omnix.functions.ts` *(baru, ~600 baris)* | Server fn: `getOmnixWallet`, `listOmnixLedger`, `omnixRequestTopup`, `omnixBuyBundle`, **`omnixSetOrderStatus`** (pengganti trigger), `listOmnixChannelSettings`, `omnixSaveChannelKeys`, `omnixClearChannelKeys`, `listOmnixTopups`, `omnixReviewTopup`, plus `lockWallet()` (`INSERT IGNORE` baris dompet lalu `FOR UPDATE`) |
| `db/migrations/013_omnix_addon.sql` *(baru)* | Baris add-on `omnix` (`monthly_price 0`, `pricing_unit 'per transaksi'`, `module_id 'omnix'`) — harga aslinya per transaksi lewat dompet, bukan langganan |
| `src/components/app/OmnixViews.tsx` *(baru)* | Dispatcher `OmnixView` → `StoresView` (koneksi toko, wajib kunci kanal tervalidasi), `OrdersView` (cari/filter/paginasi, CRUD, ubah status → tagih otomatis + toast saldo), `WalletView` (kartu saldo, beli paket, pengajuan top up, buku besar) |
| `src/components/app/OmnixOps.tsx` *(baru)* | `OmnixSettingsView` (simpan/hapus kunci kanal, validasi panjang, `secret_hint '••••1234'`), `OmnixShippingView` (scan barcode packing/pickup + beep + log), `OmnixReportView` (5 kartu ringkasan, tabel per toko, detail, ekspor CSV) |
| `src/routes/app-admin/addons.tsx` | `OmnixTopupReview`: daftar top up menunggu verifikasi Super Admin + tombol Setujui/Tolak. **Saldo hanya bertambah setelah disetujui** |
| `src/lib/modules.ts` | Modul `omnix` (ikon `Store`, fase 4, `addon: "omnix"`) + 6 submodul |
| `src/lib/data.functions.ts` | Whitelist `omnix_stores` & `omnix_orders` pada `WORKSPACE_TABLES` **dan** `COLS`. Dompet/ledger/kunci kanal sengaja **tidak** dimasukkan → hanya bisa diakses lewat server fn ber-izin |
| `src/routes/app/w.$workspaceId.$moduleId.$submoduleId.index.tsx` | Rute `omnix` → `OmnixView` |
| `src/lib/guide.ts` | Panduan modul Omnix (6 langkah, termasuk penjelasan bahwa biaya dipotong di dalam transaksi DB, tanpa trigger) |
| `db/seeds/001c_dev_addon_omnix.sql`, `001d_dev_omnix_wallet.sql` *(baru)* | Fixture dev: add-on Omnix untuk tenant demo + saldo awal Rp100.000 beserta baris ledger-nya |
| `e2e/omnix.spec.ts` *(baru)* | Uji e2e: selesaikan pesanan → saldo −Rp25 + ledger, ajukan top up Rp50.000 → setujui di `/app-admin/addons` → saldo +Rp50.000 |

**Aturan uang yang diimplementasikan (semua dalam satu transaksi):**

1. Menyelesaikan pesanan: `fee_charged = 0` → kunci dompet; bila paket aktif (`bundle_used < quota`) pakai kuota paket & biaya Rp0, jika tidak saldo wajib ≥ Rp25 lalu dipotong. Ledger `charge` mencatat `balance_after`, `fee_charged = 1`, `omnix_fee = 25`, `completed_at` diisi. Idempoten: perubahan status lain atau pesanan yang sudah tertagih tidak menagih lagi.
2. Top up: `status = pending` (min Rp10.000). Super Admin menyetujui → kunci dompet, saldo bertambah, ledger `topup posted` + `balance_after`. Ditolak → `rejected` (saldo tidak berubah).
3. Paket: potong Rp350.000 (saldo harus cukup, paket aktif lain ditolak) → kuota 20.000 dipakai 0, masa berlaku 30 hari.

**Bukti di DB dev** (MySQL 8.4, `xperd-mysql-dev`):

```
omnix_wallets.balance = 149925.0000
ledger: charge -25 (saldo 149925)  “Transaksi selesai: E2E-OMX-588043”
        charge -25 (saldo 149950)  “Transaksi selesai: E2E-OMX-560217”
        topup 50000 (saldo 149975) “Transfer manual”          (disetujui Super Admin)
        charge -25 (saldo  99975)  “Transaksi selesai: E2E-OMX-0001”
        topup 100000 (saldo 100000) “Saldo awal fixture dev”
omnix_orders: E2E-OMX-* | completed | omnix_fee 25.0000 | fee_charged 1
```

**Verifikasi:** `npx tsc --noEmit` 0 error; `npm run build` ✓; `npm run migrate` (001–013) & `npm run seed` sukses; suite e2e **33 lulus, 0 gagal** (2,0 menit).

**Dua masalah e2e yang ketangkap (bukan bug fitur):**

1. Spec awalnya tidak idempoten: nomor pesanan tetap `E2E-OMX-0001` + pesanan sudah `fee_charged = 1` dari run sebelumnya → pemilihan status `completed` tidak lagi menagih sehingga toast tagihan tidak muncul dan spec gagal **hanya bila dijalankan dua kali** (di run tunggal hijau). Diperbaiki: nomor pesanan unik per run (`E2E-OMX-<epoch>`), asersi saldo relatif (`startBalance − 25`, `afterBalance + 50000`), dan baris persetujuan dipilih berdasarkan nominalnya.
2. Asersi tombol hapus pakai `getByRole("button", { name: /Hapus|Delete/ })` yang bergantung pada *accessible name* dari atribut `title`. Playwright mencocokkan `name` ber-regex secara **penuh**, jadi setelah daftar ter-refresh `title` berubah menjadi “Already charged — cannot delete” → locator tidak menemukan elemen dan spec gagal walau UI sudah benar (snapshot menunjukkan tombol `[disabled]`). Diganti locator CSS `button[title*="charged"]` dan kini stabil.

### Ronde 17 (2026-09-30) — verifikasi di DB nyata + suite e2e hijau

**Migrasi dijalankan sungguhan**: `docker compose up -d --wait mysql` (MySQL **8.4**, container `xperd-mysql-dev`, port 3307) → `npm run migrate` sukses untuk **001–012**; 18 tabel `crm_*`, `workspaces.letterhead_config`, `md_items.is_stocked` terverifikasi lewat query.

**Fixture dev baru** (agar DB kosong bisa menjalankan seed & e2e):

| File | Isi |
|---|---|
| `db/seeds/000_dev_bootstrap.sql` | Tenant + workspace demo (id disamakan dengan fixture lain: tenant `e77b5fd9…`, workspace `46bc16a0…`) + membership owner + role customer. Tanpa ini seed gagal `ER_NO_REFERENCED_ROW_2` di `sls_documents` |
| `db/seeds/001a_dev_master_fixture.sql` | Cerminan `seedWorkspaceDefaults()`: 29 akun COA (+1450/2050/2110/2400/5200), 5 UOM, 4 kategori, 5 pajak, gudang, 2 akun kas/bank, plus item/pemasok/pelanggan contoh |
| `db/seeds/001b_dev_doc_fixture.sql` | `E2E-SO-0001` (sales order approved, id `…000d` sesuai `doc-pdf.spec.ts`) & `E2E-PR-0001` (purchase request draft) beserta barisnya |

**Hasil `npm run test:e2e`**: **32 lulus, 0 gagal, 0 skip** (1,9 menit) — termasuk spec alur dokumen, PDF, kas/bank, HR, CRM, registrasi, dan seluruh modul.

**Bug yang ketangkap e2e**: kartu Kop Surat (#53) memakai `alt="Logo"` pada gambar pratinjau. Playwright `getByAltText('Logo')` cocok **sebagian**, jadi `workspace-logo.spec.ts` gagal karena strict-mode violation (2 elemen). Diperbaiki menjadi `alt=""` + `aria-hidden="true"` (commit `82a1652`) — jenis regresi yang tidak terlihat dari `tsc`/`build`.

Tiga kegagalan awal (`cash-out-proof`, `draft-delete`, `draft-edit` PR) terbukti **karena data dev belum lengkap** (tanpa `cb_accounts`, dokumen fixture), bukan regresi kode — setelah fixture ditambahkan semuanya lulus.

Belum (dan **sengaja ditunda** atas keputusan pemilik produk, 2026-09-30): uji Meta
end-to-end (#55) yang memerlukan App ID/Secret milik user. Seluruh kode integrasi dan
langkah aktivasi (`META-SETUP.md`) sudah siap sehingga bisa dijalankan kapan saja
(spec e2e khusus Meta sudah dihapus; cara cek manualnya ada di `META-SETUP.md` §5). Batch **3D selesai**: **#63 Omnix**
(ronde 18), **#65 tag produk** (ronde 19), **#64 permukaan Qalling standalone**
(ronde 20).

### Ronde 16 (2026-09-30) — #52 Template Isian Panitia (DOCX ber-kop) + paket ZIP

| File | Isi |
|---|---|
| `package.json` | Tambah dependensi `jszip` ^3.10.2 (dipakai di browser untuk menyusun/membaca DOCX) |
| `src/lib/tender-docx.ts` *(baru, disalin utuh dari New 3)* | `buildLetterheadedDocx(blob, profile)`: menyuntik kop (motif warna atau gambar latar A4 penuh), mengganti placeholder `{{nama_perusahaan}}`, `{{nama_legal}}`, `{{alamat_perusahaan}}`, `{{npwp}}`, `{{telepon}}`, `{{email}}`, menambah header/footer + relasi & `[Content_Types].xml`; `downloadBlob()` |
| `src/components/app/CrmTenderTemplates.tsx` *(baru, ~450 baris)* | `useTenderTemplates`, `letterheadProfile` (dari `workspace.letterhead_config`), `generateTenderDocx` (baca DOCX sumber via rute unduh → tempel kop), `TenderTemplates` (daftar kartu per kategori, unggah PDF KAK/RKS + DOCX, tautkan ke dokumen checklist → status `ready`, unduh Word ber-kop, riwayat versi, hapus termasuk berkas di disk), `TemplateHistory` |
| `src/components/app/CrmTender.tsx` | Panel Template Isian Panitia disisipkan di atas daftar kategori + tombol **Unduh paket (ZIP)** yang mengelompokkan berkas checklist dan DOCX ber-kop ke folder `1-Administrasi`, `2-Teknis`, `3-Penawaran` |

Verifikasi: `tsc` 0 error, `build` sukses (`✓ built`); `jszip` & `mysql2` hanya muncul di `output/server/_libs`, tidak di bundle klien. Belum: uji manual unduh DOCX ber-kop pada berkas Word nyata (perlu memastikan kop & placeholder terganti) dan unduh paket ZIP dari browser.

### Ronde 15 (2026-09-30) — #51 Pustaka Dokumen + lampiran checklist tender

**Keputusan penyimpanan berkas (dipilih tanpa menunggu konfirmasi tambahan, mudah ditukar):** disk lokal pada volume `local-storage` (`/app/storage` di produksi, `./storage` saat dev, bisa ditimpa `STORAGE_DIR`). Alternatif MySQL blob tidak dipakai karena berkas bisa sampai 20 MB. Semua akses lewat dua server fn + satu rute unduh, jadi mengganti ke opsi blob hanya perlu menyentuh `lib/files.server.ts`.

| File | Isi |
|---|---|
| `src/lib/files.server.ts` *(baru)* | `storageRoot()`, `buildFilePath()` + `safeSegment()` (aman dari path traversal), `saveWorkspaceFile`, `readWorkspaceFile`, `deleteWorkspaceFile`, `mimeFromPath`, `ALLOWED_UPLOAD_EXT`, `MAX_UPLOAD_BYTES` (20 MB) |
| `src/lib/files.functions.ts` *(baru)* | Server fn `uploadWorkspaceFile` (data URL → berkas; validasi ekstensi, ukuran, izin tulis workspace) & `deleteWorkspaceFile` |
| `src/routes/api/workspace-files.ts` *(baru)* | Rute unduh ber-cookie sesi: kepemilikan berkas ditentukan dari baris DB yang menyimpan path (`crm_doc_library`, versi, `crm_tender_docs`, template), lalu hak akses workspace diperiksa |
| `src/components/app/CrmDocLibrary.tsx` *(baru, ~530 baris)* | `useDocLibrary`, `uploadWsFile`, `openWsFile`, `expiryState`/`ExpiryBadge`, `matchLibrary`, `DocLibraryView` (pencarian, filter kategori, 3 kartu, tabel + paginasi, dialog unggah/versi baru, riwayat versi, hapus termasuk berkas di disk) |
| `src/components/app/CrmTender.tsx` | Integrasi pustaka: `mergeLib` (berkas & expiry selalu dari pustaka), pemilih dokumen pustaka per baris, unggah berkas khusus tender, "Simpan ke pustaka", tombol **Isi otomatis dari pustaka** |
| `src/lib/modules.ts`, `src/components/app/CrmViews.tsx` | Submodul CRM `doc-library` + rutenya |
| `src/lib/guide.ts` | Panduan Pustaka Dokumen (#62 → 2/3) |

Verifikasi: `tsc` 0 error, `build` sukses. Belum: uji manual unggah/unduh berkas di lingkungan berjalan (butuh DB dev), dan ekspor ZIP per kategori (#52).

### Ronde 14 (2026-09-30) — #54 akun sosial & penjadwal, #55 Meta App, #56 dasbor sosial

| File | Isi |
|---|---|
| `src/lib/meta-social.functions.ts` *(baru)* | `getMetaSettings` (tanpa App Secret), `saveMetaApp` (verifikasi ke Graph API via `client_credentials`, status `verified`/`invalid` + pesan Meta), `startMetaConnect` (URL OAuth + `state` nonce disimpan server), `disconnectMeta` (hapus token + akun Meta), `publishPostNow` |
| `src/lib/meta-publish.server.ts` *(baru)* | Inti publikasi: Instagram memakai alur container → `media_publish`, Facebook Page memakai `/feed`; menulis `last_error`/`results`/`published_at`; `publishDuePosts()` memproses postingan jatuh tempo dengan klaim status `publishing` agar tidak dobel-publish |
| `src/routes/api/public/meta/callback.ts` *(baru)* | OAuth return Facebook Login: tukar kode → token panjang → daftar Page (+ Instagram Business) → upsert akun & token (unique key `workspace_id, platform, external_id`), set status `connected`/`verified`, redirect kembali ke halaman Akun Media Sosial dengan penanda `?meta=` |
| `src/routes/api/public/hooks/social-publish.ts` *(baru)* | Hook cron (GET/POST) untuk auto-publish; dilindungi `SOCIAL_PUBLISH_SECRET` bila diset |
| `src/components/app/CrmSocial.tsx` *(baru, ~700 baris)* | `MetaConnectCard`, `SocialAccountsView` (akun manual multi-platform), `PostSchedulerView` (kalender minggu/bulan, dialog postingan, salin caption, **Post now**, hapus, terkunci bila Meta belum terhubung), `SocialDashboardView` (6 statistik, batang per minggu & per akun, jadwal berikutnya, gagal terbaru) |
| `src/lib/modules.ts`, `src/components/app/CrmViews.tsx` | Submodul CRM baru: `social-dashboard`, `social-accounts`, `post-scheduler` + rutenya |
| `src/lib/data.functions.ts` | Whitelist `crm_social_accounts` & `crm_scheduled_posts`; `crm_meta_settings`/`crm_social_tokens` **sengaja tidak** masuk (memuat rahasia, hanya lewat server fn) |

Verifikasi: `tsc` 0 error, `build` sukses (route tree otomatis ikut diperbarui). Belum: uji end-to-end dengan App Meta nyata (verifikasi App ID/Secret, OAuth, publish ke Page/IG) dan pemasangan cron pemanggil `/api/public/hooks/social-publish`.

### Ronde 13 (2026-09-30) — #57 pencarian/paginasi tabel CRM + alert dokumen kedaluwarsa

| File | Isi |
|---|---|
| `src/components/app/CrmViews.tsx` | **Kontak Pelanggan**: `SearchInput` (kode, nama, PIC, email, telepon, kota) + paginasi 25/hal + pesan "tidak ada yang cocok" |
| `src/components/app/CrmOutreach.tsx` | **Broadcast** dan **Kampanye Sosial**: pencarian + paginasi 10/hal, pesan kosong dibedakan antara "belum ada data" dan "tidak ada yang cocok" |
| `src/components/app/CrmInsights.tsx` | **Target Sales** dan **Template Pesan**: pencarian + paginasi (tabel memakai `TableSkeletonRows` saat memuat); komponen baru `ExpiringDocsAlert` di dasbor CRM — menampilkan dokumen Pustaka Dokumen yang kedaluwarsa atau habis dalam ≤30 hari (tidak tampil selama pustaka kosong) |

Verifikasi: `tsc` 0 error, `build` sukses. Belum: uji manual pencarian/paginasi pada workspace dengan data banyak, dan memastikan alert muncul setelah Pustaka Dokumen (#51) terisi.

### Ronde 12 (2026-09-30) — #50 checklist tender, #53 kop surat, #62 sebagian

| File | Isi |
|---|---|
| `src/lib/data.functions.ts` | Whitelist tabel CRM baru: `crm_tenders`, `crm_tender_docs`, `crm_doc_library`, `crm_doc_library_versions`, `crm_tender_templates`, `crm_tender_template_versions` di `WORKSPACE_TABLES` **dan** `COLS` (tanpa `COLS` nilai akan dibuang tanpa error) |
| `src/components/app/CrmTender.tsx` *(baru, ~530 baris)* | Bertipe: `TenderView` (kartu tender: kode, kenaikan HPS, progress, badge layak submit, hitung hari ke deadline, template checklist standar 26 dokumen, paginasi `ui-states`) + `TenderDetail` (3 kategori dokumen, centang selesai, toggle wajib, status dokumen, PIC, tanggal berlaku + deteksi kedaluwarsa, catatan, tambah/hapus dokumen, ubah status tender, hapus tender + checklist, dan **lembar evaluasi siap cetak** dengan blok tanda tangan) |
| `src/lib/modules.ts`, `src/components/app/CrmViews.tsx` | Submodul CRM baru `tenders` (“Checklist Tender”) + rute ke `TenderView` |
| `src/lib/guide.ts` | Panduan bilingual 3 langkah untuk Tender Checklist (#62 sebagian) |
| `src/lib/platform.functions.ts`, `src/lib/app-shell.functions.ts`, `src/lib/app-context.tsx` | `letterhead_config` masuk whitelist `PCOLS.workspaces`, ikut dibaca `getAppShellData`, dan tersedia di tipe `Workspace` (#53) |
| `src/routes/app/w.$workspaceId.settings.tsx` | Kartu **Kop Surat Tender**: unggah PNG/JPG A4 (≤10 MB, dinormalisasi ke 1240×1754 dengan peringatan bila rasio bukan A4), toggle alamat/NPWP/telepon/email/garis pemisah, pratinjau A4 live (memakai logo & profil workspace), dan tombol simpan tersendiri via `form="workspace-settings-form"` |

Verifikasi: `tsc` 0 error, `build` sukses. Belum: uji manual (buat tender + template 26 dokumen, centang dokumen wajib sampai badge hijau, cetak lembar evaluasi, unggah kop A4 lalu simpan dan buka ulang halaman).

**Keputusan yang menunggu user (batch 3B):** penyimpanan berkas (#51 pustaka dokumen, #52 template DOCX + ZIP, unggah berkas pada checklist). Old tidak punya object storage; opsi: (a) data URL/blob di MySQL (maks 20 MB per berkas, dicadangkan lewat backup DB yang sudah ada), atau (b) disk lokal `/app/storage` (sudah ada named volume `local-storage` di `docker-compose.prod.yml`) + server fn unggah/unduh. #54–56 (akun sosial & Meta) juga menunggu App ID/Secret Meta milik user.

### Ronde 11 (2026-09-30) — #58 izin per submodul, #59 penegakan izin, #61 menu mobile

| File | Isi |
|---|---|
| `src/lib/team.functions.ts` | Server fn baru `getWorkspaceAccess({ workspaceId })` → `{ role, access[{ module_id, can_view, can_edit }] }`; peran dari `workspace_members`, pemilik tenant dianggap `owner`, `module_id` boleh `module` atau `module/submodule` |
| `src/lib/app-context.tsx` | Kontrak izin: `workspaceRole`, `accessLoading`, `canViewModule`, `canViewSubmodule`, `canEditSubmodule`; izin dimuat ulang setiap workspace aktif berganti (gagal memuat → jangan kunci aplikasi). Aturan New 3 dipertahankan: owner selalu penuh, `can_edit` bawaan `role !== "viewer"` |
| `src/routes/app/w.$workspaceId.team.tsx` | Matriks Role Access jadi accordion per modul: baris "Dashboard & module access" + satu baris `PermissionLine` untuk setiap submodul, dengan checkbox View/Edit per peran (admin/staff/viewer) |
| `src/routes/app/w.$workspaceId.$moduleId.tsx` | Gerbang `canViewModule` (layar "Akses modul dibatasi" + tautan kembali), spinner saat izin masih dimuat, menu samping menyaring submodul, **dan** baris pill mobile diganti `Sheet` hamburger (#61) |
| `src/routes/app/w.$workspaceId.$moduleId.$submoduleId.index.tsx` | Layar "Akses submodul dibatasi" bila tidak punya View, pita "Akses hanya lihat", isi dibungkus `<fieldset disabled={!canEdit}>`; isi dipindah ke komponen `SubModuleBody` |
| `src/routes/app/w.$workspaceId.$moduleId.$submoduleId.$docId.tsx` | Pemeriksaan izin submodul sebelum dokumen dirender |
| `src/routes/app/w.$workspaceId.index.tsx`, `src/components/app/AppTopbar.tsx` | Kisi peluncur & pencarian modul hanya menampilkan modul/submodul yang boleh dilihat peran (jumlah submodul di kartu mengikuti yang terlihat) |

Verifikasi: `tsc` 0 error, `build` sukses. Belum: uji manual — login sebagai `viewer` → menu modul menyusut, submodul tanpa izin menampilkan layar terbatas, dan formulir tidak bisa diubah; uji juga pemilik tenant tanpa baris `workspace_members` tetap punya akses penuh.

### Ronde 10 (2026-09-30) — #47 komponen daftar bersama + settlement kas/bank

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

