import { expect, test } from "@playwright/test";

import { login, moduleSettled, resolveWorkspaceId } from "./helpers";

/**
 * BS-parity CRM additions (#18 lost reason required, #19 convert lead to
 * quotation). The CRM module is an add-on: when qalling is not assigned the
 * spec skips itself, like the other CRM specs.
 */
test("CRM: lost reason is required and an open lead converts to a quotation", async ({ page }) => {
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

  // --- lost reason is mandatory when the stage is "lost" -----------------
  await page.getByRole("button", { name: "New" }).click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const boxes = dialog.getByRole("textbox");
  await boxes.nth(0).fill(`LEAD-LOST-${unique}`);
  await boxes.nth(1).fill(`E2E Lost Lead ${unique}`);

  const save = dialog.getByRole("button", { name: "Save" });
  await expect(save).toBeEnabled();
  await dialog.getByRole("combobox").nth(1).selectOption("lost");

  const reason = dialog.locator("div.space-y-2", { hasText: "Lost reason" }).locator("input");
  await expect(reason).toBeVisible({ timeout: 15_000 });
  await expect(save).toBeDisabled();
  await reason.fill("Harga kalah dari kompetitor");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.locator("body")).toContainText(`E2E Lost Lead ${unique}`, { timeout: 30_000 });

  // --- convert an open lead into a quotation -----------------------------
  await page.getByRole("button", { name: "New" }).click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await boxes.nth(0).fill(`LEAD-CONV-${unique}`);
  await boxes.nth(1).fill(`E2E Convert Lead ${unique}`);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const row = page.getByRole("row", { name: new RegExp(`LEAD-CONV-${unique}`) });
  await expect(row).toBeVisible({ timeout: 30_000 });
  const convert = row.locator('button[title="Convert to quotation"], button[title="Konversi ke penawaran"]');
  await expect(convert).toBeVisible();
  await convert.click();
  await expect(page.getByText(/Quotation .+ created|Penawaran .+ dibuat/)).toBeVisible({ timeout: 60_000 });

  // The lead is now linked to a quotation, so the convert action disappears.
  await expect(convert).toHaveCount(0, { timeout: 30_000 });
});
