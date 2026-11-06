// Platform admin — user management server functions (MySQL-backed).
// Ported from Business Suite's Supabase admin-users.functions.ts into the Old
// Production data layer. Export names/shapes are kept identical so the
// app-admin/users page ports unchanged.
//
// Auth model matches platform.functions.ts: requireAppAuth + requireAdmin.
// Server-only — all DB/auth imports are dynamic inside handlers.

import { createServerFn } from "@tanstack/react-start";

import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export interface AdminUserRow {
  userId: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  companyName: string | null;
  createdAt: string | null;
  platformRoles: string[];
  memberships: {
    workspaceId: string;
    workspaceName: string;
    tenantId: string | null;
    tenantName: string;
    role: string;
  }[];
}

/** Every account on the platform, with roles + workspace memberships. */
export const adminListUsers = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);

    const [profiles, roles, members, workspaces, tenants] = await Promise.all([
      execute(
        `SELECT id, email, full_name, phone, company_name, created_at FROM profiles ORDER BY created_at DESC LIMIT 2000`,
      ),
      execute(`SELECT user_id, role FROM user_roles`),
      execute(`SELECT user_id, workspace_id, role FROM workspace_members`),
      execute(`SELECT id, name, tenant_id FROM workspaces`),
      execute(`SELECT id, name FROM tenants`),
    ]);

    const tenantName = new Map((tenants ?? []).map((t) => [t.id, t.name]));
    const wsInfo = new Map(
      (workspaces ?? []).map((w) => [
        w.id,
        {
          name: w.name,
          tenantId: (w.tenant_id as string | null) ?? null,
          tenant: w.tenant_id ? (tenantName.get(w.tenant_id) ?? "-") : "-",
        },
      ]),
    );

    return (profiles ?? []).map((p) => ({
      userId: p.id,
      email: p.email,
      fullName: p.full_name,
      phone: p.phone,
      companyName: p.company_name,
      createdAt: p.created_at,
      platformRoles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
      memberships: (members ?? [])
        .filter((m) => m.user_id === p.id)
        .map((m) => ({
          workspaceId: m.workspace_id,
          workspaceName: wsInfo.get(m.workspace_id)?.name ?? m.workspace_id,
          tenantId: wsInfo.get(m.workspace_id)?.tenantId ?? null,
          tenantName: wsInfo.get(m.workspace_id)?.tenant ?? "-",
          role: m.role,
        })),
    }));
  });

/** Every workspace (for the "grant access" picker). */
export const adminListWorkspaces = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);

    const [workspaces, tenants] = await Promise.all([
      execute(`SELECT id, name, tenant_id FROM workspaces ORDER BY name ASC`),
      execute(`SELECT id, name FROM tenants`),
    ]);
    const tenantName = new Map((tenants ?? []).map((t) => [t.id, t.name]));
    return (workspaces ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      tenantName: w.tenant_id ? (tenantName.get(w.tenant_id) ?? "-") : "-",
    }));
  });

export interface AdminCreateUserInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  makeAdmin?: boolean;
}

/** Paket Qalling tiap workspace yang bisa diakses user (untuk dialog "Paket"). */
export const adminUserQallingPlans = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { targetUserId: string }) => {
    if (!data?.targetUserId) throw new Error("Missing user");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    const addon = (await execute("SELECT id FROM addons WHERE code = 'qalling' LIMIT 1"))[0];
    if (!addon) throw new Error("Qalling tidak tersedia");
    const d10 = (v: unknown) =>
      v == null ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
    const [members, workspaces, tenants, tiers, plans] = await Promise.all([
      execute("SELECT workspace_id FROM workspace_members WHERE user_id = ?", [data.targetUserId]),
      execute("SELECT id, name, tenant_id FROM workspaces"),
      execute("SELECT id, name, owner_id FROM tenants"),
      execute(
        "SELECT id, name, monthly_price, features, limits, is_active FROM addon_tiers WHERE addon_id = ? ORDER BY sort_order",
        [addon.id],
      ),
      execute(
        "SELECT tenant_id, tier_id, status, starts_at, ends_at FROM tenant_addons WHERE addon_id = ?",
        [addon.id],
      ),
    ]);
    const ids = new Set((members ?? []).map((m) => m.workspace_id));
    return {
      tiers: (tiers ?? []).map((t) => ({ ...t, monthly_price: Number(t.monthly_price) })),
      workspaces: (workspaces ?? [])
        .filter(
          (w) =>
            ids.has(w.id) ||
            (tenants ?? []).some((t) => t.id === w.tenant_id && t.owner_id === data.targetUserId),
        )
        .map((w) => {
          const plan = (plans ?? []).find((p) => p.tenant_id === w.tenant_id);
          return {
            ...w,
            tenantName: (tenants ?? []).find((t) => t.id === w.tenant_id)?.name ?? "—",
            plan: plan
              ? { ...plan, starts_at: d10(plan.starts_at), ends_at: d10(plan.ends_at) }
              : null,
          };
        }),
    };
  });

