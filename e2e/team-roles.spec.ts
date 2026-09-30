import { expect, test } from "@playwright/test";

import { ADMIN, login, resolveWorkspaceId } from "./helpers";

/**
 * Team & Access (#58): matriks "Role Access" harus benar-benar termuat dan
 * perubahannya tersimpan.
 *
 * Regresi yang dijaga: panel ini memuat `workspace_role_access` lewat lapisan
 * data generik tanpa `orderBy`; lapisan itu dulu default ke `ORDER BY code`
 * padahal tabel tersebut tidak punya kolom `code` → MySQL menolak
 * ("Unknown column 'code' in 'order clause'") dan panel berhenti di "Loading…"
 * selamanya, sehingga admin tidak pernah bisa mengubah peran/menu.
 *
 * Spec tetap idempoten: nilai yang diubah selalu dikembalikan di akhir.
 */
test("TEAM: matriks Role Access termuat dan perubahan tersimpan", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);
  await page.goto(`/app/w/${ws}/team`);

  await expect(page.getByText(/Team & Access/)).toBeVisible({ timeout: 60_000 });

  /* ---------- tab Users ---------- */
  await expect(page.getByRole("tab", { name: /Users|Pengguna/i }).first()).toBeVisible({ timeout: 30_000 });
  // Daftar anggota ditampilkan sebagai tabel (seperti BS New 3) — pemilik
  // workspace harus muncul beserta alamat emailnya dan badge Owner.
  await expect(page.getByRole("cell", { name: ADMIN.email }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^Owner$/).first()).toBeVisible();
  // Tombol aksi versi BS New 3 tersedia: Give access (user tenant yang sudah ada).
  await expect(page.getByRole("button", { name: /Give access/i })).toBeVisible();

  /* ---------- tab Role Access: matriks harus termuat ---------- */
  await page.getByRole("tab", { name: /Role Access|Akses Peran/i }).first().click();
  const omnixItem = page.getByTestId("role-access-module-omnix");
  await expect(omnixItem).toBeVisible({ timeout: 60_000 });
  // Panel tidak boleh berhenti di state loading.
  await expect(page.getByText("Loading…")).toHaveCount(0);
  // Modul yang ditambahkan batch 3 ikut masuk matriks.
  await expect(page.getByTestId("role-access-module-crm")).toBeVisible();
  await expect(omnixItem).toContainText(/Dashboard \+ \d+ submodules/);

  /* ---------- ubah izin → simpan → tetap tersimpan ---------- */
  await omnixItem.getByRole("button").first().click();
  await expect(page.getByTestId("role-access-line-omnix")).toBeVisible({ timeout: 30_000 });

  const staffView = page.getByLabel("omnix:staff:view");
  const staffEdit = page.getByLabel("omnix:staff:edit");
  await expect(staffView).toBeChecked();
  await staffView.click();
  await expect(staffView).not.toBeChecked();

  const save = page.getByRole("button", { name: /^Save$/ }).first();
  await save.click();
  await expect(page.getByText(/Role access saved/i).first()).toBeVisible({ timeout: 60_000 });

  await page.reload();
  await page.getByRole("tab", { name: /Role Access|Akses Peran/i }).first().click();
  await expect(page.getByTestId("role-access-module-omnix").getByRole("button").first()).toBeVisible({
    timeout: 60_000,
  });
  await page.getByTestId("role-access-module-omnix").getByRole("button").first().click();
  const reloadedView = page.getByLabel("omnix:staff:view");
  await expect(reloadedView).not.toBeChecked({ timeout: 30_000 });

  /* ---------- kembalikan ke setelan semula (idempoten) ---------- */
  await reloadedView.click();
  await expect(reloadedView).toBeChecked();
  const reloadedEdit = page.getByLabel("omnix:staff:edit");
  if (!(await reloadedEdit.isChecked())) await reloadedEdit.click();
  await expect(reloadedEdit).toBeChecked();
  await page.getByRole("button", { name: /^Save$/ }).first().click();
  await expect(page.getByText(/Role access saved/i).first()).toBeVisible({ timeout: 60_000 });
});
