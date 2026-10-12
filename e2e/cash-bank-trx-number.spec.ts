import { expect, test, type Locator } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Ronde 30 (parity BS New 10) — nomor transaksi kas/bank tidak boleh dipakai ulang.
 *
 * BS New 10 mengganti cara penomoran: dari menghitung **jumlah baris** menjadi
 * mengambil **nomor tertinggi** pada bulan berjalan lalu +1. Cara lama salah
 * karena (a) jurnal koreksi/storno memakai `trx_type` yang sama sehingga
 * menambah hitungan, dan (b) menghapus satu baris membuat nomor berikutnya
 * dipakai ulang sehingga bentrok dengan nomor yang masih ada.
 *
 * Spec ini: buat 3 transaksi kas masuk → hapus yang tengah → buat 1 lagi →
 * nomor baru wajib = nomor tertinggi + 1 dan tidak ada nomor ganda.
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

const ym = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const ciNumbers = async () => {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT trx_no FROM cb_transactions WHERE workspace_id = ? AND trx_no LIKE ? ORDER BY trx_no",
    [ws, `CI/${ym()}/%`],
  );
  return rows.map((r) => String(r.trx_no));
};

/** Hapus transaksi kas masuk uji + jurnalnya (fixture uji). */
async function cleanupTestRows(keep: string[]) {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT id, trx_no, journal_entry_id FROM cb_transactions WHERE workspace_id = ? AND trx_no LIKE ?",
    [ws, `CI/${ym()}/%`],
  );
  for (const r of rows) {
    if (keep.includes(String(r.trx_no))) continue;
    if (r.journal_entry_id) {
      await conn.execute("DELETE FROM acc_journal_lines WHERE entry_id = ?", [r.journal_entry_id]);
      await conn.execute("DELETE FROM acc_journal_entries WHERE id = ?", [r.journal_entry_id]);
    }
    await conn.execute("DELETE FROM cb_transactions WHERE id = ?", [r.id]);
  }
}

async function waitHidden(locator: Locator) {
  await expect(locator).toBeHidden({ timeout: 60_000 });
}

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
});

test.afterAll(async () => {
  if (conn) await conn.end();
});

test("CASH: nomor transaksi berikutnya memakai nomor tertinggi (tidak dipakai ulang)", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  ws = await resolveWorkspaceId(page);

  await page.goto(`/app/w/${ws}/cash-bank/cash-in`);
  await page.getByRole("button", { name: "Create New" }).first().waitFor({ timeout: 60_000 });
  const preExisting = await ciNumbers();

  const create = async (amount: string) => {
    await page.getByRole("button", { name: "Create New" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option").first().click();
    await dialog.locator('input[inputmode="decimal"]').fill(amount);
    await dialog.getByRole("button", { name: "Save" }).click();
    await waitHidden(dialog);
  };

  await create("111");
  await create("222");
  await create("333");
  const created = (await ciNumbers()).filter((n) => !preExisting.includes(n));
  expect(created.length, "tiga transaksi uji harus tercatat").toBe(3);

  // Hapus transaksi di tengah supaya ada celah nomor.
  const middle = created[1];
  const row = page.getByRole("row").filter({ hasText: middle }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.locator("button").last().click();
  const confirm = page.getByRole("dialog").filter({ hasText: /Cancel transaction|Batalkan transaksi/ });
  await expect(confirm).toBeVisible({ timeout: 20_000 });
  await confirm.getByRole("button", { name: /Cancel transaction|Batalkan transaksi/ }).click();
  await expect
    .poll(async () => (await ciNumbers()).includes(middle), { timeout: 30_000 })
    .toBe(false);

  const afterDelete = await ciNumbers();
  await create("444");
  const afterFourth = await ciNumbers();
  const newest = afterFourth.filter((n) => !afterDelete.includes(n));
  expect(newest.length, "satu transaksi baru").toBe(1);

  const seqOf = (n: string) => Number(n.split("/").pop());
  expect(seqOf(newest[0])).toBe(Math.max(...afterDelete.map(seqOf)) + 1);
  expect(new Set(afterFourth).size, "nomor transaksi tidak boleh ganda").toBe(afterFourth.length);

  await cleanupTestRows(preExisting);
  await expect.poll(async () => (await ciNumbers()).length, { timeout: 30_000 }).toBe(preExisting.length);
});
