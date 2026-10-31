-- Ronde 50 (BS New 13): DOKU Checkout untuk top-up wallet. `checkout_started_at` menandai checkout yang sudah diklaim sekali
-- (kegagalan ambigu tidak diulang buta; pakai "Cek"). Client ID di `payment_gateways.merchant_id`, Secret Key di
-- `payment_gateways.server_key` (diisi Super Admin dari aplikasi, tulis-saja — migrasi 032).
ALTER TABLE topups ADD COLUMN checkout_started_at datetime(6) NULL;
