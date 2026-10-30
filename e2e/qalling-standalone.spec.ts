import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Permukaan Qalling standalone (BS New 11):
 *  - `/qalling`        : situs publik dengan header & logo Qalling sendiri.
 *  - `/qalling/login`  : masuk tanpa kata sandi (kode email) — alurnya diuji di `qalling-auth.spec.ts`.
 *  - `/qalling/app`    : shell aplikasi dengan sesi (cookie yang sama dengan /auth) + penjaga sesi.
 */
test("QALLING: landing, penjaga sesi, dan shell aplikasi standalone", async ({ page }) => {
  test.setTimeout(180_000);

  // 1. Landing publik dengan logo Qalling.
  await page.goto("/qalling");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("header").first().getByAltText(/Qalling/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Masuk" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Coba Gratis" }).first()).toBeVisible();

  // 2. Shell aplikasi dijaga: tanpa sesi → dialihkan ke /qalling/login (form kode email).
  await page.context().clearCookies();
  await page.goto("/qalling/app");
  await page.waitForURL(/\/qalling\/login/, { timeout: 60_000 });
  await expect(page.locator("#email")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Kirim kode masuk" })).toBeVisible();

  // 3. Dengan sesi, shell menampilkan menu CRM + dasbor.
  await login(page);
  await page.goto("/qalling/app");
  await expect(page.getByRole("link", { name: /Home|Beranda/ }).first()).toBeVisible({ timeout: 60_000 });
  const leads = page.getByRole("link", { name: /Leads|Prospek/ }).first();
  await expect(leads).toBeVisible({ timeout: 30_000 });
  await leads.click();
  await page.waitForURL(/\/qalling\/app\/leads/, { timeout: 30_000 });
  await expect(page.locator("body")).not.toContainText("Menu tidak ditemukan");
});
