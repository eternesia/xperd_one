-- Ronde 36 (BS New 11): XPro Kanban dengan kolom dinamis per proyek.
--  * `prj_board_columns`: kolom papan per proyek. `prj_tasks.status` menyimpan
--    `key` kolom (bukan enum), jadi status lama ('todo', 'done', …) tetap valid —
--    kartu dengan status tak dikenal jatuh ke kolom pertama (resolveColumnKey).
--  * Idempoten; tanpa trigger. `updated_at` memakai ON UPDATE.
CREATE TABLE IF NOT EXISTS prj_board_columns (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  project_id char(36) NOT NULL,
  `key` varchar(40) NOT NULL,
  name varchar(120) NOT NULL,
  color varchar(20) NOT NULL DEFAULT 'info',
  is_done tinyint(1) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_prj_board_columns_key (project_id, `key`),
  KEY ix_prj_board_columns_ws (workspace_id),
  CONSTRAINT fk_prj_board_columns_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_prj_board_columns_project FOREIGN KEY (project_id) REFERENCES prj_projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
