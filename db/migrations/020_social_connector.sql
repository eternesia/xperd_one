-- Ronde 40 (BS New 11): konektor sosial Super Admin (Tebar) dan kolom postingan Qalling.
--  * `tebar_settings`: satu baris `platform` berisi API key Tebar (server-only, tidak masuk
--    lapisan data generik).
--  * `crm_scheduled_posts`: asal postingan (`source`: manual | tebar), id eksternal Tebar,
--    media dari pustaka (`media_paths`, JSON array path `crm/media/...`) dan tautan hasil terbit.
CREATE TABLE IF NOT EXISTS tebar_settings (
  id varchar(20) NOT NULL,
  api_key varchar(300) NULL,
  status varchar(20) NOT NULL DEFAULT 'none',           -- none | verified | invalid
  last_error text NULL,
  verified_at datetime(6) NULL,
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE crm_scheduled_posts
  ADD COLUMN external_id varchar(255) NULL,
  ADD COLUMN source varchar(20) NOT NULL DEFAULT 'manual',
  ADD COLUMN media_paths json NULL,
  ADD COLUMN permalinks json NULL,
  ADD KEY ix_crm_scheduled_posts_ext (workspace_id, external_id);
