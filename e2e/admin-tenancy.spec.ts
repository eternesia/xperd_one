import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Tenancy table must show the tenant's package (regression: the MySQL query
// returned a flat `package_name` while the UI reads `packages.name`, so the
// Package column always rendered "—").
test("ADMIN: tenancy table shows the tenant package name", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  await page.goto("/app-admin/tenancy");

  const table = page.locator("table").first();
  await expect(table).toBeVisible({ timeout: 60_000 });
  await expect(table).toContainText("Package");

  // No tenants in this environment → nothing to assert beyond the header.
  if (await page.getByText("No tenants found.").isVisible()) {
    test.skip(true, "no tenants seeded");
    return;
  }

  // Each tenant row must render a real package name, never the "—" fallback.
  await expect(table).toContainText(/XPERD (One|Business|Enterprise)/, { timeout: 30_000 });
});
