-- Invoice ringan dari prospek yang closing: link publik + PDF, status bayar. Tidak memposting ke akuntansi ERP.
CREATE TABLE IF NOT EXISTS crm_invoices (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  lead_id char(36) NULL,
  token char(48) NOT NULL,
  invoice_number varchar(40) NOT NULL,
  issue_date date NOT NULL,
  due_date date NULL,
  customer_name varchar(255) NOT NULL,
  customer_company varchar(255) NULL,
  customer_phone varchar(50) NULL,
  customer_email varchar(255) NULL,
  items json NOT NULL,
  subtotal decimal(18,2) NOT NULL DEFAULT 0,
  tax_rate decimal(5,2) NOT NULL DEFAULT 0,
  tax_amount decimal(18,2) NOT NULL DEFAULT 0,
  total decimal(18,2) NOT NULL DEFAULT 0,
  notes text NULL,
  status varchar(20) NOT NULL DEFAULT 'unpaid',           -- unpaid | paid | cancelled
  paid_at datetime NULL,
  sent_at datetime NULL,
  created_by char(36) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_crm_invoice_token (token),
  UNIQUE KEY uq_crm_invoice_number (workspace_id, invoice_number),
  KEY ix_crm_invoice_lead (workspace_id, lead_id),
  KEY ix_crm_invoice_status (workspace_id, status, due_date),
  CONSTRAINT fk_crm_invoice_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE addon_tiers
   SET features = JSON_SET(features, '$.lead_invoice', true)
 WHERE code IN ('qalling_pro', 'qalling_agency');
