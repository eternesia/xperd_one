import { expect, test, type Page } from "@playwright/test";
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
 * Production MRP: saklar OFF bawaan → Sales Order → explosion BOM 2 level → netting stok lot rilis/karantina, PO terbuka,
 * stok pengaman → saran produksi & beli → PR draf (idempoten) → order produksi draf (idempoten) → hitung ulang = tercukupi.
 * Angka dibandingkan dengan perhitungan manual; workspace uji terpisah dan dibersihkan.
 */
const TAG = `m${Date.now().toString().slice(-6)}`;
let c: mysql.Connection;
let ws = "";
let revoke: (() => Promise<void>) | null = null;
const uuid = () => crypto.randomUUID();
const q = (s: string, p: unknown[] = []) => sql(c, s, p);

test.afterAll(async () => {
  if (!c) return;
  try {
    if (revoke) await revoke();
    if (ws) {
      await c.query("SET FOREIGN_KEY_CHECKS = 0");
      for (const t of [
        "prc_document_lines",
        "prc_documents",
        "sls_document_lines",
        "sls_documents",
        "inv_movements",
        "md_items",
        "md_uoms",
        "md_warehouses",
        "audit_logs",
        "workspace_members",
      ])
        await c.execute(`DELETE FROM ${t} WHERE workspace_id = ?`, [ws]);
      await c.query("SET FOREIGN_KEY_CHECKS = 1");
      await dropTestWorkspace(c, ws);
    }
  } finally {
    await c.end();
  }
});

