-- Studio AI: template tanpa foto (Pengumuman Teks) → foto sumber boleh kosong. Aman diulang.
ALTER TABLE ai_jobs MODIFY source_media_id char(36) NULL;
