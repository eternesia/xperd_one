import { expect, test, type Page } from "@playwright/test";
import crypto from "node:crypto";
import type mysql from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";
import { createTestWorkspace, dropTestWorkspace, grantProduction, mfgConn, sql } from "./production-helpers";

/**
 * Production M6–M10: order → rilis (kunci BOM, koreksi potensi, penyeimbang) → issue FEFO → batch record → jam kerja → output →
 * QC/selesai → tutup (biaya aktual vs standar) → jurnal outbox (blocked_mapping/blocked_period → posted, idempoten) → pembalikan.
 * Seluruh angka dihitung ulang dari SQL; workspace uji terpisah; data & pengguna uji dibersihkan.
 */
const TAG = `c${Date.now().toString().slice(-6)}`;
const PASS = "ProdE2E2026!";
const SUP = { email: `e2e-prd-sup-${TAG}@xperd.local`, password: PASS };
const NOR = { email: `e2e-prd-nor-${TAG}@xperd.local`, password: PASS };
let c: mysql.Connection;
let base = "";
let ws = "";
let revoke: (() => Promise<void>) | null = null;
const uuid = () => crypto.randomUUID();
const q = (s: string, p: unknown[] = []) => sql(c, s, p);

test.afterAll(async () => {
  if (!c) return;
  try {
    if (revoke) await revoke();
    if (ws) {
      await c.execute("DELETE FROM acc_period_locks WHERE workspace_id = ?", [ws]);
      await c.query("SET FOREIGN_KEY_CHECKS = 0");
      for (const t of ["acc_journal_lines", "acc_journal_entries", "inv_movements", "md_items", "md_uoms", "md_warehouses", "md_accounts", "workspace_members"])
        await c.execute(`DELETE FROM ${t} WHERE workspace_id = ?`, [ws]);
      await c.query("SET FOREIGN_KEY_CHECKS = 1");
      await dropTestWorkspace(c, ws);
    }
    await c.execute("DELETE FROM profiles WHERE email LIKE ?", [`e2e-prd-%-${TAG}@%`]);
    await c.execute("DELETE FROM user_roles WHERE user_id IN (SELECT id FROM app_users WHERE email LIKE ?)", [`e2e-prd-%-${TAG}@%`]);
    await c.execute("DELETE FROM app_users WHERE email LIKE ?", [`e2e-prd-%-${TAG}@%`]);
  } finally {
    await c.end();
  }
});

