import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Ronde 28 (parity BS New 8) — Tutup Buku PPN (SPT Masa PPN).
 *
 * Aturan uang yang diuji (semua di level aplikasi dalam satu transaksi MySQL,
 * tanpa trigger/stored function — BS New 8 no longer ships DB functions):
 *   Dr PPN Keluaran (2100)   sebesar PPN keluaran periode
 *   Kr PPN Masukan (1400)    sebesar PPN masukan periode
 *   Kr PPN Lebih Bayar (1410) sebesar lebih bayar yang dikompensasi
 *   selisih kurang bayar → Kr Hutang PPN (2110); lebih bayar → Dr 1410
 * Periode terkunci (soft/hard) menolak posting, dan satu periode hanya boleh
 * ditutup sekali.
 *
 * Fixture jurnal PPN dibuat langsung di MySQL dev (data uji), seluruh interaksi
 * lewat UI, dan nilai harapan dihitung ulang dengan SQL — bukan cermin dari kode
 * aplikasi. Semua fixture dibersihkan lagi di akhir test.
 */
const PERIODS = { payable: "2000-06", overpaid: "2000-07", carried: "2000-08", empty: "1997-01" };

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

const lastDay = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

let conn: Connection;
let ws = "";

const balanceUpTo = async (code: string, date: string) => {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(l.debit - l.credit), 0) AS b
       FROM acc_journal_lines l JOIN acc_journal_entries e ON e.id = l.entry_id
      WHERE l.workspace_id = ? AND l.account_code = ? AND e.entry_date <= ?`,
    [ws, code, date],
  );
  return Number(rows[0].b);
};

const vatBalances = async (date: string) => ({
  in: await balanceUpTo("1400", date),
  out: await balanceUpTo("2100", date),
  over: await balanceUpTo("1410", date),
  payable: await balanceUpTo("2110", date),
});

const closingLines = async (period: string) => {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT l.account_code, l.debit, l.credit FROM acc_journal_lines l
       JOIN acc_journal_entries e ON e.id = l.entry_id
      WHERE l.workspace_id = ? AND e.entry_no = ? ORDER BY l.line_no`,
    [ws, `JV/PPN-${period}`],
  );
  return rows as { account_code: string; debit: number; credit: number }[];
};

/** Harapan dihitung ulang dari SQL: perhitungan kedua, bukan dari kode app. */
const expectedClosing = async (period: string) => {
  const date = lastDay(period);
  const inBal = await balanceUpTo("1400", date);
  const outBal = await balanceUpTo("2100", date);
  const overBal = await balanceUpTo("1410", date);
  const vatIn = Math.max(0, inBal);
  const vatOut = Math.max(0, -outBal);
  const carried = Math.max(0, overBal);
  return { date, vatIn, vatOut, carried, net: vatOut - vatIn - carried };
};

async function postFixtureJournal(entryNo: string, date: string, lines: { account_code: string; account_name: string; debit: number; credit: number }[]) {
  const id = crypto.randomUUID();
  await conn.execute(
    `INSERT INTO acc_journal_entries (id, workspace_id, entry_no, entry_date, source_type, memo, total_debit, total_credit, is_auto)
     VALUES (?, ?, ?, ?, 'manual', 'fixture uji PPN (e2e)', ?, ?, 0)`,
    [id, ws, `TMPVAT/${entryNo}`, date, lines.reduce((s, l) => s + l.debit, 0), lines.reduce((s, l) => s + l.credit, 0)],
  );
  for (let i = 0; i < lines.length; i++) {
    await conn.execute(
      `INSERT INTO acc_journal_lines (id, entry_id, workspace_id, line_no, account_code, account_name, description, debit, credit)
       VALUES (?, ?, ?, ?, ?, ?, 'fixture uji PPN (e2e)', ?, ?)`,
      [crypto.randomUUID(), id, ws, i + 1, lines[i].account_code, lines[i].account_name, lines[i].debit, lines[i].credit],
    );
  }
}

