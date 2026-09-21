import { test, expect } from "@playwright/test";
import { login, openLauncher, expectNoAppCrash } from "./helpers";

test("AUTH: admin can sign in and reach the workspace launcher", async ({ page }) => {
  await login(page);
  await openLauncher(page);
  // Workspace-agnostic marker: the launcher grid itself.
  await expect(page.locator("body")).toContainText("MODULE LAUNCHER", { timeout: 45_000 });
  await expectNoAppCrash(page);
});
