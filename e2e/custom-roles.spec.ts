import { expect, test } from "@playwright/test";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Peran kustom workspace (BS New 16, Ronde 56): owner/admin membuat peran dengan izin View/Edit per modul, menetapkannya ke anggota,
 * izin berlaku (menu & rute), perubahan level dasar merambat ke anggota, dan menghapus peran melepas anggota ke level dasar.
 * Penegakan di server: nama ganda ditolak, owner tidak bisa memakai peran kustom, non-admin ditolak. Data dikembalikan di akhir.
 */
const USER = { email: "e2e.custom@xperd.local", password: "CustomE2E2026" };
const NAME = "E2E Admin Konten";

const DB = {
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? 3307),
  user: process.env.MYSQL_USER ?? "xperd",
  password: process.env.MYSQL_PASSWORD ?? "xperd",
  database: process.env.MYSQL_DATABASE ?? "xperd",
};
let conn: mysql.Connection;
const q = async (sql: string, p: unknown[] = []) => (await conn.query<RowDataPacket[]>(sql, p))[0];
let ws = "";

test.afterAll(async () => {
  if (!conn) return;
  if (ws) {
    await conn.execute(
      "DELETE FROM workspace_members WHERE workspace_id = ? AND user_id IN (SELECT id FROM app_users WHERE email = ?)",
      [ws, USER.email],
    );
    await conn.execute(
      "DELETE FROM workspace_custom_roles WHERE workspace_id = ? AND name LIKE 'E2E%'",
      [ws],
    );
  }
  await conn.end();
});

