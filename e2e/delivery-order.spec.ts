import { expect, test } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * BS-parity #3: a Delivery Order lists goods only — prices, discounts, tax and
 * totals are hidden in the list, the create dialog, the detail page and the
 * printed/PDF document. Sales Orders keep showing amounts (control case).
 */
test("DO: delivery orders hide amounts while sales orders keep them", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);

  // --- delivery order: no Total column -----------------------------------
  await page.goto(`/app/w/${ws}/sales/delivery-orders`);
  await expect(page.getByRole("button", { name: "New" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("columnheader", { name: "Total" })).toHaveCount(0);

  // --- and no price/disc/tax/totals in the create dialog -----------------
  await page.getByRole("button", { name: "New" }).click();
  const doDialog = page.getByRole("dialog");
  await expect(doDialog).toBeVisible({ timeout: 30_000 });
  await expect(doDialog.getByText("Price", { exact: true })).toHaveCount(0);
  await expect(doDialog.getByText("Disc.", { exact: true })).toHaveCount(0);
  await expect(doDialog.getByText("Tax %", { exact: true })).toHaveCount(0);
  await expect(doDialog.getByText("Subtotal", { exact: false })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(doDialog).toBeHidden({ timeout: 15_000 });

  // --- sales order: same columns are present (control) -------------------
  await page.goto(`/app/w/${ws}/sales/sales-orders`);
  await expect(page.getByRole("button", { name: "New" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("columnheader", { name: "Total" })).toHaveCount(1);

  await page.getByRole("button", { name: "New" }).click();
  const soDialog = page.getByRole("dialog");
  await expect(soDialog).toBeVisible({ timeout: 30_000 });
  await expect(soDialog.getByText("Price", { exact: true })).toHaveCount(1);
  await expect(soDialog.getByText("Tax %", { exact: true })).toHaveCount(1);
  await expect(soDialog.getByText("Subtotal", { exact: false })).toHaveCount(1);
});
