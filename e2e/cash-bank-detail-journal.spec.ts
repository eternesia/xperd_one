import { expect, test } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Ronde 35 — dialog detail transaksi kas/bank (`cash-in` / `cash-out` /
 * `transfers`) harus memakai **blok jurnal berbingkai** seperti referensi:
 * judul “Journal posting” di dalam kotak `rounded-xl border`, plus catatan
 * praktik terbaik. Sebelumnya jurnal dirender polos tanpa bingkai sehingga
 * tampak “grid jurnalnya belum ada gayanya”.
 *
 * Fixture transaksi dibuat lewat SQL lalu dihapus lagi (spec idempoten).
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

const TRX_NO = `TMPCBJ/${Date.now()}`;
let conn: Connection;
let ws = "";

async function cleanup() {
  if (!conn || !ws) return;
  await conn.execute("DELETE FROM cb_transactions WHERE workspace_id = ? AND trx_no = ?", [ws, TRX_NO]);
}

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
});

test.afterAll(async () => {
  if (conn) {
    await cleanup();
    await conn.end();
  }
});

test("CASH-BANK: dialog detail menampilkan blok jurnal berbingkai", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  await cleanup();

  const [acct] = await conn.query<RowDataPacket[]>(
    "SELECT code, name FROM cb_accounts WHERE workspace_id = ? ORDER BY (gl_account_code IS NULL), code LIMIT 1",
    [ws],
  );
  expect(acct.length, "butuh satu akun kas/bank").toBeGreaterThan(0);

  await conn.execute(
    `INSERT INTO cb_transactions (id, workspace_id, trx_no, trx_date, trx_type, account_code, account_name,
       method, memo, amount, is_reconciled, journal_entry_id)
     VALUES (UUID(), ?, ?, CURDATE(), 'in', ?, ?, 'cash', 'e2e detail jurnal', 654321, 0, NULL)`,
    [ws, TRX_NO, String(acct[0].code), String(acct[0].name)],
  );

  await page.goto(`/app/w/${ws}/cash-bank/cash-in`);
  const row = page.getByRole("row").filter({ hasText: TRX_NO });
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.locator("button").first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });

  // judul blok jurnal (label yang sama dengan live)
  const box = dialog.locator("div.rounded-xl.border").filter({ hasText: /Journal posting|Jurnal terposting/ });
  await expect(box).toBeVisible({ timeout: 30_000 });
  // catatan praktik terbaik yang juga ada di live
  await expect(dialog.getByText(/Best practice|Praktik terbaik/)).toBeVisible();

  await cleanup();
});
