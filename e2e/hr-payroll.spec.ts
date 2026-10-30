import { expect, test } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Slipp HR — payroll end-to-end, disamakan dengan `xperd-one.lovable.app`
 * (Ronde 37, kode acuan BS New 11 `HrViews.tsx`):
 *   - judul "Payroll", tombol "Run payroll", dialog "Run payroll" + "Paid from";
 *   - akun kas/bank pembayar **wajib** ("Choose the paying cash/bank account.");
 *   - periode ganda ditolak dan **tidak menimpa** run yang sudah ada;
 *   - rincian slip: unduh PDF + cetak per slip, "Delete draft" hanya untuk draft;
 *   - "Approve & post journal" → jurnal `JV/PAY/YYYYMM` seimbang, nilai dihitung ulang dari SQL;
 *   - payroll terposting tidak bisa dihapus dari UI ("Posted to GL").
 * Periode uji tetap 2000-01 agar tidak mengganggu payroll nyata; fixture
 * `005_hr_employee_fixture.sql` (EMP-0001, gaji 8.000.000 + TJ-JAB 1.000.000).
 */
function envFromFile(): Record<string, string> {
  try {
    const raw = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}
const env = envFromFile();
const DB_CONFIG = {
  host: process.env.MYSQL_HOST ?? env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? env.MYSQL_PORT ?? 3307),
  user: process.env.MYSQL_USER ?? env.MYSQL_USER ?? "xperd",
  password: process.env.MYSQL_PASSWORD ?? env.MYSQL_PASSWORD ?? "xperd",
  database: process.env.MYSQL_DATABASE ?? env.MYSQL_DATABASE ?? "xperd",
};

const PERIOD = "2000-01";
const RUN_NO = "PAY/200001";
let conn: Connection;
let ws = "";
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];

async function cleanup() {
  if (!ws) return;
  const entries = await q(
    "SELECT id FROM acc_journal_entries WHERE workspace_id = ? AND source_doc_number = ?",
    [ws, RUN_NO],
  );
  for (const e of entries) {
    await conn.execute("DELETE FROM acc_journal_lines WHERE entry_id = ?", [e.id]);
    await conn.execute("DELETE FROM acc_journal_entries WHERE id = ?", [e.id]);
  }
  await conn.execute("DELETE FROM hr_payroll_runs WHERE workspace_id = ? AND run_no = ?", [
    ws,
    RUN_NO,
  ]);
}

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
});
test.afterAll(async () => {
  if (conn) {
    await cleanup();
    await conn.end();
  }
});

