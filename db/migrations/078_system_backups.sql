-- Superadmin: riwayat backup otomatis (database harian, berkas mingguan).
-- File backup disimpan di <STORAGE_DIR>/_backups (volume persisten) dan bisa diunduh dari
-- halaman Kesehatan Sistem untuk disimpan di luar server. Idempoten.
CREATE TABLE IF NOT EXISTS system_backups (
  id char(36) NOT NULL DEFAULT (uuid()),
  kind varchar(10) NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'running',
  file_name varchar(255) NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  target varchar(40) NOT NULL DEFAULT 'server',
  detail varchar(1000) NULL,
  triggered_by char(36) NULL,
  started_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  finished_at datetime(6) NULL,
  PRIMARY KEY (id),
  KEY ix_system_backups_kind (kind, status, started_at),
  CONSTRAINT ck_system_backups_kind CHECK (kind IN ('db','files')),
  CONSTRAINT ck_system_backups_status CHECK (status IN ('running','success','failed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
