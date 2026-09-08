import { test, expect } from "@playwright/test";
import { login, WS } from "./helpers";

test("BILLING: Add-on modules section lists Qalling CRM as Active", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  await page.goto(`/app/w/${WS}/billing`);
  await expect(page.getByText("Add-on modules", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("body")).toContainText("Qalling CRM", { timeout: 30_000 });
  await expect(page.locator("body")).toContainText("Active", { timeout: 30_000 });
});
