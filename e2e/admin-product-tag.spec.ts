import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * #65 (BS New 3): tag produk tenant/invoice (`xperd` | `qalling`).
 *  - Tenancy: badge produk per tenant + tombol ganti produk + filter produk.
 *  - Invoices: filter produk (dengan jumlah) + badge produk per invoice.
 *
 * Spec ini idempoten: nilai produk awal dibaca dulu, ditukar, lalu
 * dikembalikan ke nilai semula sehingga bisa dijalankan berulang.
 */
test("ADMIN: tag produk tenant bisa ditukar dan difilter", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  await page.goto("/app-admin/tenancy");

  const table = page.locator("table").first();
  await expect(table).toBeVisible({ timeout: 60_000 });
  if (await page.getByText("No tenants found.").isVisible().catch(() => false)) {
    test.skip(true, "no tenants seeded");
    return;
  }

  // Badge ganda sebagai tombol "Ganti produk".
  const toggle = page.getByTitle("Ganti produk").first();
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  const before = (await toggle.innerText()).trim();
  expect(["XPERD", "Qalling"]).toContain(before);
  const other = before === "Qalling" ? "XPERD" : "Qalling";

  await toggle.click();
  await expect(page.getByText(`Produk tenant diubah ke ${other}`).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTitle("Ganti produk").first()).toHaveText(other, { timeout: 30_000 });

  // Filter produk: hanya produk terpilih yang ditampilkan.
  const pick = async (label: string) => {
    await page.getByLabel("Filter produk").click();
    await page.getByRole("option", { name: label, exact: true }).click();
    await page.waitForTimeout(300);
  };

  await pick(other === "Qalling" ? "Qalling" : "XPERD ERP");
  await expect(page.getByTitle("Ganti produk").first()).toHaveText(other, { timeout: 30_000 });

  // Produk lama tidak boleh lagi menampilkan baris tenant tersebut.
  const oldLabel = before === "Qalling" ? "Qalling" : "XPERD ERP";
  await pick(oldLabel);
  const visibleBadges = page.getByTitle("Ganti produk");
  const badgeCount = await visibleBadges.count();
  for (let i = 0; i < badgeCount; i += 1) {
    await expect(visibleBadges.nth(i)).toHaveText(before);
  }

  await pick("Semua produk");
  // Kembalikan ke nilai semula (idempoten).
  await page.getByTitle("Ganti produk").first().click();
  await expect(page.getByText(`Produk tenant diubah ke ${before}`).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTitle("Ganti produk").first()).toHaveText(before, { timeout: 30_000 });
});

test("ADMIN: filter produk pada halaman Invoices", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  await page.goto("/app-admin/invoices");

  // Ketiga tombol filter harus muncul dengan jumlahnya masing-masing.
  const allButton = page.getByRole("button", { name: /^Semua \(\d+\)$/ }).first();
  const xperdButton = page.getByRole("button", { name: /^XPERD ERP \(\d+\)$/ }).first();
  const qallingButton = page.getByRole("button", { name: /^Qalling \(\d+\)$/ }).first();
  await expect(allButton).toBeVisible({ timeout: 60_000 });
  await expect(xperdButton).toBeVisible({ timeout: 30_000 });
  await expect(qallingButton).toBeVisible({ timeout: 30_000 });

  // Fixture dev `001e` menyediakan satu invoice per produk.
  const rowOf = (tag: "XPERD" | "Qalling") =>
    page.getByRole("row").filter({ hasText: `E2E-INV-${tag.toUpperCase()}-0001` }).first();
  const xperdRow = rowOf("XPERD");
  const qallingRow = rowOf("Qalling");
  if (!(await xperdRow.isVisible().catch(() => false))) {
    test.skip(true, "fixture invoice 001e belum diterapkan — jalankan npm run seed");
    return;
  }
  await expect(xperdRow.getByText("XPERD", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(qallingRow.getByText("Qalling", { exact: true })).toBeVisible({ timeout: 30_000 });

  // Filter XPERD → invoice Qalling tersembunyi, dan sebaliknya.
  await xperdButton.click();
  await expect(xperdRow).toBeVisible({ timeout: 30_000 });
  await expect(qallingRow).toBeHidden({ timeout: 30_000 });

  await qallingButton.click();
  await expect(qallingRow).toBeVisible({ timeout: 30_000 });
  await expect(xperdRow).toBeHidden({ timeout: 30_000 });

  await allButton.click();
  await expect(xperdRow).toBeVisible({ timeout: 30_000 });
  await expect(qallingRow).toBeVisible({ timeout: 30_000 });
});
