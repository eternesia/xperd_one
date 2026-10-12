import { expect, test } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Ronde 35 — **Rekonsiliasi Bank** (`cash-bank/reconciliation`): centang “OK”
 * harus benar-benar tersimpan **dan** tabelnya ikut berubah.
 *
 * Bug yang dijaga spec ini: `toggle` dulu hanya meng-invalidate query key
 * `["cb-trx"]`, sedangkan tabel membaca `["cb-trx-recon", …]`. Invalidasi
 * ber-prefix tidak menjangkau key lain, jadi centang tersimpan di DB tetapi
 * tabel tidak pernah refetch — dari sisi user terlihat “Approve/centang tidak
 * berjalan”. Rujukan BS New 10 meng-invalidate keduanya.
 *
 * Fixture transaksi uji dibuat lewat SQL lalu dihapus lagi (spec idempoten).
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

const TRX_NO = `TMPRECON/${Date.now()}`;
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

test("CASH-BANK: centang rekonsiliasi tersimpan dan tampilan ikut berubah", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  await cleanup();

  // Akun kas/bank dengan mapping GL (guard aplikasi menolak akun tanpa mapping).
  const [acct] = await conn.query<RowDataPacket[]>(
    "SELECT code, name, gl_account_code FROM cb_accounts WHERE workspace_id = ? AND gl_account_code IS NOT NULL ORDER BY code LIMIT 1",
    [ws],
  );
  expect(acct.length, "butuh satu akun kas/bank dengan mapping GL").toBeGreaterThan(0);

  await conn.execute(
    `INSERT INTO cb_transactions (id, workspace_id, trx_no, trx_date, trx_type, account_code, account_name,
       method, memo, amount, is_reconciled)
     VALUES (UUID(), ?, ?, CURDATE(), 'in', ?, ?, 'cash', 'e2e rekonsiliasi', 123456, 0)`,
    [ws, TRX_NO, String(acct[0].code), String(acct[0].name)],
  );

  await page.goto(`/app/w/${ws}/cash-bank/reconciliation`);
  await expect(page.getByRole("heading", { name: /Bank Reconciliation|Rekonsiliasi Bank/ })).toBeVisible({
    timeout: 60_000,
  });

  const box = page.getByRole("checkbox", { name: new RegExp(TRX_NO.replace(/[/]/g, "\\/")) });
  await expect(box).toBeVisible({ timeout: 30_000 });
  await expect(box).not.toBeChecked();

  // --- centang: DB berubah DAN kotak centang di UI ikut tercentang -------------
  await box.click();
  await expect(box).toBeChecked({ timeout: 30_000 });
  await expect
    .poll(
      async () => {
        const [rows] = await conn.query<RowDataPacket[]>(
          "SELECT is_reconciled, reconciled_at FROM cb_transactions WHERE workspace_id = ? AND trx_no = ?",
          [ws, TRX_NO],
        );
        return `${rows[0]?.is_reconciled}|${rows[0]?.reconciled_at ? "set" : "null"}`;
      },
      { timeout: 30_000 },
    )
    .toBe("1|set");

  // statistik “Open items” memakai query yang sama → ikut menyusut setelah refetch
  await expect(page.getByText(/Reconciled movement|Mutasi terekonsiliasi/)).toBeVisible();

  // --- batal centang: kembali 0 & UI ikut berubah ------------------------------
  await box.click();
  await expect(box).not.toBeChecked({ timeout: 30_000 });
  await expect
    .poll(
      async () => {
        const [rows] = await conn.query<RowDataPacket[]>(
          "SELECT is_reconciled, reconciled_at FROM cb_transactions WHERE workspace_id = ? AND trx_no = ?",
          [ws, TRX_NO],
        );
        return `${rows[0]?.is_reconciled}|${rows[0]?.reconciled_at ? "set" : "null"}`;
      },
      { timeout: 30_000 },
    )
    .toBe("0|null");

  await cleanup();
});
