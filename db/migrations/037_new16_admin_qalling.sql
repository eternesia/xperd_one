-- BS New 16 (bagian ringan): sumber pendaftaran tenant, kebijakan unggah media, komentar pertama + cover postingan, opsi "Extra 5 akun",
-- dan penyelarasan nama section kontak situs XPERD (`contact`, seperti New 16).
ALTER TABLE tenants ADD COLUMN signup_source varchar(10) NULL COMMENT 'Situs pendaftaran asal: qalling|xperd|admin; NULL = riwayat lama tak diketahui';
UPDATE tenants t SET signup_source = 'qalling'
 WHERE EXISTS (SELECT 1 FROM registrations r WHERE r.tenant_id = t.id AND r.notes IN ('qalling-google','qalling-signup'))
    OR t.notes IN ('qalling-google','qalling-signup');

CREATE TABLE IF NOT EXISTS media_upload_settings (
  singleton tinyint NOT NULL DEFAULT 1,
  photo_mb int NOT NULL DEFAULT 5,
  video_mb int NOT NULL DEFAULT 20,
  image_quality int NOT NULL DEFAULT 92,
  image_max_edge int NOT NULL DEFAULT 2560,
  compress_images tinyint(1) NOT NULL DEFAULT 1,
  compress_videos tinyint(1) NOT NULL DEFAULT 1,
  video_mbps int NOT NULL DEFAULT 10,
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (singleton),
  CONSTRAINT ck_media_singleton CHECK (singleton = 1),
  CONSTRAINT ck_media_photo CHECK (photo_mb BETWEEN 1 AND 50),
  CONSTRAINT ck_media_video CHECK (video_mb BETWEEN 1 AND 50),
  CONSTRAINT ck_media_quality CHECK (image_quality BETWEEN 85 AND 100),
  CONSTRAINT ck_media_edge CHECK (image_max_edge BETWEEN 1920 AND 4096),
  CONSTRAINT ck_media_mbps CHECK (video_mbps BETWEEN 8 AND 30)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO media_upload_settings (singleton) VALUES (1);

ALTER TABLE crm_scheduled_posts
  ADD COLUMN first_comment text NULL,
  ADD COLUMN cover_path varchar(500) NULL;

INSERT INTO addon_options (id, addon_id, code, name, monthly_price, max_quantity, grants, requires_features, is_active)
SELECT UUID(), a.id, 'qalling_extra_accounts_5', 'Extra 5 akun media sosial', 50000, 20, JSON_OBJECT('limits', JSON_OBJECT('max_accounts', 5)), JSON_ARRAY(), 1
  FROM addons a
 WHERE a.code = 'qalling'
   AND NOT EXISTS (SELECT 1 FROM addon_options o WHERE o.code = 'qalling_extra_accounts_5');

UPDATE site_content SET section = 'contact' WHERE section = 'xperd.kontak';
