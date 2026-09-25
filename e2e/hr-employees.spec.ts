import { expect, test } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Batch 2 (Slipp HR) — data karyawan: tambah (dengan estimasi take-home),
 * ubah, lalu hapus supaya data dev tetap bersih.
 */
const CODE = "E2E-EMP";
const NAME = "E2E Karyawan";

test("HR: employee CRUD with take-home estimate", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);

  await page.goto(`/app/w/${ws}/hr/employees`);
  await expect(page.getByRole("heading", { name: "Employees" })).toBeVisible({ timeout: 60_000 });

  const dialog = page.getByRole("dialog");
  const row = page.getByRole("row").filter({ hasText: CODE });

  // Bersihkan sisa run sebelumnya (kalau ada).
  if (await row.count()) {
    page.once("dialog", (d) => void d.accept());
    await row.first().getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("row").filter({ hasText: CODE })).toHaveCount(0, { timeout: 30_000 });
  }

  // --- tambah karyawan ---------------------------------------------------
  await page.getByRole("button", { name: /New employee/ }).click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.locator("input").nth(0).fill(CODE); // Code
  await dialog.locator("input").nth(1).fill(NAME); // Full name
  await dialog.locator('input[type="number"]').first().fill("8000000"); // Base salary

  // Panel estimasi bulanan ikut tampil (pakai computePayslip dari lib/hr).
  await expect(dialog.getByText("MONTHLY ESTIMATE")).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText("Take-home pay")).toBeVisible();
  await expect(dialog.getByText(/TER [ABC]/).first()).toBeVisible();

  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Employee saved/).first()).toBeVisible({ timeout: 60_000 });
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const created = page.getByRole("row").filter({ hasText: CODE });
  await expect(created).toHaveCount(1, { timeout: 30_000 });
  await expect(created.first()).toContainText("8.000.000");

  // --- ubah nama ---------------------------------------------------------
  await created.first().getByRole("button", { name: "Edit" }).click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.locator("input").nth(1).fill(`${NAME} 2`);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("row").filter({ hasText: `${NAME} 2` })).toHaveCount(1, { timeout: 30_000 });

  // --- hapus (bersihkan data uji) ---------------------------------------
  page.once("dialog", (d) => void d.accept());
  await page
    .getByRole("row")
    .filter({ hasText: CODE })
    .first()
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByRole("row").filter({ hasText: CODE })).toHaveCount(0, { timeout: 30_000 });
});
