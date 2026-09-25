-- ===========================================================================
-- 004_hr_pay_components.sql
--  * Komponen gaji default (standar Indonesia) untuk workspace demo — dipakai
--    uji payroll Slipp HR dan sama dengan tombol "Muat komponen default" di UI.
--  * Idempotent: id tetap + ON DUPLICATE KEY UPDATE (unique: workspace_id, code).
--  * CATATAN: ini data uji. Di produksi, komponen diisi lewat layar
--    HR -> Salary Components (atau tombol muat default).
-- ===========================================================================

SET @ws = '46bc16a0-56bc-4bd1-a813-fe7f0046a6d9';

INSERT INTO hr_pay_components (id, workspace_id, code, name, kind, is_fixed, taxable, default_amount, is_active, created_at, updated_at)
VALUES
  ('aaaaaaaa-bbbb-0000-0000-0000000000c1', @ws, 'TJ-JAB', 'Tunjangan Jabatan',  'allowance', 1, 1, 0, 1, NOW(), NOW()),
  ('aaaaaaaa-bbbb-0000-0000-0000000000c2', @ws, 'TJ-TRN', 'Tunjangan Transport','allowance', 1, 1, 0, 1, NOW(), NOW()),
  ('aaaaaaaa-bbbb-0000-0000-0000000000c3', @ws, 'TJ-MKN', 'Tunjangan Makan',    'allowance', 0, 1, 0, 1, NOW(), NOW()),
  ('aaaaaaaa-bbbb-0000-0000-0000000000c4', @ws, 'LEMBUR', 'Uang Lembur',        'allowance', 0, 1, 0, 1, NOW(), NOW()),
  ('aaaaaaaa-bbbb-0000-0000-0000000000c5', @ws, 'POT-KAS','Potongan Kasbon',    'deduction', 0, 0, 0, 1, NOW(), NOW()),
  ('aaaaaaaa-bbbb-0000-0000-0000000000c6', @ws, 'POT-ABS','Potongan Absensi',   'deduction', 0, 0, 0, 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name = VALUES(name), kind = VALUES(kind), is_fixed = VALUES(is_fixed),
  taxable = VALUES(taxable), is_active = VALUES(is_active), updated_at = NOW();
