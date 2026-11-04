import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import type mysql from "mysql2/promise";
import type { Locator, Page } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";
import { createTestWorkspace, dropTestWorkspace, grantProduction, mfgConn, sql } from "./production-helpers";

/**
 * Production M2 (kepatuhan): profil item, registrasi produk (aturan bahan aktif), dokumen privat (unggah, pembacaan bertanda tangan + audit READ),
 * gerbang entitlement/peran/lintas-workspace. Isi dicocokkan dengan SQL; workspace uji sendiri dihapus setelah selesai.
 */
const TAG = `m2${Date.now().toString().slice(-6)}`;
const STAFF = { email: `e2e-mfg-${TAG}@example.com`, password: "Passw0rd!234" };
const field = (scope: Page | Locator, label: string): Locator =>
  scope.locator("div.space-y-2").filter({ hasText: new RegExp(`^${label}$`, "i") }).locator("input,select").first();
const jv = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

let c: mysql.Connection;
let ws = "";
let baseWs = "";
let revoke: (() => Promise<void>) | null = null;

test.afterAll(async () => {
  if (revoke) await revoke();
  if (c) {
    await c.execute("DELETE FROM workspace_members WHERE user_id IN (SELECT id FROM app_users WHERE email = ?)", [STAFF.email]);
    await c.execute("DELETE FROM user_roles WHERE user_id IN (SELECT id FROM app_users WHERE email = ?)", [STAFF.email]);
    await c.execute("DELETE FROM profiles WHERE email = ?", [STAFF.email]);
    await c.execute("DELETE FROM app_users WHERE email = ?", [STAFF.email]);
    if (ws) await c.execute("DELETE FROM workspace_members WHERE workspace_id = ?", [ws]);
    if (ws) await dropTestWorkspace(c, ws);
    await c.end();
  }
});

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

