-- ===========================================================================
-- 005_hr_employee_fixture.sql
--  * Satu karyawan aktif untuk menguji payroll Slipp HR (dan dipakai juga oleh
--    dasbor HR). Komponen: TJ-JAB 1.000.000 (dari 004_hr_pay_components.sql).
--  * Idempotent: id tetap + ON DUPLICATE KEY UPDATE.
--  * CATATAN: data uji. Di produksi karyawan dimasukkan lewat layar HR atau impor.
-- ===========================================================================

SET @ws = '46bc16a0-56bc-4bd1-a813-fe7f0046a6d9';
-- Id komponen TJ-JAB dari 004_hr_pay_components.sql (dihardcode supaya tidak ada
-- perbandingan kolom vs variabel sesi yang bisa bentrok collation).
SET @tj = 'aaaaaaaa-bbbb-0000-0000-0000000000c1';

INSERT INTO hr_employees
  (id, workspace_id, code, name, nik, npwp, email, phone, department, position, join_date,
   status, ptkp_status, base_salary, bank_name, bank_account, bpjs_kes, bpjs_tk, components, notes, created_at, updated_at)
VALUES
  ('aaaaaaaa-bbbb-0000-0000-0000000000d1', @ws, 'EMP-0001', 'Budi Santoso (fixture)', '3171000000000001', NULL,
   'budi@contoh.com', '081200000001', NULL, NULL, '2026-01-15',
   'active', 'TK/0', 8000000, 'BCA', '1234567890', 1, 1,
   CONCAT('[{"component_id":"', @tj, '","amount":1000000}]'), 'Fixture e2e payroll Slipp HR',
   NOW(), NOW())
ON DUPLICATE KEY UPDATE
  status = VALUES(status), base_salary = VALUES(base_salary), ptkp_status = VALUES(ptkp_status),
  components = VALUES(components), bpjs_kes = VALUES(bpjs_kes), bpjs_tk = VALUES(bpjs_tk), updated_at = NOW();
