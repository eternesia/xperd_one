import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { login } from "./helpers";

/**
 * Admin Content: gambar banner/fitur yang berat (derau acak ±2 MB, kasus terburuk) harus dikompres bertahap
 * sampai muat ≤ 3.000.000 karakter — bukan ditolak "Gambar terlalu besar setelah kompresi".
 */
test("ADMIN content: gambar berat dikompres bertahap, tidak ditolak", async ({ page }) => {
  test.setTimeout(120_000);
  // JPEG derau 3200×2400 dibuat saat uji (tanpa fixture biner di repo)
  const file = path.join(test.info().outputDir, "noisy.jpg");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const w = 3200;
  const h = 2400;
  await login(page);
  await page.goto("/app-admin/content");
  await page.getByRole("button", { name: /^Website Qalling/ }).click();
  await page.getByRole("button", { name: "+ Banner utama" }).click();
  const bytes = await page.evaluate(async ({ w, h }) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = Math.random() * 255; img.data[i + 1] = Math.random() * 255; img.data[i + 2] = Math.random() * 255; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.95));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, { w, h });
  expect(bytes.length).toBeGreaterThan(5_000_000);
  expect(bytes.length).toBeLessThan(10 * 1024 * 1024);
  fs.writeFileSync(file, Buffer.from(bytes));
  await page.getByLabel("Unggah gambar banner atau fitur").setInputFiles(file);
  await expect(page.getByAltText("Pratinjau gambar")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Gambar terlalu besar setelah kompresi")).toHaveCount(0);
  const src = await page.getByAltText("Pratinjau gambar").getAttribute("src");
  expect(src!.startsWith("data:image/webp")).toBe(true);
  expect(src!.length).toBeLessThanOrEqual(3_000_000);
});
