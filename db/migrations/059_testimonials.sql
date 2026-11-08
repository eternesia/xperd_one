-- Testimoni situs Qalling yang dikelola Super Admin (sebelumnya tertanam di kode).
CREATE TABLE IF NOT EXISTS testimonials (
  id char(36) NOT NULL DEFAULT (uuid()),
  name varchar(120) NOT NULL,
  role_id varchar(160) NULL,
  role_en varchar(160) NULL,
  quote_id text NOT NULL,
  quote_en text NULL,
  rating tinyint NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_published tinyint(1) NOT NULL DEFAULT 1,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_testimonials_pub (is_published, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO testimonials (id, name, role_id, role_en, quote_id, quote_en, sort_order)
SELECT * FROM (
  SELECT UUID() AS id, 'Rina' AS name, 'Pemilik UMKM fashion' AS role_id, 'Fashion small-business owner' AS role_en,
         'Jadwal posting seminggu beres dalam satu jam. Prospek dari DM langsung masuk ke pipeline.' AS quote_id,
         'A week of posts scheduled in one hour. Leads from DMs go straight into the pipeline.' AS quote_en, 1 AS sort_order
  UNION ALL SELECT UUID(), 'Dimas', 'Agensi media sosial', 'Social media agency',
         'Banyak klien bisa dikelola dalam satu dasbor, dan laporan bulanan tinggal diunduh.',
         'Many clients in one dashboard, and monthly reports are one download away.', 2
  UNION ALL SELECT UUID(), 'Sari', 'Kreator konten', 'Content creator',
         'Rekomendasi jam emas membuat engagement saya naik. Cukup posting lewat chat AI.',
         'Golden-hour suggestions raised my engagement. I just post through AI chat.', 3
) seed WHERE NOT EXISTS (SELECT 1 FROM testimonials);
