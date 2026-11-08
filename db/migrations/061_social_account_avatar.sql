-- Foto profil akun sosial (diambil dari Tebar saat sinkron) untuk tampilan Create post, Insight, dll.
ALTER TABLE crm_social_accounts
  ADD COLUMN avatar_url varchar(600) NULL;
