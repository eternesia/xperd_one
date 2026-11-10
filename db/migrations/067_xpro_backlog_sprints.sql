-- XPro Backlog & Sprint (ala Jira).
--  * prj_sprints: sprint per proyek (project_id NULL = tugas internal). Status planned → active → completed.
--  * prj_tasks.backlog = 1: tugas belum dimulai — tidak tampil di Kanban, Tugas Saya, Beban Kerja,
--    dan pengingat. Tugas lama tetap 0 (tetap di Kanban). Memulai sprint mengubah tugasnya menjadi 0.
--  * prj_tasks.sprint_id: sprint tempat tugas direncanakan/dikerjakan (dilepas otomatis bila sprint dihapus).
CREATE TABLE IF NOT EXISTS prj_sprints (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  project_id char(36) NULL,
  name varchar(120) NOT NULL,
  goal text NULL,
  start_date date NULL,
  end_date date NULL,
  status varchar(12) NOT NULL DEFAULT 'planned',
  completed_at datetime(6) NULL,
  created_by char(36) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_prj_sprints_ws (workspace_id, project_id, status),
  CONSTRAINT fk_prj_sprints_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_prj_sprints_project FOREIGN KEY (project_id) REFERENCES prj_projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE prj_tasks
  ADD COLUMN backlog tinyint(1) NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN sprint_id char(36) NULL AFTER backlog,
  ADD KEY ix_prj_tasks_backlog (workspace_id, backlog),
  ADD KEY ix_prj_tasks_sprint (sprint_id),
  ADD CONSTRAINT fk_prj_tasks_sprint FOREIGN KEY (sprint_id) REFERENCES prj_sprints (id) ON DELETE SET NULL;
