-- ===========================================================================
-- 005_crm_insights.sql — CRM sales targets + message templates
-- (ported from Business Suite migrations 20260818135302: crm_targets, crm_templates).
-- Supports the CRM Dashboard / Targets / Templates views (components/app/CrmInsights.tsx).
-- ===========================================================================

CREATE TABLE IF NOT EXISTS crm_targets (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  owner_user_id CHAR(36),
  owner_name VARCHAR(255) NOT NULL,
  period_month DATE NOT NULL,
  target_amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by CHAR(36),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_crm_targets (workspace_id, owner_name, period_month),
  KEY idx_crm_targets_period (workspace_id, period_month),
  CONSTRAINT fk_crm_targets_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_templates (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  channel VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
  body TEXT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_crm_templates_ws (workspace_id, created_at),
  CONSTRAINT fk_crm_templates_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
