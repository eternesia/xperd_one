import { expect, test } from "@playwright/test";

import crypto from "node:crypto";
import fs from "node:fs";
import mysql from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

function dbConfig() {
  const out: Record<string, string> = {};
  try {
    for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* .env opsional */
  }
  return {
    host: process.env.MYSQL_HOST ?? out.MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.MYSQL_PORT ?? out.MYSQL_PORT ?? 3307),
    user: process.env.MYSQL_USER ?? out.MYSQL_USER ?? "xperd",
    password: process.env.MYSQL_PASSWORD ?? out.MYSQL_PASSWORD ?? "xperd",
    database: process.env.MYSQL_DATABASE ?? out.MYSQL_DATABASE ?? "xperd",
  };
}

/**
 * #63 (BS New 3): Omnix — biaya per transaksi dipotong DI LEVEL APLIKASI di
 * dalam satu transaksi MySQL (tanpa trigger database). Spec ini memastikan:
 *  1. menyelesaikan pesanan memotong saldo sebesar biaya Omnix & menulis ledger;
 *  2. (BS New 11) biaya tercatat di wallet bersama (`wallet_ledger`, jenis `usage`);
 *     alur top-up/persetujuan kini di `e2e/wallet.spec.ts`.
 */
const ORDER_NO = `E2E-OMX-${Date.now().toString().slice(-6)}`;
const FEE = 25;

function money(text: string): number {
  return Number(text.replace(/[^\d]/g, "") || 0);
}

test("OMNIX: completing an order charges the wallet and top up needs approval", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await login(page);
  const ws = await resolveWorkspaceId(page);

  /* ---------- 1. saldo awal ---------- */
  await page.goto(`/app/w/${ws}/omnix/wallet`);
  const balance = page.getByTestId("omnix-balance").first();
  await expect(balance).toBeVisible({ timeout: 60_000 });
  const startBalance = money(await balance.innerText());

  /* ---------- 2. buat pesanan lalu selesaikan (biaya dipotong) ---------- */
  // New 11: pesanan baru butuh toko terhubung → tanpa toko tombol nonaktif & halaman Toko menampilkan keadaan kosong.
  const conn = await mysql.createConnection(dbConfig());
  const storeId = crypto.randomUUID();
  const hadStores =
    Number(
      (
        (await conn.query("SELECT COUNT(*) n FROM omnix_stores WHERE workspace_id = ?", [
          ws,
        ])) as any
      )[0][0].n,
    ) > 0;
  if (!hadStores) {
    await page.goto(`/app/w/${ws}/omnix/stores`);
    await expect(page.getByText("No stores yet.")).toBeVisible({ timeout: 60_000 });
    await page.goto(`/app/w/${ws}/omnix/orders`);
    await expect(page.getByRole("button", { name: /New order/ })).toBeDisabled({ timeout: 60_000 });
    await conn.execute(
      "INSERT INTO omnix_stores (id, workspace_id, channel, store_name, shop_ref, status) VALUES (?, ?, 'shopee', 'E2E Store', 'e2e-shop', 'connected')",
      [storeId, ws],
    );
  }
  await page.goto(`/app/w/${ws}/omnix/orders`);
  const createButton = page.getByRole("button", { name: /New order|Pesanan baru|Tambah pesanan/ });
  await expect(createButton).toBeVisible({ timeout: 60_000 });
  await expect(createButton).toBeEnabled({ timeout: 30_000 });

  const existing = page.getByRole("row").filter({ hasText: ORDER_NO }).first();
  if (!(await existing.isVisible().catch(() => false))) {
    await createButton.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.locator("select").first().selectOption({ index: 1 });
    await dialog.getByTestId("omnix-order-no").fill(ORDER_NO);
    await dialog.getByTestId("omnix-order-buyer").fill("Pembeli e2e");
    await dialog.getByTestId("omnix-order-gross").fill("100000");
    await dialog.getByTestId("omnix-order-fee").fill("5000");
    await dialog.getByRole("button", { name: /Simpan|Save/ }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });
  }

  const row = page.getByRole("row").filter({ hasText: ORDER_NO }).first();
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.getByRole("combobox").selectOption("completed");
  await expect(page.getByText(new RegExp(`Rp${FEE}\\b|charged|dipotong`, "i")).first()).toBeVisible(
    {
      timeout: 60_000,
    },
  );
  // Pesanan tertagih: status menjadi lencana (tanpa pilihan status lagi) dan kolom fee menampilkan biaya Omnix.
  await expect(row.getByRole("combobox")).toHaveCount(0);
  await expect(row).toContainText("completed");
  await expect(row).toContainText(`${FEE}`);

  /* ---------- 3. saldo berkurang & wallet bersama mencatat entri `usage` ---------- */
  await page.goto(`/app/w/${ws}/omnix/wallet`);
  await expect
    .poll(async () => money(await balance.innerText()), { timeout: 60_000 })
    .toBe(startBalance - FEE);
  await page.getByRole("tab", { name: "Balance history" }).click();
  const usageRow = page.getByRole("row").filter({ hasText: `Transaksi selesai: ${ORDER_NO}` });
  await expect(usageRow).toBeVisible({ timeout: 60_000 });
  await expect(usageRow).toContainText("usage");
  await expect(usageRow).toContainText("omnix");
  // Top-up Omnix kini memakai panel wallet bersama (spec: `wallet.spec.ts`); tombolnya ada di panel, bukan form lama.
  await expect(page.getByRole("button", { name: "Top up", exact: true })).toBeVisible();
  await expect(page.getByTestId("omnix-topup-amount")).toHaveCount(0);

  // bersihkan data uji (pesanan & toko buatan spec ini)
  await conn.execute("DELETE FROM omnix_orders WHERE workspace_id = ? AND order_no = ?", [
    ws,
    ORDER_NO,
  ]);
  if (!hadStores) await conn.execute("DELETE FROM omnix_stores WHERE id = ?", [storeId]);
  await conn.end();
});
