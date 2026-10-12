import { expect, test } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Ronde 31 (parity BS New 8/10) — **Audit Trail**.
 *
 * New 8/10 mengisi `audit_logs` lewat trigger Postgres; di Old jejaknya ditulis
 * lapisan aplikasi (tanpa trigger). Spec ini membuktikannya end-to-end:
 *   1. buat satu item master data lewat UI  → tercatat action `INSERT`;
 *   2. ubah item itu lewat UI               → tercatat action `UPDATE` + kolom berubah;
 *   3. tab Audit Trail menampilkan jejaknya dan dialog detail memuat kolom
 *      “Kolom / Sebelum / Sesudah”;
 *   4. hapus item uji (UI) + bersihkan baris audit & item uji dari DB.
 */
function envFromFile(): Record<string, string> {
  try {
    const raw = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const env = envFromFile();
const DB_CONFIG = {
  host: process.env.MYSQL_HOST ?? env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? env.MYSQL_PORT ?? 3307),
  user: process.env.MYSQL_USER ?? env.MYSQL_USER ?? "xperd",
  password: process.env.MYSQL_PASSWORD ?? env.MYSQL_PASSWORD ?? "xperd",
  database: process.env.MYSQL_DATABASE ?? env.MYSQL_DATABASE ?? "xperd",
};

let conn: Connection;
let ws = "";
let savedCode = "";
const itemCode = `AUD-${Date.now().toString().slice(-6)}`;

const auditRows = async (ref: string) => {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT action, changed_fields, actor_email FROM audit_logs WHERE workspace_id = ? AND doc_ref = ? ORDER BY created_at",
    [ws, ref],
  );
  return rows;
};

async function cleanup() {
  await conn.execute("DELETE FROM audit_logs WHERE workspace_id = ? AND (doc_ref LIKE 'AUD-%' OR doc_ref LIKE ?)", [ws, `${itemCode}%`]);
  if (savedCode) await conn.execute("DELETE FROM audit_logs WHERE workspace_id = ? AND doc_ref = ?", [ws, savedCode]);
  await conn.execute("DELETE FROM md_items WHERE workspace_id = ? AND name LIKE ?", [ws, `Item audit ${itemCode}%`]);
}

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
});

test.afterAll(async () => {
  if (conn) {
    if (ws) await cleanup();
    await conn.end();
  }
});

test("AUDIT: pembuatan & perubahan master data tercatat di Audit Trail", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  await cleanup();

  // 1. buat item master data lewat UI
  await page.goto(`/app/w/${ws}/master-data/items`);
  await page.getByRole("button", { name: "New" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  // Catatan: kode item dibuat otomatis oleh sistem (Code readonly) → hanya nama
  // yang diisi, kode asli dibaca dari baris tabel setelah tersimpan.
  const textInputs = dialog.locator('input[type="text"]');
  await textInputs.nth(1).fill(`Item audit ${itemCode}`);
  await dialog.getByRole("button", { name: /^(Save|Simpan)$/ }).first().click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  const createdRow = page.getByRole("row").filter({ hasText: `Item audit ${itemCode}` }).first();
  await expect(createdRow).toBeVisible({ timeout: 30_000 });
  savedCode = ((await createdRow.innerText()).match(/\b[A-Z]{3}-\d{4,}\b/) ?? [""])[0];
  expect(savedCode, "kode item otomatis harus terbaca").not.toBe("");

  await expect.poll(async () => (await auditRows(savedCode)).length, { timeout: 30_000 }).toBeGreaterThan(0);
  const inserted = await auditRows(savedCode);
  expect(inserted.some((r) => r.action === "INSERT")).toBe(true);
  expect(String(inserted.find((r) => r.action === "INSERT")?.actor_email)).toBe("dnicorp.id@gmail.com");

  // 2. ubah nama item → tercatat UPDATE + daftar kolom yang berubah
  const row = page.getByRole("row").filter({ hasText: savedCode }).first();
  await row.getByRole("button", { name: /^Edit$/ }).click();
  const editDialog = page.getByRole("dialog");
  await expect(editDialog).toBeVisible({ timeout: 30_000 });
  await editDialog.locator('input[type="text"]').nth(1).fill(`Item audit ${itemCode} (diubah)`);
  await editDialog.getByRole("button", { name: /^(Save|Simpan)$/ }).first().click();
  await expect(editDialog).toBeHidden({ timeout: 30_000 });

  await expect
    .poll(async () => (await auditRows(savedCode)).some((r) => r.action === "UPDATE"), { timeout: 30_000 })
    .toBe(true);
  const updated = (await auditRows(savedCode)).find((r) => r.action === "UPDATE");
  expect(String(updated?.changed_fields)).toContain("name");

  // 3. tab Audit Trail di halaman Settings
  await page.goto(`/app/w/${ws}/settings`);
  await page.getByTestId("settings-tab-audit").click();
  await expect(page.getByTestId("audit-trail-view")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("audit-search").fill(savedCode);
  // baris pertama adalah perubahan terbaru (UPDATE) → cari baris "Created" untuk detail.
  const auditRow = page
    .getByRole("row")
    .filter({ hasText: savedCode })
    .filter({ hasText: /Created|Dibuat/ })
    .first();
  await expect(auditRow).toBeVisible({ timeout: 30_000 });

  // dialog detail memuat kolom sebelum/sesudah
  await auditRow.click();
  const detail = page.getByRole("dialog");
  await expect(detail).toBeVisible({ timeout: 30_000 });
  await expect(detail).toContainText(/Field|Kolom/);
  await expect(detail).toContainText(/Before|Sebelum/);
  await expect(detail).toContainText(/After|Sesudah/);
  await page.keyboard.press("Escape");

  // 4. bersihkan (item uji + baris auditnya)
  await cleanup();
  await expect
    .poll(async () => (await conn.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS c FROM md_items WHERE workspace_id = ? AND code = ?",
      [ws, savedCode],
    ))[0][0].c, { timeout: 30_000 })
    .toBe(0);
});
