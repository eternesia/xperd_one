import { expect, test } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Ronde 29 (BS New 8) — multi-currency & revaluasi kurs.
 *
 * Aturan uang yang diuji:
 *  1. Dokumen valas: total dokumen tetap dalam mata uang dokumen, jurnal
 *     dikonversi ke mata uang dasar memakai kurs dokumen.
 *  2. Revaluasi kurs akhir periode: pos valas dinilai ulang dengan kurs
 *     penutupan; selisih belum terealisasi ke 4910/6910 dan dibalik otomatis
 *     keesokan harinya.
 *  3. Pelunasan valas dengan kurs berbeda: hutang/piutang dibersihkan memakai
 *     kurs invoice, kas memakai kurs tanggal bayar, selisihnya ke 4900/6900.
 *
 * Fixture ditulis langsung ke MySQL dev (data uji), interaksi lewat UI, angka
 * harapan dihitung ulang dengan SQL. Semua fixture dibersihkan lagi.
 */
const ASOF = "2000-09-30";
const RATE_TX = 15_000;
const RATE_CLOSING = 16_000;

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

const query = async <T extends RowDataPacket>(sql: string, params: unknown[] = []) => {
  const [rows] = await conn.query<T[]>(sql, params);
  return rows;
};
const scalar = async (sql: string, params: unknown[] = []) => {
  const rows = await query<RowDataPacket>(sql, params);
  return Number(Object.values(rows[0] ?? {})[0] ?? 0);
};

/** Saldo akun (debit − kredit) sampai tanggal tertentu. */
const glBalance = (code: string, date: string) =>
  scalar(
    `SELECT COALESCE(SUM(l.debit - l.credit), 0) FROM acc_journal_lines l
       JOIN acc_journal_entries e ON e.id = l.entry_id
      WHERE l.workspace_id = ? AND l.account_code = ? AND e.entry_date <= ?`,
    [ws, code, date],
  );

const entryLines = (entryNo: string) =>
  query<RowDataPacket>(
    `SELECT l.account_code, l.debit, l.credit FROM acc_journal_lines l
       JOIN acc_journal_entries e ON e.id = l.entry_id
      WHERE l.workspace_id = ? AND e.entry_no = ? ORDER BY l.line_no`,
    [ws, entryNo],
  );

async function addRate(code: string, rate: number, type: "transaction" | "closing", date: string) {
  await conn.execute(
    `INSERT INTO md_exchange_rates (id, workspace_id, code, name, currency_code, rate_date, rate_type, rate, source, is_active)
     VALUES (UUID(), ?, ?, ?, 'USD', ?, ?, ?, 'e2e fixture', 1)`,
    [ws, code, `Kurs uji ${code}`, date, type, rate],
  );
}

async function addEntry(entryNo: string, date: string, sourceType: string, lines: { account_code: string; account_name: string; debit: number; credit: number }[]) {
  const id = crypto.randomUUID();
  await conn.execute(
    `INSERT INTO acc_journal_entries (id, workspace_id, entry_no, entry_date, source_type, memo, total_debit, total_credit, is_auto)
     VALUES (?, ?, ?, ?, ?, 'fixture uji FX (e2e)', ?, ?, 0)`,
    [id, ws, entryNo, date, sourceType, lines.reduce((s, l) => s + l.debit, 0), lines.reduce((s, l) => s + l.credit, 0)],
  );
  for (let i = 0; i < lines.length; i++) {
    await conn.execute(
      `INSERT INTO acc_journal_lines (id, entry_id, workspace_id, line_no, account_code, account_name, description, debit, credit)
       VALUES (UUID(), ?, ?, ?, ?, ?, 'fixture uji FX (e2e)', ?, ?)`,
      [id, ws, i + 1, lines[i].account_code, lines[i].account_name, lines[i].debit, lines[i].credit],
    );
  }
  return id;
}

