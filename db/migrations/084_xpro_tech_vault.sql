-- XPro: dokumentasi teknis & serah terima per proyek (repo, database, server, URL, akses,
-- catatan). Rahasia (password/token) disimpan terenkripsi AES-256-GCM oleh aplikasi. Idempoten.
CREATE TABLE IF NOT EXISTS prj_tech_assets (
  id char(36) NOT NULL,
  workspace_id char(36) NOT NULL,
  project_id char(36) NOT NULL,
  kind varchar(20) NOT NULL DEFAULT 'other',
  name varchar(150) NOT NULL,
  environment varchar(20) NOT NULL DEFAULT 'production',
  url varchar(500) NULL,
  host varchar(255) NULL,
  username varchar(150) NULL,
  secret_label varchar(60) NULL,
  secret_cipher text NULL,
  account_owner varchar(150) NULL,
  notes text NULL,
  last_verified_at datetime NULL,
  created_by char(36) NULL,
  updated_by char(36) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_prj_tech_assets_project (project_id),
  KEY ix_prj_tech_assets_ws (workspace_id),
  CONSTRAINT fk_prj_tech_assets_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_prj_tech_assets_project FOREIGN KEY (project_id) REFERENCES prj_projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prj_tech_notes (
  id char(36) NOT NULL,
  workspace_id char(36) NOT NULL,
  project_id char(36) NOT NULL,
  category varchar(20) NOT NULL DEFAULT 'other',
  title varchar(200) NOT NULL,
  body mediumtext NULL,
  created_by char(36) NULL,
  updated_by char(36) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_prj_tech_notes_project (project_id),
  CONSTRAINT fk_prj_tech_notes_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_prj_tech_notes_project FOREIGN KEY (project_id) REFERENCES prj_projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prj_tech_access_log (
  id char(36) NOT NULL,
  workspace_id char(36) NOT NULL,
  project_id char(36) NOT NULL,
  asset_id char(36) NULL,
  user_id char(36) NULL,
  action varchar(20) NOT NULL,
  detail varchar(255) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_prj_tech_log_project (project_id, created_at),
  CONSTRAINT fk_prj_tech_log_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