async function cleanup() {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id FROM acc_journal_entries
      WHERE workspace_id = ? AND (entry_no LIKE 'TMPVAT/%' OR entry_no LIKE 'JV/PPN-2000-%')`,
    [ws],
  );
  for (const r of rows) {
    await conn.execute("DELETE FROM acc_journal_lines WHERE entry_id = ?", [r.id]);
    await conn.execute("DELETE FROM acc_journal_entries WHERE id = ?", [r.id]);
  }
  await conn.execute("DELETE FROM acc_period_locks WHERE workspace_id = ? AND period IN (?, ?, ?, ?)", [
    ws,
    PERIODS.payable,
    PERIODS.overpaid,
    PERIODS.carried,
    PERIODS.empty,
  ]);
}

const openVatPanel = async (page: Page, period: string) => {
  // Selalu muat ulang halaman: preview di-cache per (workspace, periode) oleh
  // react-query, jadi tanpa reload nilai lama (mis. nol) akan dipakai terus
  // setelah fixture jurnal ditambahkan.
  await page.goto(`/app/w/${ws}/accounting/period-closing`);
  await page.getByTestId("vat-closing-panel").waitFor({ timeout: 60_000 });
  await page.getByTestId("vat-closing-period").fill(period);
  // Kartu metrik hanya dirender setelah preview dari server tiba.
  await page.getByTestId("vat-closing-metrics").waitFor({ timeout: 30_000 });
};

/** Baca angka pada kartu metrik (tahan format ID/EN: hanya digit yang dihitung). */
const metricValue = async (page: Page, key: string) => {
  const txt = await page.getByTestId(`vat-closing-${key}`).innerText();
  return Number(String(txt).trim().split("\n").pop()!.replace(/[^\d]/g, ""));
};

/** Toast sonner yang memuat pesan tertentu (teks panel sering memuat kata serupa). */
const toastWith = (page: Page, re: RegExp) =>
  page.locator("[data-sonner-toast]").filter({ hasText: re }).first();

/** Tunggu jurnal tutup PPN muncul (posting lewat UI berjalan asinkron). */
async function waitClosing(period: string, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const rows = await closingLines(period);
    if (rows.length) return rows;
    if (Date.now() > until) return [];
    await new Promise((r) => setTimeout(r, 400));
  }
}

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB_CONFIG);
});

test.afterAll(async () => {
  if (conn) await conn.end();
});

test("Accounting: tutup PPN mengompensasi 2100/1400/1410 dan menutup periode sekali", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  await cleanup();

  // Tutup layar: jurnal tutup periode (laba ditahan) + tutup PPN + kunci periode.
  await openVatPanel(page, PERIODS.payable);
  await expect(page.getByTestId("vat-closing-panel")).toContainText(/VAT Closing \(SPT Masa PPN\)|Tutup Buku PPN/);
  await expect(page.getByTestId("period-lock-submit")).toBeVisible();

  // --- A. kurang bayar → Cr Hutang PPN (2110) -----------------------------
  await postFixtureJournal("A1", "2000-06-10", [
    { account_code: "1400", account_name: "PPN Masukan", debit: 1_100_000, credit: 0 },
    { account_code: "2000", account_name: "Hutang Usaha", debit: 0, credit: 1_100_000 },
  ]);
  await postFixtureJournal("A2", "2000-06-20", [
    { account_code: "2100", account_name: "PPN Keluaran", debit: 0, credit: 1_650_000 },
    { account_code: "1200", account_name: "Piutang Usaha", debit: 1_650_000, credit: 0 },
  ]);
  const expA = await expectedClosing(PERIODS.payable);
  const beforeA = await vatBalances(expA.date);
  await openVatPanel(page, PERIODS.payable);
  expect(expA).toMatchObject({ vatIn: 1_100_000, vatOut: 1_650_000, carried: 0, net: 550_000 });
  // Preview server bisa datang dari cache/refetch — tunggu nilainya, jangan jeda tetap.
  await expect.poll(() => metricValue(page, "net"), { timeout: 30_000 }).toBe(Math.abs(expA.net));
  expect(await metricValue(page, "vatIn")).toBe(expA.vatIn);
  expect(await metricValue(page, "vatOut")).toBe(expA.vatOut);
  expect(await metricValue(page, "carriedOverpaid")).toBe(0);
  await expect(page.getByTestId("vat-closing-net")).toContainText("2110");

  await page.getByTestId("vat-closing-post").click();
  const linesA = await waitClosing(PERIODS.payable);
  expect(linesA.length, "jurnal tutup PPN harus tercatat").toBeGreaterThan(0);
  const sumA = (code: string, side: "debit" | "credit") =>
    linesA.filter((l) => l.account_code === code).reduce((s, l) => s + Number(l[side]), 0);
  expect(sumA("2100", "debit")).toBe(expA.vatOut);
  expect(sumA("1400", "credit")).toBe(expA.vatIn);
  expect(sumA("2110", "credit")).toBe(expA.net);
  expect(linesA.reduce((s, l) => s + Number(l.debit), 0)).toBeCloseTo(
    linesA.reduce((s, l) => s + Number(l.credit), 0),
    2,
  );
  const afterA = await vatBalances(expA.date);
  expect(afterA.in - beforeA.in).toBe(-expA.vatIn);
  expect(afterA.out - beforeA.out).toBe(expA.vatOut);
  expect(afterA.payable - beforeA.payable).toBe(-expA.net);

  // Satu periode hanya boleh ditutup sekali.
  await expect(page.getByTestId("vat-closing-post")).toBeDisabled({ timeout: 30_000 });
  await expect(page.getByTestId("vat-closing-post")).toContainText(/Already closed|Sudah ditutup/);

  // --- B. lebih bayar → Dr PPN Lebih Bayar (1410) -------------------------
  await postFixtureJournal("B1", "2000-07-10", [
    { account_code: "1400", account_name: "PPN Masukan", debit: 2_000_000, credit: 0 },
    { account_code: "2000", account_name: "Hutang Usaha", debit: 0, credit: 2_000_000 },
  ]);
  await postFixtureJournal("B2", "2000-07-20", [
    { account_code: "2100", account_name: "PPN Keluaran", debit: 0, credit: 1_000_000 },
    { account_code: "1200", account_name: "Piutang Usaha", debit: 1_000_000, credit: 0 },
  ]);
  const expB = await expectedClosing(PERIODS.overpaid);
  const beforeB = await vatBalances(expB.date);
  await openVatPanel(page, PERIODS.overpaid);
  expect(expB).toMatchObject({ vatIn: 2_000_000, vatOut: 1_000_000, carried: 0, net: -1_000_000 });
  await expect.poll(() => metricValue(page, "net"), { timeout: 30_000 }).toBe(1_000_000);
  expect(await metricValue(page, "vatIn")).toBe(expB.vatIn);
  expect(await metricValue(page, "vatOut")).toBe(expB.vatOut);
  await expect(page.getByTestId("vat-closing-net")).toContainText("1410");

  await page.getByTestId("vat-closing-post").click();
  const linesB = await waitClosing(PERIODS.overpaid);
  expect(linesB.length, "jurnal tutup PPN lebih bayar").toBeGreaterThan(0);
  const sumB = (code: string, side: "debit" | "credit") =>
    linesB.filter((l) => l.account_code === code).reduce((s, l) => s + Number(l[side]), 0);
  expect(sumB("1410", "debit")).toBe(1_000_000);
  expect(sumB("2110", "credit")).toBe(0);
  const afterB = await vatBalances(expB.date);
  expect(afterB.over - beforeB.over).toBe(1_000_000);
  expect(afterB.in - beforeB.in).toBe(-expB.vatIn);
  expect(afterB.out - beforeB.out).toBe(expB.vatOut);

  // --- C. lebih bayar bulan lalu dikompensasi bulan ini -------------------
  await postFixtureJournal("C1", "2000-08-10", [
    { account_code: "1400", account_name: "PPN Masukan", debit: 200_000, credit: 0 },
    { account_code: "2000", account_name: "Hutang Usaha", debit: 0, credit: 200_000 },
  ]);
  await postFixtureJournal("C2", "2000-08-20", [
    { account_code: "2100", account_name: "PPN Keluaran", debit: 0, credit: 500_000 },
    { account_code: "1200", account_name: "Piutang Usaha", debit: 500_000, credit: 0 },
  ]);
  const expC = await expectedClosing(PERIODS.carried);
  const beforeC = await vatBalances(expC.date);
  await openVatPanel(page, PERIODS.carried);
  expect(expC).toMatchObject({ vatIn: 200_000, vatOut: 500_000, carried: 1_000_000, net: -700_000 });
  await expect.poll(() => metricValue(page, "carriedOverpaid"), { timeout: 30_000 }).toBe(1_000_000);
  expect(await metricValue(page, "net")).toBe(700_000);

  await page.getByTestId("vat-closing-post").click();
  const linesC = await waitClosing(PERIODS.carried);
  expect(linesC.length, "jurnal tutup PPN kompensasi").toBeGreaterThan(0);
  const sumC = (code: string, side: "debit" | "credit") =>
    linesC.filter((l) => l.account_code === code).reduce((s, l) => s + Number(l[side]), 0);
  expect(sumC("1410", "credit")).toBe(expC.carried);
  expect(sumC("1410", "debit")).toBe(700_000);
  const afterC = await vatBalances(expC.date);
  expect(afterC.over - beforeC.over).toBe(-expC.carried + 700_000);

  // --- D. periode tanpa saldo PPN ditolak --------------------------------
  await openVatPanel(page, PERIODS.empty);
  await expect(page.getByTestId("vat-closing-post")).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId("vat-closing-post").click();
  await expect(toastWith(page, /Tidak ada saldo PPN|No VAT balance/)).toBeVisible({ timeout: 30_000 });
  expect(await closingLines(PERIODS.empty)).toHaveLength(0);

  // --- E. periode terkunci (hard lock) menolak tutup PPN ------------------
  await page.getByTestId("period-lock-period").fill(PERIODS.empty);
  await page.getByTestId("period-lock-note").fill("uji e2e tutup PPN");
  await page.getByTestId("period-lock-submit").click();
  await expect(toastWith(page, /Period locked|Periode dikunci/)).toBeVisible({ timeout: 30_000 });
  await openVatPanel(page, PERIODS.empty);
  await expect(page.getByTestId("vat-closing-post")).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId("vat-closing-post").click();
  await expect(toastWith(page, /terkunci|locked \(hard lock\)/i)).toBeVisible({ timeout: 30_000 });
  expect(await closingLines(PERIODS.empty)).toHaveLength(0);

  // Buka lagi supaya tidak meninggalkan kunci periode.
  await page.getByTestId(`period-lock-remove-${PERIODS.empty}`).click();
  await expect(toastWith(page, /Period unlocked|Kunci periode dibuka/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId(`period-lock-remove-${PERIODS.empty}`)).toHaveCount(0, { timeout: 30_000 });

  await cleanup();
});
