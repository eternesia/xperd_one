# Porting Slipp HR (Batch 2) — rencana & progres

Dokumen kerja untuk memindahkan modul **Slipp HR** dari ekspor Lovable
**`Xperd One Business Suite New 2`** ke aplikasi produksi **`Xperd One Old Production`**
(TanStack Start + MySQL).

> Ringkasan perbandingan antar-ekspor ada di dokumen terpisah di luar repo
> (`../DIFF-BS-NEW-VS-OLD-PRODUCTION.md`, bagian **Batch 2 — Ekspor `New 2`**).
> File ini yang dipakai untuk kerja harian karena ikut ter-commit di git.

Status: **belum dimulai** (menunggu keputusan owner).

---

## 1. Ringkasan pekerjaan

Ekspor `New 2` menambah satu modul penuh, bukan patch kecil:

| Item | Isi | Sumber di New 2 |
|---|---|---|
| Modul | `hr` berubah dari placeholder `disabled: true` → add-on **`slipp_hr`** dengan 7 submodule | `src/lib/modules.ts:246-266` |
| UI | `HrView` (1.336 baris) + `HrDashboard` (232 baris) | `src/components/app/HrViews.tsx`, `HrDashboard.tsx` |
| Logika | PTKP, PPh 21 **TER** kategori A/B/C, BPJS, `computePayslip()`, akun jurnal | `src/lib/hr.ts` (201 baris) |
| Tabel | `hr_employees`, `hr_org_units`, `hr_pay_components`, `hr_payroll_runs`, `hr_payslips` | `.from(...)` di `HrViews.tsx` |
| Billing | `addons.pricing_unit` → harga per **karyawan/bulan** (Rp15.000) | `src/lib/addons.ts:13,72`; `src/routes/app/w.$workspaceId.billing.tsx:328` |
| COA | 5 akun baru: 1250, 2210, 2300, 6200, 6210 | `src/lib/provisioning.server.ts:8-30` |
| Panduan | entri `hr` diganti dari "coming soon" → 5 langkah nyata | `src/lib/guide.ts` |
| Route | `moduleId === "hr"` → `HrDashboard`; submodule → `HrView` | 2 file route index |

Ekspor **tidak** memuat migration HR (jumlah migration sama: 26 vs 26), jadi tabel
harus dibuat sendiri di Old.

## 2. Aturan porting (wajib diikuti)

1. **Supabase → server fn MySQL.** Tidak boleh ada `supabase` di Old. Pakai
   `listWorkspaceRows` / `saveWorkspaceRow` / `upsertWorkspaceRows` /
   `deleteWorkspaceRow` / `replaceChildRows` dari `@/lib/data.functions`, dan
   `await import("@/integrations/mysql/pool")` di server fn baru.
2. **Whitelist kolom.** Setiap kolom baru harus masuk `COLS` (data.functions) atau
   `PCOLS` (platform.functions), plus `CB_ALLOWED`-style allowlist bila tabel
   ditulis lewat server fn khusus. Tanpa ini nilai **dibuang tanpa error**.
3. **Tabel baru → migration** di `db/migrations/` (idempotent, dijalankan
   `npm run migrate`) dan fixture uji di `db/seeds/`.
4. **Gerbang mutu sebelum commit:** `npx tsc --noEmit` = 0, `npm run build` = 0,
   `npm run test:e2e` hijau (suite saat ini 26 passed).
5. **Commit kecil per fase**, pesan bahasa Indonesia menjelaskan akar masalah +
   cara verifikasi. `git add` per file (jangan `git add -A`), lalu `push origin master`.
