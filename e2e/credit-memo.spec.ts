import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Nota Kredit Piutang/Hutang (BS New 16, Ronde 56): satu transaksi (nota + jurnal), jurnal seimbang sesuai akun, batas sisa faktur,
 * nomor unik, idempotensi `posting_key`, tanggal tidak boleh sebelum faktur, periode terkunci menolak, pembatalan = jurnal pembalik.
 * Semua angka dibandingkan dengan SQL; faktur & nota uji dibersihkan.
 */
const TAG = `E2ECM${Date.now().toString().slice(-6)}`;
const DB = {
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? 3307),
  user: process.env.MYSQL_USER ?? "xperd",
  password: process.env.MYSQL_PASSWORD ?? "xperd",
  database: process.env.MYSQL_DATABASE ?? "xperd",
  dateStrings: true,
};
let conn: mysql.Connection;
const q = async (sql: string, p: unknown[] = []) => (await conn.query<RowDataPacket[]>(sql, p))[0];
let ws = "";

test.afterAll(async () => {
  if (!conn) return;
  if (ws) {
    await conn.execute(
      "DELETE FROM acc_journal_lines WHERE entry_id IN (SELECT id FROM acc_journal_entries WHERE workspace_id = ? AND (entry_no LIKE ? OR source_doc_number LIKE ?))",
      [ws, `${TAG}%`, `${TAG}%`],
    );
    await conn.execute(
      "DELETE FROM acc_journal_entries WHERE workspace_id = ? AND (entry_no LIKE ? OR source_doc_number LIKE ?)",
      [ws, `${TAG}%`, `${TAG}%`],
    );
    await conn.execute("DELETE FROM acc_credit_memos WHERE workspace_id = ? AND memo_no LIKE ?", [
      ws,
      `${TAG}%`,
    ]);
    await conn.execute("DELETE FROM sls_documents WHERE workspace_id = ? AND doc_number LIKE ?", [
      ws,
      `${TAG}%`,
    ]);
    await conn.execute("DELETE FROM prc_documents WHERE workspace_id = ? AND doc_number LIKE ?", [
      ws,
      `${TAG}%`,
    ]);
    await conn.execute(
      "DELETE FROM acc_period_locks WHERE workspace_id = ? AND period = '2031-01'",
      [ws],
    );
  }
  await conn.end();
});

