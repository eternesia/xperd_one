import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import type mysql from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";
import {
  createTestWorkspace,
  dropTestWorkspace,
  grantProduction,
  mfgConn,
  sql,
} from "./production-helpers";

/**
 * ERP posting atomik (BS New 16): HPP rata-rata aktif (replay kronologis), satu transaksi per dokumen (rollback penuh bila gagal),
 * idempotensi kunci posting, stok keluar bersamaan tidak pernah negatif, pembatalan = pembalik bernilai asli, kasir POS atomik,
 * guard lot Production, dan dialog batal di UI. Semua angka dibandingkan ulang dari SQL pada workspace uji terpisah.
 */
let c: mysql.Connection;
let base = "";
let ws = "";
let revoke: (() => Promise<void>) | null = null;
const today = new Date().toISOString().slice(0, 10);
const uuid = () => crypto.randomUUID();
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;

test.afterAll(async () => {
  if (!c) return;
  if (revoke) await revoke();
  if (ws) {
    await c.execute("DELETE FROM acc_period_locks WHERE workspace_id = ?", [ws]);
    await dropTestWorkspace(c, ws);
  }
  await c.end();
});

type Res<T = any> = { ok: boolean; v?: T; error?: string };

test("ERP ATOMIK: HPP replay, rollback, idempotensi, konkurensi, batal, POS, lot, dialog batal", async ({
  page,
}) => {
  test.setTimeout(420_000);
  c = await mfgConn();
  await login(page);
  base = await resolveWorkspaceId(page);
  ws = await createTestWorkspace(c, base, "erp");

  // admin dev = anggota (owner) workspace uji, supaya jalur baca server (withMember) ikut berlaku
  await c.execute(
    "INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (UUID(), ?, '00000000-0000-0000-0000-000000000001', 'owner')",
    [ws],
  );
  // master uji
  await c.execute(
    "INSERT INTO md_warehouses (id, workspace_id, code, name, is_active) VALUES (UUID(), ?, 'WH1', 'Gudang Uji', 1)",
    [ws],
  );
  const item = async (code: string, stocked: boolean) =>
    c.execute(
      "INSERT INTO md_items (id, workspace_id, code, name, item_type, is_stocked, uom_code, cost_price, sell_price, is_active) VALUES (UUID(), ?, ?, ?, ?, ?, 'PCS', 0, 300, 1)",
      [ws, code, `Item ${code}`, stocked ? "goods" : "service", stocked ? 1 : 0],
    );
  await item("ITEM-A", true);
  await item("ITEM-B", true);
  await item("SVC-1", false);
  await c.execute(
    "INSERT INTO md_accounts (id, workspace_id, code, name, account_type, is_active) VALUES (UUID(), ?, '1010', 'Bank Uji', 'asset', 1)",
    [ws],
  );
  await c.execute(
    "INSERT INTO cb_accounts (id, workspace_id, code, name, account_kind, gl_account_code, currency, is_active) VALUES (UUID(), ?, 'BANK1', 'Bank Uji', 'bank', '1010', 'IDR', 1)",
    [ws],
  );

  await page.goto(`/app/w/${ws}`);
  const call = (mod: string, fn: string, data: unknown) =>
    page.evaluate(
      async ({ mod, fn, data }) => {
        const m = await import(/* @vite-ignore */ `/src/lib/${mod}.ts`);
        try {
          return { ok: true, v: await (m as any)[fn]({ data }) };
        } catch (e) {
          return { ok: false, error: (e as Error).message };
        }
      },
      { mod, fn, data },
    ) as Promise<Res>;
  const save = (
    side: "purchase" | "sales",
    doc: Record<string, unknown>,
    lines: unknown[],
    key = uuid(),
    extra: Record<string, unknown> = {},
  ) =>
    call("erp-document.functions", "erpSaveDocument", {
      workspaceId: ws,
      side,
      key,
      draft: false,
      document: { doc_date: today, currency: "IDR", exchange_rate: 1, ...doc },
      lines,
      ...extra,
    });
  const stock = async (code: string) =>
    Number(
      (
        await sql(
          c,
          "SELECT COALESCE(SUM(qty),0) q FROM inv_movements WHERE workspace_id = ? AND item_code = ? AND warehouse_code = 'WH1'",
          [ws, code],
        )
      )[0].q,
    );
  const avg = async (code: string) => {
    const r = await call("ledger.functions", "fetchMovingAverageCosts", {
      workspaceId: ws,
      codes: [code],
    });
    if (!r.ok) throw new Error(`fetchMovingAverageCosts: ${r.error}`);
    return Number(r.v?.[0]?.unit_cost ?? NaN);
  };
  const counts = async () => ({
    docs: Number(
      (
        await sql(
          c,
          "SELECT (SELECT COUNT(*) FROM sls_documents WHERE workspace_id=?) + (SELECT COUNT(*) FROM prc_documents WHERE workspace_id=?) n",
          [ws, ws],
        )
      )[0].n,
    ),
    lines: Number(
      (
        await sql(
          c,
          "SELECT (SELECT COUNT(*) FROM sls_document_lines WHERE workspace_id=?) + (SELECT COUNT(*) FROM prc_document_lines WHERE workspace_id=?) n",
          [ws, ws],
        )
      )[0].n,
    ),
    mv: Number(
      (await sql(c, "SELECT COUNT(*) n FROM inv_movements WHERE workspace_id=?", [ws]))[0].n,
    ),
    je: Number(
      (await sql(c, "SELECT COUNT(*) n FROM acc_journal_entries WHERE workspace_id=?", [ws]))[0].n,
    ),
  });

  /* ================= 1. HPP replay (rata-rata aktif) ================= */
  const gr1 = await save(
    "purchase",
    {
      doc_type: "goods_receipt",
      doc_number: "GR-A1",
      supplier_name: "Pemasok Uji",
      warehouse_code: "WH1",
    },
    [{ item_code: "ITEM-A", qty: 100, unit_price: 100 }],
  );
  expect(gr1.ok, gr1.error).toBe(true);
  expect(await stock("ITEM-A")).toBe(100);
  expect(await avg("ITEM-A")).toBeCloseTo(100, 4);
  // jurnal GR: Dr Persediaan 10.000 / Cr GR-IR 10.000
  const grJ = await sql(
    c,
    "SELECT l.account_code, l.debit, l.credit FROM acc_journal_lines l JOIN acc_journal_entries e ON e.id=l.entry_id WHERE e.workspace_id=? AND e.source_id=?",
    [ws, gr1.v.id],
  );
  expect(grJ.map((r) => `${r.account_code}:${Number(r.debit)}:${Number(r.credit)}`).sort()).toEqual(
    ["1300:10000:0", "2050:0:10000"],
  );

  // faktur AR langsung: stok keluar 80 @ rata-rata 100 = 8.000, piutang 24.000
  const ar1 = await save(
    "sales",
    {
      doc_type: "ar_invoice",
      doc_number: "AR-A1",
      customer_name: "Pelanggan Uji",
      warehouse_code: "WH1",
    },
    [{ item_code: "ITEM-A", qty: 80, unit_price: 300 }],
  );
  expect(ar1.ok, ar1.error).toBe(true);
  const out = await sql(
    c,
    "SELECT qty, unit_cost, value FROM inv_movements WHERE workspace_id=? AND ref_id=?",
    [ws, ar1.v.id],
  );
  expect(out).toHaveLength(1);
  expect(Number(out[0].qty)).toBe(-80);
  expect(Number(out[0].value)).toBeCloseTo(-8000, 2);
  const arJ = await sql(
    c,
    "SELECT l.account_code, l.debit, l.credit FROM acc_journal_lines l JOIN acc_journal_entries e ON e.id=l.entry_id WHERE e.workspace_id=? AND e.source_id=?",
    [ws, ar1.v.id],
  );
  const jsum = (code: string, side: "debit" | "credit") =>
    arJ.filter((r) => r.account_code === code).reduce((s, r) => s + Number(r[side]), 0);
  expect(jsum("1200", "debit")).toBe(24000);
  expect(jsum("4000", "credit")).toBe(24000);
  expect(jsum("5000", "debit")).toBe(8000);
  expect(jsum("1300", "credit")).toBe(8000);
  expect(arJ.reduce((s, r) => s + Number(r.debit) - Number(r.credit), 0)).toBeCloseTo(0, 2);

  const gr2 = await save(
    "purchase",
    {
      doc_type: "goods_receipt",
      doc_number: "GR-A2",
      supplier_name: "Pemasok Uji",
      warehouse_code: "WH1",
    },
    [{ item_code: "ITEM-A", qty: 100, unit_price: 200 }],
  );
  expect(gr2.ok, gr2.error).toBe(true);
  // sisa 20 @100 + 100 @200 = 22.000 / 120 = 183,3333 (BUKAN rata-rata seumur hidup 150)
  expect(await stock("ITEM-A")).toBe(120);
  expect(await avg("ITEM-A")).toBeCloseTo(22000 / 120, 3);

  // membatalkan faktur AR → pembalik bernilai ASLI (+8.000), rata-rata kembali 150
  const cancelAr = await call("erp-document.functions", "erpCancelDocument", {
    workspaceId: ws,
    side: "sales",
    id: ar1.v.id,
    date: today,
    reason: "Salah input",
  });
  expect(cancelAr.ok, cancelAr.error).toBe(true);
  const rev = await sql(
    c,
    "SELECT qty, value, mfg_reverses_id FROM inv_movements WHERE workspace_id=? AND ref_id=? AND mfg_reverses_id IS NOT NULL",
    [ws, ar1.v.id],
  );
  expect(rev).toHaveLength(1);
  expect(Number(rev[0].qty)).toBe(80);
  expect(Number(rev[0].value)).toBeCloseTo(8000, 2);
  expect(await stock("ITEM-A")).toBe(200);
  expect(await avg("ITEM-A")).toBeCloseTo(150, 3);
  const revJ = await sql(
    c,
    "SELECT e.reverses_journal_id, SUM(l.debit) d, SUM(l.credit) k FROM acc_journal_entries e JOIN acc_journal_lines l ON l.entry_id=e.id WHERE e.workspace_id=? AND e.source_id=? AND e.reverses_journal_id IS NOT NULL GROUP BY e.id",
    [ws, ar1.v.id],
  );
  expect(revJ).toHaveLength(1);
  expect(Number(revJ[0].d)).toBeCloseTo(Number(revJ[0].k), 2);
  expect(
    (
      await sql(c, "SELECT status, cancellation_reason FROM sls_documents WHERE id=?", [ar1.v.id])
    )[0],
  ).toMatchObject({ status: "cancelled", cancellation_reason: "Salah input" });
  // pembatalan ulang idempoten (tidak menambah pembalik)
  expect(
    (
      await call("erp-document.functions", "erpCancelDocument", {
        workspaceId: ws,
        side: "sales",
        id: ar1.v.id,
        date: today,
        reason: "Ulang",
      })
    ).ok,
  ).toBe(true);
  expect(
    Number(
      (
        await sql(
          c,
          "SELECT COUNT(*) n FROM inv_movements WHERE workspace_id=? AND mfg_reverses_id IS NOT NULL",
          [ws],
        )
      )[0].n,
    ),
  ).toBe(1);
  // alasan terlalu pendek / tanggal sebelum dokumen ditolak
  expect(
    (
      await call("erp-document.functions", "erpCancelDocument", {
        workspaceId: ws,
        side: "purchase",
        id: gr2.v.id,
        date: today,
        reason: "x",
      })
    ).ok,
  ).toBe(false);

  /* ================= 2. rollback penuh bila gagal di tengah ================= */
  const before = await counts();
  // (a) stok tidak cukup → gagal SETELAH dokumen+baris ditulis
  const tooMuch = await save(
    "sales",
    { doc_type: "ar_invoice", doc_number: "AR-FAIL1", customer_name: "X", warehouse_code: "WH1" },
    [{ item_code: "ITEM-A", qty: 5000, unit_price: 300 }],
  );
  expect(tooMuch.ok).toBe(false);
  expect(tooMuch.error).toMatch(/Insufficient stock/);
  expect(await counts()).toEqual(before);
  // (b) periode terkunci → gagal di jurnal SETELAH mutasi stok ditulis
  await c.execute(
    "INSERT INTO acc_period_locks (id, workspace_id, period, lock_type) VALUES (UUID(), ?, ?, 'hard')",
    [ws, today.slice(0, 7)],
  );
  const locked = await save(
    "sales",
    { doc_type: "ar_invoice", doc_number: "AR-FAIL2", customer_name: "X", warehouse_code: "WH1" },
    [{ item_code: "ITEM-A", qty: 1, unit_price: 300 }],
  );
  expect(locked.ok).toBe(false);
  expect(locked.error).toMatch(/terkunci/);
  expect(await counts()).toEqual(before);
  await c.execute("DELETE FROM acc_period_locks WHERE workspace_id = ?", [ws]);
  // (c) gudang wajib untuk faktur AR langsung berisi barang persediaan
  const noWh = await save(
    "sales",
    { doc_type: "ar_invoice", doc_number: "AR-FAIL3", customer_name: "X" },
    [{ item_code: "ITEM-A", qty: 1, unit_price: 300 }],
  );
  expect(noWh.ok).toBe(false);
  expect(noWh.error).toMatch(/Warehouse required/);
  expect(await counts()).toEqual(before);

  /* ================= 3. idempotensi + klik ganda ================= */
  const key = uuid();
  const doc = {
    doc_type: "ar_invoice",
    doc_number: "AR-IDEM",
    customer_name: "Pelanggan Uji",
    warehouse_code: "WH1",
  };
  const lines = [{ item_code: "ITEM-A", qty: 10, unit_price: 300 }];
  const [d1, d2] = await Promise.all([
    save("sales", doc, lines, key),
    save("sales", doc, lines, key),
  ]);
  expect(d1.ok && d2.ok, `${d1.error} / ${d2.error}`).toBe(true);
  expect(d1.v.id).toBe(d2.v.id);
  expect(
    Number(
      (
        await sql(
          c,
          "SELECT COUNT(*) n FROM sls_documents WHERE workspace_id=? AND doc_number='AR-IDEM'",
          [ws],
        )
      )[0].n,
    ),
  ).toBe(1);
  expect(
    Number(
      (
        await sql(c, "SELECT COUNT(*) n FROM inv_movements WHERE workspace_id=? AND ref_id=?", [
          ws,
          d1.v.id,
        ])
      )[0].n,
    ),
  ).toBe(1);
  expect(
    Number(
      (
        await sql(
          c,
          "SELECT COUNT(*) n FROM acc_journal_entries WHERE workspace_id=? AND source_id=?",
          [ws, d1.v.id],
        )
      )[0].n,
    ),
  ).toBe(1);
  expect(await stock("ITEM-A")).toBe(190);
  // nomor dokumen ganda dengan kunci berbeda ditolak tanpa sisa
  const beforeDup = await counts();
  const dup = await save("sales", doc, lines, uuid());
  expect(dup.ok).toBe(false);
  expect(await counts()).toEqual(beforeDup);

  /* ================= 4. stok keluar bersamaan tidak pernah negatif ================= */
  await save(
    "purchase",
    {
      doc_type: "goods_receipt",
      doc_number: "GR-B1",
      supplier_name: "Pemasok Uji",
      warehouse_code: "WH1",
    },
    [{ item_code: "ITEM-B", qty: 10, unit_price: 50 }],
  );
  const race = await Promise.all([
    save(
      "sales",
      { doc_type: "ar_invoice", doc_number: "AR-RACE1", customer_name: "X", warehouse_code: "WH1" },
      [{ item_code: "ITEM-B", qty: 8, unit_price: 100 }],
    ),
    save(
      "sales",
      { doc_type: "ar_invoice", doc_number: "AR-RACE2", customer_name: "X", warehouse_code: "WH1" },
      [{ item_code: "ITEM-B", qty: 8, unit_price: 100 }],
    ),
  ]);
  expect(race.filter((r) => r.ok)).toHaveLength(1);
  expect(await stock("ITEM-B")).toBe(2);

  /* ================= 5. dokumen turunan memblokir pembatalan ================= */
  const arPay = await save(
    "sales",
    { doc_type: "ar_invoice", doc_number: "AR-PAY", customer_name: "Pelanggan Uji" },
    [{ item_code: "SVC-1", description: "Jasa", qty: 1, unit_price: 1000 }],
  );
  expect(arPay.ok, arPay.error).toBe(true);
  const rcp = await save(
    "sales",
    {
      doc_type: "sales_receipt",
      doc_number: "RC-PAY",
      customer_name: "Pelanggan Uji",
      source_document_id: arPay.v.id,
      bank_account_code: "BANK1",
      bank_account_name: "Bank Uji",
    },
    [{ description: "Pelunasan", qty: 1, unit_price: 1000 }],
  );
  expect(rcp.ok, rcp.error).toBe(true);
  expect(
    (await sql(c, "SELECT status FROM sls_documents WHERE id=?", [arPay.v.id]))[0].status,
  ).toBe("closed");
  const cbRow = await sql(
    c,
    "SELECT trx_type, amount, account_code FROM cb_transactions WHERE workspace_id=? AND trx_no='RC-PAY'",
    [ws],
  );
  expect(cbRow).toHaveLength(1);
  expect(Number(cbRow[0].amount)).toBe(1000);
  const blocked = await call("erp-document.functions", "erpCancelDocument", {
    workspaceId: ws,
    side: "sales",
    id: arPay.v.id,
    date: today,
    reason: "Coba batal",
  });
  expect(blocked.ok).toBe(false);
  expect(blocked.error).toMatch(/downstream/);
  expect(
    (
      await call("erp-document.functions", "erpCancelDocument", {
        workspaceId: ws,
        side: "sales",
        id: rcp.v.id,
        date: today,
        reason: "Batal bayar",
      })
    ).ok,
  ).toBe(true);
  expect(
    Number(
      (
        await sql(
          c,
          "SELECT COUNT(*) n FROM cb_transactions WHERE workspace_id=? AND trx_no='REV/RC-PAY'",
          [ws],
        )
      )[0].n,
    ),
  ).toBe(1);
  expect(
    (await sql(c, "SELECT status FROM sls_documents WHERE id=?", [arPay.v.id]))[0].status,
  ).toBe("invoiced");
  expect(
    (
      await call("erp-document.functions", "erpCancelDocument", {
        workspaceId: ws,
        side: "sales",
        id: arPay.v.id,
        date: today,
        reason: "Batal faktur",
      })
    ).ok,
  ).toBe(true);
  // penerimaan tanpa rekening kas/bank ditolak
  const noBank = await save(
    "sales",
    { doc_type: "sales_receipt", doc_number: "RC-NOBANK", customer_name: "X" },
    [{ description: "Uang muka", qty: 1, unit_price: 500 }],
  );
  expect(noBank.ok).toBe(false);

  /* ================= 6. POS atomik ================= */
  const posKey = uuid();
  const pos = (k: string) =>
    call("erp-document.functions", "erpPosCheckout", {
      workspaceId: ws,
      key: k,
      customer_code: null,
      customer_name: "Pelanggan umum",
      warehouse_code: "WH1",
      bank_account_code: "BANK1",
      method: "qris",
      tax_rate: 11,
      doc_date: today,
      lines: [
        {
          item_code: "ITEM-A",
          description: "Item ITEM-A",
          uom_code: "PCS",
          qty: 3,
          unit_price: 1000,
          discount: 0,
        },
      ],
    });
  const stockBefore = await stock("ITEM-A");
  const p1 = await pos(posKey);
  expect(p1.ok, p1.error).toBe(true);
  expect(p1.v.total).toBe(3330);
  expect(await stock("ITEM-A")).toBe(stockBefore - 3);
  const p2 = await pos(posKey); // kirim ulang dengan kunci sama → tanpa efek ganda
  expect(p2.ok, p2.error).toBe(true);
  expect(p2.v.arId).toBe(p1.v.arId);
  expect(await stock("ITEM-A")).toBe(stockBefore - 3);
  const posDocs = await sql(
    c,
    "SELECT doc_type, total, status FROM sls_documents WHERE workspace_id=? AND id IN (?, ?) ORDER BY doc_type",
    [ws, p1.v.arId, p1.v.receiptId],
  );
  expect(posDocs.map((r) => `${r.doc_type}:${Number(r.total)}`)).toEqual([
    "ar_invoice:3330",
    "sales_receipt:3330",
  ]);
  expect(
    Number(
      (
        await sql(c, "SELECT amount FROM cb_transactions WHERE workspace_id=? AND trx_no=?", [
          ws,
          p1.v.receiptNumber,
        ])
      )[0].amount,
    ),
  ).toBe(3330);
  const posJ = await sql(
    c,
    "SELECT l.account_code, SUM(l.debit) d, SUM(l.credit) k FROM acc_journal_lines l JOIN acc_journal_entries e ON e.id=l.entry_id WHERE e.workspace_id=? AND e.source_id IN (?, ?) GROUP BY l.account_code",
    [ws, p1.v.arId, p1.v.receiptId],
  );
  const pj = (code: string, side: "d" | "k") =>
    posJ.filter((r) => r.account_code === code).reduce((s, r) => s + Number(r[side]), 0);
  expect(near(pj("4000", "k"), 3000)).toBe(true);
  expect(near(pj("2100", "k"), 330)).toBe(true);
  expect(near(pj("1010", "d"), 3330)).toBe(true);
  expect(near(pj("1200", "d"), pj("1200", "k"))).toBe(true); // piutang nol setelah dilunasi
  // stok kurang → seluruh checkout dibatalkan
  const beforePos = await counts();
  const failPos = await call("erp-document.functions", "erpPosCheckout", {
    workspaceId: ws,
    key: uuid(),
    customer_code: null,
    customer_name: "U",
    warehouse_code: "WH1",
    bank_account_code: "BANK1",
    method: "cash",
    tax_rate: 0,
    doc_date: today,
    lines: [{ item_code: "ITEM-B", description: "B", qty: 99, unit_price: 10, discount: 0 }],
  });
  expect(failPos.ok).toBe(false);
  expect(await counts()).toEqual(beforePos);

  /* ================= 7. guard lot Production ================= */
  revoke = await grantProduction(c, ws);
  const [itemA] = await sql(c, "SELECT id FROM md_items WHERE workspace_id=? AND code='ITEM-A'", [
    ws,
  ]);
  await c.execute(
    "INSERT INTO mfg_item_profiles (id, workspace_id, item_id, item_class, ghs_classes, incompatible_classes) VALUES (UUID(), ?, ?, 'solvent', '[]', '[]')",
    [ws, itemA.id],
  );
  const lotId = uuid();
  await c.execute(
    "INSERT INTO mfg_lots (id, workspace_id, item_id, lot_no, qc_status, is_active) VALUES (?,?,?,?, 'quarantine', 1)",
    [lotId, ws, itemA.id, "LOT-E2E-1"],
  );
  await c.execute(
    "INSERT INTO inv_movements (id, workspace_id, movement_date, movement_type, item_code, item_name, uom_code, warehouse_code, qty, unit_cost, value, ref_type, created_by, mfg_lot_id, mfg_idempotency_key) VALUES (UUID(), ?, ?, 'in', 'ITEM-A', 'Item ITEM-A', 'PCS', 'WH1', 50, 100, 5000, 'mfg_order', NULL, ?, ?)",
    [ws, today, lotId, uuid()],
  );
  const arLot = (no: string, lot: string | null) =>
    save(
      "sales",
      { doc_type: "ar_invoice", doc_number: no, customer_name: "X", warehouse_code: "WH1" },
      [{ item_code: "ITEM-A", qty: 5, unit_price: 300, mfg_lot_id: lot }],
    );
  const beforeLot = await counts();
  const noLot = await arLot("AR-LOT0", null);
  expect(noLot.ok).toBe(false);
  expect(noLot.error).toMatch(/requires a released lot/);
  const quarantined = await arLot("AR-LOT1", lotId);
  expect(quarantined.ok).toBe(false);
  expect(quarantined.error).toMatch(/belum dirilis/);
  expect(await counts()).toEqual(beforeLot);
  await c.execute("UPDATE mfg_lots SET qc_status='released' WHERE id=?", [lotId]);
  const okLot = await arLot("AR-LOT2", lotId);
  expect(okLot.ok, okLot.error).toBe(true);
  const lotMv = await sql(
    c,
    "SELECT qty, mfg_lot_id FROM inv_movements WHERE workspace_id=? AND ref_id=?",
    [ws, okLot.v.id],
  );
  expect(lotMv).toHaveLength(1);
  expect(Number(lotMv[0].qty)).toBe(-5);
  expect(lotMv[0].mfg_lot_id).toBe(lotId);
  // pembatalan faktur ber-lot → pembalik ber-lot (append-only)
  expect(
    (
      await call("erp-document.functions", "erpCancelDocument", {
        workspaceId: ws,
        side: "sales",
        id: okLot.v.id,
        date: today,
        reason: "Batal lot",
      })
    ).ok,
  ).toBe(true);
  expect(
    Number(
      (
        await sql(
          c,
          "SELECT COALESCE(SUM(qty),0) q FROM inv_movements WHERE workspace_id=? AND mfg_lot_id=?",
          [ws, lotId],
        )
      )[0].q,
    ),
  ).toBe(50);
  // GRN item berprofil → lot karantina otomatis dalam transaksi yang sama
  const grLot = await save(
    "purchase",
    {
      doc_type: "goods_receipt",
      doc_number: "GR-LOT",
      supplier_name: "Pemasok Uji",
      warehouse_code: "WH1",
    },
    [{ item_code: "ITEM-A", qty: 7, unit_price: 90 }],
  );
  expect(grLot.ok, grLot.error).toBe(true);
  const grLotRows = await sql(
    c,
    "SELECT l.qc_status, m.qty FROM inv_movements m JOIN mfg_lots l ON l.id=m.mfg_lot_id WHERE m.workspace_id=? AND m.ref_id=?",
    [ws, grLot.v.id],
  );
  expect(grLotRows).toHaveLength(1);
  expect(grLotRows[0].qc_status).toBe("quarantine");
  expect(Number(grLotRows[0].qty)).toBe(7);

  /* ================= 8. UI: dialog batal ================= */
  await save(
    "sales",
    { doc_type: "ar_invoice", doc_number: "AR-UI", customer_name: "Pelanggan UI" },
    [{ item_code: "SVC-1", description: "Jasa UI", qty: 1, unit_price: 700 }],
  );
  await page.goto(`/app/w/${ws}/sales/ar-invoices`);
  const row = page.getByRole("row").filter({ hasText: "AR-UI" });
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.getByRole("button", { name: /Cancel document|Batalkan dokumen/ }).click();
  const dlg = page.getByRole("dialog");
  const confirmBtn = dlg.getByRole("button", { name: /Cancel document|Batalkan dokumen/ });
  await expect(confirmBtn).toBeDisabled(); // alasan wajib
  await dlg.locator("textarea").fill("Pelanggan membatalkan");
  await confirmBtn.click();
  await expect(dlg).toBeHidden({ timeout: 30_000 });
  expect(
    (
      await sql(
        c,
        "SELECT status, cancellation_reason FROM sls_documents WHERE workspace_id=? AND doc_number='AR-UI'",
        [ws],
      )
    )[0],
  ).toMatchObject({ status: "cancelled", cancellation_reason: "Pelanggan membatalkan" });
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "AR-UI" })
      .getByRole("button", { name: /Cancel document|Batalkan dokumen/ }),
  ).toHaveCount(0);

  // POS: pemilihan rekening kas/bank tersedia
  await page.goto(`/app/w/${ws}/sales/pos`);
  await expect(page.getByText(/Select cash \/ bank|Pilih kas \/ bank/).first()).toBeVisible({
    timeout: 60_000,
  });
});
