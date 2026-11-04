import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { login, resolveWorkspaceId } from "./helpers";

/**
 * Ganti paket Qalling tanpa potong saldo (BS New 14, Ronde 52): (A) pemilik tenant saat trial berlaku — dialog Rp0, tanggal berakhir &
 * harga tersimpan tetap, audit, paket basi/kuota terlampaui/trial kedaluwarsa ditolak server; (B) Super Admin → Users → "Paket Qalling".
 * Semua nilai dihitung ulang dari SQL; data paket dikembalikan di akhir.
 */
test.use({ storageState: { cookies: [], origins: [] } });

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
const DB_CONFIG = {
  host: process.env.MYSQL_HOST ?? env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? env.MYSQL_PORT ?? 3307),
  user: process.env.MYSQL_USER ?? env.MYSQL_USER ?? "xperd",
  password: process.env.MYSQL_PASSWORD ?? env.MYSQL_PASSWORD ?? "xperd",
  database: process.env.MYSQL_DATABASE ?? env.MYSQL_DATABASE ?? "xperd",
  dateStrings: true,
  timezone: "Z",
};
let conn: Connection;
const q = async (sql: string, params: unknown[] = []) =>
  (await conn.query<RowDataPacket[]>(sql, params))[0];

let ws = "";
let tenantId = "";
let userId = "";
let saved: RowDataPacket | null = null;

const plan = async () =>
  (
    await q(
      `SELECT ta.* FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id WHERE ta.tenant_id = ? AND a.code = 'qalling'`,
      [tenantId],
    )
  )[0];
const tierId = async (code: string) =>
  String((await q("SELECT id FROM addon_tiers WHERE code = ?", [code]))[0].id);
const balance = async () =>
  Number(
    (await q("SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?", [tenantId]))[0]
      ?.balance_idr ?? 0,
  );
const setPlan = async (
  tier: string,
  status: string,
  startOffset: number,
  endOffset: number,
  extra = "",
) =>
  conn.execute(
    `UPDATE tenant_addons SET tier_id = ?, status = ?, starts_at = DATE_ADD(CURDATE(), INTERVAL ? DAY), ends_at = DATE_ADD(CURDATE(), INTERVAL ? DAY), monthly_price = 49000, pending_change = NULL, limits_override = JSON_OBJECT()${extra} WHERE id = ?`,
    [tier, status, startOffset, endOffset, saved!.id],
  );

test.afterAll(async () => {
  if (!conn) return;
  if (saved)
    await conn.execute(
      "UPDATE tenant_addons SET tier_id = ?, status = ?, starts_at = ?, ends_at = ?, monthly_price = ?, pending_change = ?, limits_override = ? WHERE id = ?",
      [
        saved.tier_id,
        saved.status,
        saved.starts_at,
        saved.ends_at,
        saved.monthly_price,
        saved.pending_change == null ? null : JSON.stringify(saved.pending_change),
        saved.limits_override == null ? null : JSON.stringify(saved.limits_override),
        saved.id,
      ],
    );
  await conn.execute(
    "DELETE FROM audit_logs WHERE table_name = 'tenant_addons' AND (new_data LIKE '%self_service_trial%' OR new_data LIKE '%superadmin_users%')",
  );
  await conn.end();
});

