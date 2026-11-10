-- XPro tugas v2: manajemen tugas & beban kerja tim.
--  * prj_tasks: deskripsi, prioritas, estimasi jam, completed_at, pembuat; project_id boleh NULL
--    (tugas internal tanpa proyek).
--  * prj_task_assignees: banyak PIC per tugas, tertaut ke akun (user_id). `name` = snapshot nama;
--    user_id NULL bila PIC lama tidak cocok dengan akun mana pun (tetap tampil di beban kerja).
--    Kolom lama prj_tasks.assignee dipertahankan = nama PIC pertama (kompatibel dengan tampilan lama).
--  * prj_task_checklist, prj_task_comments: checklist/subtugas dan komentar per tugas.
--  * prj_capacity: kapasitas jam kerja per minggu per orang (default 40 bila tidak ada baris).
--  * app_notifications: notifikasi in-app per pengguna (bel di topbar); dedupe_key anti-ganda.

ALTER TABLE prj_tasks
  MODIFY project_id char(36) NULL,
  ADD COLUMN description text NULL AFTER name,
  ADD COLUMN priority varchar(10) NOT NULL DEFAULT 'medium' AFTER status,
  ADD COLUMN estimate_hours decimal(8,2) NULL AFTER priority,
  ADD COLUMN completed_at datetime(6) NULL AFTER estimate_hours,
  ADD COLUMN created_by char(36) NULL AFTER completed_at,
  ADD KEY ix_prj_tasks_due (workspace_id, due_date);

CREATE TABLE IF NOT EXISTS prj_task_assignees (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  task_id char(36) NOT NULL,
  user_id char(36) NULL,
  name varchar(255) NOT NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_prj_task_assignees_user (task_id, user_id),
  KEY ix_prj_task_assignees_ws_user (workspace_id, user_id),
  CONSTRAINT fk_prj_task_assignees_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_prj_task_assignees_task FOREIGN KEY (task_id) REFERENCES prj_tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prj_task_checklist (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  task_id char(36) NOT NULL,
  title varchar(500) NOT NULL,
  is_done tinyint(1) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_prj_task_checklist_task (task_id, sort_order),
  CONSTRAINT fk_prj_task_checklist_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_prj_task_checklist_task FOREIGN KEY (task_id) REFERENCES prj_tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prj_task_comments (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  task_id char(36) NOT NULL,
  user_id char(36) NULL,
  author_name varchar(255) NOT NULL,
  body text NOT NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_prj_task_comments_task (task_id, created_at),
  CONSTRAINT fk_prj_task_comments_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_prj_task_comments_task FOREIGN KEY (task_id) REFERENCES prj_tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prj_capacity (
  workspace_id char(36) NOT NULL,
  user_id char(36) NOT NULL,
  hours_per_week decimal(6,2) NOT NULL DEFAULT 40,
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT fk_prj_capacity_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_notifications (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  user_id char(36) NOT NULL,
  kind varchar(40) NOT NULL,
  title varchar(255) NOT NULL,
  body varchar(1000) NULL,
  link varchar(500) NULL,
  dedupe_key varchar(190) NULL,
  read_at datetime(6) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_notifications_dedupe (dedupe_key),
  KEY ix_app_notifications_user (user_id, workspace_id, read_at, created_at),
  CONSTRAINT fk_app_notifications_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pindahkan PIC lama (teks) ke prj_task_assignees. Urutan pencocokan akun:
-- 1) anggota proyek dengan nama sama → email akun; 2) nama lengkap akun; 3) email akun.
INSERT INTO prj_task_assignees (id, workspace_id, task_id, user_id, name)
SELECT uuid(), t.workspace_id, t.id,
  COALESCE(
    (SELECT u.id FROM prj_members pm
       JOIN app_users u ON LOWER(u.email) = LOWER(TRIM(pm.email))
       JOIN workspace_members wm ON wm.user_id = u.id AND wm.workspace_id = t.workspace_id
      WHERE pm.project_id = t.project_id AND LOWER(TRIM(pm.name)) = LOWER(TRIM(t.assignee))
      LIMIT 1),
    (SELECT u.id FROM app_users u
       JOIN workspace_members wm ON wm.user_id = u.id AND wm.workspace_id = t.workspace_id
      WHERE LOWER(TRIM(u.full_name)) = LOWER(TRIM(t.assignee))
      LIMIT 1),
    (SELECT u.id FROM app_users u
       JOIN workspace_members wm ON wm.user_id = u.id AND wm.workspace_id = t.workspace_id
      WHERE LOWER(u.email) = LOWER(TRIM(t.assignee))
      LIMIT 1)
  ),
  TRIM(t.assignee)
FROM prj_tasks t
WHERE t.assignee IS NOT NULL AND TRIM(t.assignee) <> ''
  AND NOT EXISTS (SELECT 1 FROM prj_task_assignees a WHERE a.task_id = t.id);

-- Tanggal selesai untuk tugas yang sudah berada di kolom "selesai" (perkiraan: updated_at).
UPDATE prj_tasks t
SET t.completed_at = t.updated_at
WHERE t.completed_at IS NULL
  AND (
    EXISTS (SELECT 1 FROM prj_board_columns c
             WHERE c.project_id = t.project_id AND c.`key` = t.status AND c.is_done = 1)
    OR (t.status = 'done'
        AND NOT EXISTS (SELECT 1 FROM prj_board_columns c2 WHERE c2.project_id = t.project_id))
  );
