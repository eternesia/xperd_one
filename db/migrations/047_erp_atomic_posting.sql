-- BS New 16: posting ERP atomik. Kunci idempotensi dokumen, jejak pembatalan, jurnal pembalik, pembalikan stok bernilai asli
-- dan indeks replay HPP. Tanpa trigger/fungsi tersimpan: aturan ada di src/lib/erp-posting.server.ts (satu transaksi per dokumen).
-- Idempoten lewat information_schema.

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prc_documents' AND COLUMN_NAME = 'posting_key');
SET @ddl := IF(@c = 0, 'ALTER TABLE prc_documents ADD COLUMN posting_key CHAR(36) NULL, ADD COLUMN cancelled_on DATE NULL, ADD COLUMN cancellation_reason TEXT NULL, ADD UNIQUE KEY uq_prc_posting_key (workspace_id, posting_key)', 'SELECT 1');
PREPARE erp_stmt FROM @ddl; EXECUTE erp_stmt; DEALLOCATE PREPARE erp_stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sls_documents' AND COLUMN_NAME = 'posting_key');
SET @ddl := IF(@c = 0, 'ALTER TABLE sls_documents ADD COLUMN posting_key CHAR(36) NULL, ADD COLUMN cancelled_on DATE NULL, ADD COLUMN cancellation_reason TEXT NULL, ADD UNIQUE KEY uq_sls_posting_key (workspace_id, posting_key)', 'SELECT 1');
PREPARE erp_stmt FROM @ddl; EXECUTE erp_stmt; DEALLOCATE PREPARE erp_stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'acc_journal_entries' AND COLUMN_NAME = 'reverses_journal_id');
SET @ddl := IF(@c = 0, 'ALTER TABLE acc_journal_entries ADD COLUMN reverses_journal_id CHAR(36) NULL, ADD UNIQUE KEY uq_journal_reversal (workspace_id, reverses_journal_id)', 'SELECT 1');
PREPARE erp_stmt FROM @ddl; EXECUTE erp_stmt; DEALLOCATE PREPARE erp_stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_movements' AND INDEX_NAME = 'uq_inv_reversal');
SET @ddl := IF(@c = 0, 'ALTER TABLE inv_movements ADD UNIQUE KEY uq_inv_reversal (workspace_id, mfg_reverses_id)', 'SELECT 1');
PREPARE erp_stmt FROM @ddl; EXECUTE erp_stmt; DEALLOCATE PREPARE erp_stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_movements' AND INDEX_NAME = 'idx_inv_cost_replay');
SET @ddl := IF(@c = 0, 'ALTER TABLE inv_movements ADD KEY idx_inv_cost_replay (workspace_id, item_code, movement_date, created_at, id)', 'SELECT 1');
PREPARE erp_stmt FROM @ddl; EXECUTE erp_stmt; DEALLOCATE PREPARE erp_stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'acc_journal_entries' AND INDEX_NAME = 'idx_journal_source');
SET @ddl := IF(@c = 0, 'ALTER TABLE acc_journal_entries ADD KEY idx_journal_source (workspace_id, source_id)', 'SELECT 1');
PREPARE erp_stmt FROM @ddl; EXECUTE erp_stmt; DEALLOCATE PREPARE erp_stmt;
