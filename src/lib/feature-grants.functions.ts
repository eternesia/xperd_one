/** Super Admin: hibah akses sementara per email (uji coba fitur Agency, mitra/afiliator yang membantu promosi). */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

const REASONS = ["trial", "affiliate", "promo", "partner"] as const;

export type GrantRow = {
  id: string;
  email: string | null;
  tenant_name: string;
  tier_name: string | null;
  reason: string;
  note: string | null;
  starts_at: string;
  ends_at: string;
  revoked_at: string | null;
  status: "active" | "expired" | "revoked";
};

export const adminListGrants = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    const { jakartaToday } = await import("@/lib/billing-wallet.server");
    await requireAdmin(context.userId);
    const today = jakartaToday();
    const rows = await execute<Omit<GrantRow, "status">>(
      `SELECT g.id, g.email, t.name AS tenant_name, a.name AS tier_name, g.reason, g.note,
              g.starts_at, g.ends_at, g.revoked_at
         FROM feature_grants g
         JOIN tenants t ON t.id = g.tenant_id
         LEFT JOIN addon_tiers a ON a.id = g.tier_id
        ORDER BY g.created_at DESC LIMIT 300`,
    );
    const tiers = await execute<{ id: string; name: string; code: string }>(
      `SELECT t.id, t.name, t.code FROM addon_tiers t JOIN addons a ON a.id = t.addon_id
        WHERE a.code = 'qalling' AND t.is_active = 1 ORDER BY t.sort_order`,
    );
    return {
      tiers,
      grants: rows.map((r) => ({
        ...r,
        starts_at: String(r.starts_at).slice(0, 10),
        ends_at: String(r.ends_at).slice(0, 10),
        status: r.revoked_at
          ? ("revoked" as const)
          : String(r.ends_at).slice(0, 10) < today
            ? ("expired" as const)
            : ("active" as const),
      })),
    };
  });

export const adminCreateGrant = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z
      .object({
        email: z.string().trim().toLowerCase().email(),
        tierId: z.string().uuid(),
        days: z.number().int().min(1).max(365),
        reason: z.enum(REASONS),
        note: z.string().trim().max(500).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    const { jakartaToday } = await import("@/lib/billing-wallet.server");
    await requireAdmin(context.userId);
    const user = await executeOne<{ id: string }>("SELECT id FROM app_users WHERE email = ?", [
      data.email,
    ]);
    if (!user) throw new Error("Email belum terdaftar di Qalling. Minta pengguna mendaftar dulu.");
    // Tenant milik pengguna; bila tidak ada, tenant dari workspace tempat ia menjadi anggota.
    const tenant =
      (await executeOne<{ id: string; name: string }>(
        "SELECT id, name FROM tenants WHERE owner_id = ? ORDER BY created_at LIMIT 1",
        [user.id],
      )) ??
      (await executeOne<{ id: string; name: string }>(
        `SELECT t.id, t.name FROM workspace_members m
           JOIN workspaces w ON w.id = m.workspace_id JOIN tenants t ON t.id = w.tenant_id
          WHERE m.user_id = ? LIMIT 1`,
        [user.id],
      ));
    if (!tenant) throw new Error("Pengguna ini belum punya workspace.");
    const tier = await executeOne<{ features: unknown; limits: unknown }>(
      "SELECT features, limits FROM addon_tiers WHERE id = ?",
      [data.tierId],
    );
    if (!tier) throw new Error("Paket tidak ditemukan.");
    const j = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v ?? {}));
    const today = jakartaToday();
    const end = new Date(`${today}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + data.days);
    const id = uuid();
    await execute(
      `INSERT INTO feature_grants (id, tenant_id, tier_id, features, limits, reason, note, email, starts_at, ends_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tenant.id,
        data.tierId,
        j(tier.features),
        j(tier.limits),
        data.reason,
        data.note || null,
        data.email,
        today,
        end.toISOString().slice(0, 10),
        context.userId,
      ],
    );
    return { id, tenant: tenant.name, ends_at: end.toISOString().slice(0, 10) };
  });

export const adminRevokeGrant = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    await execute("UPDATE feature_grants SET revoked_at = NOW(6) WHERE id = ?", [data.id]);
    return { ok: true };
  });

export const adminExtendGrant = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z.object({ id: z.string().uuid(), days: z.number().int().min(1).max(365) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    await execute(
      `UPDATE feature_grants
          SET ends_at = DATE_ADD(GREATEST(ends_at, CURRENT_DATE), INTERVAL ? DAY), revoked_at = NULL
        WHERE id = ?`,
      [data.days, data.id],
    );
    return { ok: true };
  });
