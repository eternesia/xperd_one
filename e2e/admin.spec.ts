import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("ADMIN: Users page loads", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  await page.goto("/app-admin/users");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible({ timeout: 60_000 });
});

test("ADMIN: Add-on Modules page loads", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  await page.goto("/app-admin/addons");
  await expect(page.getByRole("heading", { name: "Add-on Modules" })).toBeVisible({ timeout: 60_000 });
});
