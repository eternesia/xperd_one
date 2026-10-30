-- Ronde 43 (BS New 11): billing ERP lewat saldo wallet — bayar invoice dari saldo, perpanjangan otomatis,
-- ganti paket instan (prorata). Padanan fungsi SQL `billing_pay_invoice` / `billing_renew_tenant` /
-- `billing_package_quote` / `billing_package_checkout` ada di `lib/billing-wallet.server.ts`
-- (transaksi aplikasi; lock urut: langganan lalu saldo wallet).
ALTER TABLE subscriptions ADD COLUMN wallet_auto_renew TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN activation_applied_at DATETIME(6) NULL;

-- Jurnal operasi checkout: kunci idempotensi + permintaan + hasil (replay mengembalikan hasil yang sama).
CREATE TABLE IF NOT EXISTS billing_operations (
  id char(36) NOT NULL DEFAULT (uuid()),
  tenant_id char(36) NOT NULL,
  idempotency_key varchar(200) NOT NULL,
  request json NOT NULL,
  result json NOT NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_billing_operations_key (idempotency_key),
  CONSTRAINT fk_billing_operations_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS billing_policy (
  singleton tinyint NOT NULL DEFAULT 1,
  addon_grace_days int NOT NULL DEFAULT 3,
  PRIMARY KEY (singleton),
  CONSTRAINT ck_billing_policy_singleton CHECK (singleton = 1),
  CONSTRAINT ck_billing_policy_grace CHECK (addon_grace_days BETWEEN 0 AND 30)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO billing_policy (singleton, addon_grace_days) VALUES (1, 3);
