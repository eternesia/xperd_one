-- BS New 16: peran kustom per workspace (mis. "Admin Konten") dengan izin View/Edit per modul/submodul. Anggota yang memakai peran kustom
-- mewarisi `base_role` di kolom `role` (disinkronkan oleh kode server, bukan trigger); menghapus peran melepas anggota (custom_role_id = NULL).
CREATE TABLE IF NOT EXISTS workspace_custom_roles (
  id char(36) NOT NULL,
  workspace_id char(36) NOT NULL,
  name varchar(60) NOT NULL,
  base_role varchar(10) NOT NULL DEFAULT 'staff',
  permissions json NOT NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_custom_role_name (workspace_id, name),
  CONSTRAINT ck_custom_role_base CHECK (base_role IN ('admin','staff','viewer')),
  CONSTRAINT fk_custom_role_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE workspace_members
  ADD COLUMN custom_role_id char(36) NULL,
  ADD CONSTRAINT fk_member_custom_role FOREIGN KEY (custom_role_id) REFERENCES workspace_custom_roles (id) ON DELETE SET NULL;
