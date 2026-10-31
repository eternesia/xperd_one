import { expect, test } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Billing → tombol "PDF" per tagihan (BS New 12): mengunduh PDF sungguhan (header %PDF) bernama dari nomor tagihan,
 * untuk tagihan milik tenant workspace. Baris tagihan uji dibuat lewat SQL dan dihapus di akhir.
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
  dateStrings: true,
  timezone: "Z",
};
const NO = `E2E-PDF-${Date.now().toString().slice(-6)}`;
let conn: Connection;
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
});
test.afterAll(async () => {
  await conn?.execute("DELETE FROM invoices WHERE invoice_number = ?", [NO]);
  await conn?.end();
});

test("BILLING: tombol PDF mengunduh tagihan sebagai berkas PDF", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);
  const [w] = await q("SELECT tenant_id FROM workspaces WHERE id = ?", [ws]);
  await conn.execute(
    "INSERT INTO invoices (id, invoice_number, tenant_id, status, issue_date, due_date, total) VALUES (UUID(), ?, ?, 'sent', CURDATE(), CURDATE(), 123000)",
    [NO, w.tenant_id],
  );
  await page.goto(`/app/w/${ws}/billing`);
  await page.getByRole("tab", { name: /^(Invoices|Tagihan)$/ }).click();
  const row = page.getByRole("row").filter({ hasText: NO });
  await expect(row).toBeVisible({ timeout: 60_000 });
  const [dl] = await Promise.all([page.waitForEvent("download"), row.getByRole("button", { name: /Download PDF|Unduh PDF/ }).click()]);
  expect(dl.suggestedFilename()).toContain(NO);
  expect(dl.suggestedFilename()).toMatch(/\.pdf$/);
  const buf = fs.readFileSync((await dl.path())!);
  expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  expect(buf.length).toBeGreaterThan(1500);
});
