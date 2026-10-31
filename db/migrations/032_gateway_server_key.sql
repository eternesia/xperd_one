-- Ronde 49: server key gateway pembayaran disimpan di DB dan diisi Super Admin dari aplikasi (tanpa env/secret
-- manager). Hanya dibaca server; tidak pernah dikembalikan ke klien. Env `server_key_secret_name` tetap jadi cadangan.
ALTER TABLE payment_gateways ADD COLUMN server_key varchar(255) NULL;