test("GANTI PAKET: trial mandiri (Rp0) + Super Admin → Users", async ({ page }) => {
  test.setTimeout(300_000);
  conn = await mysql.createConnection(DB_CONFIG);
  await login(page);
  ws = await resolveWorkspaceId(page);
  const [w] = await q("SELECT tenant_id FROM workspaces WHERE id = ?", [ws]);
  tenantId = String(w.tenant_id);
  userId = String((await q("SELECT owner_id FROM tenants WHERE id = ?", [tenantId]))[0].owner_id);
  saved = await plan();
  expect(saved, "workspace uji harus punya add-on Qalling").toBeTruthy();
  const lite = await tierId("qalling_lite");
  const pro = await tierId("qalling_pro");
  const agency = await tierId("qalling_agency");
  const balanceBefore = await balance();

  /* ---------- A. trial berlaku: Lite → Pro, Rp0 ---------- */
  await setPlan(lite, "trial", -2, 5);
  const before = await plan();
  await page.goto(`/app/w/${ws}/billing`);
  await page.getByRole("tab", { name: "Qalling" }).click();
  await expect(page.getByText(/Uji coba sampai .* Pergantian paket Rp0/)).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId("tier-qalling_lite")).toContainText("Uji coba");
  await expect(page.getByRole("button", { name: "Pilih Pro" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Paket trial saat ini" })).toBeDisabled();
  await page.getByRole("button", { name: "Coba Pro" }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByText("Dipotong sekarang")).toBeVisible();
  await expect(dlg).toContainText("Rp0");
  await expect(dlg).toContainText(String(before!.ends_at).slice(0, 10));
  expect((await plan())!.tier_id).toBe(lite); // kutipan belum menerapkan
  await dlg.getByRole("button", { name: "Konfirmasi coba paket" }).click();
  await expect.poll(async () => (await plan())!.tier_id, { timeout: 30_000 }).toBe(pro);
  const after = await plan();
  expect(after).toMatchObject({ status: "trial", monthly_price: before!.monthly_price });
  expect(String(after!.ends_at)).toBe(String(before!.ends_at));
  expect(String(after!.starts_at)).toBe(String(before!.starts_at));
  expect(await balance()).toBe(balanceBefore);
  const [log] = await q(
    "SELECT new_data, actor_id FROM audit_logs WHERE record_id = ? AND new_data LIKE '%self_service_trial%' ORDER BY created_at DESC LIMIT 1",
    [after!.id],
  );
  expect(log).toBeTruthy();
  expect(
    JSON.parse(typeof log.new_data === "string" ? log.new_data : JSON.stringify(log.new_data)),
  ).toMatchObject({
    source: "self_service_trial",
    charge: 0,
  });

  // panggilan server langsung: paket basi, kuota terlampaui
  const call = (args: Record<string, unknown>) =>
    page.evaluate(async (a) => {
      const m = await import("/src/lib/trial-tier.functions.ts");
      try {
        return { ok: true, v: await m.switchTrialTier({ data: a as never }) };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    }, args);
  const stale = await call({ tenantId, tierId: agency, expectedTierId: lite, apply: true });
  expect(stale).toMatchObject({ ok: false });
  expect((stale as { error: string }).error).toContain("Paket telah berubah");
  await conn.execute(
    "UPDATE tenant_addons SET limits_override = JSON_OBJECT('max_users', 0) WHERE id = ?",
    [after!.id],
  );
  const over = await call({ tenantId, tierId: agency, expectedTierId: pro, apply: true });
  expect((over as { error: string }).error).toContain("melebihi kuota");
  expect((await plan())!.tier_id).toBe(pro);
  await conn.execute("UPDATE tenant_addons SET limits_override = JSON_OBJECT() WHERE id = ?", [
    after!.id,
  ]);

  /* ---------- trial kedaluwarsa: server menolak, UI kembali ke checkout berbayar ---------- */
  await setPlan(lite, "trial", -10, -1);
  const expired = await call({ tenantId, tierId: pro, expectedTierId: lite, apply: true });
  expect((expired as { error: string }).error).toContain("hanya tersedia selama trial");
  expect((await plan())!.tier_id).toBe(lite);
  await page.goto(`/app/w/${ws}/billing`);
  await page.getByRole("tab", { name: "Qalling" }).click();
  await expect(page.getByTestId("tier-qalling_pro")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Coba Pro" })).toHaveCount(0);

  /* ---------- B. Super Admin → Users → Paket Qalling ---------- */
  await setPlan(
    lite,
    "active",
    -10,
    20,
    ", pending_change = JSON_OBJECT('tier_id', '" + agency + "')",
  );
  const email = String((await q("SELECT email FROM profiles WHERE id = ?", [userId]))[0].email);
  await page.goto("/app-admin/users");
  await expect(page.getByRole("columnheader", { name: "Jumlah workspace" })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByPlaceholder("Cari tenant, email, workspace…").fill(email);
  await page.getByRole("button", { name: "Detail" }).first().click();
  const row = page.getByRole("dialog").getByRole("row").filter({ hasText: email }).first();
  await row.getByRole("button", { name: "Paket Qalling" }).click();
  const d2 = page.getByRole("dialog");
  await expect(d2.getByText(/Paket saat ini:/)).toBeVisible({ timeout: 30_000 });
  await d2.locator("select").nth(1).selectOption(agency);
  await expect(d2).toContainText("Lite → Agency");
  await d2.getByRole("button", { name: "Konfirmasi ganti paket" }).click();
  await expect(
    page.getByText("Paket Qalling diperbarui tanpa pemotongan saldo").first(),
  ).toBeVisible({
    timeout: 30_000,
  });
  const done = await plan();
  expect(done).toMatchObject({ tier_id: agency, status: "active" });
  expect(Number(done!.monthly_price)).toBe(49000);
  expect(done!.pending_change).toBeNull();

  expect(await balance()).toBe(balanceBefore);
  const [log2] = await q(
    "SELECT 1 AS x FROM audit_logs WHERE record_id = ? AND new_data LIKE '%superadmin_users%'",
    [done!.id],
  );
  expect(log2).toBeTruthy();
});
