import { test, expect } from "@playwright/test";
import { login, WS } from "./helpers";

test("SETTINGS: choose Modern doc template and save", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  await page.goto(`/app/w/${WS}/settings`);

  const trigger = page.locator('button:has-text("Classic Corporate")').first();
  await expect(trigger).toBeVisible({ timeout: 60_000 });
  await trigger.click();
  await page.getByRole("option", { name: "Modern Accent" }).click();
  await page.getByRole("button", { name: /Save changes/ }).click();

  await expect(page.locator("body")).toContainText("Settings saved", { timeout: 30_000 });
});
