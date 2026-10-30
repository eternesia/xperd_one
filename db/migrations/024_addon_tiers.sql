-- Ronde 44 (BS New 11): paket (tier) & opsi tambahan add-on Qalling + entitlement.
-- Padanan migrasi New 11 0001/0005/0013. Validasi harga-vs-kapasitas (trigger Postgres) ada di
-- `lib/entitlements.ts` (`validateTierPrice`) dan dipanggil server function; engine entitlement di
-- `lib/entitlements.server.ts`; quote/checkout/renewal di `lib/addon-billing.server.ts`.

CREATE TABLE IF NOT EXISTS addon_tiers (
  id char(36) NOT NULL DEFAULT (uuid()),
  addon_id char(36) NOT NULL,
  code varchar(100) NOT NULL,
  name varchar(255) NOT NULL,
  monthly_price bigint NOT NULL DEFAULT 0,
  limits json NOT NULL,
  features json NOT NULL,
  is_active tinyint(1) NOT NULL DEFAULT 1,
  sort_order int NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_addon_tiers_code (code),
  CONSTRAINT ck_addon_tiers_price CHECK (monthly_price >= 0),
  CONSTRAINT fk_addon_tiers_addon FOREIGN KEY (addon_id) REFERENCES addons (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS addon_options (
  id char(36) NOT NULL DEFAULT (uuid()),
  addon_id char(36) NOT NULL,
  code varchar(100) NOT NULL,
  name varchar(255) NOT NULL,
  monthly_price bigint NOT NULL DEFAULT 0,
  max_quantity int NOT NULL DEFAULT 1,
  grants json NOT NULL,
  requires_features json NOT NULL,
  is_active tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_addon_options_code (code),
  CONSTRAINT ck_addon_options_price CHECK (monthly_price >= 0),
  CONSTRAINT ck_addon_options_qty CHECK (max_quantity > 0),
  CONSTRAINT fk_addon_options_addon FOREIGN KEY (addon_id) REFERENCES addons (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_addon_options (
  id char(36) NOT NULL DEFAULT (uuid()),
  tenant_id char(36) NOT NULL,
  option_id char(36) NOT NULL,
  quantity int NOT NULL,
  monthly_price bigint NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'active',
  ends_at date NOT NULL,
  pending_quantity int NULL,
  grace_until date NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_addon_options (tenant_id, option_id),
  CONSTRAINT ck_tao_qty CHECK (quantity > 0),
  CONSTRAINT ck_tao_price CHECK (monthly_price >= 0),
  CONSTRAINT ck_tao_pending CHECK (pending_quantity IS NULL OR pending_quantity >= 0),
  CONSTRAINT ck_tao_status CHECK (status IN ('active','grace','suspended','cancelled')),
  CONSTRAINT fk_tao_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
  CONSTRAINT fk_tao_option FOREIGN KEY (option_id) REFERENCES addon_options (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tenant_addons
  ADD COLUMN tier_id char(36) NULL,
  ADD COLUMN limits_override json NOT NULL DEFAULT (JSON_OBJECT()),
  ADD COLUMN features_override json NOT NULL DEFAULT (JSON_OBJECT()),
  ADD COLUMN price_locked_until date NULL,
  ADD COLUMN wallet_managed tinyint(1) NOT NULL DEFAULT 0,
  ADD COLUMN pending_change json NULL,
  ADD COLUMN grace_until date NULL,
  ADD COLUMN renewal_note varchar(100) NULL,
  ADD CONSTRAINT fk_tenant_addons_tier FOREIGN KEY (tier_id) REFERENCES addon_tiers (id);

-- Tier resmi New 11 (0013_qalling_simplified_tiers): Lite / Pro / Agency.
INSERT IGNORE INTO addon_tiers (id, addon_id, code, name, monthly_price, sort_order, is_active, features, limits)
SELECT UUID(), a.id, v.code, v.name, v.price, v.sort_order, 1, CAST(v.features AS JSON), CAST(v.limits AS JSON)
  FROM addons a
  JOIN (
    SELECT 'qalling_lite' code, 'Lite' name, 49000 price, 1 sort_order,
           '{"publishing":true,"comments":true,"insights":true,"ideas_campaigns":true}' features,
           '{"max_accounts":5,"max_users":1,"storage_gb":5,"max_video_mb":500,"monthly_post_limit":null}' limits
    UNION ALL
    SELECT 'qalling_pro', 'Pro', 149000, 2,
           '{"publishing":true,"comments":true,"insights":true,"ideas_campaigns":true,"crm":true,"inbox_dm":true,"automations":true,"templates":true}',
           '{"max_accounts":15,"max_users":3,"storage_gb":10,"max_video_mb":500,"monthly_post_limit":null}'
    UNION ALL
    SELECT 'qalling_agency', 'Agency', 349000, 3,
           '{"publishing":true,"comments":true,"insights":true,"ideas_campaigns":true,"crm":true,"inbox_dm":true,"automations":true,"templates":true,"mcp_api":true,"tender":true}',
           '{"max_accounts":40,"max_users":10,"storage_gb":30,"max_video_mb":500,"monthly_post_limit":null}'
  ) v
 WHERE a.code = 'qalling';

-- Opsi tambahan contoh (ASUMSI: New 11 repo tidak menyertakan baris opsi, hanya skema). Super Admin dapat
-- mengubah harga/maks/aktif lewat Add-on → "Optional extras".
INSERT IGNORE INTO addon_options (id, addon_id, code, name, monthly_price, max_quantity, grants, requires_features, is_active)
SELECT UUID(), a.id, v.code, v.name, v.price, v.maxq, CAST(v.grants AS JSON), CAST(v.req AS JSON), 1
  FROM addons a
  JOIN (
    SELECT 'qalling_extra_account' code, 'Extra social account' name, 9000 price, 20 maxq,
           '{"limits":{"max_accounts":1}}' grants, '["publishing"]' req
    UNION ALL SELECT 'qalling_extra_user', 'Extra user', 29000, 10, '{"limits":{"max_users":1}}', '["publishing"]'
    UNION ALL SELECT 'qalling_extra_storage', 'Extra storage 5 GB', 15000, 20, '{"limits":{"storage_gb":5}}', '["publishing"]'
  ) v
 WHERE a.code = 'qalling';
