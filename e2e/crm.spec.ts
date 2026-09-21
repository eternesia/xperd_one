import { test, expect } from "@playwright/test";
import { login, resolveWorkspaceId, moduleSettled } from "./helpers";

test("CRM: create a lead via the Leads dialog", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);
  await page.goto(`/app/w/${ws}/crm/leads`);
  if (await moduleSettled(page, "Leads")) {
    test.skip(true, "CRM add-on (qalling) is not assigned to this tenant");
    return;
  }

  await expect(page.getByText("Leads", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "New" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const boxes = dialog.getByRole("textbox");
  await boxes.nth(0).fill(`LEAD-E2E-${Date.now() % 100000}`);
  await boxes.nth(1).fill("E2E Customer A");
  await boxes.nth(2).fill("PT E2E Customer A");
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(page.locator("body")).toContainText("E2E Customer A", { timeout: 40_000 });
});
