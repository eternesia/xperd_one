import { expect, test } from "@playwright/test";

import { login, moduleSettled, resolveWorkspaceId } from "./helpers";

/**
 * BS-parity #15: import leads from an Excel/CSV sheet. Header aliases are
 * accepted, rows are bulk-inserted, and rows duplicating an existing email or
 * phone number are skipped (and reported).
 */
test("CRM: import leads from CSV and skip duplicates", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);
  await page.goto(`/app/w/${ws}/crm/leads`);
  if (await moduleSettled(page, "Leads")) {
    test.skip(true, "CRM add-on (qalling) is not assigned to this tenant");
    return;
  }
  await expect(page.getByText("Leads", { exact: true }).first()).toBeVisible({ timeout: 60_000 });

  const u = Date.now() % 100_000;
  const csv = [
    "name,company,email,phone,value",
    `E2E Import A ${u},PT Import A,a${u}@example.com,0811${u},1500000`,
    `E2E Import B ${u},PT Import B,b${u}@example.com,0822${u},2500000`,
    `Duplikat A ${u},,a${u}@example.com,,`,
  ].join("\n");

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Import Excel" }).click(),
  ]);
  await chooser.setFiles({ name: "leads.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });

  await expect(page.getByText(/2 leads imported|2 prospek diimpor/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("row", { name: new RegExp(`E2E Import A ${u}`) })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("row", { name: new RegExp(`E2E Import B ${u}`) })).toBeVisible();
  // The third row duplicates the first email, so it must not be created.
  await expect(page.getByRole("row", { name: new RegExp(`Duplikat A ${u}`) })).toHaveCount(0);
});
