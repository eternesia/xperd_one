-- 050: Production UX — level BoM, status spesifikasi QC (draft/approved), dan tab perencanaan (peralatan, lokasi gudang, sumber).
-- Idempoten lewat information_schema. Spesifikasi QC lama dianggap sudah approved.

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mfg_boms' AND COLUMN_NAME = 'bom_level');
SET @ddl := IF(@c = 0, 'ALTER TABLE mfg_boms ADD COLUMN bom_level TINYINT NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE mfg_stmt FROM @ddl;
EXECUTE mfg_stmt;
DEALLOCATE PREPARE mfg_stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mfg_qc_specs' AND COLUMN_NAME = 'status');
SET @ddl := IF(@c = 0, 'ALTER TABLE mfg_qc_specs ADD COLUMN status VARCHAR(10) NOT NULL DEFAULT ''approved'', ADD COLUMN approved_by CHAR(36) NULL, ADD COLUMN approved_at DATETIME(6) NULL', 'SELECT 1');
PREPARE mfg_stmt FROM @ddl;
EXECUTE mfg_stmt;
DEALLOCATE PREPARE mfg_stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mfg_orders' AND COLUMN_NAME = 'equipment');
SET @ddl := IF(@c = 0, 'ALTER TABLE mfg_orders ADD COLUMN equipment JSON NULL, ADD COLUMN location_from VARCHAR(80) NULL, ADD COLUMN location_to VARCHAR(80) NULL, ADD COLUMN source_type VARCHAR(10) NOT NULL DEFAULT ''bom'', ADD COLUMN qc_spec_id CHAR(36) NULL, ADD COLUMN approved_by CHAR(36) NULL, ADD COLUMN approved_at DATETIME(6) NULL', 'SELECT 1');
PREPARE mfg_stmt FROM @ddl;
EXECUTE mfg_stmt;
DEALLOCATE PREPARE mfg_stmt;

-- Status BoM disederhanakan menjadi draft / approved: versi yang menggantung di 'in_review' dikembalikan ke draft.
UPDATE mfg_bom_versions SET status = 'draft' WHERE status = 'in_review';
