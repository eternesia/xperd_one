# Modul Production (add-on `manufacturing`) — BS New 16 → Old Production

Ringkasan modul, akses, tabel, alur, dan hal yang masih menunggu keputusan pemilik produk. Sumber: `README_PRODUCTION.md` dan `docs/mfg-*.md` di BS New 16.
Implementasi Old memakai MySQL tanpa trigger/fungsi tersimpan: semua aturan ada di kode server (`transaction()` + `SELECT … FOR UPDATE`).

## 1. Ringkasan

Modul untuk formulator pestisida/agrokimia: master produksi, formulasi/BOM berversi, lot & stok (FEFO), mutu (QC), perintah produksi, biaya aktual,
jurnal otomatis ke Akuntansi, traceability maju/mundur + simulasi recall, dan log limbah B3. Menu: modul **Production** (`/app/w/<ws>/manufacturing/<seksi>`);
tautan lama `/production/<ws>/<seksi>` diarahkan ke sana. Halaman muka modul (`/app/w/<ws>/manufacturing`) = dasbor Production.

## 2. Seksi (15 submenu)

| Seksi | Isi | Tahap |
|---|---|---|
| `boms` | Formulasi / BOM berversi (draft → in_review → approved → obsolete) | M3 |
| `lots` | Lot & stok, FEFO, karantina | M4 |
| `quality` | Spesifikasi QC, inspeksi, deviasi/CAPA, tanda tangan elektronik | M5 |
| `orders` | Perintah produksi, issue bahan, langkah batch (eBMR), hasil | M6–M10 |
| `mrp` | MRP: Sales Order → kebutuhan bahan → saran beli (PR draf) / produksi (order draf) | MRP |
| `accounting` | Biaya & jurnal (outbox idempoten), pemetaan akun | M9–M10 |
| `traceability` | Penelusuran lot maju/mundur + simulasi recall | M11 |
| `reports` | Laporan produksi (rencana vs hasil, yield, biaya) — CSV/PDF/Excel | M12 |
| `waste` | Log limbah B3 | M11 |
| `work-centers`, `profiles`, `registrations`, `formulation-codes`, `settings`, `roles`, `audit` | Master & pengaturan | M1–M2 |

## 3. Akses

1. **Entitlement**: add-on `manufacturing` aktif untuk tenant dengan fitur `mfg_basic` atau `legacy` (tier kosong = semua fitur). Tanpa itu semua fungsi server menolak ("Akses Production tidak tersedia…") dan menu tersembunyi.
2. **Fitur per tier** (editor tier add-on di Super Admin → Add-on → Tier memakai `PRODUCTION_FEATURE_LABELS`): `mfg_basic` (dasar), `mfg_qc`, `mfg_trace` (Traceability & Recall — bila mati, penelusuran/recall ditolak), `mfg_mrp` (MRP — bila mati, seksi `mrp` ditolak), `mfg_subcontract` (disiapkan, belum dipakai).
3. **Matriks Role Access** workspace: kunci `manufacturing` dan `manufacturing/<seksi>` (View/Edit); peran kustom ikut. Pemilik tenant/`owner` selalu penuh.
4. **Peran produksi** (`mfg_workspace_roles`): `production_planner`, `production_supervisor`, `operator`, `warehouse`, `qc_analyst`, `qa_manager`, `cost_accountant`, `viewer`. Tulis pada seksi master (`settings`, `work-centers`, `formulation-codes`, `routings`, `profiles`, `registrations`) hanya untuk admin/pemilik atau `production_supervisor`/`qa_manager`; `rates` untuk `cost_accountant`; seksi `roles` hanya admin. `waste` ditulis admin/pemilik. Anggota `viewer`/staf tanpa peran hanya membaca.

## 4. Tabel (`mfg_*`, semua ber-`workspace_id`)

M1 (migrasi 040): `mfg_settings`, `mfg_workspace_roles`, `mfg_formulation_codes`, `mfg_item_profiles`, `mfg_product_registrations`, `mfg_work_centers`, `mfg_routings`, `mfg_routing_ops`, `mfg_cost_rates`, `mfg_number_counters`, `mfg_number_allocations`, `mfg_audit_log`.
M2–M10 (041–045): dokumen kepatuhan, BOM, lot, mutu, order/biaya/jurnal (lihat laporan tiap tahap).
M11–M12 (046): `mfg_waste_logs`; indeks penelusuran `mfg_lot_genealogy(workspace_id, parent_lot_id | child_lot_id)` dan `sls_document_lines(workspace_id, mfg_lot_id)` dibuat bila belum ada.
`mfg_audit_log` dan `mfg_number_allocations` hanya di-INSERT (tak ada jalur UPDATE/DELETE di kode).

