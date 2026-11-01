-- Ronde 51: login Google (Qalling) memakai OAuth Client milik Anda. Client ID boleh dibaca Super Admin; Client Secret tulis-saja
-- (tidak pernah dikembalikan ke klien; kosong saat simpan = pertahankan). Diisi dari Admin → Login & Pendaftaran.
ALTER TABLE platform_auth_settings
  ADD COLUMN google_client_id varchar(255) NOT NULL DEFAULT '',
  ADD COLUMN google_client_secret varchar(255) NOT NULL DEFAULT '';
