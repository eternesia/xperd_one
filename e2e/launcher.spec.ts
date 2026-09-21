import { test, expect } from "@playwright/test";
import { login, openLauncher } from "./helpers";

test("LAUNCHER: all enabled modules visible; disabled show Soon", async ({ page }) => {
  await login(page);
  await openLauncher(page);

  // Text-based (add-on gated tiles render as locked non-link tiles).
  for (const label of ["Master Data", "Procurement", "Inventory", "Sales & POS", "Cash & Bank", "Accounting", "Fixed Assets", "Tax", "Reporting & BI", "CRM"]) {
    await expect(page.getByText(new RegExp(label)).first()).toBeVisible({ timeout: 45_000 });
  }
  // Disabled modules (Manufacturing, HR) render as non-link "Soon" tiles.
  await expect(page.getByText("Soon").first()).toBeVisible({ timeout: 30_000 });
});
