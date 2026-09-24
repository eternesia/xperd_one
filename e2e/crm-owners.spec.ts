import { expect, test } from "@playwright/test";

import { login, moduleSettled, resolveWorkspaceId } from "./helpers";

/** Seeded workspace member used as the lead owner (see db/seeds/001_core_seed.sql). */
const OWNER = "Xperd Superadmin";

/**
 * BS-parity #17 (owner dropdown filled from workspace members) and #16 (the
 * owner defaults to the signed-in user and "My leads" filters on it).
 */
test("CRM: owner dropdown and My leads filter work on the signed-in user", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);
  await page.goto(`/app/w/${ws}/crm/leads`);
  if (await moduleSettled(page, "Leads")) {
    test.skip(true, "CRM add-on (qalling) is not assigned to this tenant");
    return;
  }
  await expect(page.getByText("Leads", { exact: true }).first()).toBeVisible({ timeout: 60_000 });

  const dialog = page.getByRole("dialog");
  const unique = Date.now() % 100_000;
  const mine = `E2E Mine ${unique}`;
  const unassigned = `E2E NoOwner ${unique}`;

  // --- #17: the owner field is a dropdown of workspace members -----------
  await page.getByRole("button", { name: "New" }).click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole("option", { name: OWNER, exact: true })).toHaveCount(1);

  const ownerSelect = dialog.locator("select").filter({ hasText: "—" });
  // #16: a new lead is pre-assigned to the signed-in user.
  await expect(ownerSelect).toHaveValue(OWNER);

  const boxes = dialog.getByRole("textbox");
  await boxes.nth(0).fill(`LEAD-MINE-${unique}`);
  await boxes.nth(1).fill(mine);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  // --- a second lead left without an owner (option "—") ------------------
  await page.getByRole("button", { name: "New" }).click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await boxes.nth(0).fill(`LEAD-NONE-${unique}`);
  await boxes.nth(1).fill(unassigned);
  await dialog.locator("select").filter({ hasText: "—" }).selectOption("");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const mineRow = page.getByRole("row", { name: new RegExp(mine) });
  const noneRow = page.getByRole("row", { name: new RegExp(unassigned) });
  await expect(mineRow).toBeVisible({ timeout: 30_000 });
  await expect(mineRow).toContainText(OWNER);
  await expect(noneRow).toBeVisible();

  // --- #16: "My leads" keeps mine and hides the unassigned one -----------
  await page.getByRole("button", { name: "My leads" }).click();
  await expect(mineRow).toBeVisible();
  await expect(noneRow).toHaveCount(0);

  await page.getByRole("button", { name: "My leads" }).click();
  await expect(noneRow).toBeVisible();
});
