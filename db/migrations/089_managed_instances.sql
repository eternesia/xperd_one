-- Instalasi XPERD di server klien (self-hosted) yang dipantau & dilisensikan dari Super Admin pusat.
-- `managed_instances` dipakai di pusat; `instance_state` dipakai di server klien. Idempoten.
CREATE TABLE IF NOT EXISTS managed_instances (
  id char(36) NOT NULL,
  name varchar(150) NOT NULL,
  client_name varchar(150) NULL,
  domain varchar(255) NULL,
  token_hash char(64) NOT NULL,
  token_hint varchar(16) NULL,
  modules json NOT NULL,
  max_users int NOT NULL DEFAULT 25,
  expires_at date NULL,
  grace_days int NOT NULL DEFAULT 14,
  status varchar(20) NOT NULL DEFAULT 'active',
  notes text NULL,
  last_seen_at datetime NULL,
  last_ip varchar(64) NULL,
  last_version varchar(64) NULL,
  last_report json NULL,
  created_by char(36) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_managed_instances_token (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kunci penandatangan lisensi (Ed25519) milik pusat; dibuat sekali saat pertama dibutuhkan.
CREATE TABLE IF NOT EXISTS platform_license_keys (
  id tinyint NOT NULL DEFAULT 1,
  public_pem text NOT NULL,
  private_pem text NOT NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Di server klien: lisensi terakhir dari pusat + status sinkron.
CREATE TABLE IF NOT EXISTS instance_state (
  id tinyint NOT NULL DEFAULT 1,
  license text NULL,
  last_sync_at datetime NULL,
  last_ok_at datetime NULL,
  last_error varchar(500) NULL,
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
