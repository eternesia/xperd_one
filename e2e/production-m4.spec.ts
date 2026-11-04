import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import type mysql from "mysql2/promise";
import type { Locator, Page } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";
import { createTestWorkspace, dropTestWorkspace, grantProduction, mfgConn, sql } from "./production-helpers";

/**
 * Production M4 (lot & stok): lot baru selalu karantina, pemilihan FEFO atomik (tiket teraudit), non-FEFO butuh alasan, lot blokir
 * (karantina/kedaluwarsa) tak terpilih, pengeluaran butuh tiket, dua pengeluaran bersamaan tak membuat saldo negatif, pembalikan append-only,
 * stok ber-lot tak bisa diubah/dihapus, GRN item berprofil → lot karantina otomatis, gerbang entitlement/peran/lintas-workspace.
 * Saldo dihitung ulang dari SQL; workspace uji sendiri dihapus setelah selesai.
 */
const TAG = `m4${Date.now().toString().slice(-6)}`;
const PW = "Passw0rd!234";
const PLAIN = { email: `e2e-m4-plain-${TAG}@example.com`, password: PW };
const WHUSER = { email: `e2e-m4-wh-${TAG}@example.com`, password: PW };
const field = (scope: Page | Locator, label: string): Locator =>
  scope.locator("div.space-y-2").filter({ hasText: new RegExp(`^${label}$`, "i") }).locator("input,select").first();
const uid = () => crypto.randomUUID();
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

let c: mysql.Connection;
let ws = "";
let revoke: (() => Promise<void>) | null = null;

const call = (page: Page, mod: string, fn: string, data: unknown) =>
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
  ) as Promise<{ ok: boolean; v?: any; error?: string }>;

test.afterAll(async () => {
  if (revoke) await revoke();
  if (c) {
    await c.execute("DELETE FROM workspace_members WHERE user_id IN (SELECT id FROM app_users WHERE email IN (?,?))", [PLAIN.email, WHUSER.email]);
    await c.execute("DELETE FROM profiles WHERE email IN (?,?)", [PLAIN.email, WHUSER.email]);
    await c.execute("DELETE FROM user_roles WHERE user_id IN (SELECT id FROM app_users WHERE email IN (?,?))", [PLAIN.email, WHUSER.email]);
    await c.execute("DELETE FROM app_users WHERE email IN (?,?)", [PLAIN.email, WHUSER.email]);
    if (ws) {
      await c.execute("DELETE FROM prc_document_lines WHERE workspace_id = ?", [ws]);
      await c.execute("DELETE FROM prc_documents WHERE workspace_id = ?", [ws]);
      await c.execute("DELETE FROM inv_movements WHERE workspace_id = ?", [ws]);
      await dropTestWorkspace(c, ws);
    }
    await c.end();
  }
});

