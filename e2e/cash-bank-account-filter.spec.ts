import { expect, test } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Cash & Bank — filter akun disamakan dengan BS New 11 (`matchesCbAccount`, Ronde 41):
 * hanya **transfer** yang memengaruhi akun lawan. Baris Cash In/Out lama yang masih menyimpan
 * `counterpart_account_code` basi tidak boleh bocor ke buku mutasi akun lain.
 * Fixture SQL (dihapus lagi): Cash Out di CASH dengan lawan basi BANK + Transfer CASH→BANK.
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

async function cleanup() {
  if (ws)
    await conn.execute(
      "DELETE FROM cb_transactions WHERE workspace_id = ? AND trx_no LIKE 'E2E-CBF-%'",
      [ws],
    );
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

test("CASH-BANK: buku mutasi hanya memuat transfer untuk akun lawan (bukan Cash Out basi)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  await cleanup();

  await conn.execute(
    `INSERT INTO cb_transactions (id, workspace_id, trx_no, trx_type, trx_date, account_code, counterpart_account_code, amount, memo)
     VALUES (UUID(), ?, 'E2E-CBF-OUT-1', 'out', CURDATE(), 'CASH', 'BANK', 12345, 'Cash out dengan lawan basi'),
            (UUID(), ?, 'E2E-CBF-TRF-1', 'transfer', CURDATE(), 'CASH', 'BANK', 5000, 'Transfer CASH ke BANK')`,
    [ws, ws],
  );

  await page.goto(`/app/w/${ws}/cash-bank/accounts`);
  await expect(page.getByRole("columnheader", { name: "Balance", exact: true })).toBeVisible({
    timeout: 60_000,
  });
  const statement = async (accountName: string) => {
    await page
      .getByRole("row")
      .filter({ hasText: accountName })
      .getByRole("button", { name: /Account statement|Buku mutasi/ })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Account statement|Buku mutasi/).first()).toBeVisible({
      timeout: 30_000,
    });
    return dialog;
  };

  // BANK: transfer masuk ya, Cash Out basi tidak
  let dialog = await statement("Bank Operasional");
  await expect(dialog.getByText("E2E-CBF-TRF-1")).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText("E2E-CBF-OUT-1")).toHaveCount(0);
  await dialog
    .getByRole("button", { name: /^(Close|Tutup)$/ })
    .first()
    .click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  // CASH: keduanya milik akun ini
  dialog = await statement("Kas Kecil");
  await expect(dialog.getByText("E2E-CBF-TRF-1")).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText("E2E-CBF-OUT-1")).toBeVisible();
});
