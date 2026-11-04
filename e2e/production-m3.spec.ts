import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import type mysql from "mysql2/promise";
import type { Browser, Locator, Page } from "@playwright/test";

import { login, resolveWorkspaceId } from "./helpers";
import { createTestWorkspace, dropTestWorkspace, grantProduction, mfgConn, sql } from "./production-helpers";

/**
 * Production M3 (BOM berversi): simpan draft, ajukan tinjauan, persetujuan QA dengan kode OTP + pemisahan tugas, kesesuaian komposisi dengan
 * registrasi, versi approved terkunci + revisi, perbandingan, impor CSV, idempotensi transisi, gerbang peran/lintas-workspace. Dicocokkan dengan SQL.
 */
test.use({ actionTimeout: 20_000 });
const TAG = `m3${Date.now().toString().slice(-6)}`;
const PW = "Passw0rd!234";
const USERS = {
  pl: { email: `e2e-mfg-pl-${TAG}@example.com`, password: PW },
  qa: { email: `e2e-mfg-qa-${TAG}@example.com`, password: PW },
  plain: { email: `e2e-mfg-plain-${TAG}@example.com`, password: PW },
};
const field = (scope: Page | Locator, label: string): Locator =>
  scope.locator("div.space-y-2").filter({ hasText: new RegExp(`^${label}$`, "i") }).locator("input,select").first();
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

let c: mysql.Connection;
let ws = "";
let revoke: (() => Promise<void>) | null = null;

