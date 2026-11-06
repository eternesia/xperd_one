-- BS New 19 (Production): biaya konversi per unit hasil di profil item (tenaga kerja + biaya lain), kolom other_cost di biaya order
-- dan kunci pemetaan akun `other_applied` (jurnal J4). Idempoten lewat information_schema.

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mfg_item_profiles' AND COLUMN_NAME = 'conv_labor_per_unit');
SET @ddl := IF(@c = 0, 'ALTER TABLE mfg_item_profiles ADD COLUMN conv_labor_per_unit BIGINT NOT NULL DEFAULT 0, ADD COLUMN conv_other_per_unit BIGINT NOT NULL DEFAULT 0, ADD CONSTRAINT ck_mfg_prof_conv CHECK (conv_labor_per_unit >= 0 AND conv_other_per_unit >= 0)', 'SELECT 1');
PREPARE mfg_stmt FROM @ddl; EXECUTE mfg_stmt; DEALLOCATE PREPARE mfg_stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mfg_order_costs' AND COLUMN_NAME = 'other_cost');
SET @ddl := IF(@c = 0, 'ALTER TABLE mfg_order_costs ADD COLUMN other_cost BIGINT NOT NULL DEFAULT 0 AFTER overhead_cost', 'SELECT 1');
PREPARE mfg_stmt FROM @ddl; EXECUTE mfg_stmt; DEALLOCATE PREPARE mfg_stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'ck_mfg_am_key' AND CHECK_CLAUSE LIKE '%other_applied%');
SET @ddl := IF(@c = 0, 'ALTER TABLE mfg_account_mappings DROP CHECK ck_mfg_am_key', 'SELECT 1');
PREPARE mfg_stmt FROM @ddl; EXECUTE mfg_stmt; DEALLOCATE PREPARE mfg_stmt;
SET @c := (SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'ck_mfg_am_key');
SET @ddl := IF(@c = 0, 'ALTER TABLE mfg_account_mappings ADD CONSTRAINT ck_mfg_am_key CHECK (mapping_key IN (''rm_inventory'',''wip_material'',''wip_conversion'',''fg_inventory'',''labor_applied'',''overhead_applied'',''other_applied'',''production_variance'',''scrap_loss''))', 'SELECT 1');
PREPARE mfg_stmt FROM @ddl; EXECUTE mfg_stmt; DEALLOCATE PREPARE mfg_stmt;
