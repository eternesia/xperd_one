-- Asisten teks Studio (opsional): penyedia LLM kompatibel OpenAI (Anthropic, OpenRouter, OpenAI, dll.)
-- untuk "mode perintah". Kosong = pengurai aturan tanpa API. Idempoten.
SET @c1 := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_studio_settings' AND COLUMN_NAME = 'text_llm');
SET @ddl := IF(@c1 = 0, 'ALTER TABLE ai_studio_settings ADD COLUMN text_llm json NULL', 'SELECT 1');
PREPARE tl_stmt FROM @ddl;
EXECUTE tl_stmt;
DEALLOCATE PREPARE tl_stmt;
