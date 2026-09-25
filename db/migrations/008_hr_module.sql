-- ===========================================================================
-- 008_hr_module.sql
--  * Modul baru "Slipp HR" (add-on `slipp_hr`) dari ekspor Business Suite New 2:
--    master organisasi (departemen/jabatan), komponen gaji, karyawan, payroll run
--    dan slip gaji. Ekspor New 2 tidak memuat migration HR, jadi tabelnya dibuat
--    di sini mengikuti konvensi 001_schema.sql (CHAR(36) + UUID(), DECIMAL(18,4),
--    DATETIME(6), TINYINT(1) untuk boolean, JSON untuk kolom majemuk).
--  * Kolom `addons.pricing_unit`: add-on bisa dihargai per unit (mis. Slipp HR
--    Rp15.000/karyawan/bulan) — dipakai di halaman Billing tenant.
-- Runs once via the migrate runner (001..00N in order).
-- ===========================================================================

CREATE TABLE IF NOT EXISTS hr_org_units (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  kind VARCHAR(20) NOT NULL,                 -- 'department' | 'position'
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_hr_org_units (workspace_id, kind, code),
  CONSTRAINT fk_hr_org_units_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hr_pay_components (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  kind VARCHAR(20) NOT NULL,                 -- 'allowance' | 'deduction'
  is_fixed TINYINT(1) NOT NULL DEFAULT 1,
  taxable TINYINT(1) NOT NULL DEFAULT 1,
  default_amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_hr_pay_components (workspace_id, code),
  CONSTRAINT fk_hr_pay_components_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hr_employees (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  nik VARCHAR(50),
  npwp VARCHAR(50),
  email VARCHAR(255),
  phone VARCHAR(50),
  department VARCHAR(255),                   -- mengacu hr_org_units(kind='department').name
  position VARCHAR(255),
  join_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  ptkp_status VARCHAR(10) NOT NULL DEFAULT 'TK/0',
  base_salary DECIMAL(18,4) NOT NULL DEFAULT 0,
  bank_name VARCHAR(150),
  bank_account VARCHAR(75),
  bpjs_kes TINYINT(1) NOT NULL DEFAULT 0,
  bpjs_tk TINYINT(1) NOT NULL DEFAULT 0,
  components JSON,                           -- [{ component_id, amount }]
  notes TEXT,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_hr_employees (workspace_id, code),
  CONSTRAINT fk_hr_employees_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hr_payroll_runs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  run_no VARCHAR(75) NOT NULL,               -- PAY/YYYYMM
  period CHAR(7) NOT NULL,                   -- YYYY-MM
  pay_date DATE NOT NULL,
  bank_account_code VARCHAR(100),
  employee_count INT NOT NULL DEFAULT 0,
  total_gross DECIMAL(18,4) NOT NULL DEFAULT 0,
  total_pph21 DECIMAL(18,4) NOT NULL DEFAULT 0,
  total_bpjs_company DECIMAL(18,4) NOT NULL DEFAULT 0,
  total_deductions DECIMAL(18,4) NOT NULL DEFAULT 0,
  total_net DECIMAL(18,4) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',   -- 'draft' | 'approved'
  journal_entry_id CHAR(36),
  approved_at DATETIME(6),
  notes VARCHAR(255),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_hr_payroll_runs (workspace_id, period),
  CONSTRAINT fk_hr_payroll_runs_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hr_payslips (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  run_id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  employee_id CHAR(36),
  employee_code VARCHAR(100),
  employee_name VARCHAR(255) NOT NULL,
  department VARCHAR(255),
  position VARCHAR(255),
  ptkp_status VARCHAR(10),
  npwp VARCHAR(50),
  bank_name VARCHAR(150),
  bank_account VARCHAR(75),
  base_salary DECIMAL(18,4) NOT NULL DEFAULT 0,
  allowances JSON,
  deductions JSON,
  bpjs JSON,
  gross DECIMAL(18,4) NOT NULL DEFAULT 0,
  taxable_gross DECIMAL(18,4) NOT NULL DEFAULT 0,
  ter_category VARCHAR(2),
  ter_rate DECIMAL(9,6) NOT NULL DEFAULT 0,
  pph21 DECIMAL(18,4) NOT NULL DEFAULT 0,
  bpjs_employee DECIMAL(18,4) NOT NULL DEFAULT 0,
  bpjs_company DECIMAL(18,4) NOT NULL DEFAULT 0,
  other_deductions DECIMAL(18,4) NOT NULL DEFAULT 0,
  net_pay DECIMAL(18,4) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_hr_payslips_run (workspace_id, run_id),
  CONSTRAINT fk_hr_payslips_run FOREIGN KEY (run_id) REFERENCES hr_payroll_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_hr_payslips_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add-on per unit (mis. Slipp HR dihargai per karyawan/bulan).
ALTER TABLE addons
  ADD COLUMN pricing_unit VARCHAR(20) NULL AFTER monthly_price;
