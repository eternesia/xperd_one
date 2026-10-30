-- Dev/demo: metode pembayaran wallet (Transfer Bank contoh). Hanya bila tenant demo "XPERD Demo" ada, supaya
-- rekening contoh ini TIDAK pernah masuk ke produksi. Produksi: gateway dikelola Super Admin.
INSERT INTO payment_gateways (id, provider, display_name, mode, is_active, instructions, sort_order)
SELECT UUID(), 'manual_transfer', 'Transfer Bank', 'live', 1,
       'Transfer ke BCA 123-456-7890 a.n. PT Xperd Digital. Unggah bukti transfer setelah mengajukan top-up.', 1
 WHERE EXISTS (SELECT 1 FROM tenants WHERE name = 'XPERD Demo')
   AND NOT EXISTS (SELECT 1 FROM payment_gateways WHERE provider = 'manual_transfer');
