-- ===========================================================================
-- Xperd One — MySQL schema (converted from the 22 Supabase/Postgres migrations)
-- Target: MySQL 8.4 (docker compose `mysql` service)
-- Loaded automatically on first boot via docker/mysql/init (docker-entrypoint-initdb.d)
--
-- Conversion notes:
--   * uuid            -> CHAR(36), DEFAULT (UUID())
--   * text            -> VARCHAR(...) for short/indexed/unique fields, TEXT for long
--   * jsonb           -> JSON
--   * boolean         -> TINYINT(1)
--   * numeric         -> DECIMAL(18,4) (or DECIMAL(14,2) where the source said so)
--   * timestamptz     -> DATETIME(6); now() -> CURRENT_TIMESTAMP(6)
--   * updated_at      -> ON UPDATE CURRENT_TIMESTAMP(6) replaces the Postgres trigger
--   * enums           -> VARCHAR(20/50) (values are plain strings)
--   * RLS policies    -> NOT ported; row scoping is enforced in the app query layer
--                        (is_workspace_member / can_write_workspace / owns_tenant /
--                         has_role are reimplemented as app-side checks)
--   * auth.users refs -> kept as plain CHAR(36) columns WITHOUT FK (no auth schema)
-- ===========================================================================

-- ---------- Core / auth-adjacent (no FKs to app tables) ----------

CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) PRIMARY KEY,
  full_name VARCHAR(255),
  email VARCHAR(255),
  company_name VARCHAR(255),
  phone VARCHAR(50),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  role VARCHAR(20) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_user_roles_user_role (user_id, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_users (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  auth_user_id CHAR(36),
  last_login_at DATETIME(6),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_app_users_email (email(191)),
  KEY idx_app_users_auth_user_id (auth_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS packages (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  product_line VARCHAR(20) NOT NULL,
  tagline VARCHAR(255),
  description TEXT,
  monthly_price DECIMAL(14,2),
  is_public_signup TINYINT(1) NOT NULL DEFAULT 0,
  max_workspace INT,
  max_company INT,
  max_users INT,
  features JSON NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_packages_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leads (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  job_title VARCHAR(255),
  industry VARCHAR(100),
  employee_range VARCHAR(50),
  interested_product VARCHAR(20) NOT NULL DEFAULT 'business',
  message TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'new',
  source VARCHAR(50) DEFAULT 'website',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Tenants & billing ----------

CREATE TABLE IF NOT EXISTS tenants (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(255) NOT NULL,
  package_id CHAR(36),
  owner_id CHAR(36),
  status VARCHAR(20) NOT NULL DEFAULT 'trial',
  industry VARCHAR(100),
  pic_name VARCHAR(255),
  pic_email VARCHAR(255),
  pic_phone VARCHAR(50),
  city VARCHAR(100),
  user_count INT NOT NULL DEFAULT 1,
  trial_ends_at DATE,
  started_at DATE NOT NULL DEFAULT (CURRENT_DATE),
  ends_at DATE,
  workspace_count INT NOT NULL DEFAULT 1,
  notes TEXT,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_tenants_subdomain (subdomain),
  KEY fk_tenants_package (package_id),
  CONSTRAINT fk_tenants_package FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscriptions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  package_id CHAR(36),
  status VARCHAR(20) NOT NULL DEFAULT 'trialing',
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly',
  seats INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  current_period_start DATE NOT NULL DEFAULT (CURRENT_DATE),
  current_period_end DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL 30 DAY),
  auto_renew TINYINT(1) NOT NULL DEFAULT 1,
  cancelled_at DATETIME(6),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY fk_subs_tenant (tenant_id),
  KEY fk_subs_package (package_id),
  CONSTRAINT fk_subs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_subs_package FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoices (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  invoice_number VARCHAR(100) NOT NULL,
  tenant_id CHAR(36) NOT NULL,
  subscription_id CHAR(36),
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  issue_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  due_date DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL 14 DAY),
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_at DATETIME(6),
  payment_method VARCHAR(50),
  payment_url TEXT,
  gateway_reference TEXT,
  auto_reminder TINYINT(1) NOT NULL DEFAULT 1,
  notes TEXT,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_invoices_number (invoice_number),
  KEY fk_invoices_tenant (tenant_id),
  KEY fk_invoices_sub (subscription_id),
  CONSTRAINT fk_invoices_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_invoices_sub FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reminders (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36),
  invoice_id CHAR(36),
  type VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  channel VARCHAR(20) NOT NULL DEFAULT 'email',
  scheduled_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  sent_at DATETIME(6),
  message TEXT,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY fk_reminders_tenant (tenant_id),
  KEY fk_reminders_invoice (invoice_id),
  CONSTRAINT fk_reminders_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_reminders_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS registrations (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  company_name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  city VARCHAR(100),
  industry VARCHAR(100),
  package_code VARCHAR(50) NOT NULL,
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  tenant_id CHAR(36),
  notes TEXT,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY fk_registrations_tenant (tenant_id),
  CONSTRAINT fk_registrations_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_content (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  section VARCHAR(100) NOT NULL,
  `key` VARCHAR(100) NOT NULL,
  title_en VARCHAR(255),
  title_id VARCHAR(255),
  body_en TEXT,
  body_id TEXT,
  image_url TEXT,
  link_url TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_site_content (section, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Workspaces ----------

CREATE TABLE IF NOT EXISTS workspaces (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255),
  slug VARCHAR(255) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'IDR',
  timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Jakarta',
  fiscal_year_start_month INT NOT NULL DEFAULT 1,
  default_costing_method VARCHAR(20) NOT NULL DEFAULT 'AVERAGE',
  address TEXT,
  tax_id VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'setup',
  created_by CHAR(36),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_workspaces_tenant_slug (tenant_id, slug),
  KEY fk_workspaces_tenant (tenant_id),
  CONSTRAINT fk_workspaces_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspace_members (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'staff',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_ws_members (workspace_id, user_id),
  KEY idx_ws_members_user (user_id),
  CONSTRAINT fk_ws_members_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Master data ----------

CREATE TABLE IF NOT EXISTS md_categories (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_md_categories (workspace_id, code),
  CONSTRAINT fk_md_categories_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS md_uoms (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_md_uoms (workspace_id, code),
  CONSTRAINT fk_md_uoms_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS md_items (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  item_type VARCHAR(20) NOT NULL DEFAULT 'goods',
  category_code VARCHAR(100),
  uom_code VARCHAR(100),
  barcode VARCHAR(100),
  cost_price DECIMAL(18,4) NOT NULL DEFAULT 0,
  sell_price DECIMAL(18,4) NOT NULL DEFAULT 0,
  min_stock DECIMAL(18,4) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_md_items (workspace_id, code),
  CONSTRAINT fk_md_items_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS md_customers (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  tax_id VARCHAR(50),
  credit_limit DECIMAL(18,4) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_md_customers (workspace_id, code),
  CONSTRAINT fk_md_customers_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS md_suppliers (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  tax_id VARCHAR(50),
  payment_terms INT NOT NULL DEFAULT 30,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_md_suppliers (workspace_id, code),
  CONSTRAINT fk_md_suppliers_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS md_warehouses (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  city VARCHAR(100),
  pic_name VARCHAR(255),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_md_warehouses (workspace_id, code),
  CONSTRAINT fk_md_warehouses_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS md_accounts (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  account_type VARCHAR(20) NOT NULL DEFAULT 'asset',
  parent_code VARCHAR(100),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_md_accounts (workspace_id, code),
  CONSTRAINT fk_md_accounts_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS md_taxes (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  tax_type VARCHAR(20) NOT NULL DEFAULT 'vat_out',
  rate DECIMAL(18,4) NOT NULL DEFAULT 0,
  account_code VARCHAR(100),
  description TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_md_taxes (workspace_id, code),
  CONSTRAINT fk_md_taxes_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Procurement ----------

CREATE TABLE IF NOT EXISTS prc_documents (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  doc_type VARCHAR(30) NOT NULL,
  doc_number VARCHAR(100) NOT NULL,
  doc_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  due_date DATE,
  supplier_code VARCHAR(100),
  supplier_name VARCHAR(255),
  warehouse_code VARCHAR(100),
  reference TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  currency VARCHAR(10) NOT NULL DEFAULT 'IDR',
  subtotal DECIMAL(18,4) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  total DECIMAL(18,4) NOT NULL DEFAULT 0,
  notes TEXT,
  source_document_id CHAR(36),
  source_doc_number VARCHAR(100),
  bank_account_code VARCHAR(100),
  bank_account_name VARCHAR(255),
  created_by CHAR(36),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_prc_documents (workspace_id, doc_type, doc_number),
  KEY idx_prc_documents_ws_type_date (workspace_id, doc_type, doc_date DESC),
  KEY idx_prc_documents_source (source_document_id),
  KEY fk_prc_documents_ws (workspace_id),
  CONSTRAINT fk_prc_documents_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_prc_documents_source FOREIGN KEY (source_document_id) REFERENCES prc_documents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prc_document_lines (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  document_id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  line_no INT NOT NULL DEFAULT 1,
  item_code VARCHAR(100),
  description TEXT,
  qty DECIMAL(18,4) NOT NULL DEFAULT 0,
  uom_code VARCHAR(100),
  unit_price DECIMAL(18,4) NOT NULL DEFAULT 0,
  discount DECIMAL(18,4) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(18,4) NOT NULL DEFAULT 0,
  line_total DECIMAL(18,4) NOT NULL DEFAULT 0,
  source_line_id CHAR(36),
  qty_fulfilled DECIMAL(18,4) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_prc_lines_doc (document_id),
  KEY fk_prc_lines_ws (workspace_id),
  CONSTRAINT fk_prc_lines_doc FOREIGN KEY (document_id) REFERENCES prc_documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_prc_lines_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Sales ----------

CREATE TABLE IF NOT EXISTS sls_documents (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  doc_type VARCHAR(30) NOT NULL,
  doc_number VARCHAR(100) NOT NULL,
  doc_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  due_date DATE,
  customer_code VARCHAR(100),
  customer_name VARCHAR(255),
  warehouse_code VARCHAR(100),
  reference TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  currency VARCHAR(10) NOT NULL DEFAULT 'IDR',
  subtotal DECIMAL(18,4) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  total DECIMAL(18,4) NOT NULL DEFAULT 0,
  notes TEXT,
  source_document_id CHAR(36),
  source_doc_number VARCHAR(100),
  bank_account_code VARCHAR(100),
  bank_account_name VARCHAR(255),
  created_by CHAR(36),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_sls_documents_ws_type (workspace_id, doc_type, doc_date DESC),
  KEY fk_sls_documents_ws (workspace_id),
  CONSTRAINT fk_sls_documents_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_sls_documents_source FOREIGN KEY (source_document_id) REFERENCES sls_documents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sls_document_lines (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  document_id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  line_no INT NOT NULL DEFAULT 1,
  item_code VARCHAR(100),
  description TEXT,
  qty DECIMAL(18,4) NOT NULL DEFAULT 0,
  uom_code VARCHAR(100),
  unit_price DECIMAL(18,4) NOT NULL DEFAULT 0,
  discount DECIMAL(18,4) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(18,4) NOT NULL DEFAULT 0,
  line_total DECIMAL(18,4) NOT NULL DEFAULT 0,
  source_line_id CHAR(36),
  qty_fulfilled DECIMAL(18,4) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_sls_lines_document (document_id),
  KEY fk_sls_lines_ws (workspace_id),
  CONSTRAINT fk_sls_lines_doc FOREIGN KEY (document_id) REFERENCES sls_documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_sls_lines_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sls_shipment_scans (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  scan_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  tracking_no VARCHAR(100) NOT NULL,
  marketplace VARCHAR(50) NOT NULL DEFAULT 'shopee',
  courier VARCHAR(100),
  order_no VARCHAR(100),
  buyer_name VARCHAR(255),
  item_summary TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'scanned',
  document_id CHAR(36),
  doc_number VARCHAR(100),
  notes TEXT,
  scanned_by CHAR(36),
  shipped_at DATETIME(6),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_sls_shipment_scans (workspace_id, tracking_no),
  KEY idx_sls_shipment_scans_ws_date (workspace_id, scan_date DESC),
  KEY fk_sls_scans_doc (document_id),
  CONSTRAINT fk_sls_scans_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_sls_scans_doc FOREIGN KEY (document_id) REFERENCES sls_documents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Inventory ----------

CREATE TABLE IF NOT EXISTS inv_movements (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  movement_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  movement_type VARCHAR(30) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  item_name VARCHAR(255),
  uom_code VARCHAR(100),
  warehouse_code VARCHAR(100),
  counterpart_warehouse_code VARCHAR(100),
  qty DECIMAL(18,4) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(18,4) NOT NULL DEFAULT 0,
  value DECIMAL(18,4) NOT NULL DEFAULT 0,
  ref_type VARCHAR(50),
  ref_id CHAR(36),
  ref_number VARCHAR(100),
  notes TEXT,
  created_by CHAR(36),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY fk_inv_movements_ws (workspace_id),
  CONSTRAINT fk_inv_movements_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Accounting ----------

CREATE TABLE IF NOT EXISTS acc_journal_entries (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  entry_no VARCHAR(100) NOT NULL,
  entry_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  source_type VARCHAR(50),
  source_id CHAR(36),
  source_doc_number VARCHAR(100),
  memo TEXT,
  total_debit DECIMAL(18,4) NOT NULL DEFAULT 0,
  total_credit DECIMAL(18,4) NOT NULL DEFAULT 0,
  is_auto TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_acc_journal_entries_ws (workspace_id, entry_date DESC),
  KEY fk_acc_journal_entries_ws (workspace_id),
  CONSTRAINT fk_acc_journal_entries_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS acc_journal_lines (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  entry_id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  line_no INT NOT NULL DEFAULT 1,
  account_code VARCHAR(100) NOT NULL,
  account_name VARCHAR(255),
  description TEXT,
  debit DECIMAL(18,4) NOT NULL DEFAULT 0,
  credit DECIMAL(18,4) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_acc_journal_lines_entry (entry_id),
  KEY fk_acc_journal_lines_ws (workspace_id),
  CONSTRAINT fk_acc_journal_lines_entry FOREIGN KEY (entry_id) REFERENCES acc_journal_entries(id) ON DELETE CASCADE,
  CONSTRAINT fk_acc_journal_lines_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Cash & bank ----------

CREATE TABLE IF NOT EXISTS cb_accounts (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  account_kind VARCHAR(20) NOT NULL DEFAULT 'bank',
  gl_account_code VARCHAR(100),
  bank_name VARCHAR(255),
  account_number VARCHAR(100),
  currency VARCHAR(10) NOT NULL DEFAULT 'IDR',
  opening_balance DECIMAL(18,4) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_cb_accounts (workspace_id, code),
  CONSTRAINT fk_cb_accounts_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cb_transactions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  trx_no VARCHAR(100) NOT NULL,
  trx_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  trx_type VARCHAR(30) NOT NULL,
  account_code VARCHAR(100) NOT NULL,
  account_name VARCHAR(255),
  counterpart_account_code VARCHAR(100),
  counterpart_account_name VARCHAR(255),
  category_account_code VARCHAR(100),
  category_account_name VARCHAR(255),
  contact_name VARCHAR(255),
  method VARCHAR(20) NOT NULL DEFAULT 'cash',
  reference TEXT,
  memo TEXT,
  amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  is_reconciled TINYINT(1) NOT NULL DEFAULT 0,
  reconciled_at DATETIME(6),
  journal_entry_id CHAR(36),
  created_by CHAR(36),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_cb_transactions (workspace_id, trx_no),
  KEY idx_cb_transactions_ws_date (workspace_id, trx_date DESC),
  KEY fk_cb_transactions_ws (workspace_id),
  CONSTRAINT fk_cb_transactions_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Fixed assets & tax ----------

CREATE TABLE IF NOT EXISTS fa_assets (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  acquisition_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  acquisition_cost DECIMAL(18,4) NOT NULL DEFAULT 0,
  salvage_value DECIMAL(18,4) NOT NULL DEFAULT 0,
  useful_life_months INT NOT NULL DEFAULT 60,
  method VARCHAR(30) NOT NULL DEFAULT 'straight_line',
  asset_account_code VARCHAR(100),
  accum_account_code VARCHAR(100),
  expense_account_code VARCHAR(100),
  location VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  accumulated_depreciation DECIMAL(18,4) NOT NULL DEFAULT 0,
  disposal_date DATE,
  disposal_amount DECIMAL(18,4),
  notes TEXT,
  created_by CHAR(36),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_fa_assets (workspace_id, code),
  CONSTRAINT fk_fa_assets_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fa_depreciations (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  asset_id CHAR(36) NOT NULL,
  asset_code VARCHAR(100),
  asset_name VARCHAR(255),
  period_date DATE NOT NULL,
  amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  book_value_after DECIMAL(18,4) NOT NULL DEFAULT 0,
  journal_entry_id CHAR(36),
  notes TEXT,
  created_by CHAR(36),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_fa_depreciations (asset_id, period_date),
  KEY fk_fa_dep_ws (workspace_id),
  CONSTRAINT fk_fa_dep_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_fa_dep_asset FOREIGN KEY (asset_id) REFERENCES fa_assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tax_records (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  tax_no VARCHAR(100) NOT NULL,
  tax_type VARCHAR(30) NOT NULL,
  tax_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  period VARCHAR(30),
  partner_name VARCHAR(255),
  partner_tax_id VARCHAR(50),
  doc_number VARCHAR(100),
  faktur_number VARCHAR(100),
  description TEXT,
  base_amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  rate DECIMAL(18,4) NOT NULL DEFAULT 11,
  tax_amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  ref_type VARCHAR(50),
  ref_id CHAR(36),
  journal_entry_id CHAR(36),
  notes TEXT,
  created_by CHAR(36),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_tax_records (workspace_id, tax_no),
  CONSTRAINT fk_tax_records_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Platform ops ----------

CREATE TABLE IF NOT EXISTS upgrade_requests (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  workspace_id CHAR(36),
  requested_package_id CHAR(36),
  requested_by CHAR(36),
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY fk_upgrade_tenant (tenant_id),
  KEY fk_upgrade_ws (workspace_id),
  KEY fk_upgrade_pkg (requested_package_id),
  CONSTRAINT fk_upgrade_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_upgrade_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
  CONSTRAINT fk_upgrade_pkg FOREIGN KEY (requested_package_id) REFERENCES packages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_gateways (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  provider VARCHAR(50) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  mode VARCHAR(20) NOT NULL DEFAULT 'sandbox',
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  merchant_id VARCHAR(100),
  client_key VARCHAR(255),
  server_key_secret_name VARCHAR(100),
  callback_url TEXT,
  instructions TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS announcements (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  title_en VARCHAR(255) NOT NULL,
  title_id VARCHAR(255),
  body_en TEXT,
  body_id TEXT,
  severity VARCHAR(20) NOT NULL DEFAULT 'info',
  audience VARCHAR(20) NOT NULL DEFAULT 'all',
  starts_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  ends_at DATETIME(6),
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_tickets (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  ticket_no VARCHAR(100) NOT NULL,
  tenant_id CHAR(36),
  workspace_id CHAR(36),
  subject VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  description TEXT,
  created_by CHAR(36) NOT NULL,
  assigned_to CHAR(36),
  resolved_at DATETIME(6),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_support_tickets_no (ticket_no),
  KEY fk_support_tickets_tenant (tenant_id),
  KEY fk_support_tickets_ws (workspace_id),
  CONSTRAINT fk_support_tickets_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
  CONSTRAINT fk_support_tickets_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  ticket_id CHAR(36) NOT NULL,
  author_id CHAR(36) NOT NULL,
  body TEXT NOT NULL,
  is_internal TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY fk_ticket_messages_ticket (ticket_id),
  CONSTRAINT fk_ticket_messages_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspace_role_access (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  role VARCHAR(20) NOT NULL,
  module_id VARCHAR(100) NOT NULL,
  can_view TINYINT(1) NOT NULL DEFAULT 1,
  can_edit TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_workspace_role_access (workspace_id, role, module_id),
  CONSTRAINT fk_workspace_role_access_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