test("PRODUCTION M4: lot, FEFO atomik, tiket pengeluaran, pembalikan, GRN→lot, gerbang akses", async ({ page, browser }) => {
  test.setTimeout(420_000);
  c = await mfgConn();
  await login(page);
  const baseWs = await resolveWorkspaceId(page);
  ws = await createTestWorkspace(c, baseWs, TAG);

  // ---------- seed master data ----------
  const rm1 = uid(), rm2 = uid(), foreignItem = uid();
  await c.execute("INSERT INTO md_uoms (id, workspace_id, code, name) VALUES (?,?,?,?)", [uid(), ws, "kg", "Kilogram"]);
  for (const [i, code, name] of [[rm1, "RM-1", "Bahan Baku 1"], [rm2, "RM-2", "Bahan Tanpa Profil"]] as const)
    await c.execute("INSERT INTO md_items (id, workspace_id, code, name, uom_code) VALUES (?,?,?,?, 'kg')", [i, ws, code, name]);
  await c.execute("INSERT INTO md_items (id, workspace_id, code, name, uom_code) VALUES (?,?,?,?, 'kg')", [foreignItem, baseWs, `E2E-M4-FOREIGN-${TAG}`, "Item Lain"]);
  await c.execute("INSERT INTO md_warehouses (id, workspace_id, code, name) VALUES (?,?,?,?),(?,?,?,?)", [uid(), ws, "WH-A", "Gudang A", uid(), ws, "WH-B", "Gudang B"]);
  await c.execute("INSERT INTO mfg_item_profiles (id, workspace_id, item_id, item_class, ghs_classes, incompatible_classes) VALUES (UUID(), ?, ?, 'solvent', '[]', '[]')", [ws, rm1]);
  const sup = uid();
  await c.execute("INSERT INTO md_suppliers (id, workspace_id, code, name) VALUES (?,?,?,?)", [sup, ws, "SUP-1", "Pemasok Uji"]);

  const lot = async (no: string, expiry: string | null, status: string, qty: number, extra = "") => {
    const id = uid();
    await c.execute(
      "INSERT INTO mfg_lots (id, workspace_id, item_id, lot_no, expiry_date, qc_status, created_at) VALUES (?,?,?,?,?,?, ?)",
      [id, ws, rm1, no, expiry, status, extra || new Date()],
    );
    if (qty)
      await c.execute(
        "INSERT INTO inv_movements (id, workspace_id, movement_date, movement_type, item_code, warehouse_code, qty, unit_cost, value, ref_type, ref_number, mfg_lot_id, mfg_idempotency_key) VALUES (?,?,?,'in','RM-1','WH-A',?,1000,?, 'goods_receipt', ?, ?, ?)",
        [uid(), ws, today(), qty, qty * 1000, `SEED-${no}`, id, uid()],
      );
    return id;
  };
  const bal = async (lotId: string, wh = "WH-A") => Number((await sql(c, "SELECT COALESCE(SUM(qty),0) q FROM inv_movements WHERE workspace_id = ? AND mfg_lot_id = ? AND warehouse_code = ?", [ws, lotId, wh]))[0].q);

  // ---------- tanpa entitlement: ditolak (hanya bila tak ada spec lain yang memberi add-on pada tenant yang sama) ----------
  await page.goto(`/app/w/${ws}`);
  const shared = Number((await sql(c, "SELECT COUNT(*) n FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id JOIN workspaces w ON w.tenant_id = ta.tenant_id WHERE a.code = 'manufacturing' AND w.id = ?", [ws]))[0].n);
  if (shared === 0) {
    const denied = await call(page, "production-lots.functions", "getProductionLots", { workspaceId: ws, page: 0, status: "", search: "" });
    expect(denied.ok).toBe(false);
    expect(denied.error).toMatch(/Production tidak tersedia/);
    expect((await call(page, "production-lots.functions", "saveProductionLot", { workspaceId: ws, id: null, reason: "x", values: lotValues(rm1, "DENIED") })).ok).toBe(false);
    expect(await sql(c, "SELECT 1 FROM mfg_lots WHERE workspace_id = ?", [ws])).toHaveLength(0);
  }

  revoke = await grantProduction(c, ws);

  // ---------- pengguna uji: tanpa peran produksi & peran gudang ----------
  const [adm] = await sql(c, "SELECT id FROM app_users WHERE email = ?", ["dnicorp.id@gmail.com"]);
  await c.execute("INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (UUID(), ?, ?, 'owner')", [ws, adm.id]);
  for (const u of [PLAIN, WHUSER]) {
    const r = await call(page, "team.functions", "createWorkspaceUser", { workspaceId: ws, email: u.email, password: u.password, fullName: u.email.split("@")[0], role: "staff" });
    expect(r.ok, r.error).toBe(true);
  }
  const [whRow] = await sql(c, "SELECT id FROM app_users WHERE email = ?", [WHUSER.email]);
  await c.execute("INSERT INTO mfg_workspace_roles (id, workspace_id, user_id, role) VALUES (UUID(), ?, ?, 'warehouse')", [ws, whRow.id]);

  // ---------- lot baru lewat UI → selalu karantina ----------
  await page.goto(`/app/w/${ws}/manufacturing/lots`);
  await expect(page.getByRole("heading", { name: "Lot & Stok" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Lot baru" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.locator("select").first().selectOption(rm1);
  await field(dlg, "Nomor lot").fill(`UI-${TAG}`);
  await field(dlg, "Kedaluwarsa").fill("2031-05-05");
  await field(dlg, "Assay \\(%\\)").fill("98.5");
  await field(dlg, "Alasan perubahan").fill("Lot uji UI");
  await dlg.getByRole("button", { name: "Simpan lot" }).click();
  await expect(page.getByText("Lot tersimpan").first()).toBeVisible({ timeout: 30_000 });
  const [uiLot] = await sql(c, "SELECT * FROM mfg_lots WHERE workspace_id = ? AND lot_no = ?", [ws, `UI-${TAG}`]);
  expect(uiLot.qc_status).toBe("quarantine");
  expect(Number(uiLot.assay_pct)).toBe(98.5);
  expect(String(uiLot.expiry_date).slice(0, 10)).toBe("2031-05-05");
  await expect(page.getByRole("row", { name: new RegExp(`UI-${TAG}`) })).toContainText("quarantine");
  // audit alasan tercatat
  expect((await sql(c, "SELECT reason FROM mfg_audit_log WHERE workspace_id = ? AND entity_table = 'mfg_lots' AND entity_id = ? AND action = 'INSERT'", [ws, uiLot.id]))[0].reason).toBe("Lot uji UI");
  // nomor lot ganda & item lintas-workspace & pemasok lintas-workspace ditolak; status tidak bisa diubah lewat form
  const save = (values: unknown, reason = "uji", idv: string | null = null) => call(page, "production-lots.functions", "saveProductionLot", { workspaceId: ws, id: idv, values, reason });
  expect((await save(lotValues(rm1, `UI-${TAG}`))).ok).toBe(false);
  expect((await save(lotValues(foreignItem, `X-${TAG}`))).ok).toBe(false);
  expect((await save({ ...lotValues(rm1, `Y-${TAG}`), partner_id: "00000000-0000-4000-8000-000000000001" })).ok).toBe(false);
  expect((await save(lotValues(rm1, `Z-${TAG}`), "  ")).ok).toBe(false);
  expect((await save({ ...lotValues(rm1, `W-${TAG}`), expiry_date: "2020-01-01", mfg_date: "2021-01-01" })).ok).toBe(false);
  expect((await save({ ...lotValues(rm1, `UI-${TAG}`), supplier_lot_no: "SL-9", partner_id: sup }, "ubah", uiLot.id)).ok).toBe(true);
  const [upd] = await sql(c, "SELECT * FROM mfg_lots WHERE id = ?", [uiLot.id]);
  expect(upd.supplier_lot_no).toBe("SL-9");
  expect(upd.qc_status).toBe("quarantine");

  // ---------- FEFO ----------
  const L1 = await lot("L1", "2030-01-01", "released", 100);
  const L2 = await lot("L2", "2029-06-01", "released", 10);
  const L3 = await lot("L3", "2031-01-01", "released", 100);
  const LQ = await lot("LQ", "2028-01-01", "quarantine", 50); // karantina: tak boleh terpilih meski paling cepat
  const LE = await lot("LE", "2020-01-01", "released", 50); // kedaluwarsa: tak boleh terpilih
  const select = (qty: number, key = uid(), lotId: string | null = null, reason = "") =>
    call(page, "production-lots.functions", "selectProductionLot", { workspaceId: ws, itemId: rm1, warehouse: "WH-A", qty, lotId, reason, key });
  const k1 = uid();
  const s1 = await select(5, k1);
  expect(s1.ok, s1.error).toBe(true);
  expect(s1.v.id).toBe(L2); // kedaluwarsa terdekat yang layak & stok cukup
  const s2 = await select(20);
  expect(s2.v.id).toBe(L1); // L2 hanya 10 → lot berikutnya
  expect((await sql(c, "SELECT non_fefo, reason FROM mfg_lot_selections WHERE idempotency_key = ?", [k1]))[0]).toMatchObject({ non_fefo: 1 - 1, reason: "FEFO default" });
  // non-FEFO: butuh alasan
  expect((await select(5, uid(), L3, "")).ok).toBe(false);
  const nf = await select(5, uid(), L3, "Permintaan pelanggan");
  expect(nf.ok, nf.error).toBe(true);
  expect((await sql(c, "SELECT non_fefo, reason FROM mfg_lot_selections WHERE lot_id = ?", [L3]))[0]).toMatchObject({ non_fefo: 1, reason: "Permintaan pelanggan" });
  // lot karantina / kedaluwarsa eksplisit ditolak; stok kurang ditolak; kuantitas 5 desimal ditolak
  expect((await select(5, uid(), LQ, "paksa")).ok).toBe(false);
  expect((await select(5, uid(), LE, "paksa")).ok).toBe(false);
  expect((await select(1000)).ok).toBe(false);
  expect((await select(0.00001)).ok).toBe(false);
  // replay idempoten: kunci sama & parameter sama → lot sama, satu baris; parameter beda → konflik
  const rep = await select(5, k1);
  expect(rep.v.id).toBe(L2);
  expect(await sql(c, "SELECT 1 FROM mfg_lot_selections WHERE idempotency_key = ?", [k1])).toHaveLength(1);
  expect((await select(6, k1)).ok).toBe(false);
  // audit pemilihan
  expect((await sql(c, "SELECT COUNT(*) n FROM mfg_audit_log WHERE workspace_id = ? AND action = 'SELECT'", [ws]))[0].n).toBeGreaterThanOrEqual(3);

  // ---------- pengeluaran butuh tiket; saldo; concurrency ----------
  const issue = (key: string, refNumber = "ISS-1") => call(page, "production-lots.functions", "issueSelectedLot", { workspaceId: ws, key, refNumber, reason: "pakai produksi" });
  expect((await issue(uid())).ok).toBe(false); // tanpa tiket
  const i1 = await issue(k1);
  expect(i1.ok, i1.error).toBe(true);
  expect(await bal(L2)).toBe(5);
  const [mv] = await sql(c, "SELECT * FROM inv_movements WHERE id = ?", [i1.v.id]);
  expect(Number(mv.qty)).toBe(-5);
  expect(mv.mfg_lot_id).toBe(L2);
  expect(Number(mv.unit_cost)).toBe(1000);
  expect((await issue(k1)).v.id).toBe(i1.v.id); // replay idempoten
  expect(await bal(L2)).toBe(5);
  // dua pengeluaran bersamaan (4 + 4 > saldo 5) → tepat satu berhasil, saldo tak pernah negatif
  const ka = uid(), kb = uid();
  expect((await select(4, ka)).v.id).toBe(L2);
  expect((await select(4, kb)).v.id).toBe(L2); // tiket tidak mereservasi; penegakan terjadi saat pengeluaran
  const both = await page.evaluate(async ({ ws, ka, kb }) => {
    const m = await import(/* @vite-ignore */ "/src/lib/production-lots.functions.ts");
    const run = (key: string, n: string) => (m as any).issueSelectedLot({ data: { workspaceId: ws, key, refNumber: n, reason: "bersamaan" } }).then(() => true, () => false);
    return Promise.all([run(ka, "ISS-A"), run(kb, "ISS-B")]);
  }, { ws, ka, kb });
  expect(both.filter(Boolean)).toHaveLength(1);
  expect(await bal(L2)).toBe(1);
  expect(await bal(L2)).toBeGreaterThanOrEqual(0);
  // lot dikarantina setelah dipilih tak bisa dikeluarkan
  const kq = uid();
  expect((await select(5, kq, L3, "alasan")).ok).toBe(true);
  await c.execute("UPDATE mfg_lots SET qc_status = 'hold' WHERE id = ?", [L3]);
  expect((await issue(kq)).ok).toBe(false);
  await c.execute("UPDATE mfg_lots SET qc_status = 'released' WHERE id = ?", [L3]);
  expect((await issue(kq)).ok).toBe(true);
  expect(await bal(L3)).toBe(95);

  // ---------- pembalikan append-only ----------
  const rk = uid();
  const rev = await call(page, "production-lots.functions", "reverseLotMovement", { workspaceId: ws, movementId: i1.v.id, key: rk, reason: "salah input" });
  expect(rev.ok, rev.error).toBe(true);
  const [rv] = await sql(c, "SELECT * FROM inv_movements WHERE id = ?", [rev.v.id]);
  expect(Number(rv.qty)).toBe(5);
  expect(rv.mfg_reverses_id).toBe(i1.v.id);
  expect(await bal(L2)).toBe(6);
  expect((await call(page, "production-lots.functions", "reverseLotMovement", { workspaceId: ws, movementId: i1.v.id, key: uid(), reason: "lagi" })).ok).toBe(false); // sudah dibalik
  expect((await call(page, "production-lots.functions", "reverseLotMovement", { workspaceId: ws, movementId: rev.v.id, key: uid(), reason: "balik pembalik" })).ok).toBe(false); // pembalik tidak dibalik
  expect((await call(page, "production-lots.functions", "reverseLotMovement", { workspaceId: ws, movementId: i1.v.id, key: rk, reason: "replay" })).ok).toBe(true); // replay kunci sama (idempoten)
  expect(await bal(L2)).toBe(6);
  // stok ber-lot tak bisa dihapus/diubah lewat jalur generik
  const delTry = await call(page, "data.functions", "deleteWorkspaceRow", { workspaceId: ws, table: "inv_movements", id: i1.v.id });
  expect(delTry.ok).toBe(false);
  const updTry = await call(page, "data.functions", "saveWorkspaceRow", { workspaceId: ws, table: "inv_movements", id: i1.v.id, data: { qty: -1 } });
  expect(updTry.ok).toBe(false);
  expect(await sql(c, "SELECT 1 FROM inv_movements WHERE id = ?", [i1.v.id])).toHaveLength(1);
  // stok tanpa lot tetap bisa dikelola seperti biasa
  const plain = uid();
  await c.execute("INSERT INTO inv_movements (id, workspace_id, movement_date, movement_type, item_code, warehouse_code, qty, unit_cost, value) VALUES (?,?,?,'in','RM-2','WH-A',3,1,3)", [plain, ws, today()]);
  expect((await call(page, "data.functions", "deleteWorkspaceRow", { workspaceId: ws, table: "inv_movements", id: plain })).ok).toBe(true);

  // ---------- kartu stok per lot (UI) ----------
  await page.goto(`/app/w/${ws}/manufacturing/lots`);
  await page.getByRole("button", { name: "Kartu stok L2" }).click();
  const card = page.getByRole("dialog");
  await expect(card.getByText("Kartu stok per lot")).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText("WH-A:")).toBeVisible();
  await expect(card.getByText("ISS-1").first()).toBeVisible();
  await expect(card.locator("strong").first()).toHaveText("6");
  await page.keyboard.press("Escape");

  // ---------- profil gudang ----------
  const [whA] = await sql(c, "SELECT id FROM md_warehouses WHERE workspace_id = ? AND code = 'WH-A'", [ws]);
  const w1 = await call(page, "production-lots.functions", "saveProductionWarehouse", { workspaceId: ws, warehouseId: whA.id, status: "rm", reason: "gudang bahan baku" });
  expect(w1.ok, w1.error).toBe(true);
  expect((await call(page, "production-lots.functions", "saveProductionWarehouse", { workspaceId: ws, warehouseId: whA.id, status: "quarantine", reason: "ubah" })).ok).toBe(true);
  expect(await sql(c, "SELECT warehouse_status FROM mfg_warehouse_profiles WHERE workspace_id = ?", [ws])).toEqual([{ warehouse_status: "quarantine" }]);
  const [foreignWh] = await sql(c, "SELECT id FROM md_warehouses WHERE workspace_id = ? LIMIT 1", [baseWs]);
  if (foreignWh) expect((await call(page, "production-lots.functions", "saveProductionWarehouse", { workspaceId: ws, warehouseId: foreignWh.id, status: "rm", reason: "lintas" })).ok).toBe(false);

  // ---------- GRN item berprofil → lot karantina otomatis ----------
  const grn = uid(), grnDraft = uid();
  for (const [id, no, st] of [[grn, `GRN-${TAG}`, "submitted"], [grnDraft, `GRND-${TAG}`, "draft"]] as const) {
    await c.execute("INSERT INTO prc_documents (id, workspace_id, doc_type, doc_number, doc_date, warehouse_code, status) VALUES (?,?,'goods_receipt',?,?, 'WH-A', ?)", [id, ws, no, today(), st]);
    await c.execute("INSERT INTO prc_document_lines (id, document_id, workspace_id, line_no, item_code, qty, unit_price, line_total) VALUES (UUID(),?,?,1,'RM-1',10,2500,25000)", [id, ws]);
    await c.execute("INSERT INTO prc_document_lines (id, document_id, workspace_id, line_no, item_code, qty, unit_price, line_total) VALUES (UUID(),?,?,2,'RM-2',4,100,400)", [id, ws]);
  }
  const mvRow = (docId: string, no: string, item: string, qty: number, wh = "WH-A") => ({ movement_date: today(), movement_type: "in", item_code: item, item_name: item, uom_code: "kg", warehouse_code: wh, qty, unit_cost: item === "RM-1" ? 2500 : 100, ref_type: "goods_receipt", ref_id: docId, ref_number: no });
  const insMv = (page: Page, rows: unknown[]) => call(page, "ledger.functions", "insertInvMovements", { workspaceId: ws, rows });
  expect((await insMv(page, [mvRow(grnDraft, `GRND-${TAG}`, "RM-1", 10)])).ok).toBe(false); // GRN draft
  expect((await insMv(page, [mvRow(grn, `GRN-${TAG}`, "RM-1", 10, "WH-B")])).ok).toBe(false); // gudang tak cocok
  expect((await insMv(page, [mvRow(grn, `GRN-${TAG}`, "RM-1", 11)])).ok).toBe(false); // melebihi baris GRN
  const g1 = await insMv(page, [mvRow(grn, `GRN-${TAG}`, "RM-1", 10), mvRow(grn, `GRN-${TAG}`, "RM-2", 4)]);
  expect(g1.ok, g1.error).toBe(true);
  const grnLots = await sql(c, "SELECT l.* FROM mfg_lots l JOIN inv_movements m ON m.mfg_lot_id = l.id WHERE m.workspace_id = ? AND m.ref_id = ?", [ws, grn]);
  expect(grnLots).toHaveLength(1);
  expect(grnLots[0].qc_status).toBe("quarantine");
  expect(grnLots[0].lot_no).toMatch(/^GRN-/);
  const grnMv = await sql(c, "SELECT * FROM inv_movements WHERE workspace_id = ? AND ref_id = ? ORDER BY item_code", [ws, grn]);
  expect(grnMv).toHaveLength(2);
  expect(grnMv[0].mfg_lot_id).toBe(grnLots[0].id); // RM-1 ber-lot
  expect(grnMv[1].mfg_lot_id).toBeNull(); // RM-2 tanpa profil → alur lama
  expect(await bal(grnLots[0].id)).toBe(10);
  expect((await insMv(page, [mvRow(grn, `GRN-${TAG}`, "RM-1", 1)])).ok).toBe(false); // total lot melebihi baris GRN (replay)
  // lot karantina GRN tak bisa dipilih
  expect((await call(page, "production-lots.functions", "selectProductionLot", { workspaceId: ws, itemId: rm1, warehouse: "WH-A", qty: 10, lotId: grnLots[0].id, reason: "paksa", key: uid() })).ok).toBe(false);

  // ---------- peran: tanpa peran produksi = baca saja; peran gudang = bisa ----------
  const ctxPlain = await browser.newContext({ storageState: "./e2e/lang-en.storage.json" });
  const pPlain = await ctxPlain.newPage();
  await login(pPlain, PLAIN);
  await pPlain.goto(`/app/w/${ws}`);
  const rd = await call(pPlain, "production-lots.functions", "getProductionLots", { workspaceId: ws, page: 0, status: "", search: "" });
  expect(rd.ok, rd.error).toBe(true);
  expect(rd.v.canWrite).toBe(false);
  expect(rd.v.total).toBeGreaterThan(0);
  expect((await call(pPlain, "production-lots.functions", "saveProductionLot", { workspaceId: ws, id: null, reason: "x", values: lotValues(rm1, `PL-${TAG}`) })).ok).toBe(false);
  expect((await call(pPlain, "production-lots.functions", "selectProductionLot", { workspaceId: ws, itemId: rm1, warehouse: "WH-A", qty: 1, lotId: null, reason: "", key: uid() })).ok).toBe(false);
  expect((await call(pPlain, "production-lots.functions", "reverseLotMovement", { workspaceId: ws, movementId: rev.v.id, key: uid(), reason: "x" })).ok).toBe(false);
  expect((await call(pPlain, "ledger.functions", "insertInvMovements", { workspaceId: ws, rows: [mvRow(grn, `GRN-${TAG}`, "RM-1", 0.5)] })).ok).toBe(false); // GRN item berprofil dilarang tanpa peran gudang
  await ctxPlain.close();

  const ctxWh = await browser.newContext({ storageState: "./e2e/lang-en.storage.json" });
  const pWh = await ctxWh.newPage();
  await login(pWh, WHUSER);
  await pWh.goto(`/app/w/${ws}`);
  const w2 = await call(pWh, "production-lots.functions", "saveProductionLot", { workspaceId: ws, id: null, reason: "peran gudang", values: lotValues(rm1, `WH-${TAG}`) });
  expect(w2.ok, w2.error).toBe(true);
  expect((await call(pWh, "production-lots.functions", "selectProductionLot", { workspaceId: ws, itemId: rm1, warehouse: "WH-A", qty: 1, lotId: null, reason: "", key: uid() })).ok).toBe(true);
  await ctxWh.close();

  // ---------- lintas workspace ----------
  expect((await call(page, "production-lots.functions", "getProductionLotCard", { workspaceId: ws, lotId: "00000000-0000-4000-8000-0000000000aa", page: 0 })).ok).toBe(false);
  expect((await call(page, "production-lots.functions", "getProductionLotCard", { workspaceId: baseWs, lotId: L1, page: 0 })).ok).toBe(false); // lot ws uji diminta lewat ws lain
  await c.execute("DELETE FROM md_items WHERE id = ?", [foreignItem]);
});

function lotValues(item: string, no: string) {
  return {
    item_id: item, lot_no: no, supplier_lot_no: "", partner_id: null, mfg_date: null, expiry_date: null, retest_date: null,
    assay_pct: null, lod_pct: null, density_g_ml: null, is_active: true,
  };
}
