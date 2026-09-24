import { expect, test } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * BS-parity #10: only DRAFT documents may be deleted. The delete action is
 * hidden for any other status and the server re-checks the status, so a
 * confirmed document can never be removed from the list.
 */
test("DOCS: delete action only shows for draft documents", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);

  // Drafts (seeded quotations) expose the delete action.
  await page.goto(`/app/w/${ws}/sales/quotations`);
  const draftRow = page.getByRole("row").filter({ hasText: "QUO/" }).first();
  await expect(draftRow).toBeVisible({ timeout: 60_000 });
  await expect(draftRow.getByRole("button", { name: "Delete" })).toBeVisible();

  // A confirmed document (approved sales order) must not offer deletion.
  await page.goto(`/app/w/${ws}/sales/sales-orders`);
  const approvedRow = page.getByRole("row").filter({ hasText: "E2E-SO-0001" }).first();
  await expect(approvedRow).toBeVisible({ timeout: 60_000 });
  await expect(approvedRow.getByRole("button", { name: "Delete" })).toHaveCount(0);
});