const call = (page: Page, file: string, fn: string, data: unknown) =>
  page.evaluate(
    async ({ file, fn, data }) => {
      const m = await import(/* @vite-ignore */ `/src/lib/${file}`);
      try {
        return { ok: true, v: await (m as any)[fn]({ data }) };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    { file, fn, data },
  ) as Promise<{ ok: boolean; v?: any; error?: string }>;
const ord = (page: Page, fn: string, data: Record<string, unknown>) => call(page, "production-orders.functions.ts", fn, { workspaceId: ws, ...data });
const field = (scope: Page | import("@playwright/test").Locator, label: string) =>
  scope.locator(`div.space-y-2:has(> label:text-is("${label}"))`).locator("input,select").first();
test.use({ actionTimeout: 20_000 });

test("PRODUCTION M6–M10: order, issue, batch record, output, biaya, jurnal, pembalikan", async ({ page, browser }) => {
  test.setTimeout(540_000);
  c = await mfgConn();
  await login(page);
  base = await resolveWorkspaceId(page);
  ws = await createTestWorkspace(c, base, TAG);
  const [admin] = await q("SELECT id FROM app_users WHERE email = ?", ["dnicorp.id@gmail.com"]);
  const adminId = admin.id as string;
  await c.execute("INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?,?,?, 'owner')", [uuid(), ws, adminId]);

  /* ---------- tanpa entitlement: ditolak ---------- */
  await page.goto(`/app/w/${ws}`);
  // (add-on bersifat per tenant: bila fork/spec lain sedang memberi add-on pada tenant ini, cek ini dilewati)
  const [others] = await q("SELECT COUNT(*) n FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id JOIN workspaces w ON w.tenant_id = ta.tenant_id WHERE w.id = ? AND a.code = 'manufacturing'", [ws]);
  if (Number(others.n) === 0) {
    const denied = await ord(page, "getProductionOrders", { status: "" });
    expect(denied.ok).toBe(false);
    expect(denied.error).toMatch(/Production tidak tersedia/);
  }
  revoke = await grantProduction(c, ws);

  /* ---------- fixture ---------- */
  await c.execute("INSERT INTO md_uoms (id, workspace_id, code, name) VALUES (?,?, 'KG', 'Kilogram')", [uuid(), ws]);
  for (const w of ["WH-RM", "WH-FG"]) await c.execute("INSERT INTO md_warehouses (id, workspace_id, code, name) VALUES (?,?,?,?)", [uuid(), ws, w, w]);
  const acc: Record<string, string> = { rm_inventory: "9101", wip_material: "9102", wip_conversion: "9103", fg_inventory: "9104", labor_applied: "9105", overhead_applied: "9106", other_applied: "9107" };
  for (const code of Object.values(acc)) await c.execute("INSERT INTO md_accounts (id, workspace_id, code, name, account_type) VALUES (?,?,?,?, 'asset')", [uuid(), ws, code, `Akun ${code}`]);
  const item = async (code: string, cost: number, cls: string, shelf: number | null) => {
    const id = uuid();
    await c.execute("INSERT INTO md_items (id, workspace_id, code, name, uom_code, cost_price) VALUES (?,?,?,?, 'KG', ?)", [id, ws, `${code}-${TAG}`, `Item ${code}`, cost]);
    await c.execute("INSERT INTO mfg_item_profiles (id, workspace_id, item_id, item_class, ghs_classes, incompatible_classes, shelf_life_days, created_by) VALUES (?,?,?,?, '[]', '[]', ?, ?)", [uuid(), ws, id, cls, shelf, adminId]);
    return { id, code: `${code}-${TAG}` };
  };
  const ai = await item("AI", 1100, "active_ingredient", null);
  const fill = await item("FILL", 90, "filler", null);
  const fg = await item("FG", 0, "finished_good", 365);
  await c.execute(
    "INSERT INTO mfg_product_registrations (id, workspace_id, item_id, registration_no, permit_type, ai_declared, valid_from, valid_until, status, created_by) VALUES (?,?,?,?, 'tetap', ?, '2020-01-01', '2099-12-31', 'active', ?)",
    [uuid(), ws, fg.id, `REG-${TAG}`, JSON.stringify([{ item_id: ai.id, name: "AI", content: 10, unit: "%w/w" }]), adminId],
  );
  const bomId = uuid();
  const verId = uuid();
  await c.execute("INSERT INTO mfg_boms (id, workspace_id, item_id, code, created_by) VALUES (?,?,?,?,?)", [bomId, ws, fg.id, `BOM-${TAG}`, adminId]);
  await c.execute(
    "INSERT INTO mfg_bom_versions (id, workspace_id, bom_id, version_no, status, base_batch_qty, base_uom, std_yield_pct, effective_from, change_reason, created_by) VALUES (?,?,?,1,'approved',100,'KG',100,'2020-01-01','e2e',?)",
    [verId, ws, bomId, adminId],
  );
  const line = (itemId: string, seq: number, qty: number, comp: number, basis: string) =>
    c.execute(
      "INSERT INTO mfg_bom_lines (id, workspace_id, bom_version_id, item_id, line_type, qty_per_base, uom, basis, potency_compensate, tolerance_pct, is_critical, sequence, created_by) VALUES (?,?,?,?, 'ingredient', ?, 'KG', ?, ?, 0, 0, ?, ?)",
      [uuid(), ws, verId, itemId, qty, basis, comp, seq, adminId],
    );
  await line(ai.id, 1, 10, 1, "active_equivalent");
  await line(fill.id, 2, 90, 0, "gross");
  const lot = async (itemId: string, no: string, status: string, assay: number | null, expiry: string) => {
    const id = uuid();
    await c.execute("INSERT INTO mfg_lots (id, workspace_id, item_id, lot_no, qc_status, assay_pct, expiry_date, created_by) VALUES (?,?,?,?,?,?,?,?)", [id, ws, itemId, no, status, assay, expiry, adminId]);
    return id;
  };
  const stock = (lotId: string, code: string, qty: number, cost: number) =>
    c.execute(
      "INSERT INTO inv_movements (id, workspace_id, movement_date, movement_type, item_code, warehouse_code, qty, unit_cost, value, ref_type, mfg_lot_id, mfg_idempotency_key) VALUES (?,?, CURDATE(), 'in', ?, 'WH-RM', ?, ?, ?, 'e2e', ?, ?)",
      [uuid(), ws, code, qty, cost, qty * cost, lotId, uuid()],
    );
  const aiQuar = await lot(ai.id, `AI-Q-${TAG}`, "quarantine", 80, "2099-01-01"); // belum dirilis
  await stock(aiQuar, ai.code, 100, 2000);
  const fillLot = await lot(fill.id, `FILL-1-${TAG}`, "released", null, "2099-06-01");
  await stock(fillLot, fill.code, 500, 100);
  // work center, tarif & routing (standar)
  const wcId = uuid();
  await c.execute("INSERT INTO mfg_work_centers (id, workspace_id, code, name, center_type, capacity_per_hour, labor_rate_per_hour, overhead_rate_per_hour, created_by) VALUES (?,?, 'WC-E', 'Mixer', 'mixing', 10, 50000, 30000, ?)", [wcId, ws, adminId]);
  await c.execute("INSERT INTO mfg_cost_rates (id, workspace_id, work_center_id, valid_from, labor_rate_per_hour, overhead_rate_per_hour, created_by) VALUES (?,?,?, '2020-01-01', 60000, 40000, ?)", [uuid(), ws, wcId, adminId]);
  const rtId = uuid();
  await c.execute("INSERT INTO mfg_routings (id, workspace_id, item_id, code, name, created_by) VALUES (?,?,?,?, 'Routing', ?)", [rtId, ws, fg.id, `RT-${TAG}`, adminId]);
  await c.execute("INSERT INTO mfg_routing_ops (id, workspace_id, routing_id, work_center_id, sequence, setup_minutes, run_minutes, created_by) VALUES (?,?,?,?,1,30,60,?)", [uuid(), ws, rtId, wcId, adminId]);

  // pengguna uji: supervisor+QA (peran produksi) dan staf tanpa peran produksi
  await page.goto(`/app/w/${ws}`);
  for (const [u, nm] of [[SUP, "Sup"], [NOR, "Nor"]] as const) {
    const r = await call(page, "team.functions.ts", "createWorkspaceUser", { workspaceId: ws, email: u.email, password: u.password, fullName: `E2E ${nm}`, role: "staff" });
    expect(r.ok, r.error).toBe(true);
  }
  const [sup] = await q("SELECT id FROM app_users WHERE email = ?", [SUP.email]);
  const [nor] = await q("SELECT id FROM app_users WHERE email = ?", [NOR.email]);
  for (const r of ["production_supervisor", "qa_manager"]) await c.execute("INSERT INTO mfg_workspace_roles (id, workspace_id, user_id, role) VALUES (?,?,?,?)", [uuid(), ws, sup.id, r]);

  /* ---------- order lewat UI ---------- */
  await page.goto(`/app/w/${ws}/manufacturing/orders`);
  await expect(page.getByRole("heading", { name: "Perintah Produksi" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Order baru" }).click();
  const dlg = page.getByRole("dialog");
  await field(dlg, "Produk").selectOption({ label: `${fg.code} — Item FG` });
  await field(dlg, "Versi BOM").selectOption({ index: 1 });
  await field(dlg, "Kuantitas").fill("200");
  await field(dlg, "Gudang bahan").selectOption("WH-RM");
  await field(dlg, "Gudang hasil").selectOption("WH-FG");
  await field(dlg, "Alasan").fill("Order uji E2E");
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText(/MO-\d{4}-\d{5}/).first()).toBeVisible({ timeout: 30_000 });
  const [o1] = await q("SELECT * FROM mfg_orders WHERE workspace_id = ?", [ws]);
  expect(o1.status).toBe("draft");
  expect(o1.order_no).toMatch(new RegExp(`^MO-${new Date().getFullYear()}-00001$`));
  expect(Number(o1.planned_qty)).toBe(200);
  const orderId = o1.id as string;
  const T = (status: string, reason = "uji", key = uuid()) => ord(page, "transitionProductionOrder", { orderId, status, key, reason });

  // lompat status ditolak; planned via UI
  expect((await T("released")).ok).toBe(false);
  await page.getByRole("button", { name: "Lihat" }).first().click();
  await page.getByRole("button", { name: "Direncanakan" }).click();
  await page.getByRole("dialog").last().locator("input").last().fill("Rencana disetujui");
  await page.getByRole("dialog").last().getByRole("button", { name: "Simpan" }).click();
  await expect.poll(async () => (await q("SELECT status FROM mfg_orders WHERE id = ?", [orderId]))[0].status, { timeout: 30_000 }).toBe("planned");
  await page.keyboard.press("Escape");

  /* ---------- rilis: negatif ---------- */
  // belum ada lot rilis ber-assay → ditolak
  const noLot = await T("released");
  expect(noLot.ok).toBe(false);
  expect(noLot.error).toMatch(/lot rilis/i);
  expect(await q("SELECT 1 FROM mfg_order_materials WHERE order_id = ?", [orderId])).toHaveLength(0);
  // lot rilis tersedia, tetapi registrasi produk kedaluwarsa → ditolak
  const aiLot = await lot(ai.id, `AI-1-${TAG}`, "released", 80, "2099-01-01");
  await stock(aiLot, ai.code, 100, 2000);
  await c.execute("UPDATE mfg_product_registrations SET valid_until = '2020-06-30', status = 'expired' WHERE workspace_id = ?", [ws]);
  const noReg = await T("released");
  expect(noReg.ok).toBe(false);
  expect(noReg.error).toMatch(/Registrasi/);
  await c.execute("UPDATE mfg_product_registrations SET valid_until = '2099-12-31', status = 'active' WHERE workspace_id = ?", [ws]);

  /* ---------- rilis (idempoten) ---------- */
  const relKey = uuid();
  expect((await T("released", "rilis", relKey)).ok).toBe(true);
  expect((await T("released", "rilis", relKey)).ok).toBe(true); // replay kunci sama
  expect((await q("SELECT COUNT(*) n FROM mfg_order_transitions WHERE order_id = ? AND to_status = 'released'", [orderId]))[0].n).toBe(1);
  const mats = await q("SELECT m.*, i.code FROM mfg_order_materials m JOIN md_items i ON i.id = m.item_id WHERE m.order_id = ? ORDER BY m.sequence", [orderId]);
  expect(mats).toHaveLength(2);
  // skala 200/100 = 2: AI rencana 20, assay 80% → 20/0.8 = 25; pengisi 180 − (25−20) = 175 (penyeimbang)
  expect([Number(mats[0].planned_qty), Number(mats[0].corrected_qty), Number(mats[0].potency_used_pct)]).toEqual([20, 25, 80]);
  expect(mats[0].lot_id).toBe(aiLot);
  expect([Number(mats[1].planned_qty), Number(mats[1].corrected_qty), Number(mats[1].is_balancing)]).toEqual([180, 175, 1]);
  expect(Number(mats[0].corrected_qty) + Number(mats[1].corrected_qty)).toBe(200);
  const steps = await q("SELECT * FROM mfg_batch_steps WHERE order_id = ? ORDER BY sequence", [orderId]);
  expect(steps).toHaveLength(2);
  expect(steps[0].instruction).toContain(ai.code);
  const [rel] = await q("SELECT * FROM mfg_orders WHERE id = ?", [orderId]);
  expect(rel.batch_lot_no).toMatch(new RegExp(`^LOT-\\d{6}-${fg.code}-01$`));
  expect(Number(rel.expected_output_qty)).toBe(200);
  expect(rel.registration_id).toBeTruthy();

  /* ---------- peran: staf tanpa peran produksi ditolak; viewer/lintas workspace ---------- */
  const ctxN = await browser.newContext({ storageState: "./e2e/lang-en.storage.json" });
  const pageN = await ctxN.newPage();
  await login(pageN, NOR);
  await pageN.goto(`/app/w/${ws}`);
  const nIssue = await ord(pageN, "issueProductionMaterial", { materialId: mats[0].id, qty: 1, lotId: null, key: uuid(), reason: "x" });
  expect(nIssue.ok).toBe(false);
  expect(nIssue.error).toMatch(/tidak tersedia/);
  expect((await ord(pageN, "transitionProductionOrder", { orderId, status: "cancelled", key: uuid(), reason: "x" })).ok).toBe(false);
  expect((await ord(pageN, "getProductionOrders", { status: "" })).ok).toBe(true); // baca boleh
  // lintas workspace: workspace dasar tak punya entitlement
  // (add-on per tenant → workspace lain boleh dibuka, tetapi data order ini tidak boleh bocor)
  const xws = await call(page, "production-orders.functions.ts", "getProductionOrderDetail", { workspaceId: base, orderId });
  expect(!xws.ok || (xws.v.materials.length === 0 && xws.v.steps.length === 0 && xws.v.outputs.length === 0)).toBe(true);
  expect((await call(page, "production-orders.functions.ts", "transitionProductionOrder", { workspaceId: base, orderId, status: "cancelled", key: uuid(), reason: "x" })).ok).toBe(false);

  /* ---------- issue ---------- */
  // lot belum dirilis tidak boleh dipakai
  const bad = await ord(page, "issueProductionMaterial", { materialId: mats[0].id, qty: 5, lotId: aiQuar, key: uuid(), reason: "x" });
  expect(bad.ok).toBe(false);
  // melebihi kuantitas terkoreksi
  expect((await ord(page, "issueProductionMaterial", { materialId: mats[0].id, qty: 26, lotId: aiLot, key: uuid(), reason: "x" })).ok).toBe(false);
  // batal setelah ada issue ditolak (cek setelah issue pertama)
  const k1 = uuid();
  const i1 = await ord(page, "issueProductionMaterial", { materialId: mats[0].id, qty: 25, lotId: aiLot, key: k1, reason: "Timbang AI" });
  expect(i1.ok, i1.error).toBe(true);
  expect((await ord(page, "issueProductionMaterial", { materialId: mats[0].id, qty: 25, lotId: aiLot, key: k1, reason: "Timbang AI" })).ok).toBe(true); // replay
  const movs = await q("SELECT * FROM inv_movements WHERE workspace_id = ? AND ref_type = 'mfg_order' AND qty < 0", [ws]);
  expect(movs).toHaveLength(1);
  expect([Number(movs[0].qty), Number(movs[0].unit_cost), Number(movs[0].value)]).toEqual([-25, 2000, -50000]);
  expect((await q("SELECT status FROM mfg_orders WHERE id = ?", [orderId]))[0].status).toBe("in_progress");
  expect((await T("cancelled")).ok).toBe(false);
  // dua issue pengisi bersamaan 100+100 > 175 → tepat satu berhasil
  const [r1, r2] = await Promise.all([
    ord(page, "issueProductionMaterial", { materialId: mats[1].id, qty: 100, lotId: null, key: uuid(), reason: "paralel A" }),
    ord(page, "issueProductionMaterial", { materialId: mats[1].id, qty: 100, lotId: null, key: uuid(), reason: "paralel B" }),
  ]);
  expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1);
  expect((await ord(page, "issueProductionMaterial", { materialId: mats[1].id, qty: 75, lotId: null, key: uuid(), reason: "sisa pengisi" })).ok).toBe(true);
  const [iss] = await q("SELECT SUM(issued_qty) s FROM mfg_order_materials WHERE order_id = ?", [orderId]);
  expect(Number(iss.s)).toBe(200);
  const [matv] = await q("SELECT -SUM(value) v FROM inv_movements WHERE workspace_id = ? AND ref_type = 'mfg_order' AND qty < 0", [ws]);
  expect(Number(matv.v)).toBe(25 * 2000 + 175 * 100); // 67.500
  const sels = await q("SELECT * FROM mfg_lot_selections WHERE workspace_id = ?", [ws]);
  expect(sels.length).toBe(3);

  /* ---------- batch record ---------- */
  // langkah ber-ukur: di luar batas → deviasi
  expect((await ord(page, "saveProductionStep", { orderId, id: null, values: { instruction: "Cek suhu", measure_label: "Suhu", measure_unit: "C", min_value: "20", max_value: "30" }, reason: "tambah" })).ok).toBe(true);
  const allSteps = await q("SELECT * FROM mfg_batch_steps WHERE order_id = ? ORDER BY sequence", [orderId]);
  expect(allSteps).toHaveLength(3);
  expect((await ord(page, "performProductionStep", { stepId: allSteps[2].id, value: null, reason: "x" })).ok).toBe(false); // nilai ukur wajib
  for (const s of allSteps.slice(0, 2)) expect((await ord(page, "performProductionStep", { stepId: s.id, value: null, reason: "Selesai" })).ok).toBe(true);
  const perf = await ord(page, "performProductionStep", { stepId: allSteps[2].id, value: 35, reason: "Ukur" });
  expect(perf.ok && perf.v.withinLimits === false).toBe(true);
  expect((await q("SELECT * FROM mfg_deviations WHERE workspace_id = ? AND source = 'manual'", [ws]))).toHaveLength(1);
  // verifikasi: tanda tangan wajib & berbeda dari pelaksana
  const chal = async (actor: string, stepId: string) => {
    const id = uuid();
    await c.execute("INSERT INTO mfg_esign_challenges (id, workspace_id, entity_table, entity_id, action, actor, code_hash, expires_at, verified_at) VALUES (?,?, 'mfg_batch_steps', ?, 'step_verify', ?, 'x', DATE_ADD(NOW(6), INTERVAL 5 MINUTE), NOW(6))", [id, ws, stepId, actor]);
    return id;
  };
  expect((await ord(page, "verifyProductionStep", { stepId: allSteps[0].id, signature: uuid(), reason: "x" })).ok).toBe(false); // tanpa tanda tangan
  expect((await ord(page, "verifyProductionStep", { stepId: allSteps[0].id, signature: await chal(adminId, allSteps[0].id), reason: "x" })).error).toMatch(/berbeda/); // pelaksana = verifikator
  const ctxS = await browser.newContext({ storageState: "./e2e/lang-en.storage.json" });
  const pageS = await ctxS.newPage();
  await login(pageS, SUP);
  await pageS.goto(`/app/w/${ws}`);
  const sig = await chal(sup.id, allSteps[0].id);
  expect((await ord(pageS, "verifyProductionStep", { stepId: allSteps[0].id, signature: sig, reason: "Terverifikasi" })).ok).toBe(true);
  expect((await ord(pageS, "verifyProductionStep", { stepId: allSteps[0].id, signature: sig, reason: "ulang" })).ok).toBe(false); // sekali pakai
  const [vs] = await q("SELECT * FROM mfg_batch_steps WHERE id = ?", [allSteps[0].id]);
  expect([vs.status, vs.verified_by, vs.signature_id]).toEqual(["verified", sup.id, sig]);
  // override hanya oleh supervisor produksi eksplisit (admin/pemilik ditolak) dan hanya sebelum issue
  expect((await ord(page, "overrideProductionMaterial", { materialId: mats[0].id, qty: 24, reason: "x" })).ok).toBe(false);
  expect((await ord(pageS, "overrideProductionMaterial", { materialId: mats[0].id, qty: 24, reason: "x" })).ok).toBe(false); // sudah di-issue

  /* ---------- jam kerja & output ---------- */
  const lk = uuid();
  expect((await ord(page, "logProductionLabor", { orderId, centerId: wcId, hours: 2.5, key: lk, reason: "Mixing" })).ok).toBe(true);
  expect((await ord(page, "logProductionLabor", { orderId, centerId: wcId, hours: 2.5, key: lk, reason: "Mixing" })).ok).toBe(true);
  const lab = await q("SELECT * FROM mfg_order_labor WHERE order_id = ?", [orderId]);
  expect(lab).toHaveLength(1);
  expect([Number(lab[0].labor_rate), Number(lab[0].overhead_rate)]).toEqual([60000, 40000]); // tarif berlaku (bukan default pusat kerja)
  // output salah ditolak
  expect((await ord(page, "recordProductionOutput", { orderId, type: "finished", itemId: ai.id, qty: 10, key: uuid(), reason: "x" })).ok).toBe(false);
  expect((await ord(page, "recordProductionOutput", { orderId, type: "co_product", itemId: fg.id, qty: 1, key: uuid(), reason: "x" })).ok).toBe(false);
  // qc_pending sebelum output ditolak
  expect((await T("qc_pending")).ok).toBe(false);
  const ok = uuid();
  expect((await ord(page, "recordProductionOutput", { orderId, type: "finished", itemId: fg.id, qty: 190, key: ok, reason: "Hasil batch" })).ok).toBe(true);
  expect((await ord(page, "recordProductionOutput", { orderId, type: "finished", itemId: fg.id, qty: 190, key: ok, reason: "Hasil batch" })).ok).toBe(true);
  const outs = await q("SELECT * FROM mfg_order_outputs WHERE order_id = ?", [orderId]);
  expect(outs).toHaveLength(1);
  const [fgLot] = await q("SELECT * FROM mfg_lots WHERE id = ?", [outs[0].lot_id]);
  expect(fgLot.qc_status).toBe("quarantine");
  expect(fgLot.lot_no).toBe(rel.batch_lot_no);
  expect(fgLot.expiry_date).toBeTruthy();
  const [inMv] = await q("SELECT * FROM inv_movements WHERE id = ?", [outs[0].movement_id]);
  expect([Number(inMv.qty), Number(inMv.unit_cost), Number(inMv.value), inMv.warehouse_code, inMv.mfg_lot_id]).toEqual([190, Math.round(67500 / 190), 190 * Math.round(67500 / 190), "WH-FG", fgLot.id]);
  expect((await q("SELECT parent_lot_id FROM mfg_lot_genealogy WHERE child_lot_id = ?", [fgLot.id])).map((r) => r.parent_lot_id).sort()).toEqual([aiLot, fillLot].sort());

  /* ---------- QC → selesai → tutup ---------- */
  expect((await T("qc_pending")).ok).toBe(true);
  const [qc] = await q("SELECT yield_pct FROM mfg_orders WHERE id = ?", [orderId]);
  expect(Number(qc.yield_pct)).toBe(95); // 190/200
  expect((await q("SELECT * FROM mfg_deviations WHERE workspace_id = ? AND source = 'yield'", [ws]))).toHaveLength(1); // toleransi 0%
  const t1 = await T("completed");
  expect(t1.ok).toBe(false); // lot hasil masih karantina
  expect(t1.error).toMatch(/QC/);
  await c.execute("UPDATE mfg_lots SET qc_status = 'released' WHERE id = ?", [fgLot.id]);
  expect((await T("completed")).ok).toBe(true);
  const t2 = await T("closed");
  expect(t2.ok).toBe(false); // deviasi terbuka
  expect(t2.error).toMatch(/deviasi/i);
  await c.execute("UPDATE mfg_deviations SET status = 'closed', root_cause = 'x', capa = 'x', closed_by = ?, closed_at = NOW(6) WHERE workspace_id = ?", [adminId, ws]);
  // New 19: biaya konversi per unit hasil di profil item (tenaga kerja Rp100 + biaya lain Rp50 per unit; hasil 190)
  await c.execute("UPDATE mfg_item_profiles SET conv_labor_per_unit = 100, conv_other_per_unit = 50 WHERE workspace_id = ? AND item_id = ?", [ws, fg.id]);
  expect((await T("closed")).ok).toBe(true);

  /* ---------- biaya: aktual vs standar dari SQL ---------- */
  const [cost] = await q("SELECT * FROM mfg_order_costs WHERE order_id = ?", [orderId]);
  const mat = 67500;
  const labor = 2.5 * 60000 + 190 * 100;
  const oth = 190 * 50;
  const ovh = 2.5 * 40000;
  const stdMat = 20 * 1100 + 180 * 90;
  const stdConv = ((30 + 60 * 2) / 60) * (50000 + 30000) + 200 * (100 + 50);
  expect([Number(cost.material_cost), Number(cost.labor_cost), Number(cost.overhead_cost), Number(cost.other_cost), Number(cost.total_cost)]).toEqual([mat, labor, ovh, oth, mat + labor + ovh + oth]);
  expect([Number(cost.output_qty), Number(cost.unit_cost)]).toEqual([190, Math.round((mat + labor + ovh + oth) / 190)]);
  expect([Number(cost.std_material_cost), Number(cost.std_conversion_cost), Number(cost.std_total_cost), Number(cost.variance)]).toEqual([stdMat, stdConv, stdMat + stdConv, mat + labor + ovh + oth - (stdMat + stdConv)]);

  /* ---------- jurnal: outbox ---------- */
  let ev = await q("SELECT event_code, amount, status FROM mfg_journal_events WHERE order_id = ? ORDER BY event_code", [orderId]);
  expect(ev).toHaveLength(6); // J1–J4, J5C, J5M (J4 = biaya lain dari profil item)
  expect(ev.every((e) => e.status === "blocked_mapping")).toBe(true); // mapping akun belum diisi
  expect(await q("SELECT 1 FROM acc_journal_entries WHERE workspace_id = ?", [ws])).toHaveLength(0);
  for (const [k, a] of Object.entries(acc)) expect((await ord(page, "saveProductionMapping", { mappingKey: k, account: a, reason: "Mapping uji" })).ok).toBe(true);
  expect((await ord(page, "saveProductionMapping", { mappingKey: "fg_inventory", account: "TIDAK-ADA", reason: "x" })).ok).toBe(false);
  // periode berjalan terkunci → blocked_period
  const period = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()).slice(0, 7);
  await c.execute("INSERT INTO acc_period_locks (id, workspace_id, period, lock_type) VALUES (UUID(), ?, ?, 'hard')", [ws, period]);
  expect((await ord(page, "retryProductionJournals", { orderId, reason: "coba" })).ok).toBe(true);
  ev = await q("SELECT event_code, status FROM mfg_journal_events WHERE order_id = ?", [orderId]);
  expect(ev.every((e) => e.status === "blocked_period")).toBe(true);
  await c.execute("DELETE FROM acc_period_locks WHERE workspace_id = ?", [ws]);
  expect((await ord(pageN, "retryProductionJournals", { orderId, reason: "x" })).ok).toBe(false); // bukan cost accountant
  expect((await ord(page, "retryProductionJournals", { orderId, reason: "ulang" })).ok).toBe(true);
  expect((await ord(page, "retryProductionJournals", { orderId, reason: "ulang lagi" })).ok).toBe(true); // idempoten
  ev = await q("SELECT event_code, amount, status FROM mfg_journal_events WHERE order_id = ? ORDER BY event_code", [orderId]);
  expect(ev.map((e) => [e.event_code, Number(e.amount), e.status])).toEqual([
    ["J1", mat, "posted"], ["J2", labor, "posted"], ["J3", ovh, "posted"], ["J4", oth, "posted"], ["J5C", labor + ovh + oth, "posted"], ["J5M", mat, "posted"],
  ]);
  const entries = await q("SELECT * FROM acc_journal_entries WHERE workspace_id = ?", [ws]);
  expect(entries).toHaveLength(6);
  for (const e of entries) {
    const ls = await q("SELECT account_code, debit, credit FROM acc_journal_lines WHERE entry_id = ?", [e.id]);
    expect(ls.reduce((s, l) => s + Number(l.debit), 0)).toBe(ls.reduce((s, l) => s + Number(l.credit), 0));
  }
  const bal = async (code: string) => Number((await q("SELECT COALESCE(SUM(debit-credit),0) b FROM acc_journal_lines WHERE workspace_id = ? AND account_code = ?", [ws, code]))[0].b);
  expect(await bal("9102")).toBe(0); // WIP material habis
  expect(await bal("9103")).toBe(0); // WIP konversi habis
  expect(await bal("9104")).toBe(mat + labor + ovh + oth); // barang jadi
  expect(await bal("9107")).toBe(-oth); // biaya lain dibebankan
  expect(await bal("9101")).toBe(-mat);
  // UI akuntansi menampilkan rekonsiliasi
  await page.goto(`/app/w/${ws}/manufacturing/accounting`);
  await expect(page.getByRole("heading", { name: /Biaya & Jurnal Production/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Selisih WIP: Rp0/)).toBeVisible({ timeout: 30_000 });
  const rec = await call(page, "production-orders.functions.ts", "getProductionAccounting", { workspaceId: ws });
  expect(rec.v.reconciliation.wip_ledger).toBe(0);
  expect(rec.v.reconciliation.wip_difference).toBe(0);

  /* ---------- pembalikan ---------- */
  await c.execute("INSERT INTO acc_period_locks (id, workspace_id, period, lock_type) VALUES (UUID(), ?, ?, 'hard')", [ws, period]);
  expect((await ord(page, "reverseProductionJournals", { orderId, reason: "salah" })).ok).toBe(false);
  await c.execute("DELETE FROM acc_period_locks WHERE workspace_id = ?", [ws]);
  const rv = await ord(page, "reverseProductionJournals", { orderId, reason: "Koreksi E2E" });
  expect(rv.ok && rv.v.ok).toBe(true);
  ev = await q("SELECT event_code, amount, status FROM mfg_journal_events WHERE order_id = ? ORDER BY event_code", [orderId]);
  expect(ev).toHaveLength(12);
  expect(ev.filter((e) => e.event_code.startsWith("R-")).every((e) => e.status === "posted" && Number(e.amount) < 0)).toBe(true);
  expect(ev.filter((e) => !e.event_code.startsWith("R-")).every((e) => e.status === "reversed")).toBe(true);
  expect(await bal("9104")).toBe(0);
  expect(await bal("9101")).toBe(0);
  expect((await q("SELECT COUNT(*) n FROM acc_journal_entries WHERE workspace_id = ?", [ws]))[0].n).toBe(12);
  await ord(page, "reverseProductionJournals", { orderId, reason: "ulang" });
  expect((await q("SELECT COUNT(*) n FROM acc_journal_entries WHERE workspace_id = ?", [ws]))[0].n).toBe(12); // tidak berlipat
  await ord(page, "retryProductionJournals", { orderId, reason: "tidak boleh posting ulang yang dibalik" });
  expect((await q("SELECT COUNT(*) n FROM acc_journal_entries WHERE workspace_id = ?", [ws]))[0].n).toBe(12);
  expect((await q("SELECT COUNT(*) n FROM mfg_order_costs WHERE order_id = ?", [orderId]))[0].n).toBe(1); // biaya tidak dihitung ulang

  /* ---------- lot dijual: hanya rilis + registrasi berlaku ---------- */
  const sell = await ord(page, "getSellableLots", { itemCode: fg.code });
  expect(sell.v.map((l: any) => l.lot_no)).toEqual([rel.batch_lot_no]);
  expect(sell.v[0].unit_cost).toBe(Math.round(67500 / 190));
  await c.execute("UPDATE mfg_product_registrations SET valid_until = '2020-06-30', status = 'expired' WHERE workspace_id = ?", [ws]);
  expect((await ord(page, "getSellableLots", { itemCode: fg.code })).v).toHaveLength(0);
  await c.execute("UPDATE mfg_product_registrations SET valid_until = '2099-12-31', status = 'active' WHERE workspace_id = ?", [ws]);
  await c.execute("UPDATE mfg_lots SET qc_status = 'hold' WHERE id = ?", [fgLot.id]);
  expect((await ord(page, "getSellableLots", { itemCode: fg.code })).v).toHaveLength(0);

  /* ---------- audit & UI detail ---------- */
  const audit = await q("SELECT entity_table, action FROM mfg_audit_log WHERE workspace_id = ?", [ws]);
  for (const t of ["mfg_orders", "mfg_order_materials", "mfg_batch_steps", "mfg_order_outputs", "mfg_order_labor", "mfg_journal_events", "mfg_account_mappings"])
    expect(audit.some((a) => a.entity_table === t), t).toBe(true);
  await page.goto(`/app/w/${ws}/manufacturing/orders`);
  await page.getByRole("button", { name: "Lihat" }).first().click();
  await expect(page.getByText(/Total Rp346\.000/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("posted").first()).toBeVisible();
  await ctxN.close();
  await ctxS.close();
});
