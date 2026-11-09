/**
 * Engine entitlement add-on (BS New 11): padanan fungsi SQL `billing_addon_entitlement`,
 * `workspace_addon_entitlements`, `server_workspace_has_feature`, `wallet_catalog_limits`,
 * `billing_usage_fits`. Tier + hibah opsi + override per tenant + masa tenggang; add-on lama
 * (tier_id NULL) = semua fitur (`legacy`).
 */
import { execute, executeOne } from "@/integrations/mysql/pool";
import type { Entitlement, Entitlements } from "./entitlements";
import { jakartaToday } from "./billing-wallet.server";

type Json = Record<string, unknown>;
const obj = (v: unknown): Json =>
  typeof v === "string" ? (JSON.parse(v) as Json) : ((v as Json | null) ?? {});
const d10 = (v: unknown) => (v ? String(v).slice(0, 10) : null);

interface AddonRow {
  id: string;
  tenant_id: string;
  addon_id: string;
  code: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  grace_until: string | null;
  tier_id: string | null;
  tier_code: string | null;
  tier_limits: unknown;
  tier_features: unknown;
  limits_override: unknown;
  features_override: unknown;
}

const BASE_SQL = `SELECT ta.id, ta.tenant_id, ta.addon_id, a.code, ta.status, ta.starts_at, ta.ends_at, ta.grace_until,
         ta.tier_id, t.code AS tier_code, t.limits AS tier_limits, t.features AS tier_features,
         ta.limits_override, ta.features_override
    FROM tenant_addons ta
    JOIN addons a ON a.id = ta.addon_id
    LEFT JOIN addon_tiers t ON t.id = ta.tier_id`;

function isLive(r: AddonRow, today: string): boolean {
  if ((d10(r.starts_at) ?? "") > today) return false;
  const ends = d10(r.ends_at);
  const grace = d10(r.grace_until);
  return (
    ((r.status === "active" || r.status === "trial") && (ends === null || ends >= today)) ||
    (r.status === "grace" && grace !== null && grace >= today)
  );
}

async function compute(r: AddonRow, today: string): Promise<Entitlement | null> {
  if (!isLive(r, today)) return null;
  const limits: Record<string, number | null> = {
    ...(obj(r.tier_limits) as Record<string, number | null>),
    ...(obj(r.limits_override) as Record<string, number | null>),
  };
  const features: Record<string, boolean> = {
    ...(r.tier_id === null ? { legacy: true } : (obj(r.tier_features) as Record<string, boolean>)),
    ...(obj(r.features_override) as Record<string, boolean>),
  };
  const opts = await execute<{ quantity: number; grants: unknown }>(
    `SELECT x.quantity, o.grants FROM tenant_addon_options x
       JOIN addon_options o ON o.id = x.option_id
      WHERE x.tenant_id = ? AND o.addon_id = ?
        AND ((x.status = 'active' AND x.ends_at >= ?) OR (x.status = 'grace' AND x.grace_until >= ?))`,
    [r.tenant_id, r.addon_id, today, today],
  );
  for (const o of opts) {
    const g = obj(o.grants);
    Object.assign(features, obj(g.features));
    for (const [k, v] of Object.entries(obj(g.limits))) {
      if (k in limits && limits[k] === null) continue; // tak terbatas tetap tak terbatas
      limits[k] = Number(limits[k] ?? 0) + Number(v) * o.quantity;
    }
  }
  return { tier: r.tier_code, features, limits };
}

export async function tenantEntitlements(tenantId: string): Promise<Entitlements> {
  const today = jakartaToday();
  const rows = await execute<AddonRow>(`${BASE_SQL} WHERE ta.tenant_id = ?`, [tenantId]);
  const out: Entitlements = {};
  for (const r of rows) {
    const e = await compute(r, today);
    if (e) out[r.code] = e;
  }
  await applyGrants(tenantId, today, out);
  return out;
}

