/**
 * Slipp HR — payroll engine (Indonesia).
 * BPJS rates & caps and PPh 21 TER (PP 58/2023) monthly tables.
 * December annual true-up (Pasal 17) is not applied automatically.
 *
 * Porting Batch 2: disalin apa adanya dari ekspor `Xperd One Business Suite New 2`
 * (`src/lib/hr.ts`). Modul ini murni perhitungan — tidak ada I/O maupun Supabase —
 * sehingga bisa dipakai langsung di Old. Lihat SLIPP-HR-PORTING.md.
 */

export const PTKP_STATUSES = ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"] as const;

export type TerCategory = "A" | "B" | "C";

export function terCategory(ptkp: string): TerCategory {
  if (["TK/0", "TK/1", "K/0"].includes(ptkp)) return "A";
  if (["TK/2", "TK/3", "K/1", "K/2"].includes(ptkp)) return "B";
  return "C";
}

// [upper bound in million IDR (inclusive), rate %]
const TER: Record<TerCategory, [number, number][]> = {
  A: [
    [5.4, 0], [5.65, 0.25], [5.95, 0.5], [6.3, 0.75], [6.75, 1], [7.5, 1.25], [8.55, 1.5], [9.65, 1.75],
    [10.05, 2], [10.35, 2.25], [10.7, 2.5], [11.05, 3], [11.6, 3.5], [12.5, 4], [13.75, 5], [15.1, 6],
    [16.95, 7], [19.75, 8], [24.15, 9], [26.45, 10], [28, 11], [30.05, 12], [32.4, 13], [35.4, 14],
    [39.1, 15], [43.85, 16], [47.8, 17], [51.4, 18], [56.3, 19], [62.2, 20], [68.6, 21], [77.5, 22],
    [89, 23], [103, 24], [125, 25], [157, 26], [206, 27], [337, 28], [454, 29], [550, 30], [695, 31],
    [910, 32], [1400, 33], [Infinity, 34],
  ],
  B: [
    [6.2, 0], [6.5, 0.25], [6.85, 0.5], [7.3, 0.75], [9.2, 1], [10.75, 1.5], [11.25, 2], [11.6, 2.5],
    [12.6, 3], [13.6, 4], [14.95, 5], [16.4, 6], [18.45, 7], [21.85, 8], [26, 9], [27.7, 10], [29.35, 11],
    [31.45, 12], [33.95, 13], [37.1, 14], [41.1, 15], [45.8, 16], [49.5, 17], [53.8, 18], [58.5, 19],
    [64, 20], [71, 21], [80, 22], [93, 23], [109, 24], [129, 25], [163, 26], [211, 27], [374, 28],
    [459, 29], [555, 30], [704, 31], [957, 32], [1405, 33], [Infinity, 34],
  ],
  C: [
    [6.6, 0], [6.95, 0.25], [7.35, 0.5], [7.8, 0.75], [8.85, 1], [9.8, 1.25], [10.95, 1.5], [11.2, 1.75],
    [12.05, 2], [12.95, 3], [14.15, 4], [15.55, 5], [17.05, 6], [19.5, 7], [22.7, 8], [26.6, 9], [28.1, 10],
    [30.1, 11], [32.6, 12], [35.4, 13], [38.9, 14], [43, 15], [47.4, 16], [51.2, 17], [55.8, 18], [60.4, 19],
    [66.7, 20], [74.5, 21], [83.2, 22], [95.6, 23], [110, 24], [134, 25], [169, 26], [221, 27], [390, 28],
    [463, 29], [561, 30], [709, 31], [965, 32], [1419, 33], [Infinity, 34],
  ],
};

export function terRate(category: TerCategory, monthlyGross: number) {
  const m = monthlyGross / 1_000_000;
  for (const [upper, rate] of TER[category]) if (m <= upper) return rate;
  return 34;
}

/** TER brackets as [from, to, rate%] in IDR (to = Infinity for the last). */
export function terBrackets(category: TerCategory): { from: number; to: number; rate: number }[] {
  let prev = 0;
  return TER[category].map(([upper, rate]) => {
    const row = { from: prev === 0 ? 0 : prev * 1_000_000 + 1, to: upper * 1_000_000, rate };
    prev = upper;
    return row;
  });
}

/** PTKP master (UU HPP / PMK 101/2016): TK/0 Rp54 jt, +Rp4,5 jt kawin, +Rp4,5 jt per tanggungan (maks 3). */
export const PTKP_INFO: Record<string, { annual: number; en: string; id: string }> = {
  "TK/0": { annual: 54_000_000, en: "Single, no dependents", id: "Tidak kawin, tanpa tanggungan" },
  "TK/1": { annual: 58_500_000, en: "Single, 1 dependent", id: "Tidak kawin, 1 tanggungan" },
  "TK/2": { annual: 63_000_000, en: "Single, 2 dependents", id: "Tidak kawin, 2 tanggungan" },
  "TK/3": { annual: 67_500_000, en: "Single, 3 dependents", id: "Tidak kawin, 3 tanggungan" },
  "K/0": { annual: 58_500_000, en: "Married, no dependents", id: "Kawin, tanpa tanggungan" },
  "K/1": { annual: 63_000_000, en: "Married, 1 dependent", id: "Kawin, 1 tanggungan" },
  "K/2": { annual: 67_500_000, en: "Married, 2 dependents", id: "Kawin, 2 tanggungan" },
  "K/3": { annual: 72_000_000, en: "Married, 3 dependents", id: "Kawin, 3 tanggungan" },
};