/** Ganti paket Qalling workspace user tanpa potong saldo (periode/harga/perpanjangan tetap). */
export const adminSwitchUserQallingTier = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    (data: {
      targetUserId: string;
      workspaceId: string;
      tierId: string;
      expectedTierId: string | null;
    }) => {
      if (!data?.targetUserId || !data.workspaceId || !data.tierId)
        throw new Error("Pilih user, workspace dan paket");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    await requireAdmin(context.userId);
    const { adminSwitchQallingTier } = await import("@/lib/qalling-tier-switch.server");
    return adminSwitchQallingTier({
      actor: { id: context.userId, email: context.user?.email ?? null },
      ...data,
    });
  });

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: AdminCreateUserInput) => {
    if (!data?.email?.includes("@")) throw new Error("Valid email is required");
    if (!data.password || data.password.length < 8)
      throw new Error("Password must be at least 8 characters");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    const { hashPassword } = await import("@/lib/auth-jwt.server");
    await requireAdmin(context.userId);

    const email = data.email.trim().toLowerCase();
    const existing = await executeOne<{ id: string }>(
      "SELECT id FROM app_users WHERE email = ? LIMIT 1",
      [email],
    );
    const newUserId = existing?.id ?? uuid();

    if (!existing) {
      await execute(
        "INSERT INTO app_users (id, email, full_name, password_hash, is_active) VALUES (?, ?, ?, ?, 1)",
        [newUserId, email, data.fullName, await hashPassword(data.password)],
      );
    }
    await execute(
      "INSERT INTO profiles (id, email, full_name, phone) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), phone = VALUES(phone)",
      [newUserId, email, data.fullName, data.phone ?? null],
    );
    if (!existing) {
      await execute("INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, 'customer')", [
        uuid(),
        newUserId,
      ]);
    }
    if (data.makeAdmin) {
      await execute(
        "INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, 'admin') ON DUPLICATE KEY UPDATE role = VALUES(role)",
        [uuid(), newUserId],
      );
    }
    return { userId: newUserId };
  });

export interface AdminUpdateUserInput {
  targetUserId: string;
  fullName?: string;
  phone?: string;
  password?: string;
}

export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: AdminUpdateUserInput) => {
    if (!data?.targetUserId) throw new Error("Missing user");
    if (data.password && data.password.length < 8)
      throw new Error("Password must be at least 8 characters");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    const { hashPassword } = await import("@/lib/auth-jwt.server");
    await requireAdmin(context.userId);

    if (data.password) {
      await execute("UPDATE app_users SET password_hash = ? WHERE id = ?", [
        await hashPassword(data.password),
        data.targetUserId,
      ]);
    }
    const sets: string[] = [];
    const params: unknown[] = [];
    if (data.fullName !== undefined) {
      sets.push("full_name = ?");
      params.push(data.fullName);
    }
    if (data.phone !== undefined) {
      sets.push("phone = ?");
      params.push(data.phone);
    }
    if (sets.length) {
      params.push(data.targetUserId);
      await execute(`UPDATE profiles SET ${sets.join(", ")} WHERE id = ?`, params);
    }
    return { ok: true };
  });

export interface AdminSetPlatformAdminInput {
  targetUserId: string;
  makeAdmin: boolean;
}

export const adminSetPlatformAdmin = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: AdminSetPlatformAdminInput) => {
    if (!data?.targetUserId) throw new Error("Missing user");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    if (data.targetUserId === context.userId && !data.makeAdmin)
      throw new Error("You cannot remove your own admin access");

    if (data.makeAdmin) {
      const existing = await executeOne<{ id: string }>(
        "SELECT id FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1",
        [data.targetUserId],
      );
      if (!existing) {
        await execute("INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, 'admin')", [
          uuid(),
          data.targetUserId,
        ]);
      }
    } else {
      await execute("DELETE FROM user_roles WHERE user_id = ? AND role = 'admin'", [
        data.targetUserId,
      ]);
    }
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { targetUserId: string }) => {
    if (!data?.targetUserId) throw new Error("Missing user");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { transaction } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    if (data.targetUserId === context.userId)
      throw new Error("Anda tidak bisa menghapus akun sendiri");
    await transaction(async (conn) => {
      await conn.execute("DELETE FROM workspace_members WHERE user_id = ?", [data.targetUserId]);
      await conn.execute("DELETE FROM user_roles WHERE user_id = ?", [data.targetUserId]);
      await conn.execute("DELETE FROM profiles WHERE id = ?", [data.targetUserId]);
      await conn.execute("DELETE FROM app_users WHERE id = ?", [data.targetUserId]);
    });
    return { ok: true };
  });

export interface AdminAssignWorkspaceInput {
  targetUserId: string;
  workspaceId: string;
  role: "owner" | "admin" | "staff" | "viewer";
}

export const adminAssignWorkspace = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: AdminAssignWorkspaceInput) => {
    if (!data?.targetUserId || !data.workspaceId) throw new Error("Missing user or workspace");
    if (!["owner", "admin", "staff", "viewer"].includes(data.role)) throw new Error("Invalid role");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);

    const { assertUserQuota } = await import("@/lib/qalling-quota.server");
    await assertUserQuota(data.workspaceId, data.targetUserId);
    await execute(
      `INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE role = VALUES(role)`,
      [uuid(), data.workspaceId, data.targetUserId, data.role],
    );
    return { ok: true };
  });

