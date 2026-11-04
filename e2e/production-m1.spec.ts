import { expect, test } from "@playwright/test";
import type mysql from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";
import type { Locator, Page } from "@playwright/test";
import { cleanMfg, grantProduction, mfgConn, sql } from "./production-helpers";

/**
 * Production M1 (fondasi): gerbang entitlement, pengaturan + penomoran, pusat kerja, kode formulasi, peran produksi, audit append-only.
 * Angka/isi dibandingkan dengan SQL; add-on diberikan sementara dan dicabut + data mfg_* dibersihkan setelah uji.
 */
/** Kolom form AdminField (label tidak terhubung `for`): cari kotak berlabel lalu input di dalamnya. */
const field = (scope: Page | Locator, label: string): Locator =>
  scope.locator("div.space-y-2").filter({ hasText: new RegExp(`^${label}$`, "i") }).locator("input").first();
let c: mysql.Connection;
let ws = "";
let revoke: (() => Promise<void>) | null = null;

test.afterAll(async () => {
  if (revoke) await revoke();
  if (c) {
    if (ws) await cleanMfg(c, ws);
    await c.end();
  }
});

test("PRODUCTION M1: entitlement, pengaturan, pusat kerja, kode formulasi, peran, audit", async ({ page }) => {
  test.setTimeout(240_000);
  c = await mfgConn();
  await login(page);
  ws = await resolveWorkspaceId(page);
  await cleanMfg(c, ws);

  const call = (fn: string, data: unknown) =>
    page.evaluate(
      async ({ fn, data }) => {
        const m = await import("/src/lib/production.functions.ts");
        try {
          return { ok: true, v: await (m as any)[fn]({ data }) };
        } catch (e) {
          return { ok: false, error: (e as Error).message };
        }
      },
      { fn, data },
    ) as Promise<{ ok: boolean; v?: any; error?: string }>;

  /* ---------- tanpa add-on: semua ditolak ---------- */
  await page.goto(`/app/w/${ws}`);
  const denied = await call("getProduction", { workspaceId: ws, section: "settings" });
  expect(denied.ok).toBe(false);
  expect(denied.error).toMatch(/Production tidak tersedia/);
  expect((await call("saveProductionMaster", { workspaceId: ws, table: "mfg_work_centers", id: null, reason: "x", values: { code: "WC0", name: "Tolak", center_type: "mixing", capacity_per_hour: 1, uom_code: null, labor_rate_per_hour: 0, overhead_rate_per_hour: 0, is_active: true } })).ok).toBe(false);
  expect(await sql(c, "SELECT 1 FROM mfg_work_centers WHERE workspace_id = ?", [ws])).toHaveLength(0);

  /* ---------- dengan add-on ---------- */
  revoke = await grantProduction(c, ws);
  await page.goto(`/app/w/${ws}/manufacturing/settings`);
  await expect(page.getByRole("heading", { name: "Pengaturan Production" })).toBeVisible({ timeout: 60_000 });

  // pengaturan: ubah awalan order + toleransi yield, alasan wajib
  const orderPrefix = page.getByLabel("Awalan order");
  await orderPrefix.fill("PRD");
  await page.getByLabel("Digit order").fill("6");
  await field(page, "Toleransi yield \\(%\\)").fill("1.5");
  await expect(page.getByRole("button", { name: "Simpan" })).toBeDisabled(); // tanpa alasan
  await field(page, "Alasan perubahan").fill("Penyesuaian awal E2E");
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Perubahan tersimpan").first()).toBeVisible({ timeout: 30_000 });
  const [st] = await sql(c, "SELECT * FROM mfg_settings WHERE workspace_id = ?", [ws]);
  const numbering = typeof st.numbering === "string" ? JSON.parse(st.numbering) : st.numbering;
  expect(numbering.order).toEqual({ prefix: "PRD", reset: "yearly", digits: 6 });
  expect(Number(st.yield_tolerance_pct)).toBe(1.5);

  // pusat kerja lewat UI
  await page.goto(`/app/w/${ws}/manufacturing/work-centers`);
  await page.getByRole("button", { name: "Tambah" }).click();
  const dlg = page.getByRole("dialog");
  await field(dlg, "Kode").fill("WC-E2E");
  await field(dlg, "Nama").fill("Mixer E2E");
  await field(dlg, "Alasan perubahan").fill("Tambah pusat kerja uji");
  await dlg.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Mixer E2E").first()).toBeVisible({ timeout: 30_000 });
  const [wc] = await sql(c, "SELECT * FROM mfg_work_centers WHERE workspace_id = ? AND code = 'WC-E2E'", [ws]);
  expect(wc.name).toBe("Mixer E2E");

  // kode duplikat ditolak
  const dup = await call("saveProductionMaster", { workspaceId: ws, table: "mfg_work_centers", id: null, reason: "dup", values: { code: "WC-E2E", name: "Dup", center_type: "mixing", capacity_per_hour: 1, uom_code: null, labor_rate_per_hour: 0, overhead_rate_per_hour: 0, is_active: true } });
  expect(dup.ok).toBe(false);
  // satuan bukan milik workspace ditolak; alasan kosong ditolak
  expect((await call("saveProductionMaster", { workspaceId: ws, table: "mfg_work_centers", id: wc.id, reason: "u", values: { code: "WC-E2E", name: "Mixer E2E", center_type: "mixing", capacity_per_hour: 1, uom_code: "TIDAK-ADA", labor_rate_per_hour: 0, overhead_rate_per_hour: 0, is_active: true } })).ok).toBe(false);
  expect((await call("saveProductionMaster", { workspaceId: ws, table: "mfg_work_centers", id: wc.id, reason: "  ", values: { code: "WC-E2E", name: "Mixer E2E", center_type: "mixing", capacity_per_hour: 1, uom_code: null, labor_rate_per_hour: 0, overhead_rate_per_hour: 0, is_active: true } })).ok).toBe(false);
  // id workspace lain tidak bisa diubah
  expect((await call("saveProductionMaster", { workspaceId: ws, table: "mfg_work_centers", id: "00000000-0000-4000-8000-000000000001", reason: "x", values: { code: "WC-X", name: "X", center_type: "mixing", capacity_per_hour: 1, uom_code: null, labor_rate_per_hour: 0, overhead_rate_per_hour: 0, is_active: true } })).ok).toBe(false);

  // kode formulasi bawaan: 20 kode, idempoten
  await page.goto(`/app/w/${ws}/manufacturing/formulation-codes`);
  await page.getByRole("button", { name: "Tambahkan kode standar" }).click();
  await expect(page.getByText("20 kode ditambahkan")).toBeVisible({ timeout: 30_000 });
  expect(Number((await sql(c, "SELECT COUNT(*) n FROM mfg_formulation_codes WHERE workspace_id = ?", [ws]))[0].n)).toBe(20);
  const again = await call("initializeProductionCodes", { workspaceId: ws, reason: "ulang" });
  expect(again.v.inserted).toBe(0);

  // peran produksi: pengguna harus anggota workspace
  const [me] = await sql(c, "SELECT user_id FROM workspace_members WHERE workspace_id = ? LIMIT 1", [ws]);
  const role = await call("saveProductionMaster", { workspaceId: ws, table: "mfg_workspace_roles", id: null, reason: "peran uji", values: { user_id: me.user_id, role: "qc_analyst", is_active: true } });
  expect(role.ok).toBe(true);
  const stranger = await call("saveProductionMaster", { workspaceId: ws, table: "mfg_workspace_roles", id: null, reason: "asing", values: { user_id: "00000000-0000-4000-8000-0000000000aa", role: "operator", is_active: true } });
  expect(stranger.ok).toBe(false);

  // audit: setiap perubahan tercatat dengan alasan; hanya INSERT (tanpa jalur ubah)
  await page.goto(`/app/w/${ws}/manufacturing/audit`);
  await expect(page.getByRole("heading", { name: "Audit Production" })).toBeVisible({ timeout: 60_000 });
  const audit = await sql(c, "SELECT entity_table, action, reason FROM mfg_audit_log WHERE workspace_id = ? ORDER BY created_at", [ws]);
  expect(audit.some((a) => a.entity_table === "mfg_settings" && a.reason === "Penyesuaian awal E2E")).toBe(true);
  expect(audit.some((a) => a.entity_table === "mfg_work_centers" && a.action === "INSERT")).toBe(true);
  expect(audit.filter((a) => a.entity_table === "mfg_formulation_codes")).toHaveLength(20);
  await expect(page.getByText("Penyesuaian awal E2E").first()).toBeVisible();
});
