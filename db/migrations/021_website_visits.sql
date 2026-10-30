-- Ronde 41 (BS New 11): statistik pengunjung website XPERD & Qalling (Super Admin → Pengunjung Website).
-- Dicatat lewat endpoint publik `POST /api/public/visit` (padanan fungsi `record_website_visit`):
-- validasi jalur/situs di aplikasi, `id` dari klien membuat pencatatan idempoten.
CREATE TABLE IF NOT EXISTS website_visits (
  id char(36) NOT NULL,
  site varchar(10) NOT NULL,                  -- xperd | qalling
  path varchar(200) NOT NULL,
  session_id char(36) NOT NULL,
  referrer_host varchar(200) NOT NULL DEFAULT '',
  device varchar(10) NOT NULL,                -- mobile | desktop
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_website_visits_date (created_at, site)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
