import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Ronde 29 (BS New 8) — dokumen valas: konversi jurnal & selisih kurs realisasi.
 *
 *  1. AR Invoice USD kurs 15.000: total dokumen tetap 1.000 USD, tetapi jurnal
 *     dalam mata uang dasar → Dr 1200 15.000.000 / Cr 4000 15.000.000.
 *  2. Receipt USD kurs 15.500: piutang dibersihkan memakai kurs invoice
 *     (15.000.000), kas masuk memakai kurs tanggal bayar (15.500.000), dan
 *     selisih 500.000 masuk akun selisih kurs realisasi 4900 (laba).
 *
 * Fixture kurs master ditulis ke MySQL dev; dokumen dibuat lewat UI seperti user
 * biasa; pembersihan di akhir (dokumen + jurnal + kurs uji).
 */
const DOC_DATE = "2000-09-15";
const RCP_DATE = "2000-09-20";
const RATE_INVOICE = 15_000;
const RATE_PAYMENT = 15_500;
const USD_AMOUNT = 1_000;

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
const docNo = `TMPFX-AR-${Date.now().toString().slice(-6)}`;
const rcpNo = `TMPFX-RCP-${Date.now().toString().slice(-6)}`;

const entryLines = async (entryNo: string) => {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT l.account_code, l.debit, l.credit FROM acc_journal_lines l
       JOIN acc_journal_entries e ON e.id = l.entry_id
      WHERE l.workspace_id = ? AND e.entry_no = ? ORDER BY l.line_no`,
    [ws, entryNo],
  );
  return rows;
};
const sum = (rows: RowDataPacket[], code: string, side: "debit" | "credit") =>
  rows.filter((r) => r.account_code === code).reduce((s, r) => s + Number(r[side]), 0);

async function cleanup() {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT id FROM acc_journal_entries WHERE workspace_id = ? AND (entry_no LIKE '%TMPFX%' OR entry_no LIKE 'JV/FXR%')",
    [ws],
  );
  for (const r of rows) {
    await conn.execute("DELETE FROM acc_journal_lines WHERE entry_id = ?", [r.id]);
    await conn.execute("DELETE FROM acc_journal_entries WHERE id = ?", [r.id]);
  }
  await conn.execute("DELETE FROM sls_documents WHERE workspace_id = ? AND doc_number LIKE 'TMPFX%'", [ws]);
  await conn.execute("DELETE FROM md_exchange_rates WHERE workspace_id = ? AND code LIKE 'FXTST-%'", [ws]);
  await conn.execute("DELETE FROM md_items WHERE workspace_id = ? AND code = 'FXTST-SVC'", [ws]);
}

/**
 * Pilih opsi picker: tombol `role=combobox` difilter teks placeholder.
 *
 * `optionRe` opsional: kalau diberikan, pilih opsi yang **cocok teksnya**, bukan
 * opsi pertama. Ini penting untuk picker akun kas/bank — opsi pertama bisa saja
 * akun tanpa mapping GL (mis. akun uji manual), dan submit-nya ditolak guard
 * “Select a cash/bank account with a GL mapping first”.
 */
async function pick(
  page: Page,
  scope: ReturnType<Page["getByRole"]>,
  placeholderText: string,
  optionRe?: RegExp,
) {
  await scope
    .locator('[role="combobox"]')
    .filter({ hasText: new RegExp(placeholderText, "i") })
    .first()
    .click();
  const opts = page.locator('[role="option"]:visible');
  await opts.first().waitFor({ timeout: 20_000 });
  if (optionRe) {
    await opts.filter({ hasText: optionRe }).first().click();
    return;
  }
  await opts.first().click();
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

test("FX: dokumen valas → jurnal mata uang dasar + selisih kurs realisasi", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  await cleanup();

  // Faktur AR langsung dengan barang persediaan kini memposting stok/HPP (BS New 16) → uji ini memakai item JASA agar tidak butuh gudang/stok.
  await conn.execute(
    "INSERT INTO md_items (id, workspace_id, code, name, item_type, is_stocked, sell_price, is_active) VALUES (UUID(), ?, 'FXTST-SVC', 'FX Test Service', 'service', 0, 100, 1)",
    [ws],
  );
  await conn.execute(
    `INSERT INTO md_exchange_rates (id, workspace_id, code, name, currency_code, rate_date, rate_type, rate, source, is_active)
     VALUES (UUID(), ?, 'FXTST-DOC', 'Kurs uji dokumen (e2e)', 'USD', '2000-09-01', 'transaction', ?, 'e2e', 1)`,
    [ws, RATE_INVOICE],
  );

  // --- AR Invoice USD ------------------------------------------------------
  await page.goto(`/app/w/${ws}/sales/ar-invoices`);
  await page.getByRole("button", { name: "New" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });

  await dialog.locator('input[type="date"]').first().fill(DOC_DATE);
  await dialog.locator("input[placeholder]").first().fill(docNo);
  await pick(page, dialog, "Select customer");
  await dialog.getByTestId("doc-currency").selectOption("USD");
  // Kurs terisi otomatis dari Master Kurs (mata uang dasar per 1 USD).
  await expect(dialog.getByTestId("doc-exchange-rate")).toHaveValue(String(RATE_INVOICE), { timeout: 30_000 });
  await pick(page, dialog, "Search item", /FX Test Service/);

  const lineInputs = dialog.locator("table tbody tr").first().locator('input[type="number"]');
  await lineInputs.nth(0).fill("1");
  await lineInputs.nth(1).fill(String(USD_AMOUNT));
  if ((await lineInputs.count()) > 2) await lineInputs.nth(2).fill("0");
  await dialog.getByTestId("doc-exchange-rate").fill(String(RATE_INVOICE));
  await dialog.getByRole("button", { name: /^(Submit|Create|Save|Simpan)$/ }).last().click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const [docRows] = await conn.query<RowDataPacket[]>(
    "SELECT currency, exchange_rate, total FROM sls_documents WHERE workspace_id = ? AND doc_number = ?",
    [ws, docNo],
  );
  expect(Number(docRows[0]?.total)).toBeCloseTo(USD_AMOUNT, 2);
  expect(String(docRows[0]?.currency)).toBe("USD");
  expect(Number(docRows[0]?.exchange_rate)).toBeCloseTo(RATE_INVOICE, 2);

  const invLines = await entryLines(`JV/${docNo}`);
  expect(invLines.length, "jurnal AR invoice valas harus terbentuk").toBeGreaterThan(0);
  expect(sum(invLines, "1200", "debit")).toBe(USD_AMOUNT * RATE_INVOICE);
  expect(sum(invLines, "4000", "credit")).toBe(USD_AMOUNT * RATE_INVOICE);

  // --- Receipt dengan kurs berbeda (selisih kurs realisasi) ---------------
  await page.goto(`/app/w/${ws}/sales/receipts`);
  await page.getByRole("button", { name: "New" }).first().waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "New" }).click();
  const dlg2 = page.getByRole("dialog");
  await expect(dlg2).toBeVisible({ timeout: 30_000 });
  await dlg2.locator('input[type="date"]').first().fill(RCP_DATE);
  await dlg2.locator("input[placeholder]").first().fill(rcpNo);
  await dlg2.getByRole("combobox").first().click();
  await page.locator('[role="option"]:visible').filter({ hasText: docNo }).first().click();
  // Akun kas/bank yang **punya mapping GL** (bukan opsi pertama — opsi pertama
  // bisa akun tanpa mapping sehingga submit ditolak guard).
  await pick(page, dlg2, "Select cash / bank account", /Bank Operasional/i);
  await dlg2.getByTestId("doc-currency").selectOption("USD");
  // Tunggu kurs master terisi dulu (effect CurrencyFields), baru ditimpa manual
  // dengan kurs tanggal bayar — persis alur yang dilakukan user.
  await expect(dlg2.getByTestId("doc-exchange-rate")).toHaveValue(String(RATE_INVOICE), { timeout: 30_000 });
  await dlg2.getByTestId("doc-exchange-rate").fill(String(RATE_PAYMENT));
  await dlg2.getByRole("button", { name: /^(Submit|Create|Save|Simpan)$/ }).last().click();
  await expect(dlg2).toBeHidden({ timeout: 30_000 });

  const [rcpRows] = await conn.query<RowDataPacket[]>(
    "SELECT currency, exchange_rate FROM sls_documents WHERE workspace_id = ? AND doc_number = ?",
    [ws, rcpNo],
  );
  expect(Number(rcpRows[0]?.exchange_rate)).toBeCloseTo(RATE_PAYMENT, 2);

  const rcpLines = await entryLines(`JV/${rcpNo}`);
  expect(rcpLines.length, "jurnal receipt valas harus terbentuk").toBeGreaterThan(0);
  expect(rcpLines.reduce((s, l) => s + Number(l.debit), 0)).toBeCloseTo(
    rcpLines.reduce((s, l) => s + Number(l.credit), 0),
    2,
  );
  expect(sum(rcpLines, "1200", "credit")).toBe(USD_AMOUNT * RATE_INVOICE);
  expect(sum(rcpLines, "1010", "debit")).toBe(USD_AMOUNT * RATE_PAYMENT);
  const fxDiff = USD_AMOUNT * (RATE_PAYMENT - RATE_INVOICE);
  expect(sum(rcpLines, "4900", "credit")).toBe(fxDiff);

  await cleanup();
});
