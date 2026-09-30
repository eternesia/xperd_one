-- Bootstrap data dev untuk menjalankan e2e (idempotent).
-- Dibuat oleh sesi porting Batch 3: DB dev baru perlu satu tenant + workspace
-- agar seed fixture (`db/seeds/002_sales_source_fixture.sql`, memakai id
-- workspace tetap) bisa diterapkan dan e2e punya konteks login.
SET @admin = '00000000-0000-0000-0000-000000000001';
-- Id tenant & workspace sengaja disamakan dengan fixture lain di folder ini
-- (002/003/004/005 memakai id tetap) agar seluruh seed bisa diterapkan.
SET @tenant = 'e77b5fd9-cc3f-417b-bed8-75aad0801d46';
SET @ws = '46bc16a0-56bc-4bd1-a813-fe7f0046a6d9';
SET @pkg = (SELECT id FROM packages WHERE code = 'one-professional' LIMIT 1);

INSERT IGNORE INTO tenants
  (id, name, subdomain, package_id, owner_id, status, city, user_count, workspace_count, trial_ends_at, started_at)
VALUES
  (@tenant, 'XPERD Demo', 'xperd-demo', @pkg, @admin, 'active', 'Jakarta', 1, 1,
   DATE_ADD(CURDATE(), INTERVAL 365 DAY), CURDATE());
INSERT IGNORE INTO workspaces
  (id, tenant_id, name, legal_name, slug, currency, timezone, fiscal_year_start_month,
   default_costing_method, address, tax_id, phone, email, doc_template, status, created_by)
VALUES
  (@ws, @tenant, 'XPERD Demo', 'PT XPERD Demo', 'demo', 'IDR', 'Asia/Jakarta', 1,
   'AVERAGE', 'Jl. Contoh No. 1, Jakarta', '01.234.567.8-901.000', '021-1234567',
   'demo@xperd.local', 'classic', 'active', @admin);

INSERT IGNORE INTO workspace_members (id, workspace_id, user_id, role)
VALUES (UUID(), @ws, @admin, 'owner');

INSERT IGNORE INTO user_roles (id, user_id, role) VALUES (UUID(), @admin, 'customer');

SELECT (SELECT COUNT(*) FROM tenants) AS tenants,
       (SELECT COUNT(*) FROM workspaces) AS workspaces,
       (SELECT COUNT(*) FROM workspace_members) AS members;
