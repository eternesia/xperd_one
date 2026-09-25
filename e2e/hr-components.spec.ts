import { expect, test } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Batch 2 (Slipp HR) — komponen gaji. Komponen default dipasang lewat seed
 * (`004_hr_pay_components.sql`); spec menambah satu komponen uji lalu
 * menghapusnya kembali supaya data dev tetap bersih.
 */
const CODE = "E2E-COMP";

test("HR: salary components list, create and delete", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);

  await page.goto(`/app/w/${ws}/hr/components`);
  await expect(page.getByRole("heading", { name: "Salary Components" })).toBeVisible({ timeout: 60_000 });

  // Komponen default dari seed harus tampil.
  await expect(page.getByRole("row").filter({ hasText: "TJ-JAB" })).toHaveCount(1, { timeout: 30_000 });

  const dialog = page.getByRole("dialog");
  const testRow = page.getByRole("row").filter({ hasText: CODE });

  // Bersihkan sisa run sebelumnya.
  if (await testRow.count()) {
    page.once("dialog", (d) => void d.accept());
    await testRow.first().getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("row").filter({ hasText: CODE })).toHaveCount(0, { timeout: 30_000 });
  }

  await page.getByRole("button", { name: /New component/ }).click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.locator("input").nth(0).fill(CODE); // Code
  await dialog.locator("input").nth(1).fill("E2E Tunjangan"); // Name
  await dialog.locator('input[type="number"]').fill("123000"); // Default amount
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Saved/).first()).toBeVisible({ timeout: 60_000 });
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const created = page.getByRole("row").filter({ hasText: CODE });
  await expect(created).toHaveCount(1, { timeout: 30_000 });
  await expect(created.first()).toContainText("123.000");

  // Hapus kembali (bersihkan data uji).
  page.once("dialog", (d) => void d.accept());
  await created.first().getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("row").filter({ hasText: CODE })).toHaveCount(0, { timeout: 30_000 });
});
