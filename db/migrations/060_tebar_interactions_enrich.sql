-- Data Tebar yang lebih lengkap: gambar & tautan postingan pada komentar, jenis & statistik otomasi hasil sinkron.
ALTER TABLE crm_social_comments
  ADD COLUMN post_thumbnail_url text NULL,
  ADD COLUMN post_permalink text NULL,
  ADD COLUMN post_caption varchar(300) NULL;

ALTER TABLE crm_automation_rules
  ADD COLUMN tebar_kind varchar(30) NULL,
  ADD COLUMN run_count int NOT NULL DEFAULT 0,
  ADD COLUMN last_run_at datetime(6) NULL,
  ADD COLUMN synced_at datetime(6) NULL,
  ADD KEY ix_crm_automation_ext (workspace_id, external_id);
