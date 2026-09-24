import { expect, test } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * BS-parity #12/#13: Cash Out bisa dilampiri gambar bukti, dan barisnya
 * menampilkan link "Bukti" yang membuka gambar tersebut.
 *
 * Catatan: spec ini mencatat satu transaksi kas keluar baru setiap kali dijalankan
 * (nomor CO berurutan dari server) karena fitur ini tidak punya data fixture.
 */
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AGtE0d8AAAAAElFTkSuQmCC";

test("CASH: cash out with a proof image shows a working 'Bukti' link", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);
  await page.goto(`/app/w/${ws}/cash-bank/cash-out`);

  const createBtn = page.getByRole("button", { name: "Create New" });
  await expect(createBtn).toBeVisible({ timeout: 60_000 });
  await createBtn.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });

  // Akun kas/bank + akun beban/hutang (dua Select pertama di dialog).
  await dialog.getByRole("combobox").nth(0).click();
  await page.getByRole("option").first().click();
  await dialog.getByRole("combobox").nth(1).click();
  await page.getByRole("option").first().click();

  await dialog.locator('input[inputmode="decimal"]').fill("1000");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "bukti.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_1PX, "base64"),
  });

  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Transaction posted|Transaksi tercatat/).first()).toBeVisible({ timeout: 60_000 });
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  // Baris baru menampilkan link "Proof" -> dialog pratinjau berisi gambar.
  const proofRow = page.getByRole("row").filter({ hasText: "Proof" }).first();
  await expect(proofRow).toBeVisible({ timeout: 60_000 });
  await proofRow.getByRole("button", { name: "Proof" }).click();

  const preview = page.getByRole("dialog").filter({ hasText: /Payment proof/ });
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await expect(preview.locator('img[alt="Proof"]')).toHaveAttribute("src", /^data:image\//);

  await preview.getByRole("button", { name: /Close/ }).first().click();
  await expect(preview).toBeHidden({ timeout: 30_000 });
});
