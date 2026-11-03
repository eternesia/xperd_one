/**
 * Ganti paket Qalling tanpa pemotongan saldo (BS New 14): trial mandiri oleh pemilik tenant dan penggantian oleh Super Admin.
 * Padanan fungsi `switch_qalling_trial_tier` / `admin_switch_qalling_tier` Postgres, ditulis sebagai `transaction()` +
 * `SELECT … FOR UPDATE` (Old tanpa stored function). Periode, harga, status, dan perpanjangan TIDAK berubah.
 */
import type { PoolConnection } from "mysql2/promise";
import { transaction, uuid } from "@/integrations/mysql/pool";
import { jakartaToday } from "./billing-wallet.server";
import { usageFits } from "./entitlements.server";
import { TRIAL_TIER_CODES } from "./trial-tier-rules";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const d10 = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);
const json = <T>(v: unknown, d: T): T => {
  if (v == null) return d;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return d;
    }
  }
  return v as T;
};

export interface TierSwitchResult {
  tier_id: string;
  previous_tier_id: string | null;
  name: string;
  ends_at: string;
  charge: 0;
  status: string;
  applied: boolean;
}

async function one(conn: PoolConnection, sql: string, params: unknown[]): Promise<Row | null> {
  const [rows] = await conn.execute(sql, params as never[]);
  return (rows as Row[])[0] ?? null;
}

async function lockedQallingPlan(conn: PoolConnection, tenantId: string): Promise<Row | null> {
  await conn.execute("SELECT id FROM tenants WHERE id = ? FOR UPDATE", [tenantId]);
  return one(
    conn,
    `SELECT ta.* FROM tenant_addons ta JOIN addons ad ON ad.id = ta.addon_id
      WHERE ta.tenant_id = ? AND ad.code = 'qalling' FOR UPDATE`,
    [tenantId],
  );
}

async function assertFits(tenantId: string, tier: Row, plan: Row) {
  const limits = {
    ...json<Record<string, number | null>>(tier.limits, {}),
    ...json<Record<string, number | null>>(plan.limits_override, {}),
  };
  if (!(await usageFits(tenantId, limits)))
    throw new Error(
      "Pemakaian akun, anggota atau penyimpanan melebihi kuota paket tujuan. Kurangi pemakaian terlebih dahulu",
    );
}

async function audit(
  conn: PoolConnection,
  tenantId: string,
  planId: string,
  actor: { id: string; email?: string | null },
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const ws = await one(
    conn,
    "SELECT id FROM workspaces WHERE tenant_id = ? ORDER BY created_at LIMIT 1",
    [tenantId],
  );
  if (!ws) return;
  await conn.execute(
    `INSERT INTO audit_logs (id, workspace_id, table_name, record_id, action, changed_fields, old_data, new_data, actor_id, actor_email)
     VALUES (?, ?, 'tenant_addons', ?, 'UPDATE', ?, ?, ?, ?, ?)`,
    [
      uuid(),
      ws.id,
      planId,
      JSON.stringify(Object.keys(after)),
      JSON.stringify(before),
      JSON.stringify(after),
      actor.id,
      actor.email ?? null,
    ],
  );
}

