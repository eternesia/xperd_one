-- Kirimdev dikelola platform: satu API key induk di Super Admin; tiap workspace = "customer" Kirimdev
-- yang memasang nomor WhatsApp-nya sendiri lewat setup link (Embedded Signup Meta).
CREATE TABLE IF NOT EXISTS kirimdev_settings (
  id varchar(20) NOT NULL,
  api_key varchar(300) NULL,
  status varchar(20) NOT NULL DEFAULT 'none',           -- none | verified | invalid
  last_error text NULL,
  verified_at datetime(6) NULL,
  updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE crm_wa_settings
  ADD COLUMN managed TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN kirimdev_customer_id VARCHAR(80) NULL,
  ADD COLUMN number_display VARCHAR(60) NULL;