test.afterAll(async () => {
  if (revoke) await revoke();
  if (c) {
    const emails = Object.values(USERS).map((u) => u.email);
    await c.query("DELETE FROM user_roles WHERE user_id IN (SELECT id FROM app_users WHERE email IN (?))", [emails]);
    await c.query("DELETE FROM profiles WHERE email IN (?)", [emails]);
    await c.query("DELETE FROM workspace_members WHERE user_id IN (SELECT id FROM app_users WHERE email IN (?))", [emails]);
    await c.query("DELETE FROM app_users WHERE email IN (?)", [emails]);
    if (ws) {
      await c.execute("DELETE FROM workspace_members WHERE workspace_id = ?", [ws]);
      await dropTestWorkspace(c, ws);
    }
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

async function asUser(browser: Browser, u: { email: string; password: string }) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await login(p, u);
  await p.goto(`/app/w/${ws}`);
  return { p, close: () => ctx.close() };
}

test("PRODUCTION M3: BOM — draft, tinjauan, persetujuan QA, komposisi, kunci versi, revisi, CSV", async ({ page, browser }) => {
  test.setTimeout(420_000);
  c = await mfgConn();
  await login(page);
  const baseWs = await resolveWorkspaceId(page);
  ws = await createTestWorkspace(c, baseWs, TAG);
  const id = () => crypto.randomUUID();
  const fg = id(), ai = id(), pack = id(), foreign = id();
  await c.execute("INSERT INTO md_uoms (id, workspace_id, code, name) VALUES (?,?,?,?),(?,?,?,?),(?,?,?,?)", [id(), ws, "kg", "Kilogram", id(), ws, "L", "Liter", id(), ws, "g", "Gram"]);
  for (const [i, code, name] of [[fg, "FG-1", "Herbisida M3"], [ai, "AI-1", "Glifosat M3"], [pack, "PK-1", "Jerigen"]] as const)
    await c.execute("INSERT INTO md_items (id, workspace_id, code, name, uom_code) VALUES (?,?,?,?, 'kg')", [i, ws, code, name]);
  await c.execute("INSERT INTO md_items (id, workspace_id, code, name, uom_code) VALUES (?,?,?,?, 'kg')", [foreign, baseWs, `E2E-FOREIGN-${TAG}`, "Item Lain"]);
  await c.execute("INSERT INTO mfg_formulation_codes (id, workspace_id, code, name_en, name_id, physical_state) VALUES (UUID(), ?, 'EC', 'Emulsifiable concentrate', 'Konsentrat emulsi', 'liquid')", [ws]);
  for (const [i, cls] of [[fg, "finished_good"], [ai, "active_ingredient"], [pack, "packaging_primary"]] as const)
    await c.execute("INSERT INTO mfg_item_profiles (id, workspace_id, item_id, item_class, ghs_classes, incompatible_classes) VALUES (UUID(), ?, ?, ?, '[]', '[]')", [ws, i, cls]);
  const regId = id();
  await c.execute(
    `INSERT INTO mfg_product_registrations (id, workspace_id, item_id, registration_no, permit_type, formulation_code, ai_declared, valid_from, valid_until, status)
     VALUES (?,?,?,?, 'tetap', 'EC', ?, '2025-01-01', '2099-12-31', 'active')`,
    [regId, ws, fg, `RI.${TAG}`, JSON.stringify([{ item_id: ai, name: "Glifosat M3", content: 480, unit: "g/L" }])],
  );
  const [adm] = await sql(c, "SELECT id FROM app_users WHERE email = ?", ["dnicorp.id@gmail.com"]);
  await c.execute("INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (UUID(), ?, ?, 'owner')", [ws, adm.id]);
  try {
    /* ---------- tanpa entitlement ---------- */
    await page.goto(`/app/w/${ws}`);
    const denied = await call(page, "production-bom.functions", "getProductionBoms", { workspaceId: ws, page: 0 });
    // add-on diberikan per tenant: bila spec Production lain sedang aktif pada tenant yang sama, uji penolakan dilewati
    if (!(await sql(c, "SELECT 1 FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id JOIN workspaces w ON w.tenant_id = ta.tenant_id WHERE w.id = ? AND a.code = 'manufacturing' AND ta.status = 'active'", [ws])).length) {
      expect(denied.ok).toBe(false);
      expect(denied.error).toMatch(/Production tidak tersedia/);
    }
    revoke = await grantProduction(c, ws);

    // pengguna uji: planner, QA manager, staf tanpa peran produksi
    for (const [k, u] of Object.entries(USERS)) {
      const r = await call(page, "team.functions", "createWorkspaceUser", { workspaceId: ws, email: u.email, fullName: `E2E ${k}`, password: u.password, role: "staff" });
      expect(r.ok, r.error).toBe(true);
    }
    const uid = async (e: string) => (await sql(c, "SELECT id FROM app_users WHERE email = ?", [e]))[0].id as string;
    await c.execute("INSERT INTO mfg_workspace_roles (id, workspace_id, user_id, role) VALUES (UUID(), ?, ?, 'production_planner'),(UUID(), ?, ?, 'qa_manager')", [ws, await uid(USERS.pl.email), ws, await uid(USERS.qa.email)]);

    /* ---------- UI admin: BOM baru ---------- */
    await page.goto(`/app/w/${ws}/manufacturing/boms`);
    await expect(page.getByRole("heading", { name: "Formulasi / BOM" })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "BOM baru" }).click();
    const dlg = page.getByRole("dialog");
    await field(dlg, "Kode").fill(`BOM-${TAG}-UI`);
    await dlg.locator("select").nth(0).selectOption(fg);
    await field(dlg, "Batch dasar").fill("100");
    await dlg.locator("select").nth(2).selectOption("L");
    // baris pertama: bahan aktif ekuivalen
    const row0 = dlg.locator("tbody tr").first();
    await row0.locator("select").nth(0).selectOption(ai);
    await row0.getByLabel("Kuantitas bahan 1").fill("48");
    await row0.locator("select").nth(1).selectOption("kg");
    await row0.locator("select").nth(2).selectOption("active_equivalent");
    await field(dlg, "Alasan perubahan / persetujuan").fill("Draft UI");
    await dlg.getByRole("button", { name: "Simpan draft" }).click();
    await expect(page.getByText("Draft BOM tersimpan").first()).toBeVisible({ timeout: 30_000 });
    const [ui] = await sql(c, "SELECT b.id bid, v.id vid, v.status, v.version_no, v.base_batch_qty, v.base_uom, v.created_by FROM mfg_boms b JOIN mfg_bom_versions v ON v.bom_id = b.id WHERE b.workspace_id = ? AND b.code = ?", [ws, `BOM-${TAG}-UI`]);
    expect([ui.status, ui.version_no, Number(ui.base_batch_qty), ui.base_uom]).toEqual(["draft", 1, 100, "L"]);
    expect(ui.created_by).toBe(adm.id);
    expect(await sql(c, "SELECT qty_per_base q, uom, basis FROM mfg_bom_lines WHERE bom_version_id = ?", [ui.vid])).toEqual([{ q: "48.0000", uom: "kg", basis: "active_equivalent" }]);

    // impor CSV di dialog baru → 2 baris
    await page.getByRole("button", { name: "BOM baru" }).click();
    await page.getByRole("dialog").locator('input[type="file"]').setInputFiles({ name: "bom.csv", mimeType: "text/csv", buffer: Buffer.from("item_code,qty,uom,basis,line_type\nAI-1,48,kg,active_equivalent,ingredient\nPK-1,100,g,gross,packaging\n") });
    await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(2, { timeout: 30_000 });
    await page.keyboard.press("Escape");

    /* ---------- peran ---------- */
    const pl = await asUser(browser, USERS.pl);
    const qa = await asUser(browser, USERS.qa);
    const plain = await asUser(browser, USERS.plain);
    const values = (over: Record<string, unknown> = {}) => ({
      item_id: fg, code: `BOM-${TAG}-A`, formulation_code: "EC", target_content: 480, target_unit: "g/L", base_batch_qty: 100, base_uom: "L", std_yield_pct: 98.5,
      effective_from: "2026-01-01", effective_to: null, registration_id: regId, ...over,
    });
    const lines = (qty = 48, extra: Record<string, unknown>[] = []) => [
      { item_id: ai, line_type: "ingredient", qty_per_base: qty, uom: "kg", basis: "active_equivalent", ai_target_pct: null, potency_compensate: true, tolerance_pct: 1.5, is_critical: true, sequence: 1, add_step_note: "tambah pelan" },
      { item_id: pack, line_type: "packaging", qty_per_base: 100, uom: "g", basis: "gross", ai_target_pct: null, potency_compensate: false, tolerance_pct: 0, is_critical: false, sequence: 2, add_step_note: "" },
      ...extra,
    ];
    const saveBom = (p: Page, o: { values?: unknown; lines?: unknown; versionId?: string | null; bomId?: string | null; reason?: string }) =>
      call(p, "production-bom.functions", "saveProductionBom", { workspaceId: ws, versionId: o.versionId ?? null, bomId: o.bomId ?? null, values: o.values ?? values(), lines: o.lines ?? lines(), reason: o.reason ?? "draft uji" });

    expect((await saveBom(plain.p, {})).ok).toBe(false); // tanpa peran produksi
    expect((await call(plain.p, "production-bom.functions", "getProductionBoms", { workspaceId: ws, page: 0 })).ok).toBe(true); // lihat boleh
    // planner menyimpan draft A
    const a1 = await saveBom(pl.p, {});
    expect(a1.ok, a1.error).toBe(true);
    const v1 = a1.v.id as string;
    const [bomA] = await sql(c, "SELECT * FROM mfg_boms WHERE workspace_id = ? AND code = ?", [ws, `BOM-${TAG}-A`]);
    expect(Number(bomA.target_content)).toBe(480);
    const [ver1] = await sql(c, "SELECT * FROM mfg_bom_versions WHERE id = ?", [v1]);
    expect([ver1.status, ver1.version_no, ver1.created_by, ver1.last_modified_by, Number(ver1.std_yield_pct)]).toEqual(["draft", 1, await uid(USERS.pl.email), await uid(USERS.pl.email), 98.5]);
    expect((await sql(c, "SELECT COUNT(*) n FROM mfg_bom_lines WHERE bom_version_id = ?", [v1]))[0].n).toBe(2);
    // negatif simpan
    expect((await saveBom(pl.p, { values: values({ code: `BOM-${TAG}-A2` }), lines: lines(48, [{ ...lines()[0], sequence: 3 }]) })).ok).toBe(false); // bahan ganda
    expect((await saveBom(pl.p, { values: values({ code: `BOM-${TAG}-A3`, base_uom: "ZZ" }) })).ok).toBe(false); // satuan tak valid
    expect((await saveBom(pl.p, { values: values({ code: `BOM-${TAG}-A4` }), lines: [{ ...lines()[0], item_id: foreign }] })).ok).toBe(false); // bahan workspace lain
    expect((await saveBom(pl.p, { values: values({ code: `BOM-${TAG}-A5`, item_id: pack }) })).ok).toBe(false); // registrasi bukan milik produk
    expect((await saveBom(pl.p, { values: values({ code: `BOM-${TAG}-A6`, item_id: foreign }) , lines: lines()})).ok).toBe(false); // produk workspace lain
    expect((await saveBom(pl.p, { values: values({ code: `BOM-${TAG}-A` }) })).ok).toBe(false); // kode duplikat
    expect((await saveBom(pl.p, { reason: " " })).ok).toBe(false);
    expect((await call(pl.p, "production-bom.functions", "saveProductionBom", { workspaceId: ws, versionId: null, bomId: null, values: values({ code: `BOM-${TAG}-Z`, base_batch_qty: 0 }), lines: lines(), reason: "x" })).ok).toBe(false); // zod
    expect(Number((await sql(c, "SELECT COUNT(*) n FROM mfg_boms WHERE workspace_id = ?", [ws]))[0].n)).toBe(2); // UI + A
    // edit draft: ganti seluruh baris
    const edit = await saveBom(pl.p, { versionId: v1, lines: lines(40), reason: "ubah qty" });
    expect(edit.ok, edit.error).toBe(true);
    expect(Number((await sql(c, "SELECT qty_per_base q FROM mfg_bom_lines WHERE bom_version_id = ? AND sequence = 1", [v1]))[0].q)).toBe(40);

    /* ---------- tinjauan, idempotensi ---------- */
    const tr = (p: Page, versionId: string, status: string, key: string, over: Record<string, unknown> = {}) =>
      call(p, "production-bom.functions", "transitionProductionBom", { workspaceId: ws, versionId, status, key, reason: "alasan", signature: null, override: false, ...over });
    expect((await tr(plain.p, v1, "in_review", id())).ok).toBe(false);
    const k1 = id();
    expect((await tr(pl.p, v1, "in_review", k1)).ok).toBe(true);
    expect((await tr(pl.p, v1, "in_review", k1)).ok).toBe(true); // ulang idempoten
    expect(Number((await sql(c, "SELECT COUNT(*) n FROM mfg_bom_transitions WHERE version_id = ?", [v1]))[0].n)).toBe(1);
    expect((await tr(pl.p, v1, "draft", k1)).ok).toBe(false); // kunci sama, tujuan beda
    expect((await saveBom(pl.p, { versionId: v1, lines: lines(41) })).ok).toBe(false); // in_review tidak bisa disunting
    // kembali ke draft lalu ajukan lagi
    expect((await tr(pl.p, v1, "draft", id())).ok).toBe(true);
    expect((await tr(pl.p, v1, "approved", id())).ok).toBe(false); // draft → approved tidak valid
    expect((await saveBom(pl.p, { versionId: v1, lines: lines(48), reason: "qty ekuivalen 480 g/L" })).ok).toBe(true);
    expect((await tr(pl.p, v1, "in_review", id())).ok).toBe(true);

    /* ---------- persetujuan: peran, pemisahan tugas, OTP ---------- */
    expect((await tr(pl.p, v1, "approved", id())).ok).toBe(false); // planner bukan QA
    const challenge = async (userId: string, versionId: string, code = "123456", expires = "NOW(6) + INTERVAL 300 SECOND") => {
      const cid = id();
      await c.query(`INSERT INTO mfg_approval_challenges (id, workspace_id, version_id, actor, code_hash, expires_at) VALUES (?,?,?,?,?, ${expires})`, [cid, ws, versionId, userId, sha(`${cid}:${code}`)]);
      return cid;
    };
    const qaId = await uid(USERS.qa.email);
    expect((await tr(qa.p, v1, "approved", id())).ok).toBe(false); // tanpa verifikasi
    const ch1 = await challenge(qaId, v1);
    const wrong = await call(qa.p, "production-bom.functions", "verifyBomApprovalCode", { workspaceId: ws, challengeId: ch1, code: "000000" });
    expect(wrong.ok).toBe(false);
    expect(Number((await sql(c, "SELECT attempts a FROM mfg_approval_challenges WHERE id = ?", [ch1]))[0].a)).toBe(1); // percobaan tercatat
    expect((await tr(qa.p, v1, "approved", id(), { signature: ch1 })).ok).toBe(false); // belum terverifikasi
    expect((await call(pl.p, "production-bom.functions", "verifyBomApprovalCode", { workspaceId: ws, challengeId: ch1, code: "123456" })).ok).toBe(false); // bukan aktornya
    const expired = await challenge(qaId, v1, "123456", "NOW(6) - INTERVAL 1 SECOND");
    expect((await call(qa.p, "production-bom.functions", "verifyBomApprovalCode", { workspaceId: ws, challengeId: expired, code: "123456" })).ok).toBe(false);
    expect((await call(qa.p, "production-bom.functions", "verifyBomApprovalCode", { workspaceId: ws, challengeId: ch1, code: "123456" })).ok).toBe(true);
    // pemisahan tugas: admin pembuat v1? bukan; QA boleh. Persetujuan oleh QA:
    const ok = await tr(qa.p, v1, "approved", id(), { signature: ch1, reason: "sesuai registrasi" });
    expect(ok.ok, ok.error).toBe(true);
    const [appr] = await sql(c, "SELECT status, approved_by, approved_at FROM mfg_bom_versions WHERE id = ?", [v1]);
    expect(appr.status).toBe("approved");
    expect(appr.approved_by).toBe(qaId);
    expect(appr.approved_at).not.toBeNull();
    expect((await sql(c, "SELECT consumed_at FROM mfg_approval_challenges WHERE id = ?", [ch1]))[0].consumed_at).not.toBeNull();
    expect((await sql(c, "SELECT action, signature_method FROM mfg_audit_log WHERE workspace_id = ? AND entity_id = ? AND action = 'APPROVE'", [ws, v1]))[0]).toEqual({ action: "APPROVE", signature_method: "otp" });
    // tanda tangan tidak bisa dipakai ulang
    expect((await tr(qa.p, v1, "approved", id(), { signature: ch1 })).ok).toBe(false);

    /* ---------- versi approved terkunci; revisi baru ---------- */
    expect((await saveBom(pl.p, { versionId: v1, lines: lines(10) })).ok).toBe(false);
    expect((await tr(pl.p, v1, "draft", id())).ok).toBe(false);
    expect((await sql(c, "SELECT qty_per_base q FROM mfg_bom_lines WHERE bom_version_id = ? AND sequence = 1", [v1]))[0].q).toBe("48.0000");
    const rev = await saveBom(pl.p, { bomId: bomA.id, lines: lines(60), values: values({ code: bomA.code }), reason: "revisi kadar" });
    expect(rev.ok, rev.error).toBe(true);
    const v2 = rev.v.id as string;
    expect((await sql(c, "SELECT version_no n, status FROM mfg_bom_versions WHERE id = ?", [v2]))[0]).toEqual({ n: 2, status: "draft" });
    expect((await saveBom(pl.p, { bomId: "55555555-5555-4555-8555-555555555555", values: values({ code: "ZZ" }) })).ok).toBe(false); // BOM tidak ada
    // komposisi: v2 (60 kg/100 L = 600 g/L ≠ 480) → masalah; getBomLines melaporkan
    const gl = await call(pl.p, "production-bom.functions", "getBomLines", { workspaceId: ws, versionId: v2 });
    expect(gl.v.issues).toEqual(["Kadar/basis tidak sesuai: Glifosat M3"]);
    expect((await call(pl.p, "production-bom.functions", "getBomLines", { workspaceId: ws, versionId: v1 })).v.issues).toEqual([]);
    expect((await call(page, "production-bom.functions", "getBomLines", { workspaceId: baseWs, versionId: v2 })).ok).toBe(false); // workspace lain

    expect((await tr(pl.p, v2, "in_review", id())).ok).toBe(true);
    const ch2 = await challenge(qaId, v2);
    expect((await call(qa.p, "production-bom.functions", "verifyBomApprovalCode", { workspaceId: ws, challengeId: ch2, code: "123456" })).ok).toBe(true);
    const mismatch = await tr(qa.p, v2, "approved", id(), { signature: ch2 });
    expect(mismatch.ok).toBe(false);
    expect(mismatch.error).toMatch(/Komposisi tidak sesuai/);
    // pengecualian: admin tanpa peran QA eksplisit ditolak (admin juga bukan pembuat) → pakai QA
    const admCh = await challenge(adm.id, v2);
    expect((await call(page, "production-bom.functions", "verifyBomApprovalCode", { workspaceId: ws, challengeId: admCh, code: "123456" })).ok).toBe(true);
    const admOverride = await tr(page, v2, "approved", id(), { signature: admCh, override: true });
    expect(admOverride.ok).toBe(false);
    expect(admOverride.error).toMatch(/QA manager eksplisit/);
    const ovr = await tr(qa.p, v2, "approved", id(), { signature: ch2, override: true, reason: "kadar disetujui QA" });
    expect(ovr.ok, ovr.error).toBe(true);
    expect((await sql(c, "SELECT action FROM mfg_audit_log WHERE entity_id = ? AND action LIKE 'APPROVE%' ORDER BY created_at", [v2])).map((a) => a.action)).toEqual(["APPROVE_OVERRIDE"]);

    /* ---------- pembuat / penyunting tidak boleh menyetujui sendiri ---------- */
    const own = await saveBom(qa.p, { values: values({ code: `BOM-${TAG}-B` }), lines: lines(48) });
    expect(own.ok, own.error).toBe(true);
    expect((await tr(qa.p, own.v.id, "in_review", id())).ok).toBe(true);
    const ownCh = await challenge(qaId, own.v.id);
    expect((await call(qa.p, "production-bom.functions", "verifyBomApprovalCode", { workspaceId: ws, challengeId: ownCh, code: "123456" })).ok).toBe(true);
    const self = await tr(qa.p, own.v.id, "approved", id(), { signature: ownCh });
    expect(self.ok).toBe(false);
    expect(self.error).toMatch(/pembuat|penyunting/i);
    // kirim kode ke diri sendiri juga ditolak
    expect((await call(qa.p, "production-bom.functions", "sendBomApprovalCode", { workspaceId: ws, versionId: own.v.id })).ok).toBe(false);
    // penyunting terakhir (planner mengubah draft QA) ≠ boleh disetujui oleh pembuat lain? planner → QA draft diedit planner, QA ok; sebaliknya admin pembuat
    const back = await tr(qa.p, own.v.id, "draft", id());
    expect(back.ok).toBe(true);
    expect((await saveBom(pl.p, { versionId: own.v.id, lines: lines(48), reason: "diedit planner" })).ok).toBe(true);
    expect((await sql(c, "SELECT last_modified_by m FROM mfg_bom_versions WHERE id = ?", [own.v.id]))[0].m).toBe(await uid(USERS.pl.email));

    /* ---------- UI: perbandingan v1 vs v2 ---------- */
    await page.goto(`/app/w/${ws}/manufacturing/boms`);
    await expect(page.getByText(`BOM-${TAG}-A`).first()).toBeVisible({ timeout: 60_000 });
    await page.getByRole("row").filter({ hasText: /v2/ }).getByRole("button", { name: "Bandingkan versi sebelumnya" }).first().click();
    await expect(page.getByRole("dialog").getByText("Perbandingan komposisi")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("dialog").getByRole("row").filter({ hasText: "AI-1" })).toContainText("48 kg");
    await expect(page.getByRole("dialog").getByRole("row").filter({ hasText: "AI-1" })).toContainText("60 kg");
    await page.keyboard.press("Escape");

    await pl.close();
    await qa.close();
    await plain.close();
  } finally {
    await c.execute("DELETE FROM md_items WHERE id = ?", [foreign]);
  }
});
