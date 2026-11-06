-- Kontak sosial terpadu: satu orang = satu kontak, terhubung ke percakapan DM dan prospek.
CREATE TABLE IF NOT EXISTS crm_contacts (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  name varchar(255) NOT NULL,
  phone varchar(50) NULL,
  email varchar(255) NULL,
  company_name varchar(255) NULL,
  tags json NULL,
  notes text NULL,
  source varchar(40) NOT NULL DEFAULT 'manual',          -- manual | dm | lead
  created_by char(36) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_crm_contacts_ws (workspace_id, updated_at),
  KEY ix_crm_contacts_name (workspace_id, name),
  CONSTRAINT fk_crm_contacts_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE crm_conversations
  ADD COLUMN contact_id char(36) NULL,
  ADD KEY ix_crm_conversations_contact (contact_id),
  ADD CONSTRAINT fk_crm_conversations_contact FOREIGN KEY (contact_id) REFERENCES crm_contacts (id) ON DELETE SET NULL;

ALTER TABLE crm_leads
  ADD COLUMN contact_id char(36) NULL,
  ADD KEY ix_crm_leads_contact (contact_id),
  ADD CONSTRAINT fk_crm_leads_contact FOREIGN KEY (contact_id) REFERENCES crm_contacts (id) ON DELETE SET NULL;
