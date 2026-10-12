-- ===========================================================================
-- 016_xpro.sql — modul add-on **XPro** (Proyek & Kontrak, Milestone & Tugas,
-- RAB, Tagihan Termin/BAST), diporting apa adanya dari
-- `Xperd One Business Suite New 10` (drizzle/0021_xpro_projects_phase1.sql +
-- 0022_xpro_project_detail.sql) — mengikuti permintaan pemilik produk:
-- "tiru New 10 seperti apa adanya".
--
--  * 9 tabel: prj_projects, prj_milestones, prj_budget_lines, prj_billings,
--    prj_members, prj_tasks, prj_expenses, prj_documents, prj_progress_reports.
--  * `prj_billings.ar_document_id/ar_doc_number`: BAST yang disetujui diterbitkan
--    menjadi **draft AR Invoice** di `sls_documents` (sama seperti New 10: tanpa
--    jurnal — posting terjadi saat invoice di-submit di modul Sales).
--  * TANPA trigger/stored function (aturan repo): semua logika di level aplikasi.
--  * Idempotent (CREATE TABLE IF NOT EXISTS + ON DUPLICATE KEY pada katalog
--    add-on) mengikuti pola migrasi 004/009/013.
-- Runs once via the migrate runner (001..016 in order).
-- ===========================================================================

CREATE TABLE IF NOT EXISTS prj_projects (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  code varchar(100) NOT NULL,
  name varchar(255) NOT NULL,
  contract_no varchar(100) NULL,
  customer_code varchar(100) NULL,
  customer_name varchar(255) NULL,
  manager varchar(255) NULL,
  start_date date NULL,
  end_date date NULL,
  contract_value decimal(18,4) NOT NULL DEFAULT 0,
  retention_pct decimal(9,4) NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'planning',
  notes text NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_prj_projects_code (workspace_id, code),
  KEY ix_prj_projects_ws (workspace_id),
  CONSTRAINT fk_prj_projects_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prj_milestones (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  project_id char(36) NOT NULL,
  name varchar(255) NOT NULL,
  weight_pct decimal(9,4) NOT NULL DEFAULT 0,
  progress_pct decimal(9,4) NOT NULL DEFAULT 0,
  start_date date NULL,
  due_date date NULL,
  status varchar(20) NOT NULL DEFAULT 'not_started',
  pic varchar(255) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_prj_milestones_ws (workspace_id),
  KEY ix_prj_milestones_project (project_id),
  CONSTRAINT fk_prj_milestones_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_prj_milestones_project FOREIGN KEY (project_id) REFERENCES prj_projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prj_budget_lines (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  project_id char(36) NOT NULL,
  category varchar(20) NOT NULL DEFAULT 'material',
  description varchar(255) NOT NULL,
  qty decimal(18,4) NOT NULL DEFAULT 1,
  uom varchar(30) NULL,
  unit_cost decimal(18,4) NOT NULL DEFAULT 0,
  amount decimal(18,4) NOT NULL DEFAULT 0,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_prj_budget_lines_ws (workspace_id),
  KEY ix_prj_budget_lines_project (project_id),
  CONSTRAINT fk_prj_budget_lines_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_prj_budget_lines_project FOREIGN KEY (project_id) REFERENCES prj_projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prj_billings (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  project_id char(36) NOT NULL,
  milestone_id char(36) NULL,
  progress_report_id char(36) NULL,
  bast_no varchar(100) NOT NULL,
  bast_date date NOT NULL,
  description text NULL,
  progress_pct decimal(9,4) NOT NULL DEFAULT 0,
  amount decimal(18,4) NOT NULL DEFAULT 0,
  retention_amount decimal(18,4) NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'draft',
  ar_document_id char(36) NULL,
  ar_doc_number varchar(100) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_prj_billings_ws (workspace_id),
  KEY ix_prj_billings_project (project_id),
  CONSTRAINT fk_prj_billings_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_prj_billings_project FOREIGN KEY (project_id) REFERENCES prj_projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prj_members (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  project_id char(36) NOT NULL,
  name varchar(255) NOT NULL,
  role varchar(100) NULL,
  email varchar(255) NULL,
  phone varchar(50) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_prj_members_ws (workspace_id),
  KEY ix_prj_members_project (project_id),
  CONSTRAINT fk_prj_members_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_prj_members_project FOREIGN KEY (project_id) REFERENCES prj_projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prj_tasks (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  project_id char(36) NOT NULL,
  milestone_id char(36) NULL,
  name varchar(255) NOT NULL,
  assignee varchar(255) NULL,
  start_date date NULL,
  due_date date NULL,
  progress_pct decimal(9,4) NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'todo',
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_prj_tasks_ws (workspace_id),
  KEY ix_prj_tasks_project (project_id),
  CONSTRAINT fk_prj_tasks_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_prj_tasks_project FOREIGN KEY (project_id) REFERENCES prj_projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prj_expenses (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  project_id char(36) NOT NULL,
  expense_date date NOT NULL,
  category varchar(20) NOT NULL DEFAULT 'material',
  description varchar(255) NULL,
  vendor varchar(255) NULL,
  amount decimal(18,4) NOT NULL DEFAULT 0,
  reference varchar(100) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_prj_expenses_ws (workspace_id),
  KEY ix_prj_expenses_project (project_id),
  CONSTRAINT fk_prj_expenses_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_prj_expenses_project FOREIGN KEY (project_id) REFERENCES prj_projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prj_documents (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  project_id char(36) NOT NULL,
  name varchar(255) NOT NULL,
  category varchar(30) NULL,
  file_path varchar(500) NOT NULL,
  file_size bigint NULL,
  mime_type varchar(150) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_prj_documents_ws (workspace_id),
  KEY ix_prj_documents_project (project_id),
  CONSTRAINT fk_prj_documents_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_prj_documents_project FOREIGN KEY (project_id) REFERENCES prj_projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prj_progress_reports (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  project_id char(36) NOT NULL,
  report_no varchar(100) NOT NULL,
  report_date date NOT NULL,
  period_label varchar(100) NULL,
  progress_pct decimal(9,4) NOT NULL DEFAULT 0,
  work_done text NULL,
  issues text NULL,
  next_plan text NULL,
  photos json NULL,
  status varchar(20) NOT NULL DEFAULT 'draft',
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_prj_progress_reports_ws (workspace_id),
  KEY ix_prj_progress_reports_project (project_id),
  CONSTRAINT fk_prj_progress_reports_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_prj_progress_reports_project FOREIGN KEY (project_id) REFERENCES prj_projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Katalog add-on: tanpa baris ini modul XPro tidak bisa diaktifkan tenant
-- (gating di aplikasi memakai `modules[].addon` + daftar add-on aktif tenant).
-- Harga mengikuti BS New 10: Rp750.000 / bulan.
INSERT INTO addons (id, code, name, tagline, description, monthly_price, pricing_unit, module_id, sort_order)
VALUES (UUID(), 'xpro', 'XPro', 'Proyek & kontrak, milestone, RAB, tagihan BAST',
        'Manajemen proyek: proyek & kontrak, milestone berbobot, tim & tugas (Gantt), RAB per kategori, realisasi biaya, laporan progres lapangan, dan tagihan termin/BAST yang diterbitkan menjadi draft Faktur Piutang.',
        750000, 'month', 'xpro', 40)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  tagline = VALUES(tagline),
  description = VALUES(description),
  monthly_price = VALUES(monthly_price),
  pricing_unit = VALUES(pricing_unit),
  module_id = VALUES(module_id),
  sort_order = VALUES(sort_order);
