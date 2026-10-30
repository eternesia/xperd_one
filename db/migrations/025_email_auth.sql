-- Ronde 45 (BS New 11): Email Gateway, pengaturan login/pendaftaran, OTP pendaftaran & login.
-- `email_gateway_settings.secret` hanya dibaca server (tidak pernah dikirim ke klien).
CREATE TABLE IF NOT EXISTS email_gateway_settings (
  id char(36) NOT NULL DEFAULT (uuid()),
  scope_key varchar(80) NOT NULL,
  workspace_id char(36) NULL,
  enabled tinyint(1) NOT NULL DEFAULT 0,
  provider varchar(20) NOT NULL DEFAULT 'brevo',
  from_name varchar(255) NULL,
  from_email varchar(255) NULL,
  reply_to varchar(255) NULL,
  smtp_host varchar(255) NULL,
  smtp_port int NULL,
  smtp_user varchar(255) NULL,
  smtp_secure varchar(10) NOT NULL DEFAULT 'tls',
  secret text NULL,
  events json NOT NULL,
  last_test_at datetime(6) NULL,
  last_test_status text NULL,
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_gateway_scope (scope_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_auth_settings (
  singleton tinyint NOT NULL DEFAULT 1,
  google_enabled tinyint(1) NOT NULL DEFAULT 1,
  email_otp_enabled tinyint(1) NOT NULL DEFAULT 1,
  trial_days int NOT NULL DEFAULT 14,
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (singleton),
  CONSTRAINT ck_platform_auth_singleton CHECK (singleton = 1),
  CONSTRAINT ck_platform_auth_trial CHECK (trial_days BETWEEN 1 AND 90)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Google OAuth memakai penyedia pihak ketiga (tidak ada di Old) → default nonaktif.
INSERT IGNORE INTO platform_auth_settings (singleton, google_enabled) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS registration_otps (
  id char(36) NOT NULL DEFAULT (uuid()),
  registration_id char(36) NOT NULL,
  email varchar(255) NOT NULL,
  code_hash char(64) NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  expires_at datetime(6) NOT NULL,
  consumed_at datetime(6) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_registration_otps_reg (registration_id, created_at),
  CONSTRAINT fk_registration_otps_reg FOREIGN KEY (registration_id) REFERENCES registrations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_otps (
  id char(36) NOT NULL DEFAULT (uuid()),
  email varchar(255) NOT NULL,
  code_hash char(64) NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  expires_at datetime(6) NOT NULL,
  consumed_at datetime(6) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_login_otps_email (email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
