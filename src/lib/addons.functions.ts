// Add-ons — MySQL server functions (ported from Business Suite's lib/addons +
// app-admin/addons.tsx Supabase calls into the Old Production data layer).
// Catalog + tenant assignment CRUD for platform admins, tenant-scoped reads
// for the app (module gating / billing). Server-only dynamic imports.

import { createServerFn } from "@tanstack/react-start";

import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export interface AddonRow {
  id: string;
  code: string;
  name: string;
  tagline: string | null;
  description: string | null;
  monthly_price: number;
  /** Batch 2: satuan harga add-on, mis. `employee` = per karyawan/bulan. */
  pricing_unit: string | null;
  module_id: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface TenantAddonRow {
  id: string;
  tenant_id: string;
  addon_id: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  monthly_price: number;
  addons: { code: string; name: string; monthly_price: number } | null;
}

function toAddonRow(r: Record<string, any>): AddonRow {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    tagline: r.tagline ?? null,
    description: r.description ?? null,
    monthly_price: Number(r.monthly_price) || 0,
    pricing_unit: r.pricing_unit ?? null,
    module_id: r.module_id ?? null,
    is_active: Boolean(r.is_active),
    sort_order: Number(r.sort_order) || 0,
  };
}

/** Purchasable add-on catalog (any signed-in user). */
export const listAddonCatalog = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { execute } = await import("@/integrations/mysql/pool");
    const rows = await execute(
      `SELECT id, code, name, tagline, description, monthly_price, pricing_unit, module_id, is_active, sort_order
         FROM addons ORDER BY sort_order ASC, name ASC`,
    );
    return (rows ?? []).map((r: Record<string, any>) => toAddonRow(r));
  });

/** Add-ons unlocked for a tenant (admin OR workspace member of that tenant). */
export const listTenantAddons = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { tenantId: string }) => {
    if (!data?.tenantId) throw new Error("Tenant is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { execute } = await import("@/integrations/mysql/pool");
    const { executeOne } = await import("@/integrations/mysql/pool");
    const row = await executeOne<{ c: number }>(
      `SELECT COUNT(*) AS c
         FROM workspace_members m
         JOIN workspaces w ON w.id = m.workspace_id
        WHERE m.user_id = ? AND w.tenant_id = ?`,
      [context.userId, data.tenantId],
    );
    const { hasRole } = await import("@/lib/auth-context.server");
    const isAdmin = await hasRole(context.userId, "admin");
    if (!isAdmin && !(Number(row?.c ?? 0) > 0)) throw new Error("Forbidden");

    const rows = await execute(
      `SELECT ta.id, ta.tenant_id, ta.addon_id, ta.status, ta.starts_at, ta.ends_at,
              ta.monthly_price, a.code AS addon_code, a.name AS addon_name, a.monthly_price AS addon_price
         FROM tenant_addons ta
         JOIN addons a ON a.id = ta.addon_id
        WHERE ta.tenant_id = ?
        ORDER BY a.sort_order ASC`,
      [data.tenantId],
    );
    return (rows ?? []).map((r: Record<string, any>) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      addon_id: r.addon_id,
      status: r.status,
      starts_at: r.starts_at ?? "",
      ends_at: r.ends_at ?? null,
      monthly_price: Number(r.monthly_price) || 0,
      addons: { code: r.addon_code, name: r.addon_name, monthly_price: Number(r.addon_price) || 0 },
    })) as TenantAddonRow[];
  });

// ---------------------------------------------------------------------------
// Platform-admin operations (require role 'admin')
// ---------------------------------------------------------------------------

/** All tenant add-on assignments with tenant + addon names (admin page). */
export const adminListTenantAddons = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);

    const rows = await execute(
      `SELECT ta.id, ta.tenant_id, ta.addon_id, ta.status, ta.starts_at, ta.ends_at,
              ta.monthly_price, ta.notes,
              t.name AS tenant_name, t.subdomain AS tenant_subdomain,
              a.code AS addon_code, a.name AS addon_name, a.monthly_price AS addon_price
         FROM tenant_addons ta
         JOIN tenants t ON t.id = ta.tenant_id
         JOIN addons a ON a.id = ta.addon_id
        ORDER BY t.name ASC, a.sort_order ASC`,
    );
    return (rows ?? []).map((r: Record<string, any>) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      tenant_name: r.tenant_name,
      tenant_subdomain: r.tenant_subdomain,
      addon_id: r.addon_id,
      addon_code: r.addon_code,
      addon_name: r.addon_name,
      status: r.status,
      starts_at: r.starts_at ?? "",
      ends_at: r.ends_at ?? null,
      monthly_price: Number(r.monthly_price) || 0,
      notes: r.notes ?? null,
    }));
  });

export interface UpsertTenantAddonInput {
  tenantId: string;
  addonId: string;
  status?: string;
  startsAt?: string;
  endsAt?: string;
  monthlyPrice?: number;
  notes?: string;
}

export const adminUpsertTenantAddon = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: UpsertTenantAddonInput) => {
    if (!data?.tenantId || !data?.addonId) throw new Error("Tenant and add-on are required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);

    const existing = await executeOne<{ id: string; monthly_price: string | number }>(
      "SELECT id, monthly_price FROM tenant_addons WHERE tenant_id = ? AND addon_id = ? LIMIT 1",
      [data.tenantId, data.addonId],
    );
    const price = data.monthlyPrice !== undefined ? Number(data.monthlyPrice) || 0 : Number(existing?.monthly_price) || 0;
    const status = data.status ?? "active";
    const startsAt = data.startsAt ?? new Date().toISOString().slice(0, 10);

    if (existing) {
      await execute(
        `UPDATE tenant_addons
            SET status = ?, starts_at = ?, ends_at = ?, monthly_price = ?, notes = ?
          WHERE id = ?`,
        [status, startsAt, data.endsAt ?? null, price, data.notes ?? null, existing.id],
      );
      return { id: existing.id };
    }
    const id = uuid();
    await execute(
      `INSERT INTO tenant_addons (id, tenant_id, addon_id, status, starts_at, ends_at, monthly_price, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.tenantId, data.addonId, status, startsAt, data.endsAt ?? null, price, data.notes ?? null],
    );
    return { id };
  });

export interface SetTenantAddonStatusInput {
  id: string;
  status: string;
}

export const adminSetTenantAddonStatus = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: SetTenantAddonStatusInput) => {
    if (!data?.id || !data?.status) throw new Error("Missing assignment or status");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    await execute("UPDATE tenant_addons SET status = ? WHERE id = ?", [data.status, data.id]);
    return { ok: true };
  });

export interface RemoveTenantAddonInput {
  id: string;
}

export const adminRemoveTenantAddon = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: RemoveTenantAddonInput) => {
    if (!data?.id) throw new Error("Missing assignment");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    await execute("DELETE FROM tenant_addons WHERE id = ?", [data.id]);
    return { ok: true };
  });