test("HR: payroll — sama dengan live (bank wajib, periode ganda, draft→posting jurnal)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  await cleanup();

  await page.goto(`/app/w/${ws}/hr/payroll`);
  await expect(page.getByRole("heading", { name: "Payroll", exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByText(
      "Generate monthly payroll, review payslips, then post the journal automatically.",
    ),
  ).toBeVisible();

  const dialog = page.getByRole("dialog");
  const openNew = async () => {
    await page.getByRole("button", { name: "Run payroll" }).click();
    await expect(dialog.getByText("Paid from")).toBeVisible({ timeout: 30_000 });
    await dialog.locator('input[type="month"]').fill(PERIOD);
    // tanggal bayar di periode uji: periode berjalan di DB dev bisa sedang terkunci (hard lock)
    await dialog.locator('input[type="date"]').fill("2000-01-31");
  };

  /* ---------- akun kas/bank pembayar wajib ---------- */
  await openNew();
  await dialog.getByRole("button", { name: "Generate" }).click();
  await expect(page.getByText("Choose the paying cash/bank account.").first()).toBeVisible({
    timeout: 30_000,
  });
  expect(
    await q("SELECT 1 FROM hr_payroll_runs WHERE workspace_id = ? AND run_no = ?", [ws, RUN_NO]),
  ).toHaveLength(0);

  /* ---------- buat draft ---------- */
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option").first().click();
  await dialog.getByRole("button", { name: "Generate" }).click();
  await expect(page.getByText("Payroll draft created").first()).toBeVisible({ timeout: 60_000 });

  // rincian run: slip karyawan fixture, bruto = 8.000.000 + 1.000.000
  const slipRow = page.getByRole("row").filter({ hasText: "Budi Santoso (fixture)" });
  await expect(slipRow).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByText(RUN_NO).first()).toBeVisible();
  const [slip] = await q(
    "SELECT s.gross, s.base_salary, s.net_pay, s.bpjs_company FROM hr_payslips s JOIN hr_payroll_runs r ON r.id = s.run_id WHERE r.workspace_id = ? AND r.run_no = ? AND s.employee_code = 'EMP-0001'",
    [ws, RUN_NO],
  );
  expect(Number(slip.gross)).toBe(9_000_000);
  // kolom rincian live: Pokok | Tunjangan | BPJS | PPh 21 | Potongan | Bersih (angka dari SQL)
  const idr = (n: unknown) => Math.round(Number(n)).toLocaleString("id-ID");
  await expect(slipRow.first()).toContainText(idr(slip.base_salary));
  await expect(slipRow.first()).toContainText(idr(Number(slip.gross) - Number(slip.base_salary)));
  await expect(slipRow.first()).toContainText(idr(slip.net_pay));
  await expect(dialog.getByRole("button", { name: "Delete draft" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Print all payslips" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Download all \(PDF\)/ })).toBeVisible();

  /* ---------- periode ganda ditolak dan tidak menimpa run ---------- */
  const [before] = await q(
    "SELECT id, total_gross FROM hr_payroll_runs WHERE workspace_id = ? AND run_no = ?",
    [ws, RUN_NO],
  );
  await page.keyboard.press("Escape");
  await openNew();
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option").first().click();
  await dialog.getByRole("button", { name: "Generate" }).click();
  await expect(page.getByText("Payroll for this period already exists.").first()).toBeVisible({
    timeout: 30_000,
  });
  const after = await q(
    "SELECT id, total_gross FROM hr_payroll_runs WHERE workspace_id = ? AND run_no = ?",
    [ws, RUN_NO],
  );
  expect(after).toHaveLength(1);
  expect(after[0].id).toBe(before.id);
  expect(Number(after[0].total_gross)).toBe(Number(before.total_gross));
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);

  /* ---------- daftar: hanya tombol Open; draft bisa dihapus dari rincian ---------- */
  const listRow = page.getByRole("row").filter({ hasText: RUN_NO });
  await expect(listRow.getByRole("button")).toHaveCount(1);
  await expect(listRow).toContainText("Draft");
  await listRow.getByRole("button", { name: "Open" }).click();
  page.once("dialog", (d) => void d.accept());
  await dialog.getByRole("button", { name: "Delete draft" }).click();
  await expect
    .poll(
      async () =>
        (
          await q("SELECT 1 FROM hr_payroll_runs WHERE workspace_id = ? AND run_no = ?", [
            ws,
            RUN_NO,
          ])
        ).length,
      { timeout: 30_000 },
    )
    .toBe(0);

  /* ---------- buat ulang → setujui & posting jurnal ---------- */
  await openNew();
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option").first().click();
  await dialog.getByRole("button", { name: "Generate" }).click();
  await expect(page.getByText("Payroll draft created").first()).toBeVisible({ timeout: 60_000 });
  await dialog.getByRole("button", { name: "Approve & post journal" }).click();
  await expect(page.getByText("Payroll posted to the general ledger").first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(dialog.getByText("Posted to GL")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Delete draft" })).toHaveCount(0);

  // jurnal: nomor JV/<run>, seimbang, angka dihitung ulang dari slip (bukan dari kode aplikasi)
  const [agg] = await q(
    "SELECT SUM(s.gross) AS gross, SUM(s.bpjs_company) AS bpjs_co, SUM(s.bpjs_employee) AS bpjs_emp, SUM(s.pph21) AS pph, SUM(s.other_deductions) AS other, SUM(s.net_pay) AS net FROM hr_payslips s JOIN hr_payroll_runs r ON r.id = s.run_id WHERE r.workspace_id = ? AND r.run_no = ?",
    [ws, RUN_NO],
  );
  const [entry] = await q(
    "SELECT id, entry_no, total_debit, total_credit, source_type FROM acc_journal_entries WHERE workspace_id = ? AND source_doc_number = ?",
    [ws, RUN_NO],
  );
  expect(entry.entry_no).toBe(`JV/${RUN_NO}`);
  expect(entry.source_type).toBe("payroll");
  expect(Number(entry.total_debit)).toBeCloseTo(Number(entry.total_credit), 2);
  expect(Number(entry.total_debit)).toBeCloseTo(Number(agg.gross) + Number(agg.bpjs_co), 2);
  const lines = await q(
    "SELECT account_code, debit, credit FROM acc_journal_lines WHERE entry_id = ?",
    [entry.id],
  );
  const credit = lines.reduce((a, l) => a + Number(l.credit), 0);
  const bankCredit = Math.max(...lines.map((l) => Number(l.credit)));
  expect(credit).toBeCloseTo(Number(agg.gross) + Number(agg.bpjs_co), 2);
  expect(bankCredit).toBeCloseTo(Number(agg.net), 2);
  const [run] = await q(
    "SELECT status, journal_entry_id FROM hr_payroll_runs WHERE workspace_id = ? AND run_no = ?",
    [ws, RUN_NO],
  );
  expect(run.status).toBe("approved");
  expect(run.journal_entry_id).toBe(entry.id);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("row").filter({ hasText: RUN_NO }).first()).toContainText("Posted");
  // baris terposting tidak punya aksi hapus
  await expect(
    page.getByRole("row").filter({ hasText: RUN_NO }).first().getByRole("button"),
  ).toHaveCount(1);

  /* ---------- rekap BPJS & PPh 21 memakai run ini; angka = SQL ---------- */
  await page.goto(`/app/w/${ws}/hr/tax-bpjs`);
  await expect(page.getByRole("heading", { name: "BPJS & PPh 21 Recap" })).toBeVisible({
    timeout: 60_000,
  });
  await page.locator("select").first().selectOption({ label: "January 2000" });
  const [rec] = await q(
    "SELECT s.taxable_gross, s.pph21, s.bpjs_employee, s.bpjs_company, JSON_EXTRACT(s.bpjs, '$.kes_company') AS kes_co, JSON_EXTRACT(s.bpjs, '$.kes_employee') AS kes_emp FROM hr_payslips s JOIN hr_payroll_runs r ON r.id = s.run_id WHERE r.workspace_id = ? AND r.run_no = ? AND s.employee_code = 'EMP-0001'",
    [ws, RUN_NO],
  );
  const recRow = page.getByRole("row").filter({ hasText: "Budi Santoso (fixture)" });
  for (const v of [rec.taxable_gross, rec.pph21, rec.bpjs_employee, rec.bpjs_company]) {
    await expect(recRow).toContainText(idr(v));
  }
  const kes = page
    .locator("p", { hasText: /^BPJS Kesehatan$/ })
    .locator("xpath=following-sibling::p");
  await expect(kes).toHaveText(`Rp ${idr(Number(rec.kes_co ?? 0) + Number(rec.kes_emp ?? 0))}`);
});
