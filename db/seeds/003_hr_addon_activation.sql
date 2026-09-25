-- ===========================================================================
-- 003_hr_addon_activation.sql
--  * Mengaktifkan add-on `slipp_hr` untuk tenant demo supaya modul Slipp HR
--    (dan dasbor payroll) bisa diuji end-to-end di lingkungan dev.
--  * Idempotent: memakai id tetap + ON DUPLICATE KEY UPDATE.
--  * CATATAN: ini data uji. Di produksi, add-on diaktifkan lewat
--    menu Admin -> Add-ons (tenant_addons), bukan lewat seed.
-- ===========================================================================

SET @tenant = 'e77b5fd9-cc3f-417b-bed8-75aad0801d46';   -- Demo Xperd
SET @addon  = (SELECT id FROM addons WHERE code = 'slipp_hr' LIMIT 1);

INSERT INTO tenant_addons (id, tenant_id, addon_id, status, starts_at, ends_at, monthly_price, notes, created_at, updated_at)
VALUES ('aaaaaaaa-bbbb-0000-0000-0000000000a1', @tenant, @addon, 'active', CURDATE(), NULL, 15000,
        'Fixture e2e Slipp HR', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  status = VALUES(status), monthly_price = VALUES(monthly_price), ends_at = NULL, updated_at = NOW();
