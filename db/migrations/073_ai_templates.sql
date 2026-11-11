-- Studio AI: tingkat "Template" (video dari template Remotion, tanpa model AI).
-- Dirender oleh mesin render terpisah (VPS) yang mengambil pekerjaan dari Qalling memakai token.
--  * template_enabled: saklar tingkat Template (bawaan OFF; tetap mengikuti saklar utama Studio).
--  * template_credits: harga per video Template.
--  * worker_token_hash: SHA-256 token mesin render (token asli hanya tampil sekali saat dibuat).
--  * worker_seen_at / worker_info: kapan mesin render terakhir menghubungi & keterangannya.
ALTER TABLE ai_studio_settings
  ADD COLUMN template_enabled tinyint(1) NOT NULL DEFAULT 0,
  ADD COLUMN template_credits int NOT NULL DEFAULT 1,
  ADD COLUMN worker_token_hash char(64) NULL,
  ADD COLUMN worker_seen_at datetime(6) NULL,
  ADD COLUMN worker_info varchar(255) NULL;

-- Kapan pekerjaan diambil mesin render (batas waktu render dihitung dari sini).
ALTER TABLE ai_jobs ADD COLUMN claimed_at datetime(6) NULL;
