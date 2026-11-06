-- Opsi posting per platform (mis. poll Threads, kolaborator Instagram, visibilitas LinkedIn, privasi YouTube/TikTok).
-- Bentuk: {"instagram": {...}, "threads": {...}}; diteruskan ke Tebar per akun target.
ALTER TABLE crm_scheduled_posts ADD COLUMN platform_options json NULL;
