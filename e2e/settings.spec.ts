import { test, expect } from "@playwright/test";
import { login, resolveWorkspaceId } from "./helpers";

test("SETTINGS: choose Modern doc template and save", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);
  await page.goto(`/app/w/${ws}/settings`);

  // The template is now chosen from live preview cards (BS parity), so the
  // old select trigger no longer exists. Saving Modern is idempotent.
  const card = page.getByRole("button", { name: /Modern Accent/ }).first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.click();
  await page.getByRole("button", { name: /Save changes/ }).click();

  await expect(page.locator("body")).toContainText("Settings saved", { timeout: 30_000 });

  // Each template card renders a live document preview (iframe srcDoc).
  await expect(
    page.frameLocator('iframe[title="Modern Accent"]').locator("body"),
  ).toContainText("INV/2026/0001", { timeout: 30_000 });

  // Reference artifact: layout should mirror the Business Suite settings page
  // (company profile with phone/email + document & invoice template previews).
  await page.screenshot({ path: "test-results/workspace-settings.png", fullPage: true });
});
