import { expect, test } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Batch 2 (Slipp HR) — payroll end-to-end: buat draft dari karyawan aktif,
 * setujui (posting jurnal), lalu hapus run uji supaya periode tidak bentrok
 * saat spec dijalankan ulang.
 *
 * Memakai periode uji tetap 2000-01 agar tidak mengganggu payroll nyata.
 * Bergantung pada fixture `005_hr_employee_fixture.sql` (EMP-0001, gaji 8.000.000
 * + TJ-JAB 1.000.000) dan `004_hr_pay_components.sql`.
 */
const PERIOD = "2000-01";

test("HR: payroll run generates payslips and posts the journal", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);

  await page.goto(`/app/w/${ws}/hr/payroll`);
  await expect(page.getByRole("heading", { name: "Payroll & Payslips" })).toBeVisible({ timeout: 60_000 });

  const dialog = page.getByRole("dialog");

  // Bersihkan run uji sebelumnya (kalau ada) supaya periode tidak duplikat.
  const staleRun = page.getByRole("row").filter({ hasText: "PAY/200001" });
  if (await staleRun.count()) {
    page.once("dialog", (d) => void d.accept());
    await staleRun.first().getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("row").filter({ hasText: "PAY/200001" })).toHaveCount(0, { timeout: 30_000 });
  }

  // --- buat draft payroll -------------------------------------------------
  await page.getByRole("button", { name: /Run payroll|Process payroll|Jalankan payroll|Proses payroll/ }).click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.locator('input[type="month"]').fill(PERIOD);
  await dialog.getByRole("button", { name: "Generate" }).click();
  await expect(page.getByText(/Payroll draft created/).first()).toBeVisible({ timeout: 60_000 });

  // Dialog rincian terbuka dengan slip karyawan fixture.
  await expect(page.getByText("PAY/200001").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("row").filter({ hasText: "Budi Santoso (fixture)" })).toHaveCount(1, { timeout: 30_000 });
  // Bruto = gaji pokok 8.000.000 + tunjangan jabatan 1.000.000.
  await expect(page.getByRole("row").filter({ hasText: "Budi Santoso (fixture)" }).first()).toContainText("9.000.000");
  await expect(page.getByText("Draft").first()).toBeVisible();

  // --- setujui & posting jurnal -----------------------------------------
  await page.getByRole("button", { name: /Approve & post journal/ }).click();
  await expect(page.getByText(/Payroll approved and posted to journal/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Posted to journal/).first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Close" }).first().click();
  await expect(page.getByRole("row").filter({ hasText: "PAY/200001" }).first()).toContainText("Posted");
});