const call = (page: Page, fn: string, data: Record<string, unknown>) =>
  page.evaluate(
    async ({ fn, data }) => {
      const m = await import(/* @vite-ignore */ "/src/lib/production-mrp.functions.ts");
      try {
        return { ok: true, v: await (m as any)[fn]({ data }) };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    { fn, data: { workspaceId: ws, ...data } },
  ) as Promise<{ ok: boolean; v?: any; error?: string }>;

test("PRODUCTION MRP: SO → explosion → saran beli/produksi → PR & order draf → tercukupi", async ({
  page,
}) => {
  test.setTimeout(300_000);
  c = await mfgConn();
  await login(page);
  const base = await resolveWorkspaceId(page);
  ws = await createTestWorkspace(c, base, TAG);
  const [admin] = await q("SELECT id FROM app_users WHERE email = ?", ["dnicorp.id@gmail.com"]);
  const adminId = admin.id as string;
  await c.execute(
    "INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?,?,?, 'owner')",
    [uuid(), ws, adminId],
  );
  revoke = await grantProduction(c, ws);

  /* ---------- fixture ---------- */
  for (const u of ["KG", "PCS"])
    await c.execute("INSERT INTO md_uoms (id, workspace_id, code, name) VALUES (?,?,?,?)", [
      uuid(),
      ws,
      u,
      u,
    ]);
  for (const w of ["WH-RM", "WH-FG"])
    await c.execute("INSERT INTO md_warehouses (id, workspace_id, code, name) VALUES (?,?,?,?)", [
      uuid(),
      ws,
      w,
      w,
    ]);
  const item = async (code: string, uom: string, cost: number, minStock = 0) => {
    const id = uuid();
    await c.execute(
      "INSERT INTO md_items (id, workspace_id, code, name, uom_code, cost_price, min_stock) VALUES (?,?,?,?,?,?,?)",
      [id, ws, `${code}-${TAG}`, `Item ${code}`, uom, cost, minStock],
    );
    return { id, code: `${code}-${TAG}` };
  };
  const fg = await item("FG", "PCS", 0);
  const bulk = await item("BULK", "KG", 0);
  const btl = await item("BTL", "PCS", 500);
  const ai = await item("AI", "KG", 150000, 5);
  const sol = await item("SOL", "KG", 20000);
  const bom = async (
    itemId: string,
    baseQty: number,
    baseUom: string,
    lines: [string, number, string][],
  ) => {
    const bomId = uuid();
    const verId = uuid();
    await c.execute(
      "INSERT INTO mfg_boms (id, workspace_id, item_id, code, created_by) VALUES (?,?,?,?,?)",
      [bomId, ws, itemId, `BOM-${itemId.slice(0, 6)}`, adminId],
    );
    await c.execute(
      "INSERT INTO mfg_bom_versions (id, workspace_id, bom_id, version_no, status, base_batch_qty, base_uom, std_yield_pct, effective_from, change_reason, created_by) VALUES (?,?,?,1,'approved',?,?,100,'2020-01-01','e2e',?)",
      [verId, ws, bomId, baseQty, baseUom, adminId],
    );
    let seq = 0;
    for (const [lid, qty, uom] of lines)
      await c.execute(
        "INSERT INTO mfg_bom_lines (id, workspace_id, bom_version_id, item_id, line_type, qty_per_base, uom, basis, potency_compensate, tolerance_pct, is_critical, sequence, created_by) VALUES (?,?,?,?, 'ingredient', ?, ?, 'gross', 0, 0, 0, ?, ?)",
        [uuid(), ws, verId, lid, qty, uom, ++seq, adminId],
      );
    return verId;
  };
  await bom(fg.id, 100, "PCS", [
    [bulk.id, 100, "KG"],
    [btl.id, 100, "PCS"],
  ]);
  await bom(bulk.id, 1000, "KG", [
    [ai.id, 50, "KG"],
    [sol.id, 950, "KG"],
  ]);
  const mv = (code: string, wh: string, qty: number, lotId: string | null = null) =>
    c.execute(
      "INSERT INTO inv_movements (id, workspace_id, movement_date, movement_type, item_code, warehouse_code, qty, unit_cost, value, ref_type, mfg_lot_id, mfg_idempotency_key) VALUES (?,?, CURDATE(), 'in', ?, ?, ?, 0, 0, 'e2e', ?, ?)",
      [uuid(), ws, code, wh, qty, lotId, uuid()],
    );
  const lot = async (itemId: string, no: string, status: string) => {
    const id = uuid();
    await c.execute(
      "INSERT INTO mfg_lots (id, workspace_id, item_id, lot_no, qc_status, expiry_date, created_by) VALUES (?,?,?,?,?, '2099-01-01', ?)",
      [id, ws, itemId, no, status, adminId],
    );
    return id;
  };
  await mv(fg.code, "WH-FG", 20);
  await mv(bulk.code, "WH-RM", 30);
  await mv(btl.code, "WH-RM", 200);
  await mv(ai.code, "WH-RM", 10, await lot(ai.id, `AI-R-${TAG}`, "released"));
  await mv(ai.code, "WH-RM", 40, await lot(ai.id, `AI-Q-${TAG}`, "quarantine"));
  // PO terbuka AI 2 kg
  const po = uuid();
  await c.execute(
    "INSERT INTO prc_documents (id, workspace_id, doc_type, doc_number, doc_date, status) VALUES (?,?, 'purchase_order', ?, CURDATE(), 'approved')",
    [po, ws, `PO-${TAG}`],
  );
  await c.execute(
    "INSERT INTO prc_document_lines (id, document_id, workspace_id, line_no, item_code, qty, uom_code) VALUES (?,?,?,1,?,2,'KG')",
    [uuid(), po, ws, ai.code],
  );
  // SO: terbuka 100 pcs (dihitung), terkirim penuh (diabaikan), draf (diabaikan)
  const so = async (no: string, status: string, qty: number, fulfilled: number) => {
    const id = uuid();
    await c.execute(
      "INSERT INTO sls_documents (id, workspace_id, doc_type, doc_number, doc_date, due_date, customer_code, customer_name, status) VALUES (?,?, 'sales_order', ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 10 DAY), 'C1', 'PT Pelanggan', ?)",
      [id, ws, no, status],
    );
    await c.execute(
      "INSERT INTO sls_document_lines (id, document_id, workspace_id, line_no, item_code, qty, uom_code, qty_fulfilled) VALUES (?,?,?,1,?,?, 'PCS', ?)",
      [uuid(), id, ws, fg.code, qty, fulfilled],
    );
  };
  await so(`SO-A-${TAG}`, "approved", 100, 0);
  await so(`SO-B-${TAG}`, "partial", 10, 10);
  await so(`SO-C-${TAG}`, "draft", 999, 0);

  await page.goto(`/app/w/${ws}`);

  /* ---------- saklar OFF bawaan ---------- */
  const st = await call(page, "getMrpSettings", {});
  expect(st.ok, st.error).toBe(true);
  expect(st.v.settings.enabled).toBe(false);
  const off = await call(page, "runMrp", { warehouse: null });
  expect(off.ok).toBe(false);
  expect(off.error).toMatch(/belum diaktifkan/);
  const on = await call(page, "saveMrpSettings", {
    values: { enabled: true, horizon_days: 30, include_draft: true, include_open_pr: true },
    reason: "e2e",
  });
  expect(on.ok, on.error).toBe(true);

  /* ---------- perhitungan awal ---------- */
  const run = async () => {
    const r = await call(page, "runMrp", { warehouse: null });
    expect(r.ok, r.error).toBe(true);
    return Object.fromEntries((r.v.rows as any[]).map((x) => [x.code, x])) as Record<string, any>;
  };
  let rows = await run();
  // FG: 100 − 20 = 80 → produksi; menunggu BULK
  expect(rows[fg.code]).toMatchObject({
    action: "make",
    gross: 100,
    on_hand: 20,
    net: 80,
    suggested_qty: 80,
    short_components: [bulk.code],
  });
  expect(rows[fg.code].pegs[0]).toMatchObject({
    source: "sales",
    doc_no: `SO-A-${TAG}`,
    partner: "PT Pelanggan",
  });
  // BULK: 80 (dari saran FG) − 30 = 50 → produksi; menunggu SOL
  expect(rows[bulk.code]).toMatchObject({
    action: "make",
    level: 2,
    gross: 80,
    net: 50,
    short_components: [sol.code],
  });
  // BTL: 80 − 200 → cukup
  expect(rows[btl.code].action).toBe("none");
  // AI: 50/1000×50 = 2.5 + pengaman 5 − (10 rilis + 2 PO) < 0 → cukup; karantina 40 tidak dihitung
  expect(rows[ai.code]).toMatchObject({
    action: "none",
    gross: 2.5,
    safety: 5,
    on_hand: 10,
    quarantine: 40,
    open_po: 2,
  });
  // SOL: 950/1000×50 = 47.5 → beli
  expect(rows[sol.code]).toMatchObject({
    action: "buy",
    level: 3,
    gross: 47.5,
    net: 47.5,
    suggested_qty: 47.5,
    est_value: 950000,
  });

  /* ---------- parameter: MOQ 25 + kelipatan 25 → 50 ---------- */
  const pr0 = await call(page, "saveMrpItemParams", {
    itemId: sol.id,
    values: { lead_time_days: 7, safety_stock: null, min_order_qty: 25, order_multiple: 25 },
  });
  expect(pr0.ok, pr0.error).toBe(true);
  rows = await run();
  expect(rows[sol.code]).toMatchObject({ suggested_qty: 50, lead_time_days: 7 });

  /* ---------- PR draf, idempoten ---------- */
  const key = uuid();
  const prIn = {
    key,
    warehouseCode: "WH-RM",
    lines: [{ itemId: sol.id, qty: 50, needDate: rows[sol.code].need_date }],
  };
  const pr1 = await call(page, "createMrpPurchaseRequest", prIn);
  expect(pr1.ok, pr1.error).toBe(true);
  const pr2 = await call(page, "createMrpPurchaseRequest", prIn);
  expect(pr2.v).toMatchObject({ doc_number: pr1.v.doc_number, replay: true });
  const prs = await q(
    "SELECT d.status, l.qty, l.item_code FROM prc_documents d JOIN prc_document_lines l ON l.document_id = d.id WHERE d.workspace_id = ? AND d.doc_type = 'purchase_request'",
    [ws],
  );
  expect(prs).toHaveLength(1);
  expect(prs[0]).toMatchObject({ status: "draft", item_code: sol.code });
  expect(Number(prs[0].qty)).toBe(50);
  rows = await run();
  expect(rows[sol.code]).toMatchObject({ action: "none", open_pr: 50 });
  expect(rows[bulk.code].short_components).toEqual([]);

  /* ---------- order produksi draf, idempoten ---------- */
  const moIn = {
    key: uuid(),
    warehouseFrom: "WH-RM",
    warehouseTo: "WH-FG",
    lines: [bulk, fg].map((x) => ({
      itemId: x.id,
      bomVersionId: rows[x.code].bom_version_id,
      qty: rows[x.code].suggested_qty,
      plannedStart: rows[x.code].order_date,
      plannedEnd: rows[x.code].need_date,
    })),
  };
  const mo1 = await call(page, "createMrpProductionOrders", moIn);
  expect(mo1.ok, mo1.error).toBe(true);
  expect(mo1.v.orders).toHaveLength(2);
  const mo2 = await call(page, "createMrpProductionOrders", moIn);
  expect(mo2.v.orders.every((o: any) => o.replay)).toBe(true);
  const mos = await q(
    "SELECT item_id, status, planned_qty FROM mfg_orders WHERE workspace_id = ? ORDER BY planned_qty",
    [ws],
  );
  expect(mos.map((m) => [m.item_id, m.status, Number(m.planned_qty)])).toEqual([
    [bulk.id, "draft", 50],
    [fg.id, "draft", 80],
  ]);

  /* ---------- hitung ulang: semua tercukupi oleh order & PR ---------- */
  rows = await run();
  expect(rows[fg.code]).toMatchObject({ action: "none", open_mo: 80 });
  // BULK kini dibutuhkan order FG draf (80) − stok 30 − order BULK 50 = 0
  expect(rows[bulk.code]).toMatchObject({ action: "none", gross: 80, open_mo: 50 });
  expect(rows[sol.code]).toMatchObject({ action: "none", gross: 47.5, open_pr: 50 });
  const links = await q(
    "SELECT kind, COUNT(*) n FROM mfg_mrp_links WHERE workspace_id = ? GROUP BY kind ORDER BY kind",
    [ws],
  );
  expect(links.map((l) => [l.kind, Number(l.n)])).toEqual([
    ["mo", 2],
    ["pr", 1],
  ]);

  /* ---------- halaman ---------- */
  await page.goto(`/app/w/${ws}/manufacturing/mrp`);
  await expect(page.getByRole("heading", { name: "MRP · Perencanaan Bahan" })).toBeVisible();
  await expect(page.getByText("Dokumen dari MRP")).toBeVisible();
});
