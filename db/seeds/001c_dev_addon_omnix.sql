-- Dev-only: aktifkan add-on Omnix untuk tenant demo agar modulnya terbuka saat
-- pengembangan/e2e (produksi: aktifkan lewat Billing atau halaman Add-ons).
SET @tenant = 'e77b5fd9-cc3f-417b-bed8-75aad0801d46';
INSERT INTO tenant_addons (id, tenant_id, addon_id, status, starts_at, monthly_price, notes)
SELECT UUID(), @tenant, id, 'active', CURDATE(), 0, 'dev fixture'
  FROM addons WHERE code = 'omnix'
ON DUPLICATE KEY UPDATE status = 'active', ends_at = NULL;
