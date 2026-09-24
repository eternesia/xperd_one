-- ===========================================================================
-- 007_workspace_logo_and_cb_attachment.sql
--  * #4 (BS New): logo dokumen per workspace. Di BS New logo diunggah ke
--    Supabase Storage dan kolomnya hanya menyimpan URL; Old tidak punya object
--    storage, jadi logo disimpan sebagai data URL (di-resize di browser sebelum
--    dikirim) di kolom MEDIUMTEXT. Ditampilkan di header cetak/PDF (Invoice,
--    SO, DO, PO, GR, AP, AR) dan di Settings -> Company profile.
--  * #12/#13 (BS New): lampiran bukti transaksi kas/bank pada cb_transactions.
--    Perlakuan sama (data URL di MEDIUMTEXT) karena tidak ada object storage.
-- Runs once via the migrate runner (001..00N in order).
-- ===========================================================================

ALTER TABLE workspaces
  ADD COLUMN logo_url MEDIUMTEXT NULL AFTER doc_footer_note;

ALTER TABLE cb_transactions
  ADD COLUMN attachment_url MEDIUMTEXT NULL AFTER memo;
