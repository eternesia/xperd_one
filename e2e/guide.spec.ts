import { expect, test } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * BS-parity feature: the app topbar exposes an "XPERD Help Center" menu
 * (Guide + Assistant) instead of the old single Sparkles button, and the new
 * bilingual User Guide route lives at /app/w/$workspaceId/guide.
 */
test("GUIDE: topbar help menu opens the bilingual user guide", async ({ page }) => {
  await login(page);
  const ws = await resolveWorkspaceId(page);

  await page.goto(`/app/w/${ws}/guide`);
  await expect(
    page.getByRole("heading", { name: /Panduan Pemakaian XPERD One|XPERD One Usage Guide/ }),
  ).toBeVisible({ timeout: 30_000 });

  const search = page.getByPlaceholder(/Cari fitur, modul, atau langkah|Search a feature, module or step/);
  await expect(search).toBeVisible();

  // The guide renders accordion sections and filters them by the search box.
  await expect(page.locator('[data-state="closed"], [data-state="open"]').first()).toBeVisible();
  await search.fill("zzz-tidak-ada");
  await expect(page.getByText(/Tidak ada panduan yang cocok|No guide entry matches/)).toBeVisible({
    timeout: 10_000,
  });

  // The topbar help menu links to the same guide (plus the assistant).
  await page.getByRole("button", { name: /Panduan dan XPERD Assistant|Guide and XPERD Assistant/ }).click();
  await expect(page.getByText(/Pusat Bantuan XPERD|XPERD Help Center/)).toBeVisible();
  await expect(page.getByText(/Panduan Pengguna|User Manual|User Guide/).first()).toBeVisible();
  await expect(page.getByText("XPERD Assistant").first()).toBeVisible();
});