test("CUSTOM ROLES: buat peran, tetapkan, izin berlaku, propagasi, hapus", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  conn = await mysql.createConnection(DB);
  await login(page);
  ws = await resolveWorkspaceId(page);
  await conn.execute(
    "DELETE FROM workspace_custom_roles WHERE workspace_id = ? AND name LIKE 'E2E%'",
    [ws],
  );
  await page.goto(`/app/w/${ws}/team`);

  /* ---------- anggota uji (viewer) ---------- */
  await page
    .getByRole("button", { name: /Create user/ })
    .first()
    .click();
  const createDialog = page.getByRole("dialog");
  await createDialog.getByLabel("Full name").fill("E2E Custom");
  await createDialog.getByLabel("Email").fill(USER.email);
  await createDialog.getByLabel("Password").fill(USER.password);
  await createDialog.locator("form").getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Viewer" }).click();
  await createDialog.getByRole("button", { name: /Create user/ }).click();
  await expect(page.getByRole("cell", { name: USER.email }).first()).toBeVisible({
    timeout: 60_000,
  });

  /* ---------- buat peran: hanya modul Sales (View+Edit), level dasar Staff ---------- */
  await page.getByRole("tab", { name: "Custom Roles" }).click();
  await expect(page.getByText("Belum ada custom role.")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Role baru" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByPlaceholder("Admin Konten").fill("x");
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Nama role minimal 2 karakter").first()).toBeVisible({
    timeout: 15_000,
  });
  await dlg.getByPlaceholder("Admin Konten").fill(NAME);
  await dlg.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Staff" }).click();
  const salesBlock = dlg.locator("div.rounded-md.border").filter({ hasText: /Sales/ }).first();
  await salesBlock.getByLabel("Edit").first().click(); // Edit otomatis mencentang View
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Role tersimpan").first()).toBeVisible({ timeout: 30_000 });
  const [role] = await q(
    "SELECT id, base_role, permissions FROM workspace_custom_roles WHERE workspace_id = ? AND name = ?",
    [ws, NAME],
  );
  const perms =
    typeof role.permissions === "string" ? JSON.parse(role.permissions) : role.permissions;
  expect(role.base_role).toBe("staff");
  expect(perms.sales).toEqual({ view: true, edit: true });
  expect(perms.tax).toEqual({ view: false, edit: false }); // menu tak dicentang ditolak eksplisit
  const roleId = String(role.id);
  await expect(page.getByRole("row").filter({ hasText: NAME })).toContainText("1 modul");
  // nama ganda ditolak server
  await page.getByRole("button", { name: "Role baru" }).click();
  await page.getByRole("dialog").getByPlaceholder("Admin Konten").fill(NAME);
  await page.getByRole("dialog").getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Nama role sudah dipakai di workspace ini").first()).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("dialog").getByRole("button", { name: "Batal" }).click();

  /* ---------- tetapkan ke anggota → role dasar ikut, izin berlaku ---------- */
  await page.getByRole("tab", { name: "Users" }).click();
  const row = page.getByRole("row").filter({ hasText: USER.email }).first();
  await row.getByRole("combobox").first().click();
  await page.getByRole("option", { name: NAME }).click();
  await expect
    .poll(
      async () =>
        (
          await q(
            "SELECT role, custom_role_id FROM workspace_members WHERE workspace_id = ? AND user_id = (SELECT id FROM app_users WHERE email = ?)",
            [ws, USER.email],
          )
        )[0]?.custom_role_id,
      { timeout: 30_000 },
    )
    .toBe(roleId);
  expect(
    (
      await q(
        "SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = (SELECT id FROM app_users WHERE email = ?)",
        [ws, USER.email],
      )
    )[0].role,
  ).toBe("staff");

  const ctx = await browser.newContext();
  const member = await ctx.newPage();
  await login(member, USER);
  await member.goto(`/app/w/${ws}`);
  await expect(member.getByRole("link", { name: /Sales & POS/ }).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(member.locator('a[href$="/tax"]')).toHaveCount(0);
  await member.goto(`/app/w/${ws}/tax`);
  await expect(
    member.getByText(/Module access restricted|Akses modul dibatasi/i).first(),
  ).toBeVisible({ timeout: 60_000 });

  /* ---------- propagasi level dasar ---------- */
  await page.getByRole("tab", { name: "Custom Roles" }).click();
  await page.getByRole("row").filter({ hasText: NAME }).getByTitle("Edit").click();
  await page.getByRole("dialog").getByRole("combobox").first().click();
  await page.getByRole("option", { name: /Viewer/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Role tersimpan").first()).toBeVisible({ timeout: 30_000 });
  expect(
    (
      await q(
        "SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = (SELECT id FROM app_users WHERE email = ?)",
        [ws, USER.email],
      )
    )[0].role,
  ).toBe("viewer");

  /* ---------- penegakan server ---------- */
  const asMember = await member.evaluate(
    async ({ ws, roleId }) => {
      const m = await import("/src/lib/custom-roles.functions.ts");
      try {
        await m.saveCustomRole({
          data: { workspaceId: ws, name: "E2E Nakal", base_role: "admin", permissions: {} },
        });
        return "diterima";
      } catch (e) {
        return (e as Error).message;
      }
    },
    { ws, roleId },
  );
  expect(asMember).toBe("Forbidden");
  const ownerTry = await page.evaluate(
    async ({ ws, roleId }) => {
      const m = await import("/src/lib/custom-roles.functions.ts");
      const rows = (await import("/src/lib/data.functions.ts")).listWorkspaceRows;
      const list = (await rows({
        data: { table: "workspace_members", workspaceId: ws, filters: { role: "owner" } },
      })) as { rows: { id: string }[] };
      try {
        await m.setMemberRole({
          data: { workspaceId: ws, memberId: list.rows[0].id, customRoleId: roleId },
        });
        return "diterima";
      } catch (e) {
        return (e as Error).message;
      }
    },
    { ws, roleId },
  );
  expect(ownerTry).toContain("Owner");
  await ctx.close();

  /* ---------- hapus peran → anggota kembali ke level dasar ---------- */
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("row").filter({ hasText: NAME }).getByTitle("Hapus").click();
  await expect(page.getByText("Role dihapus").first()).toBeVisible({ timeout: 30_000 });
  const [after] = await q(
    "SELECT role, custom_role_id FROM workspace_members WHERE workspace_id = ? AND user_id = (SELECT id FROM app_users WHERE email = ?)",
    [ws, USER.email],
  );
  expect(after.custom_role_id).toBeNull();
  expect(after.role).toBe("viewer");
});
