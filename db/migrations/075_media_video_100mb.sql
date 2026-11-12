-- Batas unggah video dinaikkan: bawaan 100 MB, maksimum yang bisa diatur Super Admin 500 MB. Aman diulang.
-- DROP CONSTRAINT (bukan DROP CHECK) supaya jalan di MySQL 8.0.19+ dan MariaDB.
SET @c := (SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'ck_media_video' AND CHECK_CLAUSE LIKE '%500%');
SET @ddl := IF(@c = 0 AND (SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'ck_media_video') > 0, 'ALTER TABLE media_upload_settings DROP CONSTRAINT ck_media_video', 'SELECT 1');
PREPARE media_stmt FROM @ddl; EXECUTE media_stmt; DEALLOCATE PREPARE media_stmt;
SET @c := (SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'ck_media_video');
SET @ddl := IF(@c = 0, 'ALTER TABLE media_upload_settings ADD CONSTRAINT ck_media_video CHECK (video_mb BETWEEN 1 AND 500)', 'SELECT 1');
PREPARE media_stmt FROM @ddl; EXECUTE media_stmt; DEALLOCATE PREPARE media_stmt;
ALTER TABLE media_upload_settings MODIFY video_mb int NOT NULL DEFAULT 100;
UPDATE media_upload_settings SET video_mb = 100 WHERE video_mb < 100;
