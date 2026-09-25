import { expect, test } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Batch 2 (Slipp HR) — master departemen/jabatan + master PTKP/TER.
 * Spec membuat, mengganti nama, lalu menghapus satu departemen uji supaya
 * data dev tetap bersih (idempotent).
 */
const CODE = "E2E-DEPT";
const NAME = "E2E Dept";
const RENAMED = "E2E Dept (renamed)";

test("HR: department master CRUD and PTKP reference screen", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);

  // --- master departemen -------------------------------------------------
  await page.goto(`/app/w/${ws}/hr/departments`);
  await expect(page.getByRole("heading", { name: "Master Departments" })).toBeVisible({ timeout: 60_000 });

  const dialog = page.getByRole("dialog");
  const row = page.getByRole("row").filter({ hasText: CODE });

  // Bersihkan sisa run sebelumnya bila ada.
  if (await row.count()) {
    page.once("dialog", (d) => void d.accept());
    await row.first().getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("row").filter({ hasText: CODE })).toHaveCount(0, { timeout: 30_000 });
  }

  await page.getByRole("button", { name: /Add Department/ }).click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  // AdminField tidak mengikat <label> ke input, jadi pakai urutan input di dialog.
  await dialog.locator("input").nth(0).fill(CODE);
  await dialog.locator("input").nth(1).fill(NAME);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Saved/).first()).toBeVisible({ timeout: 60_000 });
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("row").filter({ hasText: CODE })).toHaveCount(1, { timeout: 30_000 });

  // --- ganti nama (harus meng-update baris di tabel) ---------------------
  await page.getByRole("row").filter({ hasText: CODE }).first().getByRole("button", { name: "Edit" }).click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.locator("input").nth(1).fill(RENAMED);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("row").filter({ hasText: RENAMED })).toHaveCount(1, { timeout: 30_000 });

  // --- hapus (bersihkan data uji) ----------------------------------------
  page.once("dialog", (d) => void d.accept());
  await page
    .getByRole("row")
    .filter({ hasText: RENAMED })
    .first()
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByRole("row").filter({ hasText: CODE })).toHaveCount(0, { timeout: 30_000 });

  // --- master PTKP/TER ---------------------------------------------------
  await page.goto(`/app/w/${ws}/hr/ptkp`);
  await expect(page.getByRole("heading", { name: "PTKP & TER Master" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("row").filter({ hasText: "TK/0" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "TER B" })).toBeVisible();
});
