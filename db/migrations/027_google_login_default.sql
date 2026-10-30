-- Ronde 47: tampilan Qalling disamakan dengan New 11 → tombol "Masuk/Daftar dengan Google" tampil (default New 11 = aktif).
-- Tanpa `VITE_GOOGLE_OAUTH_URL` (penyedia OAuth pihak ketiga) klik menampilkan pesan jelas; Super Admin dapat mematikannya
-- di Login & Pendaftaran.
UPDATE platform_auth_settings SET google_enabled = 1 WHERE singleton = 1;
