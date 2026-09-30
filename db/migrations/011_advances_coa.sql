-- ===========================================================================
-- 011_advances_coa.sql
--  * Batch 3 item #37 (uang muka) & #38 (auto-jurnal AP Invoice): akun COA yang
--    dipakai jurnal otomatis, plus dua akun pelaporan PPN dari item #39.
--      - 2400 Uang Muka Penjualan  -> kredit saat menerima uang muka pelanggan
--      - 2050 Hutang Belum Ditagih (GR/IR) -> penampung barang diterima belum ditagih
--      - 5200 Beban Jasa & Profesional -> beban default pembelian non-persediaan
--      - 1410 PPN Lebih Bayar, 2110 Hutang PPN -> pelaporan/tutup periode PPN
--  * 1500 Uang Muka Pembelian dan 2200 Hutang Pajak sudah dibuat sejak
--    001_schema.sql; 1450 PPh Dibayar Dimuka dibuat di 010_new3_schema.sql.
--  * Workspace baru mendapatkannya lewat DEFAULT_COA (provisioning.server.ts),
--    workspace lama lewat migration ini.
--  * Idempotent: INSERT ... SELECT ... WHERE NOT EXISTS per akun, jadi aman
--    dijalankan pada DB yang sebagian akunnya sudah ada.
-- Runs once via the migrate runner (001..00N in order).
-- ===========================================================================

INSERT INTO md_accounts (id, workspace_id, code, name, account_type, is_active)
SELECT UUID(), w.id, a.code, a.name, a.account_type, 1
FROM workspaces w
CROSS JOIN (
  SELECT '2050' AS code, 'Hutang Belum Ditagih (GR/IR)' AS name, 'liability' AS account_type
  UNION ALL SELECT '2400', 'Uang Muka Penjualan', 'liability'
  UNION ALL SELECT '5200', 'Beban Jasa & Profesional', 'expense'
  UNION ALL SELECT '1410', 'PPN Lebih Bayar', 'asset'
  UNION ALL SELECT '2110', 'Hutang PPN', 'liability'
) a
WHERE NOT EXISTS (
  SELECT 1 FROM md_accounts x WHERE x.workspace_id = w.id AND x.code = a.code
);
