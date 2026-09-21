import { test, expect } from "@playwright/test";
import { login, resolveWorkspaceId } from "./helpers";

test("SETTINGS: choose Modern doc template and save", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);
  await page.goto(`/app/w/${ws}/settings`);

  // The select shows the currently saved template, so it may already be
  // "Modern Accent" from a previous run. Open whatever is set, then pick Modern.
  const trigger = page.locator("#docTemplateSelect");
  await expect(trigger).toBeVisible({ timeout: 60_000 });
  await trigger.click();
  await page.getByRole("option", { name: "Modern Accent" }).click();
  await page.getByRole("button", { name: /Save changes/ }).click();

  await expect(page.locator("body")).toContainText("Settings saved", { timeout: 30_000 });
});
