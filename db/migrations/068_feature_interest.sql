-- Uji minat fitur sebelum dibangun (mis. Studio AI foto ke video). Satu baris per pengguna per fitur per jenis kejadian.
CREATE TABLE IF NOT EXISTS feature_interest (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  feature VARCHAR(50) NOT NULL,
  event VARCHAR(20) NOT NULL,            -- click | want
  user_id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NULL,
  note VARCHAR(500) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_feature_interest (feature, event, user_id),
  KEY idx_feature_interest (feature, event, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO announcements (title_en, title_id, body_en, body_id, severity, audience, ends_at, is_published)
SELECT 'Coming soon: turn product photos into videos with AI',
       'Segera hadir: ubah foto produk jadi video dengan AI',
       'We are preparing an AI Studio that turns a product photo into a short promo video for Reels and TikTok, ready to schedule. Interested? Open Media and tap "Photo → AI video" to join the early list.',
       'Kami sedang menyiapkan Studio AI yang mengubah foto produk menjadi video promo singkat untuk Reels dan TikTok, langsung siap dijadwalkan. Tertarik? Buka menu Media lalu ketuk "Foto → Video AI" untuk masuk daftar awal.',
       'promo', 'all', DATE_ADD(NOW(6), INTERVAL 30 DAY), 1
 WHERE NOT EXISTS (SELECT 1 FROM announcements WHERE title_en = 'Coming soon: turn product photos into videos with AI');
