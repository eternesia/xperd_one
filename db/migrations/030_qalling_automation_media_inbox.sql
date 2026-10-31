-- Ronde 48 (BS New 12, migrasi 0017/0021/0022/0023 + 0018 indeks): automasi kaya, DM→Leads, folder media, like komentar,
-- gambar CMS beranda (data-URL WebP ≤ ~1 MB → mediumtext), dan indeks skala.
ALTER TABLE site_content MODIFY COLUMN image_url mediumtext NULL;

ALTER TABLE crm_conversations
  ADD COLUMN lead_id char(36) NULL,
  ADD KEY ix_crm_conversations_lead (lead_id),
  ADD CONSTRAINT fk_crm_conversations_lead FOREIGN KEY (lead_id) REFERENCES crm_leads (id) ON DELETE SET NULL;

ALTER TABLE crm_media
  ADD COLUMN folder varchar(60) NULL,
  ADD KEY ix_crm_media_ws_folder (workspace_id, folder),
  ADD CONSTRAINT ck_crm_media_folder CHECK (folder IS NULL OR CHAR_LENGTH(folder) BETWEEN 1 AND 60);

ALTER TABLE crm_social_comments ADD COLUMN liked_at datetime(6) NULL;

ALTER TABLE crm_automation_rules
  ADD COLUMN external_id varchar(100) NULL,
  ADD COLUMN action_kind varchar(20) NOT NULL DEFAULT 'reply',
  ADD COLUMN public_reply text NULL,
  ADD COLUMN link_label varchar(40) NULL,
  ADD COLUMN link_url text NULL,
  ADD COLUMN track_clicks tinyint(1) NOT NULL DEFAULT 1,
  ADD COLUMN follow_gate tinyint(1) NOT NULL DEFAULT 0,
  ADD COLUMN follow_ask text NULL,
  ADD COLUMN follow_button varchar(40) NULL,
  ADD COLUMN follow_retry text NULL,
  ADD COLUMN auto_like tinyint(1) NOT NULL DEFAULT 0,
  ADD COLUMN click_count int NOT NULL DEFAULT 0,
  ADD CONSTRAINT ck_crm_automation_action_kind CHECK (action_kind IN ('reply','comment_to_dm'));

-- Indeks daftar/kuota (New 12 `0018`); indeks fungsional per-bulan dilewati (MySQL: kueri kuota memakai rentang tanggal).
CREATE INDEX ix_crm_posts_ws_schedule ON crm_scheduled_posts (workspace_id, scheduled_at);
CREATE INDEX ix_crm_posts_ws_status_schedule ON crm_scheduled_posts (workspace_id, status, scheduled_at);
CREATE INDEX ix_crm_accounts_ws_status ON crm_social_accounts (workspace_id, status);
CREATE INDEX ix_crm_media_ws_created ON crm_media (workspace_id, created_at);
