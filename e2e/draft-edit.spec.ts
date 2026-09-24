import { expect, test } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * BS-parity #9: an existing DRAFT document can be re-opened, edited and saved
 * again (header updated in place, lines replaced). The spec round-trips the
 * document number so the seeded fixture is left unchanged.
 */
test("DOCS: edit a draft document and save it again", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);
  await page.goto(`/app/w/${ws}/sales/quotations`);
  await expect(page.getByRole("button", { name: "Create New" })).toBeVisible({ timeout: 60_000 });

  const draftRow = page.getByRole("row").filter({ hasText: "QUO/" }).first();
  await expect(draftRow).toBeVisible();
  const original = (await draftRow.locator("td").nth(1).innerText()).trim();
  expect(original).toMatch(/^QUO\//);

  const dialog = page.getByRole("dialog");

  const rename = async (value: string) => {
    await draftRow.getByRole("button", { name: "Edit draft" }).click();
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole("heading", { name: /Edit Draft/ })).toBeVisible();
    const code = dialog.getByRole("textbox").nth(0);
    await expect(code).toHaveValue(/QUO\//);
    await code.fill(value);
    await dialog.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/Draft updated/).first()).toBeVisible({ timeout: 60_000 });
    await expect(dialog).toBeHidden({ timeout: 30_000 });
  };

  // Rename → proves the header is updated in place and lines are re-created.
  await rename(`${original}-EDIT`);
  await expect(page.getByText(`${original}-EDIT`, { exact: false }).first()).toBeVisible({ timeout: 30_000 });

  // Rename back so the seeded fixture stays as it was.
  const editedRow = page.getByRole("row", { name: new RegExp(`${original}-EDIT`) }).first();
  await expect(editedRow).toBeVisible();
  await editedRow.getByRole("button", { name: "Edit draft" }).click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("textbox").nth(0).fill(original);
  await dialog.getByRole("button", { name: "Save draft" }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  await expect(page.getByRole("row", { name: new RegExp(original) }).first()).toBeVisible();
});

/**
 * Same feature on the procurement side (seeded draft purchase request). Names
 * are fixed so re-runs stay idempotent even after a failed run.
 */
test("DOCS: edit a draft purchase request", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);
  await page.goto(`/app/w/${ws}/procurement/purchase-requests`);
  await expect(page.getByRole("button", { name: "Create New" })).toBeVisible({ timeout: 60_000 });

  const base = "E2E-PR-0001";
  const edited = `${base}-EDIT`;
  const row = page.getByRole("row").filter({ hasText: base }).first();
  await expect(row).toBeVisible();
  const dialog = page.getByRole("dialog");

  const rename = async (value: string) => {
    await page.getByRole("row").filter({ hasText: base }).first().getByRole("button", { name: "Edit draft" }).click();
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole("heading", { name: /Edit Draft/ })).toBeVisible();
    await dialog.getByRole("textbox").nth(0).fill(value);
    await dialog.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/Draft updated/).first()).toBeVisible({ timeout: 60_000 });
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect(page.getByText(value, { exact: false }).first()).toBeVisible({ timeout: 30_000 });
  };

  await rename(edited);
  await rename(base);
});