/** Pemilik tenant mengganti paket selama trial yang masih berlaku. `apply=false` hanya menghitung kutipan. */
export async function switchTrialTier(p: {
  actor: { id: string; email?: string | null };
  tenantId: string;
  tierId: string;
  expectedTierId: string | null;
  apply: boolean;
}): Promise<TierSwitchResult> {
  return transaction(async (conn) => {
    const owner = await one(conn, "SELECT id FROM tenants WHERE id = ? AND owner_id = ?", [
      p.tenantId,
      p.actor.id,
    ]);
    if (!owner) throw new Error("Hanya pemilik tenant yang dapat mengganti paket trial");
    const today = jakartaToday();
    const plan = await lockedQallingPlan(conn, p.tenantId);
    if (
      !plan ||
      plan.status !== "trial" ||
      d10(plan.starts_at) > today ||
      !plan.ends_at ||
      d10(plan.ends_at) < today
    )
      throw new Error("Pergantian gratis hanya tersedia selama trial yang masih berlaku");
    if ((plan.tier_id ?? null) !== (p.expectedTierId ?? null))
      throw new Error("Paket telah berubah. Muat ulang sebelum mencoba paket lain");
    const tier = await one(
      conn,
      "SELECT * FROM addon_tiers WHERE id = ? AND addon_id = ? AND is_active = 1",
      [p.tierId, plan.addon_id],
    );
    if (!tier || !(TRIAL_TIER_CODES as readonly string[]).includes(String(tier.code)))
      throw new Error("Paket trial tidak tersedia");
    await assertFits(p.tenantId, tier, plan);
    // Opsi tambahan aktif harus tetap didukung fitur paket tujuan.
    const feats = {
      ...json<Record<string, boolean>>(tier.features, {}),
      ...json<Record<string, boolean>>(plan.features_override, {}),
    };
    const [opts] = await conn.execute(
      `SELECT o.requires_features FROM tenant_addon_options x JOIN addon_options o ON o.id = x.option_id
        WHERE x.tenant_id = ? AND o.addon_id = ? AND x.status IN ('active','grace')`,
      [p.tenantId, plan.addon_id],
    );
    for (const o of opts as Row[])
      if (json<string[]>(o.requires_features, []).some((f) => !feats[f]))
        throw new Error("Paket tujuan tidak mendukung tambahan yang masih aktif");
    if (p.apply && plan.tier_id !== tier.id) {
      await conn.execute("UPDATE tenant_addons SET tier_id = ? WHERE id = ?", [tier.id, plan.id]);
      await audit(
        conn,
        p.tenantId,
        plan.id,
        p.actor,
        { tier_id: plan.tier_id },
        {
          tier_id: tier.id,
          source: "self_service_trial",
          ends_at: d10(plan.ends_at),
          charge: 0,
        },
      );
    }
    return {
      tier_id: tier.id,
      previous_tier_id: plan.tier_id ?? null,
      name: tier.name,
      ends_at: d10(plan.ends_at),
      charge: 0,
      status: "trial",
      applied: p.apply,
    };
  });
}

/** Super Admin mengganti paket Qalling pengguna pada satu workspace (paket aktif/trial berlaku). */
export async function adminSwitchQallingTier(p: {
  actor: { id: string; email?: string | null };
  targetUserId: string;
  workspaceId: string;
  tierId: string;
  expectedTierId: string | null;
}): Promise<{ tier_id: string }> {
  return transaction(async (conn) => {
    const isAdmin = await one(
      conn,
      "SELECT 1 AS x FROM user_roles WHERE user_id = ? AND role = 'admin'",
      [p.actor.id],
    );
    if (!isAdmin) throw new Error("Forbidden");
    const ws = await one(conn, "SELECT id, tenant_id FROM workspaces WHERE id = ?", [
      p.workspaceId,
    ]);
    if (!ws) throw new Error("Workspace tidak ditemukan");
    const plan = await lockedQallingPlan(conn, ws.tenant_id);
    const member = await one(
      conn,
      "SELECT 1 AS x FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
      [ws.id, p.targetUserId],
    );
    const owns = await one(conn, "SELECT 1 AS x FROM tenants WHERE id = ? AND owner_id = ?", [
      ws.tenant_id,
      p.targetUserId,
    ]);
    if (!member && !owns) throw new Error("User bukan anggota workspace");
    if (!plan) throw new Error("Tenant belum memiliki paket Qalling");
    if ((plan.tier_id ?? null) !== (p.expectedTierId ?? null))
      throw new Error("Paket telah berubah. Muat ulang sebelum menyimpan");
    const today = jakartaToday();
    if (
      !["active", "trial"].includes(plan.status) ||
      d10(plan.starts_at) > today ||
      (plan.ends_at && d10(plan.ends_at) < today)
    )
      throw new Error("Paket harus aktif atau dalam trial yang berlaku");
    const tier = await one(
      conn,
      "SELECT * FROM addon_tiers WHERE id = ? AND addon_id = ? AND is_active = 1",
      [p.tierId, plan.addon_id],
    );
    if (!tier) throw new Error("Paket tidak tersedia");
    await assertFits(ws.tenant_id, tier, plan);
    if (plan.tier_id === tier.id) return { tier_id: tier.id };
    await conn.execute("UPDATE tenant_addons SET tier_id = ?, pending_change = NULL WHERE id = ?", [
      tier.id,
      plan.id,
    ]);
    await audit(
      conn,
      ws.tenant_id,
      plan.id,
      p.actor,
      { tier_id: plan.tier_id, pending_change: plan.pending_change ?? null },
      {
        tier_id: tier.id,
        pending_change: null,
        source: "superadmin_users",
        target_user: p.targetUserId,
      },
    );
    return { tier_id: tier.id };
  });
}
