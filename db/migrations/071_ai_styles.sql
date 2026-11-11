-- Studio AI: gaya gerakan bisa diatur.
--  * `ai_studio_settings.styles`: gaya bawaan platform (nama, keterangan, prompt, aktif) — null = bawaan di kode.
--  * `ai_user_styles`: "Gaya saya" per workspace = gaya bawaan + arahan tersimpan, dipakai ulang satu tim.
ALTER TABLE ai_studio_settings ADD COLUMN styles json NULL;

CREATE TABLE IF NOT EXISTS ai_user_styles (
  id char(36) NOT NULL,
  workspace_id char(36) NOT NULL,
  name varchar(60) NOT NULL,
  style varchar(30) NOT NULL,
  note varchar(500) NOT NULL DEFAULT '',
  created_by char(36) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_ai_user_styles_ws (workspace_id, created_at),
  CONSTRAINT fk_ai_user_styles_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
