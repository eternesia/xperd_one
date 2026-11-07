-- Paket Agency: persetujuan konten oleh klien (link publik) dan laporan klien white-label (link publik).
CREATE TABLE IF NOT EXISTS crm_post_approvals (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  post_id char(36) NOT NULL,
  token char(48) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',          -- pending | approved | changes_requested | cancelled
  client_label varchar(120) NULL,
  message_to_client text NULL,
  client_name varchar(120) NULL,
  client_comment text NULL,
  prev_status varchar(20) NULL,                           -- status post sebelum diminta persetujuan
  prev_scheduled_at datetime NULL,
  requested_by char(36) NULL,
  requested_by_email varchar(255) NULL,
  decided_at datetime NULL,
  expires_at datetime NOT NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_post_approval_token (token),
  KEY ix_post_approval_post (post_id, created_at),
  KEY ix_post_approval_ws (workspace_id, status),
  CONSTRAINT fk_post_approval_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_report_links (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  token char(48) NOT NULL,
  title varchar(150) NOT NULL,
  brand_name varchar(120) NOT NULL,
  brand_color varchar(9) NOT NULL DEFAULT '#2563eb',
  logo_url varchar(500) NULL,
  client_group_id char(36) NULL,                           -- NULL = semua akun
  period_days int NOT NULL DEFAULT 30,
  created_by char(36) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  revoked_at datetime NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_report_link_token (token),
  KEY ix_report_link_ws (workspace_id, created_at),
  CONSTRAINT fk_report_link_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fitur baru untuk tier Agency (idempotent; Super Admin bisa mengubahnya di Add-on → tier).
UPDATE addon_tiers
   SET features = JSON_SET(features, '$.client_approval', true, '$.white_label_reports', true, '$.activity_log', true)
 WHERE code = 'qalling_agency';
