-- Dev-only: menutup celah bootstrap tenant demo.
--
-- 1) `000_dev_bootstrap.sql` berjalan SEBELUM `001_core_seed.sql`, jadi saat itu
--    tabel `packages` masih kosong → `package_id` tenant demo = NULL dan halaman
--    Tenancy kehilangan nama paket (spec `admin-tenancy` gagal di DB baru).
-- 2) Add-on `qalling` (CRM) belum pernah diberikan lewat seed, sehingga seluruh
--    spec e2e CRM ter-*skip* di DB bersih ("CRM add-on (qalling) is not assigned
--    to this tenant") dan regresi CRM tidak pernah tertangkap.
--
-- Berkas ini dijalankan setelah `001_core_seed.sql` sehingga katalog `packages`
-- dan `addons` sudah tersedia. Idempotent (UPDATE + unique key tenant+addon).
-- Catatan: variabel MySQL memakai kolase `utf8mb4_general_ci`, sedangkan kolom
-- `tenants.id` = `utf8mb4_unicode_ci`; tanpa `COLLATE` perbandingannya error
-- `ER_CANT_AGGREGATE_2COLLATIONS` (1267).
SET @tenant = 'e77b5fd9-cc3f-417b-bed8-75aad0801d46';

UPDATE tenants
   SET package_id = (SELECT id FROM packages WHERE code = 'one-professional' LIMIT 1)
 WHERE id = @tenant COLLATE utf8mb4_unicode_ci;

INSERT INTO tenant_addons (id, tenant_id, addon_id, status, starts_at, monthly_price, notes)
SELECT UUID(), @tenant, id, 'active', CURDATE(), 0, 'dev fixture'
  FROM addons WHERE code = 'qalling'
ON DUPLICATE KEY UPDATE status = 'active', ends_at = NULL;
