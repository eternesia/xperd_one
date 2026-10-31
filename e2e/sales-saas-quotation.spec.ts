import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Perilaku New 11 (Ronde 46), ditemukan saat membandingkan dengan situs live xperd-new.lovable.app:
 *  - AR Invoices: "Generate SaaS Monthly" membuat faktur DRAF bulan ini dari faktur AR terakhir tiap pelanggan (hanya baris
 *    item SaaS/langganan bulanan); pelanggan yang sudah ditagih bulan ini dilewati.
 *  - Quotations: dapat diedit/dihapus di tahap mana pun kecuali dibatalkan, dan dapat diduplikat sebagai draf baru.
 * Angka dihitung dari SQL/rumus (qty×harga − diskon, pajak atas netto), data uji dihapus di akhir.
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
const DB = {
  host: process.env.MYSQL_HOST ?? env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? env.MYSQL_PORT ?? 3307),
  user: process.env.MYSQL_USER ?? env.MYSQL_USER ?? "xperd",
  password: process.env.MYSQL_PASSWORD ?? env.MYSQL_PASSWORD ?? "xperd",
  database: process.env.MYSQL_DATABASE ?? env.MYSQL_DATABASE ?? "xperd",
  dateStrings: true,
  timezone: "Z",
};
let conn: Connection;
let ws = "";
const q = async (sql: string, p: unknown[] = []) => (await conn.query<RowDataPacket[]>(sql, p))[0];
const TAG = `E2ESAAS${Date.now().toString().slice(-5)}`;
const today = () => new Date().toISOString().slice(0, 10);

async function mkDoc(
  type: string,
  number: string,
  status: string,
  date: string,
  customer: string,
  lines: [string, number, number, number, number][],
) {
  const id = crypto.randomUUID();
  let sub = 0,
    disc = 0,
    tax = 0;
  for (const [, qty, price, d, rate] of lines) {
    const gross = qty * price;
    sub += gross;
    disc += d;
    tax += ((gross - d) * rate) / 100;
  }
  await conn.execute(
    `INSERT INTO sls_documents (id, workspace_id, doc_type, doc_number, doc_date, customer_code, customer_name, status, subtotal, discount_amount, tax_amount, total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      ws,
      type,
      number,
      date,
      customer,
      `${customer} name`,
      status,
      sub,
      disc,
      tax,
      sub - disc + tax,
    ],
  );
  let n = 1;
  for (const [item, qty, price, d, rate] of lines) {
    await conn.execute(
      `INSERT INTO sls_document_lines (id, document_id, workspace_id, line_no, item_code, description, qty, uom_code, unit_price, discount, tax_rate, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PCS', ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        id,
        ws,
        n++,
        item,
        `${item} desc`,
        qty,
        price,
        d,
        rate,
        qty * price - d + ((qty * price - d) * rate) / 100,
      ],
    );
  }
  return id;
}

test.beforeAll(async () => {
  conn = await mysql.createConnection(DB);
});
test.afterAll(async () => {
  if (!conn) return;
  await conn
    .execute(
      "DELETE FROM sls_document_lines WHERE document_id IN (SELECT id FROM sls_documents WHERE workspace_id = ? AND (customer_code LIKE ? OR doc_number LIKE ? OR reference LIKE ?))",
      [ws, `${TAG}%`, `${TAG}%`, `SAAS-%`],
    )
    .catch(() => undefined);
  await conn.execute(
    "DELETE FROM sls_documents WHERE workspace_id = ? AND (customer_code LIKE ? OR doc_number LIKE ?)",
    [ws, `${TAG}%`, `${TAG}%`],
  );
  await conn.execute("DELETE FROM md_items WHERE workspace_id = ? AND code LIKE ?", [
    ws,
    `${TAG}%`,
  ]);
  await conn.end();
});