export interface AdminRemoveWorkspaceAccessInput {
  targetUserId: string;
  workspaceId: string;
}

export const adminRemoveWorkspaceAccess = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: AdminRemoveWorkspaceAccessInput) => {
    if (!data?.targetUserId || !data.workspaceId) throw new Error("Missing user or workspace");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);

    await execute("DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?", [
      data.workspaceId,
      data.targetUserId,
    ]);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// #25 (BS New): reset transaksi tenant — SEMUA logika di kode aplikasi.
// Sengaja TIDAK memakai trigger DB maupun tabel/kolom baru: daftar tabel yang
// dibersihkan ada di konstanta TX_TABLES di bawah, dijalankan satu transaksi
// MySQL (atomic) dan diverifikasi ulang sebelum commit. Master data (item,
// customer, supplier, COA, gudang, paket, BoM & master Production) tidak disentuh;
// transaksi Production (order, lot, QC, biaya) ikut dibersihkan.
// ---------------------------------------------------------------------------

/**
 * Data transaksi Production (anak dulu sesuai FK). Master Production (BoM, spesifikasi QC, profil item,
 * pemetaan akun, pengaturan, pusat kerja, routing, registrasi, peran, dokumen terlampir) dan jejak audit
 * TIDAK dihapus. Penghitung penomoran ikut direset agar nomor order/lot/inspeksi mulai dari awal.
 */
const MFG_TX_TABLES = [
  "mfg_qc_results",
  "mfg_deviations",
  "mfg_qc_inspections",
  "mfg_lot_selections",
  "mfg_lot_genealogy",
  "mfg_batch_steps",
  "mfg_order_costs",
  "mfg_order_labor",
  "mfg_order_materials",
  "mfg_order_outputs",
  "mfg_order_transitions",
  "mfg_journal_events",
  "mfg_orders",
  "mfg_lots",
  "mfg_waste_logs",
  "mfg_number_allocations",
  "mfg_number_counters",
] as const;

/** Urutan penting: anak dulu (lines -> documents) agar tidak melanggar FK. */
const TX_TABLES = [
  ...MFG_TX_TABLES,
  "acc_journal_lines",
  "acc_journal_entries",
  "sls_shipment_scans",
  "sls_document_lines",
  "sls_documents",
  "prc_document_lines",
  "prc_documents",
  "inv_movements",
  "cb_transactions",
  "fa_depreciations",
  "tax_records",
] as const;

export interface AdminResetTenantInput {
  tenantId: string;
}

export const adminResetTenantTransactions = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: AdminResetTenantInput) => {
    if (!data?.tenantId || typeof data.tenantId !== "string") throw new Error("tenantId required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    const { transaction } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);

    const workspaces = await execute<{ id: string }>(
      "SELECT id FROM workspaces WHERE tenant_id = ?",
      [data.tenantId],
    );
    const ids = workspaces.map((w) => w.id);
    if (!ids.length) return { workspaces: 0, deleted: {} as Record<string, number> };

    const placeholders = ids.map(() => "?").join(", ");
    const deleted: Record<string, number> = {};

    await transaction(async (conn) => {
      for (const table of TX_TABLES) {
        const [result] = await conn.execute(
          `DELETE FROM \`${table}\` WHERE workspace_id IN (${placeholders})`,
          ids,
        );
        deleted[table] = Number((result as { affectedRows?: number }).affectedRows ?? 0);
      }

      // Turunan yang tidak dihapus, tapi direset ke kondisi awal.
      await conn.execute(
        `UPDATE fa_assets
            SET accumulated_depreciation = 0, status = 'active', disposal_date = NULL, disposal_amount = NULL
          WHERE workspace_id IN (${placeholders})`,
        ids,
      );
      await conn.execute(
        `UPDATE cb_accounts SET opening_balance = 0 WHERE workspace_id IN (${placeholders})`,
        ids,
      );
      // Lead tetap ada (master CRM), hanya tautan ke penawarannya yang dilepas.
      await conn.execute(
        `UPDATE crm_leads SET quotation_id = NULL WHERE workspace_id IN (${placeholders})`,
        ids,
      );

      // Verifikasi di dalam transaksi: kalau masih ada sisa, batalkan semua.
      const leftovers: string[] = [];
      for (const table of TX_TABLES) {
        const [rows] = await conn.query(
          `SELECT COUNT(*) AS n FROM \`${table}\` WHERE workspace_id IN (${placeholders})`,
          ids,
        );
        const count = Number((rows as { n?: number }[])[0]?.n ?? 0);
        if (count > 0) leftovers.push(`${table}: ${count}`);
      }
      if (leftovers.length) throw new Error(`Reset tidak tuntas — ${leftovers.join(", ")}`);
    });

    return { workspaces: ids.length, deleted };
  });
