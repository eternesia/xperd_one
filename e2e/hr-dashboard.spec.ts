import { expect, test } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Batch 2 (Slipp HR) — dasbor payroll. Modul ini add-on, jadi spec membutuhkan
 * add-on `slipp_hr` aktif untuk tenant demo (seed `003_hr_addon_activation.sql`)
 * dan workspace HR yang bisa diakses.
 */
test("HR: payroll dashboard renders KPIs and HR submodules", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);

  await page.goto(`/app/w/${ws}/hr`);
  await expect(page.getByText("SLIPP HR", { exact: false }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: /Payroll Dashboard|Dasbor Payroll/ })).toBeVisible({ timeout: 60_000 });

  // KPI utama ikut tampil (tanpa data pun kartunya harus ada).
  await expect(page.getByText(/Active employees|Karyawan aktif/).first()).toBeVisible();
  await expect(page.getByText(/Departments|Departemen/).first()).toBeVisible();
  await expect(page.getByText(/Base salary \/ month|Gaji pokok \/ bulan/).first()).toBeVisible();

  // Tautan ke submodule payroll bekerja.
  await page.getByRole("link", { name: /Process payroll|Proses payroll/ }).click();
  await expect(page).toHaveURL(/\/hr\/payroll$/, { timeout: 30_000 });
});
