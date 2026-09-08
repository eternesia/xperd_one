-- ===========================================================================
-- 003_addons.sql — Add-on catalog + tenant add-on assignments
-- (ported from "Xperd One Business Suite": addons / tenant_addons tables).
-- Idempotent — safe for the migrate runner (files run in order).
-- ===========================================================================

-- Catalog of purchasable add-ons (e.g. "qalling" CRM).
CREATE TABLE IF NOT EXISTS addons (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  tagline VARCHAR(255),
  description TEXT,
  monthly_price DECIMAL(18,4) NOT NULL DEFAULT 0,
  module_id VARCHAR(100),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_addons_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which add-ons a tenant has unlocked (status: trial / active / suspended / cancelled).
CREATE TABLE IF NOT EXISTS tenant_addons (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  addon_id CHAR(36) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  starts_at DATE NOT NULL DEFAULT (CURRENT_DATE),
  ends_at DATE,
  monthly_price DECIMAL(18,4) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_tenant_addons (tenant_id, addon_id),
  CONSTRAINT fk_tenant_addons_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT fk_tenant_addons_addon FOREIGN KEY (addon_id) REFERENCES addons (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
