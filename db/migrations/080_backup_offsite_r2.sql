-- Backup ke object storage (Cloudflare R2/S3): bucket khusus backup + status unggah per backup. Idempoten.
SET @c1 := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_storage_settings' AND COLUMN_NAME = 'backup_bucket');
SET @ddl := IF(@c1 = 0, 'ALTER TABLE platform_storage_settings ADD COLUMN backup_bucket varchar(100) NOT NULL DEFAULT '''' AFTER bucket', 'SELECT 1');
PREPARE bk_stmt FROM @ddl;
EXECUTE bk_stmt;
DEALLOCATE PREPARE bk_stmt;

SET @c2 := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_backups' AND COLUMN_NAME = 'remote_status');
SET @ddl := IF(@c2 = 0, 'ALTER TABLE system_backups ADD COLUMN remote_status varchar(12) NULL AFTER target, ADD COLUMN remote_key varchar(255) NULL AFTER remote_status, ADD COLUMN remote_error varchar(500) NULL AFTER remote_key, ADD COLUMN remote_at datetime(6) NULL AFTER remote_error', 'SELECT 1');
PREPARE bk_stmt FROM @ddl;
EXECUTE bk_stmt;
DEALLOCATE PREPARE bk_stmt;
