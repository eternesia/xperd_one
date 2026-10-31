-- Ronde 48 (BS New 12, migrasi 0024): Klien & Brand, dan referral.
-- MySQL tidak mendukung FK komposit dengan SET NULL parsial → konsistensi workspace akun↔klien dijaga di aplikasi
-- (server function `assignAccountClient`); referral: tanpa trigger → komisi diposting di `walletSettleTopup` (transaksi sama).
CREATE TABLE IF NOT EXISTS crm_client_groups (
  id char(36) NOT NULL DEFAULT (uuid()),
  workspace_id char(36) NOT NULL,
  name varchar(80) NOT NULL,
  color varchar(20) NOT NULL DEFAULT 'blue',
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_client_groups_id_ws (id, workspace_id),
  KEY ix_client_groups_ws (workspace_id),
  CONSTRAINT fk_client_groups_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT ck_client_groups_name CHECK (CHAR_LENGTH(name) BETWEEN 1 AND 80)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE crm_social_accounts
  ADD COLUMN client_group_id char(36) NULL,
  ADD KEY ix_social_accounts_client (workspace_id, client_group_id),
  ADD CONSTRAINT fk_social_accounts_client FOREIGN KEY (client_group_id) REFERENCES crm_client_groups (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS referral_settings (
  singleton tinyint NOT NULL DEFAULT 1,
  enabled tinyint(1) NOT NULL DEFAULT 1,
  percent decimal(5,2) NOT NULL DEFAULT 10,
  max_idr bigint NOT NULL DEFAULT 100000,
  min_topup_idr bigint NOT NULL DEFAULT 50000,
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (singleton),
  CONSTRAINT ck_referral_singleton CHECK (singleton = 1),
  CONSTRAINT ck_referral_percent CHECK (percent BETWEEN 0 AND 100),
  CONSTRAINT ck_referral_amounts CHECK (max_idr >= 0 AND min_topup_idr >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO referral_settings (singleton) VALUES (1);

CREATE TABLE IF NOT EXISTS referral_codes (
  tenant_id char(36) NOT NULL,
  code varchar(16) NOT NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (tenant_id),
  UNIQUE KEY uq_referral_code (code),
  CONSTRAINT fk_referral_codes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referrals (
  referred_tenant_id char(36) NOT NULL,
  referrer_tenant_id char(36) NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'pending',
  commission_idr bigint NOT NULL DEFAULT 0,
  topup_id char(36) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  rewarded_at datetime(6) NULL,
  PRIMARY KEY (referred_tenant_id),
  KEY ix_referrals_referrer (referrer_tenant_id, created_at),
  CONSTRAINT fk_referrals_referred FOREIGN KEY (referred_tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT fk_referrals_referrer FOREIGN KEY (referrer_tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT ck_referrals_status CHECK (status IN ('pending','rewarded')),
  CONSTRAINT ck_referrals_distinct CHECK (referred_tenant_id <> referrer_tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
