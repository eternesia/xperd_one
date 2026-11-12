-- Berkas unggahan (media, dokumen) disimpan di bucket object storage (R2). Sakelar default OFF. Idempoten.
SET @c1 := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_storage_settings' AND COLUMN_NAME = 'media_on_r2');
SET @ddl := IF(@c1 = 0, 'ALTER TABLE platform_storage_settings ADD COLUMN media_on_r2 tinyint(1) NOT NULL DEFAULT 0 AFTER backup_bucket, ADD COLUMN media_migration json NULL AFTER media_on_r2', 'SELECT 1');
PREPARE m_stmt FROM @ddl;
EXECUTE m_stmt;
DEALLOCATE PREPARE m_stmt;
