-- Ronde 42 (BS New 11): wallet tenant bersama (deposit prabayar) — Tahap 1: inti wallet.
--  * `wallet_accounts` (saldo per tenant, tidak boleh negatif), `wallet_ledger` (buku besar **hanya tambah**:
--    tidak ada kode yang meng-UPDATE/DELETE-nya; koreksi = entri `adjustment` baru), `topups` (pengajuan),
--    `wallet_settings` (min/maks/preset).
--  * Padanan fungsi SQL New 11 (`wallet_post_entry`, `wallet_create_topup`, `wallet_settle_topup`) ada di
--    `lib/wallet.server.ts`: transaksi aplikasi + `SELECT … FOR UPDATE` + kunci idempotensi unik.
--  * Saldo lama Omnix (`omnix_wallets.balance`) dipindah sebagai entri `adjustment` pembuka (idempoten);
--    `omnix_wallets.balance` tetap dipertahankan sebagai cermin kompatibilitas dari saldo bersama.
CREATE TABLE IF NOT EXISTS wallet_accounts (
  tenant_id char(36) NOT NULL,
  balance_idr bigint NOT NULL DEFAULT 0,
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (tenant_id),
  CONSTRAINT ck_wallet_balance CHECK (balance_idr >= 0),
  CONSTRAINT fk_wallet_accounts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id char(36) NOT NULL DEFAULT (uuid()),
  tenant_id char(36) NOT NULL,
  entry_type varchar(20) NOT NULL,
  amount_idr bigint NOT NULL,
  balance_after bigint NOT NULL,
  product_code varchar(50) NOT NULL DEFAULT 'platform',
  invoice_id char(36) NULL,
  ref_id char(36) NULL,
  idempotency_key varchar(200) NOT NULL,
  description varchar(500) NOT NULL DEFAULT '',
  created_by char(36) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_wallet_ledger_idem (idempotency_key),
  KEY ix_wallet_ledger_tenant_date (tenant_id, created_at, id),
  CONSTRAINT ck_wallet_ledger_type CHECK (entry_type IN ('topup','subscription','addon','usage','refund','adjustment','voucher')),
  CONSTRAINT ck_wallet_ledger_amount CHECK (amount_idr <> 0),
  CONSTRAINT ck_wallet_ledger_after CHECK (balance_after >= 0),
  CONSTRAINT fk_wallet_ledger_account FOREIGN KEY (tenant_id) REFERENCES wallet_accounts (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_settings (
  singleton tinyint NOT NULL DEFAULT 1,
  min_topup_idr bigint NOT NULL DEFAULT 50000,
  max_topup_idr bigint NOT NULL DEFAULT 10000000,
  presets json NOT NULL,
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (singleton),
  CONSTRAINT ck_wallet_settings_singleton CHECK (singleton = 1),
  CONSTRAINT ck_wallet_settings_range CHECK (min_topup_idr > 0 AND max_topup_idr >= min_topup_idr)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO wallet_settings (singleton, presets) VALUES (1, JSON_ARRAY(50000, 100000, 250000, 500000, 1000000));

CREATE TABLE IF NOT EXISTS topups (
  id char(36) NOT NULL DEFAULT (uuid()),
  tenant_id char(36) NOT NULL,
  amount_idr bigint NOT NULL,
  gateway_id char(36) NULL,
  gateway varchar(30) NOT NULL DEFAULT 'manual_transfer',  -- manual_transfer | midtrans
  status varchar(20) NOT NULL DEFAULT 'pending',            -- pending | paid | expired | failed | rejected
  idempotency_key char(36) NOT NULL,
  gateway_ref varchar(100) NULL,
  payment_url text NULL,
  proof_path varchar(500) NULL,
  note varchar(1000) NOT NULL DEFAULT '',
  review_note varchar(1000) NULL,
  created_by char(36) NULL,
  approved_by char(36) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  paid_at datetime(6) NULL,
  reviewed_at datetime(6) NULL,
  expires_at datetime(6) NULL,
  late_payment tinyint(1) NOT NULL DEFAULT 0,
  invoice_id char(36) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_topups_idem (idempotency_key),
  UNIQUE KEY uq_topups_gateway_ref (gateway_ref),
  KEY ix_topups_tenant_date (tenant_id, created_at, id),
  CONSTRAINT ck_topups_amount CHECK (amount_idr > 0),
  CONSTRAINT ck_topups_status CHECK (status IN ('pending','paid','expired','failed','rejected')),
  CONSTRAINT fk_topups_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Saldo awal dari Omnix (sekali; kunci idempotensi `legacy-opening:<tenant>`).
INSERT IGNORE INTO wallet_accounts (tenant_id, balance_idr)
  SELECT tenant_id, FLOOR(balance) FROM omnix_wallets WHERE balance > 0;
INSERT IGNORE INTO wallet_ledger (id, tenant_id, entry_type, amount_idr, balance_after, product_code, idempotency_key, description)
  SELECT UUID(), tenant_id, 'adjustment', FLOOR(balance), FLOOR(balance), 'omnix', CONCAT('legacy-opening:', tenant_id), 'Saldo awal dari Omnix'
    FROM omnix_wallets WHERE balance > 0;
