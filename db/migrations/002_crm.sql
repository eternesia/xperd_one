-- ===========================================================================
-- 002_crm.sql — Qalling CRM (ported from "Xperd One Business Suite" Lovable export)
-- Adds the CRM tables for the `crm` module: leads, activities, broadcasts,
-- broadcast recipients, WhatsApp gateway settings and social campaigns.
--
-- Replicates the Supabase schema from Business Suite migrations:
--   20260816162245 (crm_leads, crm_activities)
--   20260817022352 (crm_broadcasts, crm_broadcast_recipients, crm_wa_settings, crm_campaigns)
--   20260818135302 (crm_leads extra cols: lost_reason, stage_changed_at, ...)
-- Idempotent (CREATE TABLE IF NOT EXISTS) — safe for the migrate runner.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- crm_leads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_leads (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  company_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  source VARCHAR(50),
  stage VARCHAR(30) NOT NULL DEFAULT 'new',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  estimated_value DECIMAL(18,4) NOT NULL DEFAULT 0,
  probability INT NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'IDR',
  owner_user_id CHAR(36),
  owner_name VARCHAR(255),
  customer_code VARCHAR(100),
  converted_customer_code VARCHAR(100),
  quotation_id CHAR(36),
  next_follow_up_at DATE,
  last_activity_at DATETIME(6),
  lost_reason VARCHAR(255),
  stage_changed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  notes TEXT,
  created_by CHAR(36),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_crm_leads_ws_code (workspace_id, code),
  KEY idx_crm_leads_stage (workspace_id, stage),
  KEY idx_crm_leads_status (workspace_id, status),
  CONSTRAINT fk_crm_leads_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- crm_activities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_activities (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  lead_id CHAR(36),
  activity_type VARCHAR(30) NOT NULL DEFAULT 'note',
  subject VARCHAR(255) NOT NULL,
  body TEXT,
  due_at DATETIME(6),
  done_at DATETIME(6),
  outcome VARCHAR(255),
  owner_user_id CHAR(36),
  owner_name VARCHAR(255),
  created_by CHAR(36),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_crm_activities_due (workspace_id, due_at),
  CONSTRAINT fk_crm_activities_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_activities_lead FOREIGN KEY (lead_id) REFERENCES crm_leads (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- crm_broadcasts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_broadcasts (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  channel VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
  message TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  scheduled_at DATETIME(6),
  sent_at DATETIME(6),
  total_recipients INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  created_by CHAR(36),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_crm_broadcasts_ws (workspace_id, created_at),
  CONSTRAINT fk_crm_broadcasts_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- crm_broadcast_recipients
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_broadcast_recipients (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  broadcast_id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  lead_id CHAR(36),
  name VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error TEXT,
  sent_at DATETIME(6),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_crm_bc_recipients_broadcast (broadcast_id),
  KEY idx_crm_bc_recipients_status (status),
  CONSTRAINT fk_crm_bc_recipients_bc FOREIGN KEY (broadcast_id) REFERENCES crm_broadcasts (id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_bc_recipients_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- crm_wa_settings (one row per workspace)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_wa_settings (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  provider VARCHAR(30) NOT NULL DEFAULT 'manual',
  sender_number VARCHAR(50),
  endpoint_url VARCHAR(500),
  api_token VARCHAR(500),
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  notes TEXT,
  last_checked_at DATETIME(6),
  last_status VARCHAR(500),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_crm_wa_settings_ws (workspace_id),
  CONSTRAINT fk_crm_wa_settings_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- crm_campaigns
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_campaigns (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  objective VARCHAR(50) NOT NULL DEFAULT 'awareness',
  platforms JSON,
  content TEXT,
  media_url TEXT,
  budget DECIMAL(18,4) NOT NULL DEFAULT 0,
  start_date DATE,
  end_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  reach INT NOT NULL DEFAULT 0,
  clicks INT NOT NULL DEFAULT 0,
  leads_generated INT NOT NULL DEFAULT 0,
  owner_name VARCHAR(255),
  created_by CHAR(36),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_crm_campaigns_ws (workspace_id, created_at),
  CONSTRAINT fk_crm_campaigns_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
