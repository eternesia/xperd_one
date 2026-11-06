-- 049: BoM skincare — Phase (A–H), bentuk sediaan, sumber dokumen formula.
-- Satu bahan boleh muncul di lebih dari satu phase (mis. AL05 di Phase F dan H), sehingga
-- keunikan baris BoM menjadi (versi, item, phase). Idempoten lewat information_schema.

SET @c1 := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mfg_bom_lines' AND COLUMN_NAME = 'phase');
SET @ddl := IF(@c1 = 0, 'ALTER TABLE mfg_bom_lines ADD COLUMN phase VARCHAR(20) NOT NULL DEFAULT '''' AFTER line_type', 'SELECT 1');
PREPARE mfg_stmt FROM @ddl;
EXECUTE mfg_stmt;
DEALLOCATE PREPARE mfg_stmt;

SET @i1 := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mfg_bom_lines' AND INDEX_NAME = 'uq_mfg_bomline_item_phase');
SET @ddl := IF(@i1 = 0, 'ALTER TABLE mfg_bom_lines ADD UNIQUE KEY uq_mfg_bomline_item_phase (workspace_id, bom_version_id, item_id, phase)', 'SELECT 1');
PREPARE mfg_stmt FROM @ddl;
EXECUTE mfg_stmt;
DEALLOCATE PREPARE mfg_stmt;

SET @i2 := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mfg_bom_lines' AND INDEX_NAME = 'uq_mfg_bomline_item');
SET @ddl := IF(@i2 > 0, 'ALTER TABLE mfg_bom_lines DROP INDEX uq_mfg_bomline_item', 'SELECT 1');
PREPARE mfg_stmt FROM @ddl;
EXECUTE mfg_stmt;
DEALLOCATE PREPARE mfg_stmt;

SET @c2 := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mfg_bom_versions' AND COLUMN_NAME = 'dosage_form');
SET @ddl := IF(@c2 = 0, 'ALTER TABLE mfg_bom_versions ADD COLUMN dosage_form VARCHAR(80) NULL, ADD COLUMN source_document VARCHAR(200) NULL', 'SELECT 1');
PREPARE mfg_stmt FROM @ddl;
EXECUTE mfg_stmt;
DEALLOCATE PREPARE mfg_stmt;
