-- Studio AI Qalling: foto produk → video promo singkat, dibayar kredit AI dari saldo wallet (1 kredit = Rp1.000).
-- Fitur DIMATIKAN secara bawaan (`enabled = 0`): selama OFF hanya Super Admin yang bisa memakainya (mode uji);
-- pengguna biasa tetap melihat tombol "segera hadir" (uji minat, migrasi 068).
--  * `ai_studio_settings`: satu baris `platform` — saklar, API key penyedia (server-only), tingkat & harga.
--  * `ai_jobs`: satu baris per permintaan pembuatan video (status, biaya, penyedia, model, hasil).
--  * `crm_media.ai_generated`: label "AI" pada hasil di pustaka Media.
CREATE TABLE IF NOT EXISTS ai_studio_settings (
  id varchar(20) NOT NULL,
  enabled tinyint(1) NOT NULL DEFAULT 0,
  fal_api_key varchar(300) NULL,
  atlas_api_key varchar(300) NULL,
  tiers json NULL,                                      -- null = pakai bawaan di kode (src/lib/ai-studio.ts)
  daily_limit int NOT NULL DEFAULT 10,                  -- per workspace per 24 jam
  usd_idr int NOT NULL DEFAULT 16500,                   -- kurs untuk laporan margin
  updated_by char(36) NULL,
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO ai_studio_settings (id, enabled) VALUES ('platform', 0);

CREATE TABLE IF NOT EXISTS ai_jobs (
  id char(36) NOT NULL,
  workspace_id char(36) NOT NULL,
  tenant_id char(36) NOT NULL,
  user_id char(36) NULL,
  kind varchar(30) NOT NULL DEFAULT 'image_to_video',
  status varchar(20) NOT NULL DEFAULT 'queued',         -- queued | processing | saving | done | failed
  tier varchar(20) NOT NULL,                            -- hemat | standar | premium
  provider varchar(20) NOT NULL,                        -- fal | atlas
  model varchar(200) NOT NULL,
  style varchar(30) NOT NULL,
  prompt text NOT NULL,
  user_note varchar(500) NULL,
  source_media_id char(36) NOT NULL,
  duration_s tinyint NOT NULL,
  aspect_ratio varchar(10) NOT NULL,
  credits int NOT NULL,
  charged_idr int NOT NULL DEFAULT 0,
  refunded tinyint(1) NOT NULL DEFAULT 0,
  est_cost_usd decimal(10,4) NULL,
  external_id varchar(255) NULL,
  status_url varchar(1000) NULL,
  response_url varchar(1000) NULL,
  result_media_id char(36) NULL,
  error text NULL,
  is_admin_test tinyint(1) NOT NULL DEFAULT 0,
  submitted_at datetime(6) NULL,
  finished_at datetime(6) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_ai_jobs_ws (workspace_id, created_at),
  KEY ix_ai_jobs_status (status, updated_at),
  CONSTRAINT ck_ai_jobs_status CHECK (status IN ('queued','processing','saving','done','failed')),
  CONSTRAINT fk_ai_jobs_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE crm_media ADD COLUMN ai_generated tinyint(1) NOT NULL DEFAULT 0;
