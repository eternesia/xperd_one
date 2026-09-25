-- ===========================================================================
-- 009_hr_addon.sql
--  * Katalog add-on "Slipp HR" (modul `hr`, ekspor Business Suite New 2).
--    Tanpa baris katalog ini modul HR tidak bisa diaktifkan tenant, karena
--    gating di aplikasi memakai `modules[].addon` + daftar add-on aktif tenant.
--  * `pricing_unit = 'employee'`: ditagih per karyawan aktif per bulan
--    (Rp15.000), sesuai label di halaman Billing.
--  * Idempotent (ON DUPLICATE KEY UPDATE pada uq_addons_code) mengikuti pola
--    004_workspace_doc_settings.sql untuk add-on "qalling".
-- Runs once via the migrate runner (001..00N in order).
-- ===========================================================================

INSERT INTO addons (id, code, name, tagline, description, monthly_price, pricing_unit, module_id, sort_order)
VALUES (UUID(), 'slipp_hr', 'Slipp HR', 'Karyawan, payroll, BPJS & PPh 21 TER',
        'HR add-on: master organisasi, komponen gaji, payroll bulanan, slip gaji, BPJS dan PPh 21 TER. Dihargai per karyawan aktif per bulan.',
        15000, 'employee', 'hr', 20)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  tagline = VALUES(tagline),
  description = VALUES(description),
  monthly_price = VALUES(monthly_price),
  pricing_unit = VALUES(pricing_unit),
  module_id = VALUES(module_id),
  sort_order = VALUES(sort_order);
