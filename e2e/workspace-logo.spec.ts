import { expect, test } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * BS-parity #4: logo workspace bisa diunggah di Settings -> Company profile,
 * dipakai di header cetak/PDF dokumen, dan dihapus lagi. Spec ini
 * mengembalikan state workspace ke "tanpa logo" di akhir supaya idempotent.
 */
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AGtE0d8AAAAAElFTkSuQmCC";

test("SETTINGS: upload, persist and remove the workspace document logo", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);
  await page.goto(`/app/w/${ws}/settings`);

  const save = page.getByRole("button", { name: "Save changes" });
  await expect(save).toBeVisible({ timeout: 60_000 });

  const logo = page.getByAltText("Logo", { exact: true }).first();
  const fileInput = page.locator('input[type="file"]').first();
  await expect(fileInput).toBeVisible();

  // Tanpa logo kustom: teks "No logo" (New 11/12), tanpa gambar.
  if (await page.getByRole("button", { name: "Remove" }).isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Remove" }).click();
    await save.click();
    await expect(page.getByText(/Settings saved|Pengaturan disimpan/).first()).toBeVisible({ timeout: 60_000 });
  }
  await expect(page.getByText(/^(No logo|Belum ada logo)$/)).toBeVisible();
  await expect(logo).toHaveCount(0);

  // Unggah logo kustom -> pratinjau berganti dan template cetak memuat data URL-nya.
  await fileInput.setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_1PX, "base64"),
  });
  await expect(logo).toHaveAttribute("src", /^data:image\//);

  const preview = page.locator("iframe").first();
  await expect
    .poll(async () => (await preview.getAttribute("srcdoc")) ?? "", { timeout: 30_000 })
    .toContain("data:image/png");

  await save.click();
  await expect(page.getByText(/Settings saved|Pengaturan disimpan/).first()).toBeVisible({ timeout: 60_000 });

  // Persist setelah reload.
  await page.reload();
  await expect(page.getByAltText("Logo", { exact: true }).first()).toHaveAttribute("src", /^data:image\//, { timeout: 60_000 });

  // Hapus logo kustom -> kembali ke "No logo" (state awal).
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText(/^(No logo|Belum ada logo)$/)).toBeVisible();
  await save.click();
  await expect(page.getByText(/Settings saved|Pengaturan disimpan/).first()).toBeVisible({ timeout: 60_000 });
  await page.reload();
  await expect(page.getByText(/^(No logo|Belum ada logo)$/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByAltText("Logo", { exact: true }).first()).toHaveCount(0);
});
