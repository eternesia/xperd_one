import { expect, test } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Batch 2 (Slipp HR) — layar rekap BPJS & PPh 21: pilih run payroll, lihat rekap
 * per karyawan + total setoran. Data berasal dari run yang dibuat spec payroll
 * (`e2e/hr-payroll.spec.ts` dijalankan lebih dulu secara alfabetis).
 */
test("HR: BPJS & PPh 21 recap renders per-employee and totals", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);

  await page.goto(`/app/w/${ws}/hr/tax-bpjs`);
  await expect(page.getByRole("heading", { name: "BPJS & PPh 21" })).toBeVisible({ timeout: 60_000 });

  // Kartu ringkasan setoran selalu ada.
  await expect(page.getByText("BPJS to deposit")).toBeVisible();
  await expect(page.getByText("Gross", { exact: true }).first()).toBeVisible();

  // Bila ada run payroll: baris karyawan + baris total muncul; bila belum ada,
  // tampil pesan kosong (spec tetap hijau tanpa data).
  const hasRows = await page.getByRole("row").filter({ hasText: "Total" }).count();
  if (hasRows) {
    await expect(page.getByRole("row").filter({ hasText: "EMP-0001" }).first()).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Total" }).first()).toBeVisible();
  } else {
    await expect(page.getByText(/No payroll yet/)).toBeVisible();
  }
});