/** Gabungkan hibah akses sementara (feature_grants): fitur di-OR, batas diambil yang terbesar. */
async function applyGrants(tenantId: string, today: string, out: Entitlements) {
  let grants: {
    addon_code: string;
    features: unknown;
    limits: unknown;
    reason: string;
    ends_at: string;
    tier_code: string | null;
  }[] = [];
  try {
    grants = await execute(
      `SELECT g.addon_code, g.features, g.limits, g.reason, g.ends_at, t.code AS tier_code
         FROM feature_grants g LEFT JOIN addon_tiers t ON t.id = g.tier_id
        WHERE g.tenant_id = ? AND g.revoked_at IS NULL AND g.starts_at <= ? AND g.ends_at >= ?
        ORDER BY g.ends_at DESC`,
      [tenantId, today, today],
    );
  } catch {
    return; // tabel belum termigrasi
  }
  for (const g of grants) {
    const cur: Entitlement = out[g.addon_code] ?? { tier: null, features: {}, limits: {} };
    const features = { ...cur.features };
    for (const [k, v] of Object.entries(obj(g.features))) if (v === true) features[k] = true;
    const limits = { ...cur.limits };
    for (const [k, v] of Object.entries(obj(g.limits)) as [string, number | null][]) {
      if (limits[k] === null) continue; // sudah tak terbatas
      limits[k] = v === null ? null : Math.max(Number(limits[k] ?? 0), Number(v));
    }
    out[g.addon_code] = {
      ...cur,
      features,
      limits,
      grant: cur.grant ?? {
        tier: g.tier_code,
        ends_at: String(g.ends_at).slice(0, 10),
        reason: g.reason,
      },
    };
  }
}

export async function workspaceEntitlements(workspaceId: string): Promise<Entitlements> {
  const w = await executeOne<{ tenant_id: string }>(
    "SELECT tenant_id FROM workspaces WHERE id = ?",
    [workspaceId],
  );
  return w ? tenantEntitlements(w.tenant_id) : {};
}

/** Fitur Qalling aktif untuk workspace (`legacy` = semua fitur). */
export async function workspaceHasFeature(workspaceId: string, feature: string): Promise<boolean> {
  const q = (await workspaceEntitlements(workspaceId)).qalling;
  return Boolean(q && (q.features.legacy === true || q.features[feature] === true));
}

/** Batas Qalling workspace (null bila tidak ada add-on aktif). */
export async function workspaceLimits(
  workspaceId: string,
): Promise<Record<string, number | null> | null> {
  return (await workspaceEntitlements(workspaceId)).qalling?.limits ?? null;
}

/** Pemakaian saat ini tiap workspace tenant muat dalam batas? (`billing_usage_fits`). */
export async function usageFits(
  tenantId: string,
  limits: Record<string, number | null | undefined>,
): Promise<boolean> {
  const ws = await execute<{ id: string }>("SELECT id FROM workspaces WHERE tenant_id = ?", [
    tenantId,
  ]);
  for (const w of ws) {
    const u = await workspaceUsage(w.id);
    const over = (cap: number | null | undefined, used: number) =>
      cap !== null && cap !== undefined && cap < used;
    if (
      over(limits.max_accounts, u.accounts) ||
      over(limits.max_users, u.users) ||
      over(limits.storage_gb == null ? null : limits.storage_gb * 1_000_000_000, u.storageBytes)
    )
      return false;
  }
  return true;
}

export async function workspaceUsage(workspaceId: string) {
  const [a, u, s] = await Promise.all([
    executeOne<{ n: number }>(
      "SELECT COUNT(*) AS n FROM crm_social_accounts WHERE workspace_id = ? AND status <> 'disconnected'",
      [workspaceId],
    ),
    executeOne<{ n: number }>(
      "SELECT COUNT(*) AS n FROM workspace_members WHERE workspace_id = ?",
      [workspaceId],
    ),
    executeOne<{ n: number | null }>(
      "SELECT COALESCE(SUM(size_bytes),0) AS n FROM crm_media WHERE workspace_id = ?",
      [workspaceId],
    ),
  ]);
  return {
    accounts: Number(a?.n ?? 0),
    users: Number(u?.n ?? 0),
    storageBytes: Number(s?.n ?? 0),
  };
}
