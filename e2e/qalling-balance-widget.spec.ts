import { expect, test } from "@playwright/test";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/** Topbar Qalling: widget saldo (angka = SQL `wallet_accounts`) + tombol Top up menuju tab Saldo (paritas live). */
const DB = {
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? 3307),
  user: process.env.MYSQL_USER ?? "xperd",
  password: process.env.MYSQL_PASSWORD ?? "xperd",
  database: process.env.MYSQL_DATABASE ?? "xperd",
};

test("QALLING topbar: widget saldo = SQL dan tombol Top up", async ({ page }) => {
  test.setTimeout(120_000);
  const conn = await mysql.createConnection(DB);
  try {
    await login(page);
    const ws = await resolveWorkspaceId(page);
    const [w] = (await conn.query<RowDataPacket[]>("SELECT tenant_id FROM workspaces WHERE id = ?", [ws]))[0];
    const [acc] = (await conn.query<RowDataPacket[]>("SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?", [w.tenant_id]))[0];
    const expected = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
      Number(acc?.balance_idr ?? 0),
    );
    await page.goto("/qalling/app");
    const widget = page.getByTestId("qalling-balance");
    await expect(widget).toBeVisible({ timeout: 60_000 });
    await expect(widget).toContainText(expected.replace(/\s/g, " "));
    await widget.getByRole("link", { name: "Top up" }).click();
    await expect(page).toHaveURL(/\/qalling\/app\/billing\?tab=saldo/);
  } finally {
    await conn.end();
  }
});
