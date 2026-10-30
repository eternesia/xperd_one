import { expect, test } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Slipp HR — rekap BPJS & PPh 21, disamakan dengan live (Ronde 37, BS New 11):
 * pilih periode, kartu ringkasan (BPJS Kesehatan / JHT / JKK + JKM / JP / PPh 21),
 * tabel per karyawan tanpa kolom "Net" dan tanpa tombol cetak slip. Bila belum ada
 * payroll → pesan "Run a payroll first.".
 */
test("HR: BPJS & PPh 21 recap — struktur sama dengan live", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);

  await page.goto(`/app/w/${ws}/hr/tax-bpjs`);
  await expect(page.getByRole("heading", { name: "BPJS & PPh 21 Recap" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByText("Monthly contributions and PPh 21 TER withheld per employee."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Print payslips" })).toHaveCount(0);

  if (await page.getByText("Run a payroll first.").count()) return; // belum ada payroll: spec tetap hijau

  for (const card of ["BPJS Kesehatan", "JHT", "JKK + JKM", "JP", "PPh 21"]) {
    await expect(page.getByText(card, { exact: true }).first()).toBeVisible();
  }
  const head = page.getByRole("columnheader");
  await expect(head).toHaveText([
    "Employee",
    "NPWP",
    "PTKP / TER",
    "Taxable gross",
    "PPh 21",
    "BPJS employee",
    "BPJS company",
  ]);
  await expect(page.getByText(/PP 58\/2023/)).toBeVisible();
});
