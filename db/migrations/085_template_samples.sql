-- Contoh video per tipe template Studio (ditampilkan ke pengguna sebagai pratinjau). Idempoten.
SET @c1 := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_studio_settings' AND COLUMN_NAME = 'template_samples');
SET @ddl := IF(@c1 = 0, 'ALTER TABLE ai_studio_settings ADD COLUMN template_samples json NULL', 'SELECT 1');
PREPARE ts_stmt FROM @ddl;
EXECUTE ts_stmt;
DEALLOCATE PREPARE ts_stmt;
