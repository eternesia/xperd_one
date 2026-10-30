-- Ronde 38 (BS New 11): Qalling Ideas (Kanban ide konten) dan Media Library.
--  * crm_idea_columns / crm_ideas: papan ide per workspace (kolom bawaan Todo/Progress/Done
--    dibuat dari UI saat papan masih kosong).
--  * crm_media: metadata pustaka media; berkasnya di STORAGE_DIR (`crm/media/...`), bukan bucket
--    Supabase. Tidak ada trigger kuota (kuota tier = klaster wallet/entitlement, menunggu keputusan).
CREATE TABLE IF NOT EXISTS crm_idea_columns (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  name varchar(80) NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_crm_idea_columns_ws (workspace_id),
  CONSTRAINT fk_crm_idea_columns_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_ideas (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  column_id char(36) NOT NULL,
  title varchar(200) NOT NULL,
  body text NOT NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_crm_ideas_ws (workspace_id),
  KEY ix_crm_ideas_column (column_id),
  CONSTRAINT fk_crm_ideas_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_ideas_column FOREIGN KEY (column_id) REFERENCES crm_idea_columns (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_media (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  name varchar(255) NOT NULL,
  file_path varchar(500) NOT NULL,
  mime_type varchar(100) NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  created_by char(36) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_crm_media_ws (workspace_id, created_at),
  UNIQUE KEY uq_crm_media_path (file_path),
  CONSTRAINT fk_crm_media_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
