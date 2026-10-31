-- Ronde 48 (BS New 12): persetujuan syarat saat mendaftar. Kalimat kotak centang dan tiga dokumen diedit Super Admin;
-- dokumen kosong tidak ditampilkan sebagai tautan. `registrations.terms_accepted_at` mencatat waktu persetujuan.
ALTER TABLE platform_auth_settings
  ADD COLUMN terms_label text NOT NULL DEFAULT ('Saya menyetujui Syarat Layanan, Kebijakan Privasi, dan Kebijakan Penggunaan yang Wajar.'),
  ADD COLUMN terms_of_service mediumtext NOT NULL DEFAULT (''),
  ADD COLUMN privacy_policy mediumtext NOT NULL DEFAULT (''),
  ADD COLUMN acceptable_use_policy mediumtext NOT NULL DEFAULT ('');
ALTER TABLE registrations ADD COLUMN terms_accepted_at datetime(6) NULL;
