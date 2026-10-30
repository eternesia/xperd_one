-- Ronde 39 (BS New 11): Qalling Inbox (DM Meta), Comments dan Automations (Meta native).
--  * Padanan fungsi SQL `crm_ingest_meta_message` ada di aplikasi (social-interactions.server.ts,
--    transaksi + SELECT … FOR UPDATE); tidak ada trigger/fungsi di MySQL.
--  * `crm_meta_settings.native_social_enabled/webhook_verify_token` = opt-in per workspace;
--    secret (app_secret, access_token) hanya dibaca server.
ALTER TABLE crm_meta_settings
  ADD COLUMN native_social_enabled TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN webhook_verify_token VARCHAR(200) NULL,
  ADD COLUMN oauth_expires_at DATETIME(6) NULL;

ALTER TABLE crm_social_tokens
  ADD COLUMN page_id VARCHAR(150) NULL;

CREATE TABLE IF NOT EXISTS crm_conversations (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  account_id char(36) NOT NULL,
  participant_id varchar(200) NOT NULL,
  participant_name varchar(255) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'open',            -- open | resolved
  last_message text NOT NULL,
  last_message_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  last_inbound_at datetime(6) NULL,
  reply_window_expires_at datetime(6) NULL,
  unread_count int NOT NULL DEFAULT 0,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_crm_conversations_participant (account_id, participant_id),
  KEY ix_crm_inbox_recent (workspace_id, last_message_at),
  CONSTRAINT fk_crm_conversations_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_conversations_acc FOREIGN KEY (account_id) REFERENCES crm_social_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_messages (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  conversation_id char(36) NOT NULL,
  provider_message_id varchar(255) NULL,
  direction varchar(20) NOT NULL,                        -- inbound | outbound | note
  body text NOT NULL,
  attachments json NULL,
  status varchar(20) NOT NULL DEFAULT 'received',        -- received | sending | sent | failed | unknown | note
  created_by char(36) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_crm_messages_provider (conversation_id, provider_message_id),
  KEY ix_crm_messages_thread (conversation_id, created_at),
  CONSTRAINT fk_crm_messages_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_messages_conv FOREIGN KEY (conversation_id) REFERENCES crm_conversations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_social_comments (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  account_id char(36) NOT NULL,
  provider_comment_id varchar(255) NOT NULL,
  post_id varchar(255) NOT NULL,
  author_name varchar(255) NOT NULL DEFAULT '',
  body text NOT NULL,
  reply text NULL,
  status varchar(20) NOT NULL DEFAULT 'open',            -- open | sending | sent | failed | unknown | removed
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_crm_social_comments (account_id, provider_comment_id),
  KEY ix_crm_social_comments_ws (workspace_id, created_at),
  CONSTRAINT fk_crm_social_comments_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_social_comments_acc FOREIGN KEY (account_id) REFERENCES crm_social_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_automation_rules (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  account_id char(36) NOT NULL,
  name varchar(100) NOT NULL,
  trigger_type varchar(20) NOT NULL,                     -- dm | comment
  keyword varchar(100) NOT NULL DEFAULT '',
  reply_body text NOT NULL,
  enabled tinyint(1) NOT NULL DEFAULT 0,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_crm_automation_rules_ws (workspace_id, account_id),
  CONSTRAINT fk_crm_automation_rules_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_automation_rules_acc FOREIGN KEY (account_id) REFERENCES crm_social_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Klaim durable: UNIQUE (rule_id, event_id) mencegah balasan ganda bila webhook diulang
-- setelah hasil provider yang ambigu (status unknown tidak pernah dikirim ulang otomatis).
CREATE TABLE IF NOT EXISTS crm_automation_runs (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  rule_id char(36) NOT NULL,
  event_id varchar(255) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'sending',
  error text NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_crm_automation_runs (rule_id, event_id),
  KEY ix_crm_automation_runs_ws (workspace_id, created_at),
  CONSTRAINT fk_crm_automation_runs_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_automation_runs_rule FOREIGN KEY (rule_id) REFERENCES crm_automation_rules (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
