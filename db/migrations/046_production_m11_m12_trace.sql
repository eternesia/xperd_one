-- BS New 16 · Production M11–M12: log limbah B3 + indeks penelusuran lot (traceability/recall).
-- Tanpa trigger/fungsi tersimpan: penelusuran & simulasi recall dihitung di src/lib/production-trace.functions.ts (CTE rekursif).
-- Tidak ada FK ke tabel tahap lain (mfg_orders dibuat tahap M6–M10); log limbah hanya di-INSERT, status/penanganan boleh diperbarui
-- (nilai lama tercatat di mfg_audit_log), kuantitas/kode/tanggal tidak berubah; "hapus" = arsip (is_active = 0).
-- Idempoten.

CREATE TABLE IF NOT EXISTS mfg_waste_logs (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  log_date DATE NOT NULL,
  waste_code VARCHAR(40) NOT NULL,
  description VARCHAR(500) NOT NULL,
  source_order_id CHAR(36) NULL,
  qty DECIMAL(18,4) NOT NULL,
  uom VARCHAR(20) NOT NULL,
  storage_location VARCHAR(120) NULL,
  handler_name VARCHAR(120) NULL,
  manifest_no VARCHAR(80) NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'stored',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_mfg_waste_ws (workspace_id, log_date),
  CONSTRAINT ck_mfg_waste CHECK (qty > 0 AND CHAR_LENGTH(TRIM(waste_code)) > 0 AND CHAR_LENGTH(TRIM(description)) > 0),
  CONSTRAINT ck_mfg_waste_status CHECK (status IN ('stored','handed_over','disposed')),
  CONSTRAINT fk_mfg_waste_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Indeks penelusuran: dibuat hanya bila kolom milik tahap lain sudah ada dan indeks belum ada (tanpa rutin tersimpan).
SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'mfg_lot_genealogy' AND column_name = 'parent_lot_id');
SET @has_idx = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'mfg_lot_genealogy' AND index_name = 'mfg_gen_parent_idx');
SET @ddl = IF(@has_col > 0 AND @has_idx = 0, 'CREATE INDEX mfg_gen_parent_idx ON mfg_lot_genealogy (workspace_id, parent_lot_id)', 'DO 0');
PREPARE mfg_stmt FROM @ddl; EXECUTE mfg_stmt; DEALLOCATE PREPARE mfg_stmt;
SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'mfg_lot_genealogy' AND column_name = 'child_lot_id');
SET @has_idx = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'mfg_lot_genealogy' AND index_name = 'mfg_gen_child_idx');
SET @ddl = IF(@has_col > 0 AND @has_idx = 0, 'CREATE INDEX mfg_gen_child_idx ON mfg_lot_genealogy (workspace_id, child_lot_id)', 'DO 0');
PREPARE mfg_stmt FROM @ddl; EXECUTE mfg_stmt; DEALLOCATE PREPARE mfg_stmt;
SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sls_document_lines' AND column_name = 'mfg_lot_id');
SET @has_idx = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'sls_document_lines' AND index_name = 'sls_lines_mfg_lot_idx');
SET @ddl = IF(@has_col > 0 AND @has_idx = 0, 'CREATE INDEX sls_lines_mfg_lot_idx ON sls_document_lines (workspace_id, mfg_lot_id)', 'DO 0');
PREPARE mfg_stmt FROM @ddl; EXECUTE mfg_stmt; DEALLOCATE PREPARE mfg_stmt;
