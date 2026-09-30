import { expect, test } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * #58/#59: rantai "Role Access → menu & akses" harus benar-benar berlaku.
 *
 * Regresi yang dijaga (ditemukan 2026-09-30, "menu Team/Roles belum ke-update"):
 * panel Role Access sebelumnya berhenti di state "Loading…" karena lapisan data
 * generik mengurutkan dengan `ORDER BY code` padahal `workspace_role_access`
 * tidak punya kolom `code`. Akibatnya admin tidak pernah bisa mengubah peran,
 * dan izin yang tersimpan tidak pernah terlihat/pernah diuji sampai ke menu.
 *
 * Spec ini: admin membuat user `viewer`, mencabut akses modul Tax untuk viewer,
 * lalu memastikan menu (kartu modul) dan rute modul ikut menolak. Di akhir
 * semuanya dikembalikan (izin + keanggotaan) supaya idempoten.
 */
const VIEWER = { email: "e2e.viewer@xperd.local", password: "ViewerE2E2026" };
const TAX_KEYS = ["tax", "tax/vat-in", "tax/vat-out", "tax/withholding", "tax/efaktur"];

test("ROLES: cabut akses modul untuk viewer → menu & rute ikut berubah", async ({ page, browser }) => {
  test.setTimeout(300_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);
  await page.goto(`/app/w/${ws}/team`);

  /* ---------- 1. buat/segarkan user viewer ---------- */
  await page.fill("#mname", "E2E Viewer");
  await page.fill("#memail", VIEWER.email);
  await page.fill("#mpass", VIEWER.password);
  await page.locator("form").getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Viewer" }).click();
  await page.getByRole("button", { name: /Create user/i }).click();
  await expect(page.getByText(VIEWER.email).first()).toBeVisible({ timeout: 60_000 });

  /* ---------- 2. cabut akses modul Tax untuk viewer ---------- */
  const openTax = async () => {
    await page.getByRole("tab", { name: /Role Access|Akses Peran/i }).first().click();
    const item = page.getByTestId("role-access-module-tax");
    await expect(item).toBeVisible({ timeout: 60_000 });
    await item.getByRole("button").first().click();
    await expect(page.getByTestId("role-access-line-tax")).toBeVisible({ timeout: 30_000 });
  };

  await openTax();
  for (const key of TAX_KEYS) {
    const box = page.getByLabel(`${key}:viewer:view`);
    await expect(box).toBeChecked();
    await box.click();
    await expect(box).not.toBeChecked();
  }
  await page.getByRole("button", { name: /^Save$/ }).first().click();
  await expect(page.getByText(/Role access saved/i).first()).toBeVisible({ timeout: 60_000 });

  /* ---------- 3. viewer: menu & rute harus tunduk pada izin ---------- */
  const viewerCtx = await browser.newContext();
  const viewer = await viewerCtx.newPage();
  await login(viewer, VIEWER);
  await viewer.goto(`/app/w/${ws}`);

  // Modul yang masih diizinkan tampil…
  await expect(viewer.getByRole("link", { name: /Sales & POS/ }).first()).toBeVisible({ timeout: 60_000 });
  // …sedangkan Tax tidak lagi punya kartu menu.
  await expect(viewer.locator(`a[href$="/tax"]`)).toHaveCount(0);
  // Membuka rutenya langsung juga ditolak.
  await viewer.goto(`/app/w/${ws}/tax`);
  await expect(viewer.getByText(/Module access restricted|Akses modul dibatasi/i).first()).toBeVisible({
    timeout: 60_000,
  });
  await viewerCtx.close();

  /* ---------- 4. kembalikan izin & hapus anggota (idempoten) ---------- */
  await openTax();
  for (const key of TAX_KEYS) {
    const box = page.getByLabel(`${key}:viewer:view`);
    if (!(await box.isChecked())) await box.click();
    await expect(box).toBeChecked();
  }
  await page.getByRole("button", { name: /^Save$/ }).first().click();
  await expect(page.getByText(/Role access saved/i).first()).toBeVisible({ timeout: 60_000 });

  await page.getByRole("tab", { name: /Users|Pengguna/i }).first().click();
  const remove = page.getByRole("button", { name: "Remove" }).first();
  await expect(remove).toBeVisible({ timeout: 30_000 });
  await remove.click();
  await expect(page.getByText(VIEWER.email)).toHaveCount(0, { timeout: 60_000 });
});