test("SALES: Generate SaaS Monthly + penawaran terbit dapat diedit/dihapus/diduplikat", async ({
  page,
}) => {
  test.setTimeout(100_000);
  await login(page);
  ws = await resolveWorkspaceId(page);
  page.on("dialog", (d) => void d.accept());

  /* ---------- Generate SaaS Monthly ---------- */
  await conn.execute(
    "INSERT INTO md_items (id, workspace_id, code, name, item_type, billing_cycle, sell_price) VALUES (?, ?, ?, 'SaaS plan', 'subscription', 'monthly', 150000)",
    [crypto.randomUUID(), ws, `${TAG}-SAAS`],
  );
  await conn.execute(
    "INSERT INTO md_items (id, workspace_id, code, name, item_type, sell_price) VALUES (?, ?, ?, 'One-off goods', 'goods', 5000)",
    [crypto.randomUUID(), ws, `${TAG}-GOODS`],
  );
  // tanggal 15 bulan lalu (setMonth(-1) pada tanggal 31 meluap ke bulan yang sama)
  const nowD = new Date();
  const lm = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - 1, 15)).toISOString().slice(0, 10);
  const custA = `${TAG}-A`,
    custB = `${TAG}-B`;
  // A: faktur bulan lalu dengan 1 baris SaaS + 1 baris barang; B: sudah ditagih bulan ini (dilewati)
  await mkDoc("ar_invoice", `${TAG}/INV-A`, "approved", lm, custA, [
    [`${TAG}-SAAS`, 2, 150000, 10000, 11],
    [`${TAG}-GOODS`, 1, 5000, 0, 0],
  ]);
  await mkDoc("ar_invoice", `${TAG}/INV-B1`, "approved", lm, custB, [
    [`${TAG}-SAAS`, 1, 150000, 0, 11],
  ]);
  const period = today().slice(0, 7);
  const bThis = await mkDoc("ar_invoice", `${TAG}/INV-B2`, "draft", today(), custB, [
    [`${TAG}-SAAS`, 1, 150000, 0, 11],
  ]);
  await conn.execute("UPDATE sls_documents SET reference = ? WHERE id = ?", [
    `SAAS-${period}`,
    bThis,
  ]);

  await page.goto(`/app/w/${ws}/sales/ar-invoices`);
  await expect(page.getByRole("button", { name: "Generate SaaS Monthly" })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Generate SaaS Monthly" }).click();
  await expect(
    page.getByText("1 draft SaaS invoice(s) created for this month.").first(),
  ).toBeVisible({ timeout: 30_000 });

  const made = await q(
    "SELECT * FROM sls_documents WHERE workspace_id = ? AND customer_code = ? AND reference = ?",
    [ws, custA, `SAAS-${period}`],
  );
  expect(made).toHaveLength(1);
  // 2 × 150.000 = 300.000; diskon 10.000; pajak 11% × 290.000 = 31.900; hanya baris SaaS yang disalin
  expect(made[0]).toMatchObject({ status: "draft", doc_date: today() });
  expect([
    Number(made[0].subtotal),
    Number(made[0].discount_amount),
    Number(made[0].tax_amount),
    Number(made[0].total),
  ]).toEqual([300000, 10000, 31900, 321900]);
  const ml = await q("SELECT item_code, qty FROM sls_document_lines WHERE document_id = ?", [
    made[0].id,
  ]);
  expect(ml.map((l) => [l.item_code, Number(l.qty)])).toEqual([[`${TAG}-SAAS`, 2]]);
  expect(
    await q(
      "SELECT 1 FROM sls_documents WHERE workspace_id = ? AND customer_code = ? AND doc_date = ? AND doc_number NOT LIKE ?",
      [ws, custB, today(), `${TAG}/%`],
    ),
  ).toHaveLength(0);
  // dijalankan lagi: semua sudah ditagih
  await page.getByRole("button", { name: "Generate SaaS Monthly" }).click();
  await expect(
    page.getByText("All SaaS customers are already billed this month.").first(),
  ).toBeVisible({ timeout: 30_000 });
  expect(
    await q(
      "SELECT 1 FROM sls_documents WHERE workspace_id = ? AND customer_code = ? AND reference = ?",
      [ws, custA, `SAAS-${period}`],
    ),
  ).toHaveLength(1);

  /* ---------- Quotations: edit / hapus / duplikat ---------- */
  const sent = await mkDoc("quotation", `${TAG}/QUO-SENT`, "submitted", today(), `${TAG}-Q`, [
    [`${TAG}-SAAS`, 3, 150000, 0, 11],
  ]);
  const cancelled = await mkDoc("quotation", `${TAG}/QUO-CANC`, "cancelled", today(), `${TAG}-Q`, [
    [`${TAG}-SAAS`, 1, 1000, 0, 0],
  ]);
  await page.goto(`/app/w/${ws}/sales/quotations`);
  await page.getByPlaceholder("Search number or customer…").fill(TAG);
  const rowSent = page.getByRole("row").filter({ hasText: `${TAG}/QUO-SENT` });
  const rowCanc = page.getByRole("row").filter({ hasText: `${TAG}/QUO-CANC` });
  await expect(rowSent).toBeVisible({ timeout: 60_000 });
  await expect(rowSent.getByRole("button", { name: /^Edit/ })).toBeVisible();
  await expect(rowSent.getByRole("button", { name: "Delete" })).toBeVisible();
  await expect(rowCanc.getByRole("button", { name: /^Edit/ })).toHaveCount(0);
  await expect(rowCanc.getByRole("button", { name: "Delete" })).toHaveCount(0);

  // duplikat → draf baru dengan nomor baru dan baris yang sama
  const before = Number(
    (
      await q(
        "SELECT COUNT(*) n FROM sls_documents WHERE workspace_id = ? AND doc_type = 'quotation'",
        [ws],
      )
    )[0].n,
  );
  await rowSent.getByRole("button", { name: "Duplicate quotation" }).click();
  await expect(page.getByText("Quotation duplicated as a new draft.").first()).toBeVisible({
    timeout: 30_000,
  });
  const copies = await q(
    "SELECT * FROM sls_documents WHERE workspace_id = ? AND doc_type = 'quotation' AND customer_code = ? AND id <> ? AND id <> ?",
    [ws, `${TAG}-Q`, sent, cancelled],
  );
  expect(copies).toHaveLength(1);
  expect(copies[0].status).toBe("draft");
  expect(copies[0].doc_number).not.toBe(`${TAG}/QUO-SENT`);
  expect(Number(copies[0].total)).toBe(499500);
  expect(
    Number(
      (
        await q(
          "SELECT COUNT(*) n FROM sls_documents WHERE workspace_id = ? AND doc_type = 'quotation'",
          [ws],
        )
      )[0].n,
    ),
  ).toBe(before + 1);
  expect(
    (await q("SELECT COUNT(*) n FROM sls_document_lines WHERE document_id = ?", [copies[0].id]))[0]
      .n,
  ).toBe(1);

  // hapus penawaran terbit (status "submitted") → hilang dari SQL; yang dibatalkan ditolak server walau UI dilewati
  await rowSent.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Deleted").first()).toBeVisible({ timeout: 30_000 });
  expect(await q("SELECT 1 FROM sls_documents WHERE id = ?", [sent])).toHaveLength(0);
  const err = await page.evaluate(
    async ({ w, id }) => {
      const m = await import("/src/lib/data.functions.ts");
      try {
        await m.deleteWorkspaceRow({
          data: { table: "sls_documents", workspaceId: w, id, forbidStatus: "cancelled" },
        });
        return "";
      } catch (e) {
        return (e as Error).message;
      }
    },
    { w: ws, id: cancelled },
  );
  expect(err).toMatch(/cannot be deleted/);
  expect(await q("SELECT 1 FROM sls_documents WHERE id = ?", [cancelled])).toHaveLength(1);
});
