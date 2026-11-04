import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import type mysql from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";
import { cleanMfg, grantProduction, mfgConn, sql } from "./production-helpers";

/**
 * Production M11–M12: traceability maju/mundur, simulasi recall, laporan produksi, log limbah B3, dasbor.
 * Data lot/genealogi/order/penjualan diisi lewat SQL di workspace uji sendiri; semua angka dibandingkan dengan agregat SQL biasa.
 */
const TAG = `m11${Date.now().toString().slice(-6)}`;
let c: mysql.Connection;
let base = "";
let ws = "";
let tenantId = "";
let revoke: (() => Promise<void>) | null = null;

test.afterAll(async () => {
  if (revoke) await revoke();
  if (c) {
    await c.execute("DELETE FROM app_users WHERE email LIKE ?", [`e2e-${TAG}-%`]);
    if (ws) {
      await c.query("SET FOREIGN_KEY_CHECKS = 0");
      for (const t of ["inv_movements", "sls_document_lines", "sls_documents", "md_items"])
        await c.execute(`DELETE FROM ${t} WHERE workspace_id = ?`, [ws]);
      await c.query("SET FOREIGN_KEY_CHECKS = 1");
      await cleanMfg(c, ws);
      await c.query("SET FOREIGN_KEY_CHECKS = 0");
      await c.execute("DELETE FROM workspace_members WHERE workspace_id = ?", [ws]);
      await c.execute("DELETE FROM workspaces WHERE id = ?", [ws]);
      await c.execute("DELETE FROM tenants WHERE id = ?", [tenantId]);
      await c.query("SET FOREIGN_KEY_CHECKS = 1");
    }
    await c.end();
  }
});

const id = () => crypto.randomUUID();