## 5. Alur penting

- **Penomoran** order/lot/inspeksi/deviasi: transaksional (`FOR UPDATE` pada `mfg_settings`/penghitung), idempoten lewat kunci.
- **Traceability** (M11): CTE rekursif atas `mfg_lot_genealogy`, kedalaman maks 20, siklus dicegah lewat jejak path. Arah maju = lot turunan, mundur = bahan asal.
- **Simulasi recall**: lot + seluruh turunan; sisa stok dari `inv_movements` bertanda lot (tanpa `transfer`; kuantitas bertanda +/−), penjualan dari baris DO/faktur AR bertanda lot (status bukan draft/cancelled/void), dikelompokkan per pelanggan.
- **Laporan produksi** (M12): order per `planned_start` dengan biaya dari `mfg_order_costs`; ekspor CSV (sel berawalan `= + - @` dinetralkan), PDF (kop workspace), Excel.
- **Log limbah B3**: pencatatan baru; setelahnya hanya uraian/lokasi/pengangkut/manifest/status yang berubah (nilai lama masuk audit); tanggal, kode, jumlah, satuan terkunci (koreksi = arsipkan + catat ulang). "Hapus" = arsip.
- **MRP** (migrasi 090, `src/lib/production-mrp*.ts`, saklar `mfg_mrp_settings.enabled` OFF bawaan per workspace; diatur oleh penulis seksi `settings`):
  - Kebutuhan: baris Sales Order `approved`/`partial` (sisa = qty − terkirim, tanggal = jatuh tempo atau tanggal SO, maks. horizon) +
    order produksi (draf/planned = BOM × qty; released/in_progress = sisa material terkoreksi − ter-issue). Order draf bisa dikecualikan.
  - Pasokan: stok tanpa lot + lot `released` yang belum kedaluwarsa/retest (sisa umur ≥ pengaturan; karantina/hold ditampilkan terpisah, tidak dihitung),
    PO terbuka, PR terbuka (opsional, mencegah PR dobel), order produksi terbuka item tsb. (rencana − hasil jadi).
  - Netting per level (low-level code, maks. 20 level, siklus BOM dihentikan): kurang = kebutuhan + stok pengaman − pasokan.
    Item ber-BOM approved & berlaku → saran **produksi** dan bahannya meledak ke level berikutnya; tanpa BOM → saran **beli**.
    Ukuran pesan: MOQ lalu kelipatan; tanggal pesan/mulai = tanggal butuh − lead time (parameter per item `mfg_mrp_item_params`).
  - Aksi (peran PPIC/supervisor/admin): **PR draf** lewat `erpSaveDocumentTx` (nomor PR/YYYYMM/NNNN, harga = harga pokok item) dan
    **order produksi draf** lewat `saveOrderTx` (rilis tetap di seksi Orders). Idempoten per kunci klik (`mfg_mrp_links`).
  - Satuan BOM ≠ satuan item hanya diberi peringatan (belum ada konversi otomatis).
- **Dasbor**: kartu BOM, order, barang jadi 6 bulan, lot karantina/kedaluwarsa ≤ 30 hari, inspeksi tertunda, deviasi terbuka, pusat kerja, biaya & selisih + grafik.

## 6. Cara memberi add-on

Super Admin → Add-on: katalog sudah memuat `Production` (kode `manufacturing`, module `manufacturing`, harga 0 — atur sesuai paket). Tambahkan ke tenant lewat "Add-on tenant"; kosongkan tier untuk akses penuh (`legacy`) atau pilih tier dengan fitur `mfg_*` yang dicentang.
Produksi nyata: jalankan `npm run migrate` (040–046), lalu aktifkan add-on per tenant. Operasional jangan dibuka sebelum rekonsiliasi stok/jurnal produksi vs akuntansi lulus.

## 7. [VERIFIKASI] — butuh keputusan pemilik produk

- Toleransi komposisi bahan aktif (BOM vs `ai_declared` registrasi) dan ambang yield.
- Kode limbah B3 (PP 22/2021: B105d dst.), kewajiban manifest elektronik, masa simpan maksimum limbah; saat ini kode bebas ≤ 40 karakter, manifest opsional.
- Klasifikasi GHS/UN dan aturan inkompatibilitas penyimpanan pada profil item.
- Masa berlaku & peringatan kedaluwarsa registrasi produk (gate produksi/penjualan).
- Kebijakan e-sign (kode email 6 digit, berlaku 5 menit) — perlu gateway email platform terkonfigurasi.
- Apakah lot recall juga harus memblokir penjualan otomatis (saat ini hanya simulasi).
