-- Studio Video: harga Template per durasi (JSON [{max_s, credits}]); kosong = harga bawaan di kode. Aman diulang.
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_studio_settings' AND COLUMN_NAME = 'template_prices');
SET @ddl := IF(@c = 0, 'ALTER TABLE ai_studio_settings ADD COLUMN template_prices json NULL', 'SELECT 1');
PREPARE ai_stmt FROM @ddl; EXECUTE ai_stmt; DEALLOCATE PREPARE ai_stmt;
