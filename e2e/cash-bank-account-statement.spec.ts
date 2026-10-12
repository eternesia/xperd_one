import { expect, test } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Ronde 35 (parity BS New 10) — daftar **Akun Kas & Bank** harus punya aksi
 * baris ikon **mata** yang membuka popup *buku mutasi* akun (mutasi + akun lawan
 * + saldo berjalan). Sebelumnya Old hanya punya ikon pensil & hapus, jadi
 * “show popup”-nya tidak ada.
 *
 * Spec ini memakai akun yang sudah ada di workspace demo (tanpa fixture tulis).
 */
test("CASH-BANK: ikon mata di daftar akun membuka buku mutasi", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);

  await page.goto(`/app/w/${ws}/cash-bank/accounts`);
  await expect(page.getByRole("heading", { name: /Cash & Bank Accounts|Akun Kas & Bank/ })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("columnheader", { name: "Balance", exact: true })).toBeVisible({ timeout: 30_000 });

  // ikon mata = tombol ber-aria "Account statement" / "Buku mutasi"
  const eye = page.getByRole("button", { name: /Account statement|Buku mutasi/ }).first();
  await expect(eye).toBeVisible({ timeout: 30_000 });
  await eye.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText(/Account statement|Buku mutasi/).first()).toBeVisible();

  // kolom buku mutasi seperti referensi
  for (const col of ["Date", "Number", "Description", "Contra account", "In", "Out", "Balance"]) {
    await expect(dialog.getByRole("columnheader", { name: col, exact: true })).toBeVisible({ timeout: 20_000 });
  }
  for (const kpi of ["Money in", "Money out", "Closing balance"]) {
    await expect(dialog.getByText(kpi, { exact: true })).toBeVisible();
  }

  // Tombol "Close" ada dua: di footer dan tombol X (Radix) → pilih yang footer.
  await dialog.getByRole("button", { name: /^(Close|Tutup)$/ }).first().click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
});
