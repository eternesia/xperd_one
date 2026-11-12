-- Harga Template: video 8–10 detik = 1 kredit (tingkat baru di depan). Idempoten: hanya bila
-- tingkat ≤ 10 detik belum ada. NULL = harga bawaan aplikasi (sudah memuat tingkat ini).
UPDATE ai_studio_settings
   SET template_prices = JSON_ARRAY_INSERT(template_prices, '$[0]', JSON_OBJECT('max_s', 10, 'credits', 1))
 WHERE template_prices IS NOT NULL
   AND JSON_VALID(template_prices)
   AND JSON_LENGTH(template_prices) > 0
   AND JSON_LENGTH(template_prices) < 6
   AND NOT JSON_CONTAINS(JSON_EXTRACT(template_prices, '$[*].max_s'), '10');
