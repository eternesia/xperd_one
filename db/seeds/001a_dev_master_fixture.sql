-- Master data dev (idempotent) — cerminan `seedWorkspaceDefaults()` di
-- `src/lib/provisioning.server.ts`, ditambah 1 item/pemasok/pelanggan contoh.
-- Gunanya: DB dev yang dibuat lewat SQL (bukan onboarding aplikasi) tetap punya
-- COA, kas/bank, dan master dasar sehingga e2e `draft-*`, `cash-out-proof`, dan
-- layar akuntansi bisa berjalan. Aman dijalankan berulang (ON DUPLICATE KEY).
SET @ws = '46bc16a0-56bc-4bd1-a813-fe7f0046a6d9';

INSERT INTO md_accounts (id, workspace_id, code, name, account_type, is_active) VALUES
  (UUID(), @ws, '1000', 'Kas', 'asset', 1),
  (UUID(), @ws, '1010', 'Bank BCA', 'asset', 1),
  (UUID(), @ws, '1200', 'Piutang Usaha', 'asset', 1),
  (UUID(), @ws, '1250', 'Piutang Karyawan', 'asset', 1),
  (UUID(), @ws, '1300', 'Persediaan Barang', 'asset', 1),
  (UUID(), @ws, '1400', 'PPN Masukan', 'asset', 1),
  (UUID(), @ws, '1410', 'PPN Lebih Bayar', 'asset', 1),
  (UUID(), @ws, '1450', 'PPh Dibayar Dimuka', 'asset', 1),
  (UUID(), @ws, '1500', 'Uang Muka Pembelian', 'asset', 1),
  (UUID(), @ws, '1700', 'Aset Tetap', 'asset', 1),
  (UUID(), @ws, '1790', 'Akumulasi Penyusutan', 'asset', 1),
  (UUID(), @ws, '2000', 'Hutang Usaha', 'liability', 1),
  (UUID(), @ws, '2050', 'Hutang Belum Ditagih (GR/IR)', 'liability', 1),
  (UUID(), @ws, '2100', 'PPN Keluaran', 'liability', 1),
  (UUID(), @ws, '2110', 'Hutang PPN', 'liability', 1),
  (UUID(), @ws, '2200', 'Hutang Pajak', 'liability', 1),
  (UUID(), @ws, '2210', 'Hutang PPh 21', 'liability', 1),
  (UUID(), @ws, '2300', 'Hutang BPJS', 'liability', 1),
  (UUID(), @ws, '2400', 'Uang Muka Penjualan', 'liability', 1),
  (UUID(), @ws, '3000', 'Modal Disetor', 'equity', 1),
  (UUID(), @ws, '3900', 'Laba Ditahan', 'equity', 1),
  (UUID(), @ws, '4000', 'Pendapatan Penjualan', 'revenue', 1),
  (UUID(), @ws, '4100', 'Retur Penjualan', 'revenue', 1),
  (UUID(), @ws, '5000', 'Harga Pokok Penjualan', 'expense', 1),
  (UUID(), @ws, '5200', 'Beban Jasa & Profesional', 'expense', 1),
  (UUID(), @ws, '6000', 'Beban Operasional', 'expense', 1),
  (UUID(), @ws, '6100', 'Beban Penyusutan', 'expense', 1),
  (UUID(), @ws, '6200', 'Beban Gaji & Tunjangan', 'expense', 1),
  (UUID(), @ws, '6210', 'Beban BPJS Perusahaan', 'expense', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), account_type = VALUES(account_type), is_active = 1;

INSERT INTO md_uoms (id, workspace_id, code, name, is_active) VALUES
  (UUID(), @ws, 'PCS', 'Piece', 1),
  (UUID(), @ws, 'BOX', 'Box', 1),
  (UUID(), @ws, 'KG', 'Kilogram', 1),
  (UUID(), @ws, 'LTR', 'Liter', 1),
  (UUID(), @ws, 'SET', 'Set', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = 1;

INSERT INTO md_categories (id, workspace_id, code, name, is_active) VALUES
  (UUID(), @ws, 'CAT-FG', 'Finished Goods', 1),
  (UUID(), @ws, 'CAT-RAW', 'Raw Material', 1),
  (UUID(), @ws, 'CAT-PKG', 'Packaging', 1),
  (UUID(), @ws, 'CAT-OFC', 'Office Supplies', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = 1;

INSERT INTO md_taxes (id, workspace_id, code, name, tax_type, rate, account_code, is_active) VALUES
  (UUID(), @ws, 'PPN11', 'PPN 11%', 'vat_out', 11, '2100', 1),
  (UUID(), @ws, 'PPNIN11', 'PPN Masukan 11%', 'vat_in', 11, '1400', 1),
  (UUID(), @ws, 'PPNF11', 'PPN Final 1,1%', 'vat_out', 1.1, '2100', 1),
  (UUID(), @ws, 'PPH23', 'PPh 23', 'withholding', 2, '2200', 1),
  (UUID(), @ws, 'NON', 'Notax', 'none', 0, NULL, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), tax_type = VALUES(tax_type), rate = VALUES(rate), account_code = VALUES(account_code), is_active = 1;

INSERT INTO md_warehouses (id, workspace_id, code, name, is_active) VALUES
  (UUID(), @ws, 'WH-01', 'Gudang Pusat', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = 1;

INSERT INTO cb_accounts (id, workspace_id, code, name, account_kind, gl_account_code, currency, opening_balance, is_active) VALUES
  (UUID(), @ws, 'CASH', 'Kas Kecil', 'cash', '1000', 'IDR', 0, 1),
  (UUID(), @ws, 'BANK', 'Bank Operasional', 'bank', '1010', 'IDR', 0, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), account_kind = VALUES(account_kind), gl_account_code = VALUES(gl_account_code), is_active = 1;

INSERT INTO md_items (id, workspace_id, code, name, item_type, category_code, uom_code, cost_price, sell_price, min_stock, is_stocked, is_active) VALUES
  (UUID(), @ws, 'E2E-ITM-001', 'Item Uji e2e', 'goods', 'CAT-FG', 'PCS', 100000, 150000, 0, 1, 1),
  (UUID(), @ws, 'E2E-SRV-001', 'Jasa Uji e2e', 'service', 'CAT-OFC', 'SET', 0, 500000, 0, 0, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), cost_price = VALUES(cost_price), sell_price = VALUES(sell_price), is_active = 1;

INSERT INTO md_suppliers (id, workspace_id, code, name, contact_name, email, phone, is_active) VALUES
  (UUID(), @ws, 'E2E-SUP-001', 'PT Contoh Pemasok', 'Budi', 'supplier@example.com', '021-5550001', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = 1;

INSERT INTO md_customers (id, workspace_id, code, name, contact_name, email, phone, is_active) VALUES
  (UUID(), @ws, 'C-0001', 'PT Contoh Pelanggan', 'Siti', 'customer@example.com', '021-5550002', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = 1;