export const BPJS = {
  kesCap: 12_000_000,
  jpCap: 10_547_400,
  kesCompany: 4,
  kesEmployee: 1,
  jhtCompany: 3.7,
  jhtEmployee: 2,
  jkkCompany: 0.24,
  jkmCompany: 0.3,
  jpCompany: 2,
  jpEmployee: 1,
};

export interface EmpComponent {
  component_id: string;
  amount: number;
}

export interface PayComponent {
  id: string;
  code: string;
  name: string;
  kind: "allowance" | "deduction";
  is_fixed: boolean;
  taxable: boolean;
  default_amount: number;
  is_active: boolean;
}

export interface Employee {
  id: string;
  code: string;
  name: string;
  nik: string | null;
  npwp: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  position: string | null;
  join_date: string | null;
  status: string;
  ptkp_status: string;
  base_salary: number;
  bank_name: string | null;
  bank_account: string | null;
  bpjs_kes: boolean;
  bpjs_tk: boolean;
  components: EmpComponent[];
  notes: string | null;
}

export interface SlipLine {
  code: string;
  name: string;
  amount: number;
  taxable?: boolean;
}

const r = (n: number) => Math.round(n);

export function computePayslip(emp: Employee, components: PayComponent[]) {
  const byId = new Map(components.map((c) => [c.id, c]));
  const allowances: SlipLine[] = [];
  const deductions: SlipLine[] = [];
  for (const ec of emp.components ?? []) {
    const c = byId.get(ec.component_id);
    if (!c || !c.is_active || !Number(ec.amount)) continue;
    const line = { code: c.code, name: c.name, amount: Number(ec.amount), taxable: c.taxable };
    (c.kind === "allowance" ? allowances : deductions).push(line);
  }
  const base = Number(emp.base_salary) || 0;
  const allowanceTotal = allowances.reduce((s, a) => s + a.amount, 0);
  const gross = base + allowanceTotal;
  const fixedWage = base + allowances.filter((a) => a.taxable).reduce((s, a) => s + a.amount, 0);

  const kesBase = Math.min(fixedWage, BPJS.kesCap);
  const jpBase = Math.min(fixedWage, BPJS.jpCap);
  const bpjs = {
    kes_company: emp.bpjs_kes ? r((kesBase * BPJS.kesCompany) / 100) : 0,
    kes_employee: emp.bpjs_kes ? r((kesBase * BPJS.kesEmployee) / 100) : 0,
    jht_company: emp.bpjs_tk ? r((fixedWage * BPJS.jhtCompany) / 100) : 0,
    jht_employee: emp.bpjs_tk ? r((fixedWage * BPJS.jhtEmployee) / 100) : 0,
    jkk_company: emp.bpjs_tk ? r((fixedWage * BPJS.jkkCompany) / 100) : 0,
    jkm_company: emp.bpjs_tk ? r((fixedWage * BPJS.jkmCompany) / 100) : 0,
    jp_company: emp.bpjs_tk ? r((jpBase * BPJS.jpCompany) / 100) : 0,
    jp_employee: emp.bpjs_tk ? r((jpBase * BPJS.jpEmployee) / 100) : 0,
  };
  const bpjsEmployee = bpjs.kes_employee + bpjs.jht_employee + bpjs.jp_employee;
  const bpjsCompany = bpjs.kes_company + bpjs.jht_company + bpjs.jkk_company + bpjs.jkm_company + bpjs.jp_company;

  // TER gross: taxable cash + employer-paid JKK, JKM and BPJS Kesehatan (benefits in kind).
  const taxableCash = base + allowances.filter((a) => a.taxable).reduce((s, a) => s + a.amount, 0);
  const taxableGross = taxableCash + bpjs.jkk_company + bpjs.jkm_company + bpjs.kes_company;
  const category = terCategory(emp.ptkp_status);
  const rate = terRate(category, taxableGross);
  const pph21 = r((taxableGross * rate) / 100);

  const otherDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const net = gross - bpjsEmployee - pph21 - otherDeductions;

  return {
    base_salary: base,
    allowances,
    deductions,
    bpjs,
    gross,
    taxable_gross: taxableGross,
    ter_category: category,
    ter_rate: rate,
    pph21,
    bpjs_employee: bpjsEmployee,
    bpjs_company: bpjsCompany,
    other_deductions: otherDeductions,
    net_pay: net,
  };
}

export type ComputedSlip = ReturnType<typeof computePayslip>;

export const HR_ACCOUNTS = {
  salaryExpense: { account_code: "6200", account_name: "Beban Gaji & Tunjangan" },
  bpjsExpense: { account_code: "6210", account_name: "Beban BPJS Perusahaan" },
  pph21Payable: { account_code: "2210", account_name: "Hutang PPh 21" },
  bpjsPayable: { account_code: "2300", account_name: "Hutang BPJS" },
  employeeReceivable: { account_code: "1250", account_name: "Piutang Karyawan / Potongan" },
};

export const periodLabel = (period: string, lang: string) => {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(lang === "id" ? "id-ID" : "en-US", { month: "long", year: "numeric" });
};
