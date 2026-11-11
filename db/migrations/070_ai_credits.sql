-- Studio AI: saldo kredit tersendiri per tenant + paket kredit.
--  * Paket dibeli dari saldo wallet, atau dibayar langsung (QRIS/kartu) lewat top-up ber-`purchase_intent`
--    {"kind":"ai_credits"} yang otomatis dikonversi menjadi kredit begitu pembayaran lunas.
--  * Video memotong kredit (bukan Rupiah). `ai_credit_ledger` hanya ditambah, kunci idempotensi unik.
--  * Harga per video disesuaikan dengan nilai kredit baru (±Rp2.000–2.500/kredit): 3/5/10 kredit per 5 detik.
CREATE TABLE IF NOT EXISTS ai_credit_accounts (
  tenant_id char(36) NOT NULL,
  credits int NOT NULL DEFAULT 0,
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (tenant_id),
  CONSTRAINT ck_ai_credit_accounts_nonneg CHECK (credits >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_credit_ledger (
  id char(36) NOT NULL,
  tenant_id char(36) NOT NULL,
  kind varchar(20) NOT NULL,                       -- purchase | usage | refund | bonus | adjustment
  delta int NOT NULL,
  balance_after int NOT NULL,
  amount_idr int NOT NULL DEFAULT 0,               -- Rupiah yang dibayar (pembelian paket)
  ref_id char(36) NULL,
  idempotency_key varchar(120) NOT NULL,
  description varchar(255) NOT NULL DEFAULT '',
  created_by char(36) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_ai_credit_ledger_idem (idempotency_key),
  KEY ix_ai_credit_ledger_tenant (tenant_id, created_at),
  CONSTRAINT ck_ai_credit_ledger_kind CHECK (kind IN ('purchase','usage','refund','bonus','adjustment')),
  CONSTRAINT ck_ai_credit_ledger_delta CHECK (delta <> 0),
  CONSTRAINT ck_ai_credit_ledger_after CHECK (balance_after >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE ai_studio_settings ADD COLUMN credit_packs json NULL;   -- null = bawaan di kode

-- Pekerjaan lama dibayar dari saldo Rupiah; yang baru dari kredit (menentukan jalur refund).
ALTER TABLE ai_jobs ADD COLUMN charge_source varchar(10) NOT NULL DEFAULT 'wallet';

-- Tingkat yang sudah tersimpan memakai kredit lama (Rp1.000/kredit) → sesuaikan ke nilai kredit baru.
UPDATE ai_studio_settings
   SET tiers = JSON_SET(tiers,
         '$.hemat.credits_5s', 3, '$.hemat.credits_10s', 6,
         '$.standar.credits_5s', 5, '$.standar.credits_10s', 10,
         '$.premium.credits_5s', 10, '$.premium.credits_10s', 20)
 WHERE id = 'platform' AND tiers IS NOT NULL;
