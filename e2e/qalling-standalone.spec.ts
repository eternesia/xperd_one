import { test, expect } from "@playwright/test";
import { ADMIN } from "./helpers";

/**
 * #64 (BS New 3): permukaan Qalling standalone.
 *  - `/qalling`     : landing publik dengan header Qalling sendiri (bukan situs XPERD).
 *  - `/qalling/login`: form login khusus Qalling.
 *  - `/qalling/app`  : shell aplikasi (memakai ulang view CRM) + penjaga sesi.
 */
test("QALLING: landing, login, dan shell aplikasi standalone", async ({ page }) => {
  test.setTimeout(180_000);

  // 1. Landing publik.
  await page.goto("/qalling");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Qalling", { timeout: 60_000 });
  await expect(page.locator("header").first()).toContainText("Qalling");
  await expect(page.getByRole("link", { name: /Sign in|Masuk/ }).first()).toBeVisible();

  // 2. Shell aplikasi dijaga: tanpa sesi → dialihkan ke /qalling/login.
  await page.context().clearCookies();
  await page.goto("/qalling/app");
  await page.waitForURL(/\/qalling\/login/, { timeout: 60_000 });
  await expect(page.locator("#email")).toBeVisible({ timeout: 30_000 });

  // 3. Login memakai form Qalling → masuk ke shell.
  await page.fill("#email", ADMIN.email);
  await page.fill("#password", ADMIN.password);
  await page.locator("#password").press("Enter");
  await page.waitForURL(/\/qalling\/app/, { timeout: 60_000 });

  // 4. Shell menampilkan menu CRM (dipakai ulang dari modul CRM) + dasbor.
  await expect(page.getByRole("link", { name: /Dashboard|Dasbor/ }).first()).toBeVisible({ timeout: 60_000 });
  const leads = page.getByRole("link", { name: /Leads|Prospek/ }).first();
  await expect(leads).toBeVisible({ timeout: 30_000 });

  await leads.click();
  await page.waitForURL(/\/qalling\/app\/leads/, { timeout: 30_000 });
  await expect(page.locator("body")).not.toContainText("Menu tidak ditemukan");
  await expect(page.getByText(/Leads|Prospek/).first()).toBeVisible({ timeout: 30_000 });
});