test("NOTA KREDIT: AR & AP — jurnal seimbang, batas sisa, idempotensi, periode, pembatalan", async ({
  page,
}) => {
  test.setTimeout(300_000);
  conn = await mysql.createConnection(DB);
  await login(page);
  ws = await resolveWorkspaceId(page);
  const arId = crypto.randomUUID();
  const apId = crypto.randomUUID();
  await conn.execute(
    "INSERT INTO sls_documents (id, workspace_id, doc_type, doc_number, doc_date, status, customer_name, currency, exchange_rate, subtotal, tax_amount, total) VALUES (?, ?, 'ar_invoice', ?, '2030-12-01', 'submitted', 'Pelanggan Uji', 'IDR', 1, 1000000, 110000, 1110000)",
    [arId, ws, `${TAG}-AR`],
  );
  await conn.execute(
    "INSERT INTO prc_documents (id, workspace_id, doc_type, doc_number, doc_date, status, supplier_name, currency, exchange_rate, subtotal, tax_amount, total) VALUES (?, ?, 'ap_invoice', ?, '2030-12-01', 'submitted', 'Pemasok Uji', 'IDR', 1, 2000000, 220000, 2220000)",
    [apId, ws, `${TAG}-AP`],
  );

  const call = (fn: string, data: unknown) =>
    page.evaluate(
      async ({ fn, data }) => {
        const m = await import("/src/lib/credit-memo.functions.ts");
        try {
          return { ok: true, v: await (m as any)[fn]({ data }) };
        } catch (e) {
          return { ok: false, error: (e as Error).message };
        }
      },
      { fn, data },
    ) as Promise<{ ok: boolean; v?: any; error?: string }>;
  const lines = async (memoNo: string) =>
    q(
      "SELECT l.account_code, l.debit, l.credit FROM acc_journal_lines l JOIN acc_journal_entries e ON e.id = l.entry_id WHERE e.workspace_id = ? AND e.entry_no = ? ORDER BY l.line_no",
      [ws, memoNo],
    );

  /* ---------- UI: Nota Kredit Piutang ---------- */
  await page.goto(`/app/w/${ws}/accounting/ar-credit-memo`);
  await expect(
    page.getByRole("heading", { name: /AR Credit Memo|Nota Kredit Piutang/ }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /New credit memo|Nota kredit baru/ }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("combobox").click();
  await page.getByRole("option", { name: new RegExp(`${TAG}-AR`) }).click();
  await expect(dlg.getByText(/Remaining creditable|Sisa yang bisa dikreditkan/)).toContainText(
    "1,110,000",
  );
  await dlg.locator("input").nth(0).fill(`${TAG}-CN1`);
  await dlg.locator('input[type="date"]').fill("2031-01-10");
  await dlg.locator('input[type="number"]').nth(0).fill("500000");
  await dlg.locator('input[type="number"]').nth(1).fill("55000");
  await dlg.locator("textarea").fill("Potongan harga uji");
  await dlg.getByRole("button", { name: /^(Post|Posting)$/ }).click();
  await expect(page.getByText(/Credit memo posted|Nota kredit diposting/).first()).toBeVisible({
    timeout: 30_000,
  });
  const [m1] = await q("SELECT * FROM acc_credit_memos WHERE workspace_id = ? AND memo_no = ?", [
    ws,
    `${TAG}-CN1`,
  ]);
  expect([Number(m1.net), Number(m1.vat), Number(m1.total), m1.status, m1.side]).toEqual([
    500000,
    55000,
    555000,
    "posted",
    "ar",
  ]);
  expect(
    (await lines(`${TAG}-CN1`)).map((l) => [l.account_code, Number(l.debit), Number(l.credit)]),
  ).toEqual([
    ["4100", 500000, 0],
    ["2100", 55000, 0],
    ["1200", 0, 555000],
  ]);
  await expect(page.getByRole("row").filter({ hasText: `${TAG}-CN1` })).toContainText("555,000");

  /* ---------- aturan server ---------- */
  const base = {
    workspaceId: ws,
    side: "ar",
    invoiceId: arId,
    date: "2031-01-11",
    vat: 0,
    reason: "uji",
  };
  const over = await call("postCreditMemo", {
    ...base,
    memoNo: `${TAG}-CN2`,
    net: 600000,
    key: crypto.randomUUID(),
  }); // sisa 555.000
  expect(over.error).toContain("exceeds invoice remaining");
  const early = await call("postCreditMemo", {
    ...base,
    memoNo: `${TAG}-CN3`,
    net: 1000,
    date: "2030-11-30",
    key: crypto.randomUUID(),
  });
  expect(early.error).toContain("before invoice");
  const dupNo = await call("postCreditMemo", {
    ...base,
    memoNo: `${TAG}-CN1`,
    net: 1000,
    key: crypto.randomUUID(),
  });
  expect(dupNo.error).toContain("sudah dipakai");
  const key = crypto.randomUUID();
  const a = await call("postCreditMemo", { ...base, memoNo: `${TAG}-CN4`, net: 100000, key });
  const b = await call("postCreditMemo", { ...base, memoNo: `${TAG}-CN4`, net: 100000, key });
  expect(a.ok && b.ok && a.v.id === b.v.id).toBe(true);
  expect(
    await q("SELECT 1 FROM acc_credit_memos WHERE workspace_id = ? AND memo_no = ?", [
      ws,
      `${TAG}-CN4`,
    ]),
  ).toHaveLength(1);
  expect(
    await q("SELECT 1 FROM acc_journal_entries WHERE workspace_id = ? AND entry_no = ?", [
      ws,
      `${TAG}-CN4`,
    ]),
  ).toHaveLength(1);
  // periode terkunci menolak
  await conn.execute(
    "INSERT INTO acc_period_locks (id, workspace_id, period, lock_type) VALUES (UUID(), ?, '2031-01', 'hard')",
    [ws],
  );
  const locked = await call("postCreditMemo", {
    ...base,
    memoNo: `${TAG}-CN5`,
    net: 1000,
    key: crypto.randomUUID(),
  });
  expect(locked.error).toContain("terkunci");
  await conn.execute("DELETE FROM acc_period_locks WHERE workspace_id = ? AND period = '2031-01'", [
    ws,
  ]);

  /* ---------- batal via UI → jurnal pembalik, sisa pulih ---------- */
  await page.reload();
  const row = page.getByRole("row").filter({ hasText: `${TAG}-CN1` });
  await row.getByRole("button", { name: /^(Cancel|Batalkan)$/ }).click();
  const cd = page.getByRole("dialog");
  await cd.locator('input[type="date"]').fill("2031-01-12");
  await cd.locator("textarea").fill("Salah input");
  await cd.getByRole("button", { name: /Cancel memo|Batalkan nota/ }).click();
  await expect(page.getByText(/Credit memo cancelled|Nota kredit dibatalkan/).first()).toBeVisible({
    timeout: 30_000,
  });
  const [c1] = await q(
    "SELECT status, cancellation_reason FROM acc_credit_memos WHERE workspace_id = ? AND memo_no = ?",
    [ws, `${TAG}-CN1`],
  );
  expect([c1.status, c1.cancellation_reason]).toEqual(["cancelled", "Salah input"]);
  expect(
    (await lines(`${TAG}-CN1-VOID`)).map((l) => [
      l.account_code,
      Number(l.debit),
      Number(l.credit),
    ]),
  ).toEqual([
    ["4100", 0, 500000],
    ["2100", 0, 55000],
    ["1200", 555000, 0],
  ]);
  expect((await lines(`${TAG}-CN1`)).length).toBe(3); // entri asli tidak diubah
  // sisa pulih: CN1 batal, CN4 100.000 aktif → 1.010.000 masih bisa dikreditkan
  const okAgain = await call("postCreditMemo", {
    ...base,
    memoNo: `${TAG}-CN6`,
    net: 1010000,
    key: crypto.randomUUID(),
  });
  expect(okAgain.ok, okAgain.error).toBe(true);
  const again = await call("cancelCreditMemo", {
    workspaceId: ws,
    id: m1.id,
    date: "2031-01-13",
    reason: "ulang",
  }); // sudah batal: idempoten
  expect(again.ok).toBe(true);
  expect(
    await q("SELECT 1 FROM acc_journal_entries WHERE workspace_id = ? AND entry_no = ?", [
      ws,
      `${TAG}-CN1-VOID`,
    ]),
  ).toHaveLength(1);

  /* ---------- Nota Kredit Hutang ---------- */
  await page.goto(`/app/w/${ws}/accounting/ap-credit-memo`);
  await expect(
    page.getByRole("heading", { name: /AP Credit Memo|Nota Kredit Hutang/ }),
  ).toBeVisible({ timeout: 60_000 });
  const ap = await call("postCreditMemo", {
    workspaceId: ws,
    side: "ap",
    invoiceId: apId,
    memoNo: `${TAG}-DN1`,
    date: "2031-01-10",
    net: 300000,
    vat: 33000,
    reason: "Selisih harga",
    key: crypto.randomUUID(),
  });
  expect(ap.ok, ap.error).toBe(true);
  expect(
    (await lines(`${TAG}-DN1`)).map((l) => [l.account_code, Number(l.debit), Number(l.credit)]),
  ).toEqual([
    ["2000", 333000, 0],
    ["5200", 0, 300000],
    ["1400", 0, 33000],
  ]);
  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: `${TAG}-DN1` })).toContainText("333,000", {
    timeout: 30_000,
  });
  // sisi AR tidak ikut tampil di daftar AP
  await expect(page.getByRole("row").filter({ hasText: `${TAG}-CN4` })).toHaveCount(0);
});