test("PRODUCTION M2: profil, registrasi, dokumen privat, gerbang akses", async ({ page, browser }) => {
  test.setTimeout(300_000);
  c = await mfgConn();
  await login(page);
  baseWs = await resolveWorkspaceId(page);
  ws = await createTestWorkspace(c, baseWs, TAG);
  const other = baseWs; // workspace lain tenant yang sama (untuk uji lintas-workspace)

  // seed master data di workspace uji
  const id = () => crypto.randomUUID();
  const fg = id(), ai = id(), solv = id(), foreign = id();
  await c.execute("INSERT INTO md_uoms (id, workspace_id, code, name) VALUES (?,?,?,?),(?,?,?,?)", [id(), ws, "kg", "Kilogram", id(), ws, "L", "Liter"]);
  for (const [i, code, name] of [[fg, "FG-1", "Herbisida Uji"], [ai, "AI-1", "Glifosat Teknis"], [solv, "SV-1", "Pelarut Uji"]] as const)
    await c.execute("INSERT INTO md_items (id, workspace_id, code, name, uom_code) VALUES (?,?,?,?, 'kg')", [i, ws, code, name]);
  await c.execute("INSERT INTO md_items (id, workspace_id, code, name, uom_code) VALUES (?,?,?,?, 'kg')", [foreign, other, `E2E-FOREIGN-${TAG}`, "Item Lain"]);
  const supplier = id();
  await c.execute("INSERT INTO md_suppliers (id, workspace_id, code, name) VALUES (?,?,?,?)", [supplier, ws, "SUP-1", "Pemasok Uji"]);
  await c.execute("INSERT INTO mfg_formulation_codes (id, workspace_id, code, name_en, name_id, physical_state) VALUES (UUID(), ?, 'EC', 'Emulsifiable concentrate', 'Konsentrat emulsi', 'liquid')", [ws]);
  const cleanForeign = async () => c.execute("DELETE FROM md_items WHERE id = ?", [foreign]);

  try {
    /* ---------- tanpa entitlement: ditolak ---------- */
    await page.goto(`/app/w/${ws}`);
    const denied = await call(page, "production-compliance.functions", "getProductionCompliance", { workspaceId: ws, section: "profiles" });
    // add-on diberikan per tenant: bila spec Production lain sedang aktif pada tenant yang sama, uji penolakan dilewati
    if (!(await sql(c, "SELECT 1 FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id JOIN workspaces w ON w.tenant_id = ta.tenant_id WHERE w.id = ? AND a.code = 'manufacturing' AND ta.status = 'active'", [ws])).length) {
      expect(denied.ok).toBe(false);
      expect(denied.error).toMatch(/Production tidak tersedia/);
      expect((await call(page, "production-compliance.functions", "saveProductionProfile", { workspaceId: ws, itemId: fg, reason: "x", values: profile("finished_good") })).ok).toBe(false);
      expect(await sql(c, "SELECT 1 FROM mfg_item_profiles WHERE workspace_id = ?", [ws])).toHaveLength(0);
    }

    revoke = await grantProduction(c, ws);

    /* ---------- profil lewat UI ---------- */
    await page.goto(`/app/w/${ws}/manufacturing/profiles`);
    await expect(page.getByRole("heading", { name: "Profil Item Produksi" })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Tambah" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.locator("select").first().selectOption(fg);
    await dlg.locator("select").nth(1).selectOption("finished_good");
    await field(dlg, "Kelas GHS").fill("GHS07, GHS09");
    await field(dlg, "Alasan perubahan").fill("Profil barang jadi uji");
    await dlg.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Perubahan tersimpan").first()).toBeVisible({ timeout: 30_000 });
    const [fgp] = await sql(c, "SELECT * FROM mfg_item_profiles WHERE workspace_id = ? AND item_id = ?", [ws, fg]);
    expect(fgp.item_class).toBe("finished_good");
    expect(jv(fgp.ghs_classes)).toEqual(["GHS07", "GHS09"]);

    // profil lain via fungsi + validasi
    expect((await call(page, "production-compliance.functions", "saveProductionProfile", { workspaceId: ws, itemId: ai, reason: "profil AI", values: { ...profile("active_ingredient"), is_b3: true, density_g_ml: 1.2345 } })).ok).toBe(true);
    expect((await call(page, "production-compliance.functions", "saveProductionProfile", { workspaceId: ws, itemId: solv, reason: "profil pelarut", values: profile("solvent") })).ok).toBe(true);
    expect((await call(page, "production-compliance.functions", "saveProductionProfile", { workspaceId: ws, itemId: foreign, reason: "lintas", values: profile("solvent") })).ok).toBe(false); // item workspace lain
    expect((await call(page, "production-compliance.functions", "saveProductionProfile", { workspaceId: ws, itemId: ai, reason: " ", values: profile("solvent") })).ok).toBe(false); // alasan kosong
    expect((await call(page, "production-compliance.functions", "saveProductionProfile", { workspaceId: ws, itemId: ai, reason: "ghs", values: { ...profile("solvent"), ghs_classes: Array.from({ length: 51 }, (_, i) => `G${i}`) } })).ok).toBe(false);
    expect(Number((await sql(c, "SELECT density_g_ml d FROM mfg_item_profiles WHERE item_id = ?", [ai]))[0].d)).toBe(1.2345);
    // update profil ada → satu baris per item
    expect((await call(page, "production-compliance.functions", "saveProductionProfile", { workspaceId: ws, itemId: solv, reason: "ubah", values: { ...profile("solvent"), shelf_life_days: 365 } })).ok).toBe(true);
    expect(await sql(c, "SELECT shelf_life_days FROM mfg_item_profiles WHERE item_id = ?", [solv])).toEqual([{ shelf_life_days: 365 }]);

    /* ---------- registrasi ---------- */
    const reg = (over: Record<string, unknown> = {}) => ({
      item_id: fg, registration_no: `RI.${TAG}.001`, permit_type: "tetap", formulation_code: "EC", valid_from: "2025-01-01", valid_until: "2099-12-31",
      status: "active", is_active: true, holder_supplier_id: null, holder_customer_id: null,
      ai_declared: [{ item_id: ai, name: "Glifosat Teknis", content: 480, unit: "g/L" }], ...over,
    });
    const save = (values: unknown, reason = "registrasi uji", idv: string | null = null) =>
      call(page, "production-compliance.functions", "saveProductionRegistration", { workspaceId: ws, id: idv, values, reason });
    const ok = await save(reg());
    expect(ok.ok, ok.error).toBe(true);
    const regId = ok.v.id as string;
    const [row] = await sql(c, "SELECT * FROM mfg_product_registrations WHERE id = ?", [regId]);
    expect(jv(row.ai_declared)).toEqual([{ item_id: ai, name: "Glifosat Teknis", content: 480, unit: "g/L" }]);
    // negatif
    expect((await save(reg({ registration_no: `RI.${TAG}.001` }))).ok).toBe(false); // nomor duplikat
    expect((await save(reg({ registration_no: "X1", item_id: solv }))).ok).toBe(false); // bukan barang jadi
    expect((await save(reg({ registration_no: "X2", valid_until: "2020-01-01" }))).ok).toBe(false); // kedaluwarsa tidak boleh aktif
    expect((await save(reg({ registration_no: "X3", valid_from: "2024-01-01", valid_until: "2023-01-01", status: "suspended" }))).ok).toBe(false); // rentang terbalik
    expect((await save(reg({ registration_no: "X4", ai_declared: [{ item_id: solv, name: "Pelarut", content: 10, unit: "g/L" }] }))).ok).toBe(false); // bukan bahan aktif
    expect((await save(reg({ registration_no: "X5", ai_declared: [] }))).ok).toBe(false);
    expect((await save(reg({ registration_no: "X6", ai_declared: [{ item_id: ai, name: "A", content: 60, unit: "%w/w" }, { item_id: ai, name: "A2", content: 50, unit: "%w/w" }] }))).ok).toBe(false); // total >100%
    expect((await save(reg({ registration_no: "X7", ai_declared: [{ item_id: ai, name: "A", content: 1.0000001, unit: "g/L" }] }))).ok).toBe(false); // presisi 6 desimal
    expect((await save(reg({ registration_no: "X8", holder_supplier_id: supplier, holder_customer_id: supplier }))).ok).toBe(false); // dua prinsipal
    expect((await save(reg({ registration_no: "X9", ai_declared: [{ item_id: foreign, name: "Lain", content: 1, unit: "g/L" }] }))).ok).toBe(false); // bahan aktif workspace lain
    expect((await save(reg({ registration_no: "X10", holder_supplier_id: "11111111-1111-4111-8111-111111111111" }))).ok).toBe(false); // prinsipal tak dikenal
    expect((await save(reg({ registration_no: "X11", formulation_code: "ZZ" }))).ok).toBe(false); // kode formulasi tak dikenal
    // identitas item tak dapat diubah
    await c.execute("UPDATE mfg_item_profiles SET item_class='finished_good' WHERE item_id = ?", [solv]);
    expect((await save(reg({ item_id: solv }), "ganti item", regId)).ok).toBe(false);
    await c.execute("UPDATE mfg_item_profiles SET item_class='solvent' WHERE item_id = ?", [solv]);
    // update sah + alasan kosong ditolak
    expect((await save(reg({ valid_until: "2098-06-30" }), "perpanjang", regId)).ok).toBe(true);
    expect((await save(reg(), " ", regId)).ok).toBe(false);
    expect(String((await sql(c, "SELECT valid_until v FROM mfg_product_registrations WHERE id = ?", [regId]))[0].v)).toBe("2098-06-30");
    // id registrasi workspace lain / acak tidak bisa diubah
    expect((await save(reg(), "x", "22222222-2222-4222-8222-222222222222")).ok).toBe(false);

    /* ---------- dokumen privat ---------- */
    const up = (entityId: string, kind: string, bytes: Buffer, mime = "application/pdf", reason = "unggah uji") =>
      call(page, "production-compliance.functions", "uploadProductionDocument", { workspaceId: ws, entityId, kind, filename: "izin.pdf", mime, base64: bytes.toString("base64"), reason });
    expect((await up(regId, "permit", Buffer.from("bukan pdf"))).ok).toBe(false); // magic byte salah
    expect((await up(regId, "permit", Buffer.alloc(5 * 1024 * 1024 + 10, 0x41))).ok).toBe(false); // > 5 MB (validator base64 / ukuran)
    expect((await up("33333333-3333-4333-8333-333333333333", "permit", PDF)).ok).toBe(false); // target tak ada
    expect((await up((await sql(c, "SELECT id FROM mfg_item_profiles WHERE item_id = ?", [fg]))[0].id, "permit", PDF)).ok).toBe(false); // entitas profil bukan registrasi
    // lewat UI: edit registrasi → unggah izin
    await page.goto(`/app/w/${ws}/manufacturing/registrations`);
    await expect(page.getByText(`RI.${TAG}.001`).first()).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: /^Edit / }).first().click();
    const rdlg = page.getByRole("dialog");
    await field(rdlg, "Alasan perubahan").fill("Unggah izin uji");
    await rdlg.locator('input[type="file"]').first().setInputFiles({ name: "izin.pdf", mimeType: "application/pdf", buffer: PDF });
    await expect(page.getByText("Dokumen tersimpan").first()).toBeVisible({ timeout: 30_000 });
    const [doc] = await sql(c, "SELECT * FROM mfg_document_links WHERE workspace_id = ? AND kind = 'permit'", [ws]);
    expect(doc.entity_id).toBe(regId);
    expect(Number(doc.size_bytes)).toBe(PDF.length);
    expect((await sql(c, "SELECT permit_file_id p FROM mfg_product_registrations WHERE id = ?", [regId]))[0].p).toBe(doc.id);
    // dokumen SDS untuk profil
    const [aiProfile] = await sql(c, "SELECT id FROM mfg_item_profiles WHERE item_id = ?", [ai]);
    const sds = await up(aiProfile.id, "sds", PDF, "application/pdf", "SDS uji");
    expect(sds.ok, sds.error).toBe(true);
    await page.keyboard.press("Escape");

    // pembacaan: token bertanda tangan, audit READ, isi berkas sama
    const opened = await call(page, "production-compliance.functions", "openProductionDocument", { workspaceId: ws, id: doc.id });
    expect(opened.ok, opened.error).toBe(true);
    const fetched = await page.evaluate(async (u) => {
      const r = await fetch(u);
      return { s: r.status, t: r.headers.get("content-type"), b: new TextDecoder().decode(new Uint8Array(await r.arrayBuffer())).slice(0, 5) };
    }, opened.v.url as string);
    expect(fetched).toEqual({ s: 200, t: "application/pdf", b: "%PDF-" });
    expect(Number((await sql(c, "SELECT COUNT(*) n FROM mfg_audit_log WHERE workspace_id = ? AND action = 'READ' AND entity_id = ?", [ws, doc.id]))[0].n)).toBe(1);
    const tampered = await page.evaluate(async (u) => (await fetch(u.slice(0, -3) + "abc")).status, opened.v.url as string);
    expect(tampered).toBe(403);
    const anon = await browser.newContext();
    expect((await anon.request.get(`http://127.0.0.1:3999${opened.v.url}`)).status()).toBe(401); // tanpa sesi
    await anon.close();
    expect((await call(page, "production-compliance.functions", "openProductionDocument", { workspaceId: ws, id: "44444444-4444-4444-8444-444444444444" })).ok).toBe(false);
    expect((await call(page, "production-compliance.functions", "openProductionDocument", { workspaceId: other, id: doc.id })).ok).toBe(false); // workspace lain

    /* ---------- peran: staff tanpa peran produksi ditolak, dengan supervisor boleh ---------- */
    const [adm] = await sql(c, "SELECT id FROM app_users WHERE email = ?", ["dnicorp.id@gmail.com"]);
    await c.execute("INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (UUID(), ?, ?, 'owner')", [ws, adm.id]);
    const created = await call(page, "team.functions", "createWorkspaceUser", { workspaceId: ws, email: STAFF.email, fullName: "E2E MFG Staff", password: STAFF.password, role: "staff" });
    expect(created.ok, created.error).toBe(true);
    const sctx = await browser.newContext();
    const spage = await sctx.newPage();
    await login(spage, STAFF);
    await spage.goto(`/app/w/${ws}`);
    const staffSave = () => call(spage, "production-compliance.functions", "saveProductionProfile", { workspaceId: ws, itemId: solv, reason: "staf", values: { ...profile("solvent"), shelf_life_days: 7 } });
    expect((await call(spage, "production-compliance.functions", "getProductionCompliance", { workspaceId: ws, section: "profiles" })).ok).toBe(true); // lihat boleh
    const denyStaff = await staffSave();
    expect(denyStaff.ok).toBe(false);
    expect((await call(spage, "production-compliance.functions", "uploadProductionDocument", { workspaceId: ws, entityId: (await sql(c, "SELECT id FROM mfg_item_profiles WHERE item_id = ?", [ai]))[0].id, kind: "sds", filename: "a.pdf", mime: "application/pdf", base64: PDF.toString("base64"), reason: "x" })).ok).toBe(false);
    const [su] = await sql(c, "SELECT id FROM app_users WHERE email = ?", [STAFF.email]);
    await c.execute("INSERT INTO mfg_workspace_roles (id, workspace_id, user_id, role) VALUES (UUID(), ?, ?, 'production_supervisor')", [ws, su.id]);
    expect((await staffSave()).ok).toBe(true);
    await c.execute("UPDATE mfg_workspace_roles SET role = 'operator' WHERE user_id = ?", [su.id]);
    expect((await staffSave()).ok).toBe(false);
    await sctx.close();

    // audit append-only: tiap simpan tercatat dengan alasan
    const audit = await sql(c, "SELECT entity_table, action, reason FROM mfg_audit_log WHERE workspace_id = ?", [ws]);
    expect(audit.some((a) => a.entity_table === "mfg_item_profiles" && a.reason === "Profil barang jadi uji")).toBe(true);
    expect(audit.some((a) => a.entity_table === "mfg_product_registrations" && a.reason === "perpanjang" && a.action === "UPDATE")).toBe(true);
  } finally {
    await cleanForeign();
  }
});

function profile(item_class: string) {
  return {
    item_class, cas_no: null, is_b3: false, shelf_life_days: null, density_g_ml: null, potency_basis: "as_is", requires_qc_incoming: false, fefo: true,
    storage_condition: null, ghs_classes: [], incompatible_classes: [], un_number: null, is_active: true,
  };
}
