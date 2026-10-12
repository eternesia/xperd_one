-- ===========================================================================
-- 014_multi_currency.sql — Ronde 29 (parity Xperd One Business Suite New 8)
--
--  * `md_currencies` & `md_exchange_rates`: master mata uang dan kurs
--    (migrasi `0018_multi_currency_master.sql` New 8).
--      - `rate_type`: `transaction` (kurs transaksi), `tax` (kurs KMK),
--        `closing` (kurs penutupan periode).
--      - `rate` selalu berarti: **nilai mata uang dasar untuk 1 unit mata uang
--        tersebut** (mis. USD → 16.000 pada workspace ber-basis IDR).
--  * `sls_documents.exchange_rate` & `prc_documents.exchange_rate`
--    (`0019_document_exchange_rate.sql` New 8). Total dokumen tetap dalam mata
--    uang dokumen; jurnal disajikan dalam mata uang dasar (dikonversi saat
--    posting memakai kurs dokumen ini).
--  * Akun selisih kurs 4900/4910 (laba) & 6900/6910 (rugi) untuk workspace yang
--    sudah ada, plus mata uang awal tiap workspace (IDR = mata uang dasar).
--
-- Idempotent: `CREATE TABLE IF NOT EXISTS` + `WHERE NOT EXISTS`, sehingga aman
-- dijalankan ulang pada DB yang sudah terisi.
-- Runs once via the migrate runner (001..00N in order).
-- ===========================================================================

CREATE TABLE IF NOT EXISTS md_currencies (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  code VARCHAR(10) NOT NULL,
  name VARCHAR(255) NOT NULL,
  symbol VARCHAR(10),
  decimals INT NOT NULL DEFAULT 2,
  is_base TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_md_currencies (workspace_id, code),
  CONSTRAINT fk_md_currencies_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS md_exchange_rates (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  currency_code VARCHAR(10) NOT NULL,
  rate_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  rate_type VARCHAR(20) NOT NULL DEFAULT 'transaction',
  rate DECIMAL(18,6) NOT NULL DEFAULT 0,
  source VARCHAR(100),
  notes TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_md_exchange_rates (workspace_id, code),
  KEY ix_md_exchange_rates_lookup (workspace_id, currency_code, rate_type, rate_date),
  CONSTRAINT fk_md_exchange_rates_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kurs dokumen: mata uang dasar per 1 satuan mata uang dokumen.
ALTER TABLE sls_documents
  ADD COLUMN exchange_rate DECIMAL(18,6) NOT NULL DEFAULT 1 AFTER currency;

ALTER TABLE prc_documents
  ADD COLUMN exchange_rate DECIMAL(18,6) NOT NULL DEFAULT 1 AFTER currency;

-- ---------------------------------------------------------------------------
-- Backfill: akun selisih kurs (realisasi & belum terealisasi)
-- ---------------------------------------------------------------------------

INSERT INTO md_accounts (id, workspace_id, code, name, account_type, is_active)
SELECT UUID(), w.id, x.code, x.name, x.account_type, 1
  FROM workspaces w
  CROSS JOIN (
    SELECT '4900' COLLATE utf8mb4_unicode_ci AS code, 'Laba Selisih Kurs' AS name, 'revenue' AS account_type
    UNION ALL SELECT '4910', 'Laba Selisih Kurs Belum Terealisasi', 'revenue'
    UNION ALL SELECT '6900', 'Rugi Selisih Kurs', 'expense'
    UNION ALL SELECT '6910', 'Rugi Selisih Kurs Belum Terealisasi', 'expense'
  ) x
 WHERE NOT EXISTS (
   SELECT 1 FROM md_accounts a WHERE a.workspace_id = w.id AND a.code = x.code
 );

-- ---------------------------------------------------------------------------
-- Backfill: mata uang awal tiap workspace (IDR = mata uang dasar/pelaporan)
-- ---------------------------------------------------------------------------

INSERT INTO md_currencies (id, workspace_id, code, name, symbol, decimals, is_base, is_active)
SELECT UUID(), w.id, c.code, c.name, c.symbol, c.decimals, c.is_base, 1
  FROM workspaces w
  CROSS JOIN (
    SELECT 'IDR' COLLATE utf8mb4_unicode_ci AS code, 'Rupiah Indonesia' AS name, 'Rp' AS symbol, 0 AS decimals, 1 AS is_base
    UNION ALL SELECT 'USD', 'US Dollar', '$', 2, 0
    UNION ALL SELECT 'SGD', 'Singapore Dollar', 'S$', 2, 0
    UNION ALL SELECT 'EUR', 'Euro', '€', 2, 0
    UNION ALL SELECT 'JPY', 'Japanese Yen', '¥', 0, 0
    UNION ALL SELECT 'CNY', 'Chinese Yuan', '¥', 2, 0
    UNION ALL SELECT 'AUD', 'Australian Dollar', 'A$', 2, 0
    UNION ALL SELECT 'GBP', 'Pound Sterling', '£', 2, 0
    UNION ALL SELECT 'MYR', 'Malaysian Ringgit', 'RM', 2, 0
  ) c
 WHERE NOT EXISTS (
   SELECT 1 FROM md_currencies mc WHERE mc.workspace_id = w.id AND mc.code = c.code
 );

-- Workspace lama yang seluruh mata uangnya belum ditandai dasar: IDR jadi dasar.
UPDATE md_currencies mc
   SET mc.is_base = 1
 WHERE mc.code = 'IDR'
   AND NOT EXISTS (
     SELECT 1 FROM (SELECT workspace_id FROM md_currencies WHERE is_base = 1) b
      WHERE b.workspace_id = mc.workspace_id
   );
