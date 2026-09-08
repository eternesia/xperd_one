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
  memberships: { workspaceId: string; workspaceName: string; tenantName: string; role: string }[];
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
      (workspaces ?? []).map((w) => [w.id, { name: w.name, tenant: w.tenant_id ? (tenantName.get(w.tenant_id) ?? "-") : "-" }]),
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

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: AdminCreateUserInput) => {
    if (!data?.email?.includes("@")) throw new Error("Valid email is required");
    if (!data.password || data.password.length < 8) throw new Error("Password must be at least 8 characters");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    const { hashPassword } = await import("@/lib/auth-jwt.server");
    await requireAdmin(context.userId);

    const email = data.email.trim().toLowerCase();
    const existing = await executeOne<{ id: string }>("SELECT id FROM app_users WHERE email = ? LIMIT 1", [email]);
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
      await execute("INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, 'customer')", [uuid(), newUserId]);
    }
    if (data.makeAdmin) {
      await execute("INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, 'admin') ON DUPLICATE KEY UPDATE role = VALUES(role)", [
        uuid(),
        newUserId,
      ]);
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
    if (data.password && data.password.length < 8) throw new Error("Password must be at least 8 characters");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    const { hashPassword } = await import("@/lib/auth-jwt.server");
    await requireAdmin(context.userId);

    if (data.password) {
      await execute("UPDATE app_users SET password_hash = ? WHERE id = ?", [await hashPassword(data.password), data.targetUserId]);
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
    if (data.targetUserId === context.userId && !data.makeAdmin) throw new Error("You cannot remove your own admin access");

    if (data.makeAdmin) {
      const existing = await executeOne<{ id: string }>(
        "SELECT id FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1",
        [data.targetUserId],
      );
      if (!existing) {
        await execute("INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, 'admin')", [uuid(), data.targetUserId]);
      }
    } else {
      await execute("DELETE FROM user_roles WHERE user_id = ? AND role = 'admin'", [data.targetUserId]);
    }
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
