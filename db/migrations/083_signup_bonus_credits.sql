-- Bonus kredit Studio AI untuk tenant yang baru mendaftar (0 = mati). Idempoten.
SET @c1 := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_studio_settings' AND COLUMN_NAME = 'signup_bonus_credits');
SET @ddl := IF(@c1 = 0, 'ALTER TABLE ai_studio_settings ADD COLUMN signup_bonus_credits int NOT NULL DEFAULT 5', 'SELECT 1');
PREPARE sb_stmt FROM @ddl;
EXECUTE sb_stmt;
DEALLOCATE PREPARE sb_stmt;
