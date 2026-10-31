-- Ronde 48 (BS New 12, migrasi 0019): konfigurasi storage eksternal (S3/R2/Wasabi/Spaces/B2). Hanya dibaca server; kunci tidak
-- pernah dikembalikan ke klien. Konfigurasi/uji TIDAK memindahkan berkas yang sudah ada (berkas Old tetap di STORAGE_DIR).
CREATE TABLE IF NOT EXISTS platform_storage_settings (
  singleton tinyint NOT NULL DEFAULT 1,
  provider varchar(20) NOT NULL DEFAULT 'r2',
  endpoint varchar(255) NOT NULL DEFAULT '',
  bucket varchar(100) NOT NULL DEFAULT '',
  region varchar(50) NOT NULL DEFAULT 'auto',
  access_key varchar(255) NOT NULL DEFAULT '',
  secret_key varchar(255) NOT NULL DEFAULT '',
  cdn_url varchar(255) NOT NULL DEFAULT '',
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (singleton),
  CONSTRAINT ck_platform_storage_singleton CHECK (singleton = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
