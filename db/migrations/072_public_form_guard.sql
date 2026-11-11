-- Perlindungan form publik (xperd.id/contact): token sekali pakai + batas kiriman per IP/email.
-- Baris lebih dari 2 hari dihapus otomatis saat ada kiriman baru.
CREATE TABLE IF NOT EXISTS public_form_submissions (
  nonce char(32) NOT NULL,                 -- dari token form; unik → token tidak bisa dipakai ulang
  form varchar(30) NOT NULL,
  ip_hash char(64) NOT NULL,               -- SHA-256 IP + rahasia aplikasi (IP asli tidak disimpan)
  email varchar(255) NULL,
  created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (nonce),
  KEY ix_pfs_ip (form, ip_hash, created_at),
  KEY ix_pfs_email (form, email, created_at),
  KEY ix_pfs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