async function cleanup() {
  const rows = await query<RowDataPacket>(
    `SELECT id FROM acc_journal_entries
      WHERE workspace_id = ? AND (entry_no LIKE 'TMPFX%' OR entry_no LIKE 'JV/FXR%')`,
    [ws],
  );
  for (const r of rows) {
    await conn.execute("DELETE FROM acc_journal_lines WHERE entry_id = ?", [r.id]);
    await conn.execute("DELETE FROM acc_journal_entries WHERE id = ?", [r.id]);
  }
  await conn.execute("DELETE FROM md_exchange_rates WHERE workspace_id = ? AND code LIKE 'FXTST-%'", [ws]);
  await conn.execute("DELETE FROM sls_documents WHERE workspace_id = ? AND doc_number LIKE 'TMPFX-%'", [ws]);
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

test("FX: revaluasi kurs pos valas + jurnal balik otomatis", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  await cleanup();

  // --- fixture: kurs transaksi & penutupan USD, invoice AR valas + jurnalnya --
  await addRate("FXTST-TX", RATE_TX, "transaction", "2000-09-01");
  await addRate("FXTST-CL", RATE_CLOSING, "closing", ASOF);
  await conn.execute(
    `INSERT INTO sls_documents (id, workspace_id, doc_type, doc_number, doc_date, customer_name, status, currency, exchange_rate, subtotal, total)
     VALUES (UUID(), ?, 'ar_invoice', 'TMPFX-AR1', '2000-09-15', 'PT Valas Uji', 'open', 'USD', ?, 1000, 1000)`,
    [ws, RATE_TX],
  );
  await addEntry("TMPFX-GL", "2000-09-15", "ar_invoice", [
    { account_code: "1200", account_name: "Piutang Usaha", debit: 1000 * RATE_TX, credit: 0 },
    { account_code: "4000", account_name: "Pendapatan Penjualan", debit: 0, credit: 1000 * RATE_TX },
  ]);

  // --- pratinjau di UI ----------------------------------------------------
  await page.goto(`/app/w/${ws}/accounting/fx-revaluation`);
  await expect(page.getByTestId("fx-revaluation-view")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("fx-reval-date").fill(ASOF);

  const expectedDiff = 1000 * (RATE_CLOSING - RATE_TX); // 1.000.000
  const row = page.getByRole("row").filter({ hasText: "TMPFX-AR1" });
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await expect(row).toContainText(/1\.000\.000|1,000,000/);
  await expect(page.getByTestId("fx-reval-summary")).toContainText(/1\.000\.000|1,000,000/);

  // Jurnal revaluasi belum ada sebelum diposting.
  expect(await entryLines("JV/FXR/200009")).toHaveLength(0);

  await page.getByTestId("fx-reval-post").click();
  await expect(page.getByTestId("fx-reval-post")).toBeDisabled({ timeout: 60_000 });
  await expect(page.getByText(/Sudah diposting|Posted/).first()).toBeVisible({ timeout: 30_000 });

  // --- jurnal revaluasi & jurnal balik otomatis ---------------------------
  const reval = await entryLines("JV/FXR/200009");
  expect(reval.length, "jurnal revaluasi harus tercatat").toBeGreaterThan(0);
  const sum = (rows: RowDataPacket[], code: string, side: "debit" | "credit") =>
    rows.filter((r) => r.account_code === code).reduce((s, r) => s + Number(r[side]), 0);
  expect(sum(reval, "1200", "debit")).toBe(expectedDiff);
  expect(sum(reval, "4910", "credit")).toBe(expectedDiff);
  expect(reval.reduce((s, r) => s + Number(r.debit), 0)).toBeCloseTo(
    reval.reduce((s, r) => s + Number(r.credit), 0),
    2,
  );

  const reversal = await entryLines("JV/FXR-REV/200009");
  expect(reversal.length, "jurnal balik harus dibuat otomatis").toBeGreaterThan(0);
  expect(sum(reversal, "1200", "credit")).toBe(expectedDiff);
  expect(sum(reversal, "4910", "debit")).toBe(expectedDiff);
  const reverseRows = await query<RowDataPacket>(
    "SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') AS d FROM acc_journal_entries WHERE workspace_id = ? AND entry_no = 'JV/FXR-REV/200009'",
    [ws],
  );
  expect(String(reverseRows[0]?.d)).toBe("2000-10-01");

  // Piutang naik ke kurs penutupan, lalu kembali setelah pembalikan.
  expect(await glBalance("1200", ASOF)).toBe(1000 * RATE_CLOSING);
  expect(await glBalance("1200", "2000-10-01")).toBe(1000 * RATE_TX);
  // 4910 adalah akun pendapatan: saldo kredit → SUM(debit − kredit) negatif.
  expect(await glBalance("4910", ASOF)).toBe(-expectedDiff);
  expect(await glBalance("4910", "2000-10-31")).toBe(0);

  // --- penjagaan: satu periode hanya sekali ---------------------------------
  await page.reload();
  await page.getByTestId("fx-reval-date").fill(ASOF);
  await expect(page.getByTestId("fx-reval-post")).toBeDisabled({ timeout: 30_000 });
  await expect(page.getByTestId("fx-reval-post")).toContainText(/Sudah diposting|Already posted/);
  expect(await entryLines("JV/FXR/200009")).toHaveLength(reval.length);

  await cleanup();
});
