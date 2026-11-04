-- Aset situs kecil yang diunggah Super Admin (mis. poster promosi referral). Disimpan di DB agar ikut cadangan; dilayani lewat
-- /api/public/site-asset/<key>. Idempoten.
CREATE TABLE IF NOT EXISTS site_assets (
  asset_key varchar(100) NOT NULL,
  mime varchar(60) NOT NULL,
  size_bytes int NOT NULL,
  data mediumblob NOT NULL,
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (asset_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
