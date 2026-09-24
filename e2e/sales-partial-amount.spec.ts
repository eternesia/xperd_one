import { expect, test } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * BS-parity #7 (bagian NILAI): AR Invoice menarik dokumen sumber lalu boleh
 * menagih **sebagian nilainya** — bukan sebagian qty.
 *
 * Spec ini hanya bekerja di dalam dialog lalu ditutup (tanpa submit), sehingga
 * tidak menambah dokumen baru di data dev. Yang diperiksa:
 *   1. widget Partial/Full muncul untuk dokumen penyelesaian berbasis nilai,
 *   2. setelah menarik sumber: "Sisa" == "Dokumen ini" (draft awal = sisa penuh),
 *   3. "Apply partial" menskalakan NILAI dokumen, sisa sumber tidak berubah,
 *   4. "Full" mengembalikan dokumen ke nilai sisa penuh.
 */
function parseBalance(text: string) {
  const m = text.match(/Open balance:\s*(.+?)\s*·\s*This document:\s*(.+)/);
  return m ? { open: m[1].trim(), doc: m[2].trim() } : null;
}

test("SALES: AR invoice partial amount is value-based (sisa vs nilai dokumen)", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);
  await page.goto(`/app/w/${ws}/sales/ar-invoices`);

  await expect(page.getByRole("button", { name: "New" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "New" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });

  // 1) Tarik sumber pertama yang masih bersisa (picker hanya menampilkan itu).
  await dialog.getByRole("combobox").first().click();
  const sourceOptions = page.getByRole("option");
  if ((await sourceOptions.count()) === 0) {
    await page.keyboard.press("Escape");
    test.skip(
      true,
      "Tidak ada dokumen sumber terbuka. Jalankan `npm run seed` (fixture E2E-DO-0001) dulu.",
    );
    return;
  }
  await sourceOptions.first().click();

  const widget = dialog.locator("div.mt-3").filter({ hasText: "Open balance:" }).first();
  await expect(widget).toBeVisible({ timeout: 30_000 });
  await expect(widget.getByText("Amount to invoice")).toBeVisible();

  // 2) Draft awal = sisa penuh.
  const line = widget.locator("p").first();
  const initial = parseBalance(await line.innerText());
  expect(initial).not.toBeNull();
  expect(initial!.doc).toBe(initial!.open);

  // 3) Partial kecil -> hanya nilai dokumen yang berubah, sisa sumber tetap.
  await widget.locator('input[type="number"]').fill("1000");
  await widget.getByRole("button", { name: "Apply partial" }).click();
  const partial = parseBalance(await line.innerText());
  expect(partial).not.toBeNull();
  expect(partial!.open).toBe(initial!.open);
  expect(partial!.doc).not.toBe(initial!.doc);
  expect(partial!.doc).toMatch(/1[,.]000/);

  // 4) Full -> kembali ke sisa penuh.
  await widget.getByRole("button", { name: "Full", exact: true }).click();
  const full = parseBalance(await line.innerText());
  expect(full).not.toBeNull();
  expect(full!.doc).toBe(initial!.open);

  // Tutup tanpa menyimpan.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden({ timeout: 15_000 });
});
