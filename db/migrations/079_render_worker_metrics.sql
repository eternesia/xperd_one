-- Metrik mesin render video (CPU, RAM, disk, uptime) yang dikirim saat melapor ke /render-worker/claim,
-- untuk halaman Kesehatan Sistem di superadmin. Idempoten.
SET @c1 := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_studio_settings' AND COLUMN_NAME = 'worker_metrics');
SET @ddl := IF(@c1 = 0, 'ALTER TABLE ai_studio_settings ADD COLUMN worker_metrics json NULL AFTER worker_info', 'SELECT 1');
PREPARE rw_stmt FROM @ddl;
EXECUTE rw_stmt;
DEALLOCATE PREPARE rw_stmt;
