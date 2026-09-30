-- ===========================================================================
-- 013_omnix_addon.sql — Batch 3 #63 (BS New 3): katalog add-on Omnix.
--  * Hanya menambahkan baris katalog (`addons`) supaya modul Omnix bisa
--    diaktifkan lewat Billing / halaman Add-ons.
--  * HARGA belum diputuskan: `monthly_price` 0 dan `pricing_unit` 'per transaksi'
--    karena biaya Omnix memang ditagihkan per transaksi lewat wallet
--    (Rp25/transaksi tuntas, paket Rp350.000 untuk 20.000 transaksi).
--  * TIDAK ada trigger/stored function: seluruh logika saldo & biaya ada di
--    level aplikasi (`src/lib/omnix.functions.ts`) di dalam transaksi MySQL.
-- ===========================================================================

INSERT INTO addons (id, code, name, tagline, description, monthly_price, pricing_unit, module_id, sort_order)
VALUES (UUID(), 'omnix', 'Omnix', 'Marketplace & food delivery omni-channel',
        'Add-on integrasi toko online: koneksi toko, transaksi, pengiriman & pickup, laporan, saldo & tagihan, pengaturan API.',
        0, 'per transaksi', 'omnix', 20)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  tagline = VALUES(tagline),
  description = VALUES(description),
  pricing_unit = VALUES(pricing_unit),
  module_id = VALUES(module_id),
  sort_order = VALUES(sort_order);
