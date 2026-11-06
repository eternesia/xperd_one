-- Notifikasi email otomatis (trial, saldo, invoice, ringkasan posting).
--  * `email_notifications`: log + kunci anti-duplikat (`dedupe_key` UNIQUE). Satu kejadian = satu email;
--    status pending → sending → sent | failed (percobaan ulang maks 3 untuk failed). Baris `sending` yang
--    tersangkut tidak dikirim ulang otomatis (lebih baik tidak ganda daripada ganda).
--  * `notification_prefs`: pilihan berhenti berlangganan per tenant (default aktif bila tidak ada baris).
CREATE TABLE IF NOT EXISTS email_notifications (
  id char(36) NOT NULL DEFAULT (uuid()),
  tenant_id char(36) NULL,
  workspace_id char(36) NULL,
  kind varchar(40) NOT NULL,
  dedupe_key varchar(190) NOT NULL,
  to_email varchar(255) NOT NULL,
  subject varchar(255) NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  error text NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  sent_at datetime(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_notifications_dedupe (dedupe_key),
  KEY ix_email_notifications_tenant (tenant_id, kind, created_at),
  KEY ix_email_notifications_status (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_prefs (
  tenant_id char(36) NOT NULL,
  kind varchar(40) NOT NULL,
  enabled tinyint(1) NOT NULL DEFAULT 1,
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (tenant_id, kind),
  CONSTRAINT fk_notification_prefs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