test("PRODUCTION M11–M12: trace, recall, laporan, limbah B3, dasbor, gerbang akses", async ({ page, browser }) => {
  test.setTimeout(300_000);
  c = await mfgConn();
  await login(page);
  base = await resolveWorkspaceId(page);
  // Tenant sendiri (pemilik = admin dev) supaya pemberian add-on spec Production lain pada tenant dev tidak mengubah gerbang entitlement di sini.
  const [bw] = await sql(c, "SELECT t.owner_id FROM workspaces w JOIN tenants t ON t.id = w.tenant_id WHERE w.id = ?", [base]);
  tenantId = id();
  await c.execute("INSERT INTO tenants (id, name, subdomain, owner_id, status) VALUES (?,?,?,?, 'active')", [tenantId, `E2E ${TAG}`, `e2e-${TAG}`, bw.owner_id]);
  ws = id();
  await c.execute("INSERT INTO workspaces (id, tenant_id, name, slug, status) VALUES (?,?,?,?, 'active')", [ws, tenantId, `E2E Production ${TAG}`, `e2e-${TAG}`]);
  await c.execute("INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?,?,?, 'owner')", [id(), ws, bw.owner_id]);
  await c.query("SET FOREIGN_KEY_CHECKS = 0");

  const call = (mod: string, fn: string, data: unknown, p = page) =>
    p.evaluate(
      async ({ mod, fn, data }) => {
        const m = await import(/* @vite-ignore */ `/src/lib/${mod}.ts`);
        try {
          return { ok: true, v: await (m as any)[fn]({ data }) };
        } catch (e) {
          return { ok: false, error: (e as Error).message };
        }
      },
      { mod, fn, data },
    ) as Promise<{ ok: boolean; v?: any; error?: string }>;
  const T = "production-trace.functions";

  /* ---------- fixture ---------- */
  const item = { rm: id(), fg: id() };
  await c.execute("INSERT INTO md_items (id, workspace_id, code, name) VALUES (?,?,?,?),(?,?,?,?)", [item.rm, ws, `RM-${TAG}`, "Bahan Aktif Uji", item.fg, ws, `FG-${TAG}`, "Produk Jadi Uji"]);
  const lot = { A: id(), B: id(), C: id(), D: id() };
  const mk = (l: string, no: string, itemId: string, qc: string, exp: string | null) =>
    c.execute("INSERT INTO mfg_lots (id, workspace_id, item_id, lot_no, qc_status, expiry_date) VALUES (?,?,?,?,?,?)", [l, ws, itemId, no, qc, exp]);
  const soon = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  await mk(lot.A, `LA-${TAG}`, item.rm, "released", null);
  await mk(lot.B, `LB-${TAG}`, item.fg, "released", soon);
  await mk(lot.C, `LC-${TAG}`, item.fg, "quarantine", null);
  await mk(lot.D, `LD-${TAG}`, item.fg, "hold", null);
  const bomV = id();
  const ord = { o1: id(), o2: id() };
  const mkOrder = (o: string, no: string, st: string, start: string, y: number) =>
    c.execute(
      "INSERT INTO mfg_orders (id, workspace_id, order_no, item_id, bom_version_id, planned_qty, uom, warehouse_from, warehouse_to, status, planned_start, yield_pct, batch_lot_no, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [o, ws, no, item.fg, bomV, 100, "KG", "RM", "FG", st, start, y, `B-${no}`, "00000000-0000-4000-8000-000000000000"],
    );
  const today = new Date().toISOString().slice(0, 10);
  await mkOrder(ord.o1, `MO-${TAG}-1`, "closed", today, 98.5);
  await mkOrder(ord.o2, `MO-${TAG}-2`, "in_progress", today, 96);
  await c.execute("INSERT INTO mfg_lot_genealogy (id, workspace_id, parent_lot_id, child_lot_id, order_id, qty, uom) VALUES (?,?,?,?,?,?,?),(?,?,?,?,?,?,?)", [id(), ws, lot.A, lot.B, ord.o1, 10, "KG", id(), ws, lot.B, lot.C, ord.o2, 5, "KG"]);
  // siklus buatan (C → A) tidak boleh membuat penelusuran berulang tanpa henti
  await c.execute("INSERT INTO mfg_lot_genealogy (id, workspace_id, parent_lot_id, child_lot_id, order_id, qty, uom) VALUES (?,?,?,?,?,?,?)", [id(), ws, lot.C, lot.A, ord.o2, 1, "KG"]);
  await c.execute("INSERT INTO mfg_order_costs (id, workspace_id, order_id, material_cost, labor_cost, overhead_cost, total_cost, output_qty, unit_cost, std_material_cost, std_conversion_cost, std_total_cost, variance, co_product_allocation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'[]')", [id(), ws, ord.o1, 600000, 100000, 50000, 750000, 98, 7653, 700000, 40000, 740000, 10000]);
  const out = (o: string, type: string, qty: number) =>
    c.execute("INSERT INTO mfg_order_outputs (id, workspace_id, order_id, output_type, item_id, qty, uom, idempotency_key, created_by) VALUES (?,?,?,?,?,?,?,?,?)", [id(), ws, o, type, item.fg, qty, "KG", id(), "00000000-0000-4000-8000-000000000000"]);
  await out(ord.o1, "finished", 98);
  await out(ord.o1, "scrap", 2);
  await out(ord.o2, "co_product", 4);
  const mv = (l: string, type: string, qty: number, cost: number) =>
    c.execute("INSERT INTO inv_movements (id, workspace_id, movement_type, item_code, qty, unit_cost, value, mfg_lot_id) VALUES (?,?,?,?,?,?,?,?)", [id(), ws, type, `FG-${TAG}`, qty, cost, qty * cost, l]);
  await mv(lot.A, "in", 10, 1000);
  await mv(lot.B, "in", 100, 2000);
  await mv(lot.B, "out", -30, 2000);
  await mv(lot.B, "transfer", -5, 2000); // transfer tidak dihitung
  await mv(lot.C, "in", 50, 3000);
  await mv(lot.D, "in", 7, 100); // lot di luar turunan
  const doc = async (type: string, status: string, cust: string, no: string, l: string, qty: number, price: number) => {
    const d = id();
    await c.execute("INSERT INTO sls_documents (id, workspace_id, doc_type, doc_number, doc_date, status, customer_code, customer_name, currency, exchange_rate, subtotal, tax_amount, total) VALUES (?,?,?,?,?,?,?,?,'IDR',1,0,0,0)", [d, ws, type, no, today, status, cust, `Cust ${cust}`]);
    await c.execute("INSERT INTO sls_document_lines (id, document_id, workspace_id, line_no, item_code, qty, unit_price, mfg_lot_id) VALUES (?,?,?,1,?,?,?,?)", [id(), d, ws, `FG-${TAG}`, qty, price, l]);
  };
  await doc("delivery_order", "submitted", "X", `${TAG}-DO1`, lot.B, 20, 5000);
  await doc("ar_invoice", "submitted", "X", `${TAG}-INV1`, lot.C, 5, 6000);
  await doc("ar_invoice", "submitted", "Y", `${TAG}-INV2`, lot.C, 3, 6000);
  await doc("ar_invoice", "cancelled", "Y", `${TAG}-INV3`, lot.B, 99, 1);
  await doc("ar_invoice", "draft", "Y", `${TAG}-INV4`, lot.B, 77, 1);
  await doc("sales_order", "submitted", "Z", `${TAG}-SO1`, lot.B, 55, 1); // bukan DO/faktur

  /* ---------- tanpa add-on: semua ditolak ---------- */
  await page.goto(`/app/w/${ws}`);
  for (const [fn, data] of [
    ["traceProductionLot", { workspaceId: ws, lotId: lot.A }],
    ["searchTraceLots", { workspaceId: ws, search: "" }],
    ["getProductionReport", { workspaceId: ws, from: today, to: today }],
    ["getWasteLogs", { workspaceId: ws }],
  ] as const) {
    const r = await call(T, fn, data);
    expect(r.ok, fn).toBe(false);
    expect(r.error).toMatch(/Production tidak tersedia/);
  }
  expect((await call("production-dashboard.functions", "getProductionDashboard", { workspaceId: ws })).ok).toBe(false);

  /* ---------- fitur mfg_trace dimatikan: trace diblokir, laporan/limbah tetap ---------- */
  revoke = await grantProduction(c, ws, { mfg_basic: true });
  const blocked = await call(T, "traceProductionLot", { workspaceId: ws, lotId: lot.A });
  expect(blocked.ok).toBe(false);
  expect(blocked.error).toMatch(/Traceability belum aktif/);
  expect((await call(T, "getProductionReport", { workspaceId: ws, from: today, to: today })).ok).toBe(true);
  await revoke();
  revoke = await grantProduction(c, ws);

  /* ---------- trace maju / mundur ---------- */
  const tr = await call(T, "traceProductionLot", { workspaceId: ws, lotId: lot.A });
  expect(tr.ok, tr.error).toBe(true);
  const fwd = tr.v.forward.map((n: any) => [n.lot_no, n.depth, n.order_no, n.qty]);
  expect(fwd.slice(0, 2)).toEqual([
    [`LB-${TAG}`, 1, `MO-${TAG}-1`, 10],
    [`LC-${TAG}`, 2, `MO-${TAG}-2`, 5],
  ]);
  // siklus C→A: A muncul sebagai turunan C (depth 3) tetapi penelusuran berhenti (tidak berulang)
  expect(tr.v.forward.length).toBeLessThanOrEqual(3);
  const trc = await call(T, "traceProductionLot", { workspaceId: ws, lotId: lot.C });
  const back = trc.v.backward.map((n: any) => [n.lot_no, n.depth]);
  expect(back.slice(0, 2)).toEqual([[`LB-${TAG}`, 1], [`LA-${TAG}`, 2]]);
  const isolated = await call(T, "traceProductionLot", { workspaceId: ws, lotId: lot.D });
  expect(isolated.v.forward).toEqual([]);
  expect(isolated.v.backward).toEqual([]);

  /* ---------- recall: angka = agregat SQL ---------- */
  const rc = tr.v.recall;
  const inSet = [lot.A, lot.B, lot.C];
  const [stock] = await sql(c, "SELECT SUM(qty) q, SUM(qty*unit_cost) v FROM inv_movements WHERE workspace_id = ? AND movement_type <> 'transfer' AND mfg_lot_id IN (?,?,?)", [ws, ...inSet]);
  const [sold] = await sql(c, "SELECT SUM(dl.qty) q, SUM(dl.qty*dl.unit_price) v FROM sls_document_lines dl JOIN sls_documents d ON d.id = dl.document_id WHERE dl.workspace_id = ? AND dl.mfg_lot_id IN (?,?,?) AND d.doc_type IN ('delivery_order','ar_invoice') AND d.status NOT IN ('draft','cancelled','void')", [ws, ...inSet]);
  expect(rc.remaining_qty).toBe(Number(stock.q));
  expect(rc.remaining_qty).toBe(130);
  expect(rc.remaining_value).toBe(Number(stock.v));
  expect(rc.sold_qty).toBe(Number(sold.q));
  expect(rc.sold_qty).toBe(28);
  expect(rc.sold_value).toBe(Number(sold.v));
  expect(rc.sold_value).toBe(148000);
  expect(rc.lots.map((l: any) => l.lot_no)).toEqual([`LA-${TAG}`, `LB-${TAG}`, `LC-${TAG}`]);
  expect(rc.customers.map((x: any) => [x.customer_code, x.qty, x.value, x.documents])).toEqual([["X", 25, 130000, 2], ["Y", 3, 18000, 1]]);

  // Bagian UI memerlukan workspace di tenant dev (pengalih workspace aplikasi): pindahkan workspace ke tenant dev dan beri add-on di sana.
  await revoke!();
  const [bt] = await sql(c, "SELECT tenant_id FROM workspaces WHERE id = ?", [base]);
  await c.execute("UPDATE workspaces SET tenant_id = ? WHERE id = ?", [bt.tenant_id, ws]);
  revoke = await grantProduction(c, ws);

  /* ---------- lot workspace lain ditolak ---------- */
  // workspace lain (juga ber-add-on) tetap tidak boleh membaca lot ini
  const cross = await call(T, "traceProductionLot", { workspaceId: base, lotId: lot.A });
  expect(cross.ok).toBe(false);
  expect(cross.error).toMatch(/Lot tidak ditemukan/);


  /* ---------- UI traceability ---------- */
  await page.goto(`/app/w/${ws}/manufacturing/traceability`);
  await expect(page.getByRole("heading", { name: "Traceability & Recall" })).toBeVisible({ timeout: 60_000 });
  await page.locator("select").first().selectOption({ label: new RegExp(`LA-${TAG}`) as any }).catch(async () => {
    const val = await page.locator("select option", { hasText: `LA-${TAG}` }).first().getAttribute("value");
    await page.locator("select").first().selectOption(val!);
  });
  await expect(page.getByText("Lot dalam simulasi recall")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(`Cust X`)).toBeVisible();
  await expect(page.getByText("Rp148.000").first()).toBeVisible();

  /* ---------- laporan produksi ---------- */
  const rep = await call(T, "getProductionReport", { workspaceId: ws, from: today, to: today });
  expect(rep.ok).toBe(true);
  expect(rep.v).toHaveLength(2);
  const r1 = rep.v.find((r: any) => r.order_no === `MO-${TAG}-1`);
  expect([r1.planned_qty, r1.output_qty, r1.yield_pct, r1.total_cost, r1.unit_cost, r1.variance]).toEqual([100, 98, 98.5, 750000, 7653, 10000]);
  expect(rep.v.find((r: any) => r.order_no === `MO-${TAG}-2`).total_cost).toBe(0);
  expect((await call(T, "getProductionReport", { workspaceId: ws, from: "2020-01-01", to: "2020-01-02" })).v).toEqual([]);
  expect((await call(T, "getProductionReport", { workspaceId: ws, from: today, to: "2000-01-01" })).ok).toBe(false);
  await page.goto(`/app/w/${ws}/manufacturing/reports`);
  await expect(page.getByRole("heading", { name: "Laporan Produksi" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(`MO-${TAG}-1`, { exact: true })).toBeVisible({ timeout: 30_000 });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSV" }).click()]);
  const csv = (await (await import("node:fs/promises")).readFile(await dl.path(), "utf8")).replace(/^﻿/, "");
  const lines = csv.trim().split("\n");
  expect(lines[0]).toBe("order_no,status,item,planned_start,batch_lot_no,planned_qty,output_qty,uom,yield_pct,total_cost,unit_cost,variance");
  expect(lines.some((l) => l.startsWith(`MO-${TAG}-1,closed,`) && l.includes(",750000,7653,10000"))).toBe(true);

  /* ---------- dasbor = SQL ---------- */
  const dash = await call("production-dashboard.functions", "getProductionDashboard", { workspaceId: ws });
  expect(dash.ok).toBe(true);
  const d = dash.v;
  const [oc] = await sql(c, "SELECT COUNT(*) n, AVG(yield_pct) y FROM mfg_orders WHERE workspace_id = ?", [ws]);
  expect(d.orderTotal).toBe(Number(oc.n));
  expect(d.avgYield).toBe(Math.round(Number(oc.y) * 10) / 10);
  expect(d.lotStatus).toEqual({ released: 2, quarantine: 1, hold: 1 });
  expect(d.expiringLots).toBe(1);
  expect(d.finishedQty).toBe(102); // 98 finished + 4 co_product (scrap tidak dihitung)
  expect(d.totalCost).toBe(750000);
  expect(d.totalVariance).toBe(10000);
  expect(d.orderStatus).toEqual({ closed: 1, in_progress: 1 });
  const thisMonth = d.outputByMonth.at(-1);
  expect([thisMonth.finished, thisMonth.scrap]).toEqual([102, 2]);
  await page.goto(`/app/w/${ws}/manufacturing`);
  await expect(page.getByRole("heading", { name: /Production Dashboard|Dasbor Production/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Rp750.000").first().or(page.getByText("750.000").first())).toBeVisible();

  /* ---------- log limbah B3 ---------- */
  const wv = { log_date: today, waste_code: "B105d", description: "Sisa pelarut", qty: 12.5, uom: "KG", storage_location: "TPS-1", handler_name: null, manifest_no: null, status: "stored" };
  expect((await call(T, "saveWasteLog", { workspaceId: ws, id: null, values: { ...wv, qty: 0 } })).ok).toBe(false);
  expect((await call(T, "saveWasteLog", { workspaceId: ws, id: null, values: { ...wv, status: "bocor" } })).ok).toBe(false);
  const w1 = await call(T, "saveWasteLog", { workspaceId: ws, id: null, values: wv });
  expect(w1.ok).toBe(true);
  // kode/jumlah/tanggal/satuan terkunci setelah dicatat
  for (const patch of [{ qty: 99 }, { waste_code: "B999" }, { uom: "L" }, { log_date: "2020-01-01" }])
    expect((await call(T, "saveWasteLog", { workspaceId: ws, id: w1.v.id, values: { ...wv, ...patch } })).ok).toBe(false);
  const up = await call(T, "saveWasteLog", { workspaceId: ws, id: w1.v.id, values: { ...wv, status: "handed_over", manifest_no: "MF-001", handler_name: "PT Pengolah" } });
  expect(up.ok).toBe(true);
  const [wr] = await sql(c, "SELECT status, manifest_no, CAST(qty AS CHAR) qty FROM mfg_waste_logs WHERE id = ?", [w1.v.id]);
  expect([wr.status, wr.manifest_no, wr.qty]).toEqual(["handed_over", "MF-001", "12.5000"]);
  // UI: catat limbah baru lewat dialog
  await page.goto(`/app/w/${ws}/manufacturing/waste`);
  await expect(page.getByRole("heading", { name: "Log Limbah B3" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("MF-001")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Catat limbah" }).click();
  const dlg = page.getByRole("dialog");
  const f = (label: string) => dlg.locator("div.space-y-2").filter({ hasText: new RegExp(`^${label}$`, "i") }).locator("input").first();
  await f("Kode limbah").fill("B104");
  await f("Uraian").fill("Kemasan terkontaminasi");
  await f("Jumlah").fill("3");
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Catatan tersimpan").first()).toBeVisible({ timeout: 30_000 });
  expect(Number((await sql(c, "SELECT COUNT(*) n FROM mfg_waste_logs WHERE workspace_id = ? AND waste_code = 'B104' AND qty = 3 AND is_active = 1", [ws]))[0].n)).toBe(1);
  // arsip = nonaktif (tetap ada), hilang dari daftar
  expect((await call(T, "saveWasteLog", { workspaceId: ws, id: w1.v.id, values: null, archive: true })).ok).toBe(true);
  expect(Number((await sql(c, "SELECT is_active FROM mfg_waste_logs WHERE id = ?", [w1.v.id]))[0].is_active)).toBe(0);
  expect((await call(T, "getWasteLogs", { workspaceId: ws })).v.rows.map((r: any) => r.waste_code)).toEqual(["B104"]);
  expect((await call(T, "saveWasteLog", { workspaceId: ws, id: w1.v.id, values: wv })).ok).toBe(false); // sudah diarsipkan
  // audit tercatat: INSERT, UPDATE (nilai lama tersimpan), ARCHIVE
  const au = await sql(c, "SELECT action, reason FROM mfg_audit_log WHERE workspace_id = ? AND entity_table = 'mfg_waste_logs' AND entity_id = ? ORDER BY created_at, action", [ws, w1.v.id]);
  expect(au.map((a) => a.action).sort()).toEqual(["ARCHIVE", "INSERT", "UPDATE"]);
  // workspace lain tidak bisa mengubah catatan ini
  expect((await call(T, "saveWasteLog", { workspaceId: base, id: w1.v.id, values: wv })).ok).toBe(false);

  /* ---------- peran: staff/viewer tanpa peran produksi hanya baca ---------- */
  const mkUser = async (role: string) => {
    const email = `e2e-${TAG}-${role}@example.com`;
    const r = await call("team.functions", "createWorkspaceUser", { workspaceId: ws, email, fullName: `U ${role}`, password: "Passw0rd!234", role });
    expect(r.ok, r.error).toBe(true);
    return email;
  };
  for (const role of ["staff", "viewer"]) {
    const email = await mkUser(role);
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const p = await ctx.newPage();
    await login(p, { email, password: "Passw0rd!234" });
    await p.goto(`/app/w/${ws}`);
    expect((await call(T, "getWasteLogs", { workspaceId: ws }, p)).v.canWrite, role).toBe(false);
    const wr2 = await call(T, "saveWasteLog", { workspaceId: ws, id: null, values: wv }, p);
    expect(wr2.ok, role).toBe(false);
    expect(wr2.error).toMatch(/Production tidak tersedia/);
    expect((await call(T, "traceProductionLot", { workspaceId: ws, lotId: lot.A }, p)).ok, role).toBe(true);
    await ctx.close();
  }
  expect(Number((await sql(c, "SELECT COUNT(*) n FROM mfg_waste_logs WHERE workspace_id = ? AND is_active = 1", [ws]))[0].n)).toBe(1);
});
