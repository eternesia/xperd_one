import { test, expect } from "@playwright/test";
import { login, resolveWorkspaceId } from "./helpers";

test("BILLING: Add-on modules section lists the catalog with a status badge", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);
  await page.goto(`/app/w/${ws}/billing`);
  // BS New 11: katalog add-on ada di tab "Add-ons" pada halaman Billing.
  await page.getByRole("tab", { name: "Add-ons" }).click();
  await expect(page.getByText("Add-on modules", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("body")).toContainText("Qalling CRM", { timeout: 30_000 });
  // Active depends on whether the tenant was assigned the add-on.
  await expect(page.locator("body")).toContainText(/Active|Not active/, { timeout: 30_000 });
});
