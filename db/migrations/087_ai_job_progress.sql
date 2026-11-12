-- Kemajuan render (0–100) yang dilaporkan mesin render, untuk progres % di Studio. Idempoten.
SET @c1 := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_jobs' AND COLUMN_NAME = 'progress');
SET @ddl := IF(@c1 = 0, 'ALTER TABLE ai_jobs ADD COLUMN progress tinyint unsigned NULL AFTER status', 'SELECT 1');
PREPARE p_stmt FROM @ddl;
EXECUTE p_stmt;
DEALLOCATE PREPARE p_stmt;