6. **Jangan** menambah trigger DB (keputusan #11): semua logika di kode.

## 3. Fase kerja

### Fase 0 — Skema & whitelist
- [ ] `db/migrations/008_hr_module.sql`:
  - `hr_org_units`, `hr_pay_components`, `hr_employees`, `hr_payroll_runs`, `hr_payslips`
  - `ALTER TABLE addons ADD COLUMN pricing_unit VARCHAR(20) NULL`
- [ ] Daftarkan tabel di `COLS` (`src/lib/data.functions.ts`) + `hr_*` di allowlist bila perlu
- [ ] Tambahkan `pricing_unit` ke `PCOLS.addons` (`src/lib/platform.functions.ts`)
- [ ] `npm run migrate` di DB dev, cek `SHOW TABLES LIKE 'hr_%'`
- Verifikasi: `tsc` 0 (belum ada kode baru), migration tercatat di `db_apply_log`

#### Draft DDL (sesuaikan tipe dengan `db/migrations/001_schema.sql`)
```sql
CREATE TABLE IF NOT EXISTS hr_org_units (
  id            VARCHAR(36) PRIMARY KEY,
  workspace_id  VARCHAR(36) NOT NULL,
  kind          VARCHAR(20) NOT NULL,          -- 'department' | 'position'
  code          VARCHAR(40) NOT NULL,
  name          VARCHAR(160) NOT NULL,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hr_org (workspace_id, kind, code)
);

CREATE TABLE IF NOT EXISTS hr_pay_components (
  id             VARCHAR(36) PRIMARY KEY,
  workspace_id   VARCHAR(36) NOT NULL,
  code           VARCHAR(40) NOT NULL,
  name           VARCHAR(160) NOT NULL,
  kind           VARCHAR(20) NOT NULL,         -- 'allowance' | 'deduction'
  is_fixed       TINYINT(1) NOT NULL DEFAULT 1,
  taxable        TINYINT(1) NOT NULL DEFAULT 1,
  default_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hr_comp (workspace_id, code)
);

CREATE TABLE IF NOT EXISTS hr_employees (
  id           VARCHAR(36) PRIMARY KEY,
  workspace_id VARCHAR(36) NOT NULL,
  code         VARCHAR(40) NOT NULL,
  name         VARCHAR(160) NOT NULL,
  nik          VARCHAR(40) NULL,
  npwp         VARCHAR(40) NULL,
  email        VARCHAR(160) NULL,
  phone        VARCHAR(40) NULL,
  department   VARCHAR(160) NULL,              -- mengacu nama hr_org_units(kind='department')
  position     VARCHAR(160) NULL,
  join_date    DATE NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'active',
  ptkp_status  VARCHAR(10) NOT NULL DEFAULT 'TK/0',
  base_salary  DECIMAL(18,2) NOT NULL DEFAULT 0,
  bank_name     VARCHAR(120) NULL,
  bank_account  VARCHAR(60) NULL,
  bpjs_kes     TINYINT(1) NOT NULL DEFAULT 0,
  bpjs_tk      TINYINT(1) NOT NULL DEFAULT 0,
  components   JSON NULL,                      -- [{ component_id, amount }]
  notes        TEXT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hr_emp (workspace_id, code)
);

CREATE TABLE IF NOT EXISTS hr_payroll_runs (
  id                 VARCHAR(36) PRIMARY KEY,
  workspace_id       VARCHAR(36) NOT NULL,
  run_no             VARCHAR(40) NOT NULL,     -- PAY/YYYYMM
  period             CHAR(7) NOT NULL,         -- YYYY-MM
  pay_date           DATE NOT NULL,
  bank_account_code  VARCHAR(40) NULL,
  employee_count     INT NOT NULL DEFAULT 0,
  total_gross        DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_pph21        DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_bpjs_company DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_deductions   DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_net          DECIMAL(18,2) NOT NULL DEFAULT 0,
  status             VARCHAR(20) NOT NULL DEFAULT 'draft',   -- draft | approved
  journal_entry_id   VARCHAR(36) NULL,
  approved_at        DATETIME NULL,
  notes              VARCHAR(255) NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hr_run (workspace_id, period)
);

CREATE TABLE IF NOT EXISTS hr_payslips (
  id               VARCHAR(36) PRIMARY KEY,
  run_id           VARCHAR(36) NOT NULL,
  workspace_id     VARCHAR(36) NOT NULL,
  employee_id      VARCHAR(36) NULL,
  employee_code    VARCHAR(40) NOT NULL,
  employee_name    VARCHAR(160) NOT NULL,
  department       VARCHAR(160) NULL,
  position         VARCHAR(160) NULL,
  ptkp_status      VARCHAR(10) NULL,
  npwp             VARCHAR(40) NULL,
  bank_name        VARCHAR(120) NULL,
  bank_account     VARCHAR(60) NULL,
  gross            DECIMAL(18,2) NOT NULL DEFAULT 0,
  taxable_gross    DECIMAL(18,2) NOT NULL DEFAULT 0,
  ter_category     VARCHAR(2) NULL,
  ter_rate         DECIMAL(8,4) NULL,
  pph21            DECIMAL(18,2) NOT NULL DEFAULT 0,
  bpjs_employee    DECIMAL(18,2) NOT NULL DEFAULT 0,
  bpjs_company     DECIMAL(18,2) NOT NULL DEFAULT 0,
  other_deductions DECIMAL(18,2) NOT NULL DEFAULT 0,
  net_pay          DECIMAL(18,2) NOT NULL DEFAULT 0,
  allowances       JSON NULL,
  deductions       JSON NULL,
  bpjs             JSON NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_hr_slips (workspace_id, run_id)
);
```

### Fase 1 — `src/lib/hr.ts` (logika murni, tanpa I/O)
- [ ] Port apa adanya: `PTKP_STATUSES`, `terCategory()`, `terRate()`, `terBrackets()`,
      `PTKP_INFO`, `BPJS`, tipe `Employee`/`PayComponent`/`EmpComponent`/`SlipLine`,
      `computePayslip()`, `HR_ACCOUNTS`, `periodLabel()`
- [ ] **Cek ulang tabel tarif TER** (A/B/C) vs lampiran PMK — angka harus benar
- Verifikasi: `tsc` 0; bandingkan hasil `computePayslip` dengan ekspor untuk 2–3
  contoh karyawan (bisa lewat spec kecil atau konsol)

### Fase 2 — `modules.ts` + gating add-on
- [ ] Ganti blok `hr` placeholder (`src/lib/modules.ts:248-261`) menjadi
      `addon: "slipp_hr"` + 7 submodule: `employees`, `departments`, `positions`,
      `ptkp`, `components`, `payroll`, `tax-bpjs`
- [ ] Pastikan gating add-on yang ada di Old membaca `mod.addon` (submodule HR
      tampil **hanya** bila tenant punya add-on `slipp_hr`)
- Verifikasi: modul HR tidak muncul tanpa add-on; muncul setelah add-on aktif

### Fase 3 — `HrDashboard`
- [ ] Port `HrDashboard.tsx` (232 baris): kartu total karyawan aktif, payroll
      terakhir, komponen aktif, tautan cepat ke submodule
- Verifikasi: halaman `/app/w/<ws>/hr` merender angka dari DB

### Fase 4 — `HrViews` (per submodule, bisa dipecah 3 commit)
- [ ] `employees` — CRUD karyawan (PTKP, gaji pokok, bank, BPJS, komponen, estimasi take-home)
- [ ] `departments` + `positions` — CRUD `hr_org_units` (**rename ikut meng-update
      `hr_employees.department`/`position`** — jangan dilewat)
- [ ] `ptkp` + `components` — master PTKP/TER (read-only dari `hr.ts`) dan komponen gaji
      (tombol "Muat komponen default")
- [ ] `payroll` — buat draft run (periode, tanggal bayar, bank pembayar) → generate
      slip per karyawan aktif → cetak slip → **approve & posting jurnal**
- [ ] `tax-bpjs` — rekap bulanan per karyawan (BPJS + PPh 21)
- Verifikasi: e2e baru (lihat bagian 4)

### Fase 5 — Billing & addons `pricing_unit`
- [ ] `lib/addons.ts`: tambah `pricing_unit` pada tipe + select
- [ ] `routes/app/w.$workspaceId.billing.tsx`: label `employee/mo` → "karyawan/bln"
- Verifikasi: kartu add-on Slipp HR menampilkan Rp15.000/karyawan/bulan

### Fase 6 — COA, panduan, e2e
- [ ] `src/lib/provisioning.server.ts`: tambah 1250, 2210, 2300, 6200, 6210
      (idempotent — cek sebelum insert agar tidak duplikat di workspace lama)
- [ ] `src/lib/guide.ts`: ganti entri `hr` "coming soon" → 5 langkah
- [ ] e2e: dashboard HR, CRUD karyawan, rename master departemen, generate payroll
      1 periode + approve (verifikasi jurnal `acc_journal_*` terbentuk), rekap BPJS/PPh 21

## 4. Titik integrasi akuntansi (jangan sampai salah)

Dari `computePayslip()` + rantai approve di `HrViews.tsx:938-951`:

| Akun | Perlakuan |
|---|---|
| 6200 Beban Gaji & Tunjangan | **debit** `gross` |
| 6210 Beban BPJS Perusahaan | **debit** `bpjs_company` |
| 2300 Hutang BPJS | **kredit** `bpjs_company + bpjs_employee` |
| 2210 Hutang PPh 21 | **kredit** `pph21` |
| 1250 Piutang Karyawan / Potongan | dipakai untuk potongan lain (`other_deductions`) |
| Bank pembayar (`bank_account_code`) | **kredit** `net_pay` |

Di Old, posting memakai pola `postJournalEntry` dari `@/lib/ledger.functions`
(lihat `createCbTransaction` sebagai contoh), lalu simpan `journal_entry_id` +
`approved_at` di `hr_payroll_runs`.

## 5. Risiko & catatan

- **Tarif TER PPh 21** harus persis; salah tarif = slip gaji salah. Verifikasi vs lampiran resmi.
- **Gating add-on**: kalau `slipp_hr` belum aktif, submodule harus tersembunyi
  (jangan sampai muncul lalu error).
- **Harga per karyawan** butuh `employee_count` tenant → pastikan tagihan bulanan
  membaca `hr_employees` yang `status = 'active'`.
- **Rename master** (departemen/jabatan) harus menyapu `hr_employees`, kalau tidak
  data karyawan jadi yatim.
- **Payroll run unik per periode** (`uq_hr_run`): cegah generate dobel periode sama.
- **Project payroll** idempotent: kalau gagal di tengah, hapus run + slip-nya
  (pola yang dipakai ekspor) supaya tidak ada slip separuh.

## 6. Log progres

| Fase | Status | Commit |
|---|---|---|
| 0. Migration 008 + whitelist | ⬜ belum | — |
| 1. `lib/hr.ts` | ⬜ belum | — |
| 2. `modules.ts` + gating add-on | ⬜ belum | — |
| 3. `HrDashboard` | ⬜ belum | — |
| 4. `HrViews` (employees → org units → ptkp/components → payroll → tax-bpjs) | ⬜ belum | — |
| 5. Billing `pricing_unit` | ⬜ belum | — |
| 6. COA + panduan + e2e | ⬜ belum | — |
