import { expect, test } from "@playwright/test";

import { login } from "./helpers";

/**
 * BS-parity #25: tombol "Reset transaction data" di halaman admin Tenancy.
 *
 * Spec ini SENGAJA hanya menguji pengaman destruktifnya (batal / kata konfirmasi
 * salah) — data dev tidak boleh dihapus oleh test. Logika reset ada di kode
 * (`adminResetTenantTransactions`), bukan trigger DB.
 */
test("ADMIN: tenant transaction reset is guarded by a RESET confirmation", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  await page.goto("/app-admin/tenancy");

  const reset = page.getByRole("button", { name: "Reset transaction data" }).first();
  await expect(reset).toBeVisible({ timeout: 60_000 });

  // 1) Dibatalkan -> tidak ada perubahan.
  page.once("dialog", (d) => void d.dismiss());
  await reset.click();
  await expect(page.getByText(/Transaksi dibersihkan/)).toHaveCount(0);

  // 2) Kata konfirmasi salah -> tidak ada perubahan.
  page.once("dialog", (d) => void d.accept("reset-please"));
  await reset.click();
  await expect(page.getByText(/Transaksi dibersihkan/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reset transaction data" }).first()).toBeVisible();
});
