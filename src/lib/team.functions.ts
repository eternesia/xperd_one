import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export interface CreateUserInput {
  workspaceId: string;
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: "admin" | "staff" | "viewer";
}

export const createWorkspaceUser = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: CreateUserInput) => {
    if (!data?.workspaceId) throw new Error("Workspace is required");
    if (!data.email?.includes("@")) throw new Error("Valid email is required");
    if (!data.password || data.password.length < 8) throw new Error("Password must be at least 8 characters");
    if (!["admin", "staff", "viewer"].includes(data.role)) throw new Error("Invalid role");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { hasWorkspaceRole } = await import("@/lib/auth-context.server");
    if (!(await hasWorkspaceRole(data.workspaceId, context.userId, ["owner", "admin"]))) {
      throw new Error("Forbidden");
    }

    const { execute, executeOne, transaction, uuid } = await import("@/integrations/mysql/pool");
    const { hashPassword } = await import("@/lib/auth-jwt.server");

    const email = data.email.trim().toLowerCase();
    const existing = await executeOne<{ id: string }>("SELECT id FROM app_users WHERE email = ? LIMIT 1", [email]);
    const newUserId = existing?.id ?? uuid();

    await transaction(async (conn) => {
      if (!existing) {
        await conn.execute(
          "INSERT INTO app_users (id, email, full_name, password_hash, is_active) VALUES (?, ?, ?, ?, 1)",
          [newUserId, email, data.fullName, await hashPassword(data.password)],
        );
      }
      await conn.execute(
        "INSERT INTO profiles (id, email, full_name, phone) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), phone = VALUES(phone)",
        [newUserId, email, data.fullName, data.phone ?? null],
      );
      await conn.execute(
        "INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, 'customer') ON DUPLICATE KEY UPDATE role = VALUES(role)",
        [uuid(), newUserId],
      );
      await conn.execute(
        "INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)",
        [uuid(), data.workspaceId, newUserId, data.role],
      );
    });

    return { userId: newUserId, email };
  });

export const updateWorkspaceUser = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: {
    workspaceId: string;
    targetUserId: string;
    fullName?: string;
    phone?: string;
    password?: string;
  }) => {
    if (!data?.workspaceId || !data.targetUserId) throw new Error("Missing user");
    if (data.password && data.password.length < 8) throw new Error("Password must be at least 8 characters");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { hasWorkspaceRole, isWorkspaceMember } = await import("@/lib/auth-context.server");
    if (!(await hasWorkspaceRole(data.workspaceId, context.userId, ["owner", "admin"]))) throw new Error("Forbidden");
    if (!(await isWorkspaceMember(data.workspaceId, data.targetUserId))) {
      throw new Error("User is not a member of this workspace");
    }

    const { execute } = await import("@/integrations/mysql/pool");
    const { hashPassword } = await import("@/lib/auth-jwt.server");

    if (data.password) {
      await execute("UPDATE app_users SET password_hash = ? WHERE id = ?", [
        await hashPassword(data.password),
        data.targetUserId,
      ]);
    }

    if (data.fullName !== undefined || data.phone !== undefined) {
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
      params.push(data.targetUserId);
      await execute(`UPDATE profiles SET ${sets.join(", ")} WHERE id = ?`, params);
    }

    return { ok: true };
  });

export type WorkspaceRole = "owner" | "admin" | "staff" | "viewer";

export interface WorkspaceAccessResult {
  role: WorkspaceRole | null;
  /** Izin per kunci: `module` untuk dashboard/modul, `module/submodule` untuk submodul. */
  access: { module_id: string; can_view: boolean; can_edit: boolean }[];
}

/**
 * #58 (BS New 3): kontrak izin akses untuk satu workspace.
 * `module_id` di `workspace_role_access` boleh berupa `module` atau `module/submodule`,
 * sehingga matriks Role Access bisa mengatur View/Edit sampai ke tiap submodul.
 */
export const getWorkspaceAccess = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { workspaceId: string }) => {
    if (!data?.workspaceId) throw new Error("Workspace is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<WorkspaceAccessResult> => {
    const { execute, executeOne } = await import("@/integrations/mysql/pool");

    const member = await executeOne<{ role: string }>(
      "SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ? LIMIT 1",
      [data.workspaceId, context.userId],
    );

    let role = member?.role ?? null;
    if (!role) {
      // Pemilik tenant otomatis punya akses penuh walau tanpa baris keanggotaan.
      const owner = await executeOne<{ c: number }>(
        `SELECT COUNT(*) AS c
           FROM workspaces w
           JOIN tenants t ON t.id = w.tenant_id
          WHERE w.id = ? AND t.owner_id = ?`,
        [data.workspaceId, context.userId],
      );
      if (Number(owner?.c ?? 0) > 0) role = "owner";
    }
    if (!role) throw new Error("Forbidden");

    const rows = await execute<{ module_id: string; can_view: number; can_edit: number }>(
      "SELECT module_id, can_view, can_edit FROM workspace_role_access WHERE workspace_id = ? AND role = ?",
      [data.workspaceId, role],
    );

    return {
      role: role as WorkspaceRole,
      access: (rows ?? []).map((row) => ({
        module_id: row.module_id,
        can_view: Number(row.can_view) === 1,
        can_edit: Number(row.can_edit) === 1,
      })),
    };
  });

export interface TenantUserRow {
  userId: string;
  fullName: string | null;
  email: string | null;
  memberships: { workspaceId: string; workspaceName: string; role: string }[];
}

/**
 * #58 (BS New 3): daftar pengguna yang sudah dikenal tenant ini beserta
 * keanggotaan workspace-nya. Dipakai dialog "Give access" agar admin bisa
 * memberi akses ke user yang sudah ada tanpa membuat akun baru.
 */
export const listTenantUsers = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { workspaceId: string }) => {
    if (!data?.workspaceId) throw new Error("Workspace is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<TenantUserRow[]> => {
    const { hasWorkspaceRole } = await import("@/lib/auth-context.server");
    if (!(await hasWorkspaceRole(data.workspaceId, context.userId, ["owner", "admin"]))) {
      throw new Error("Forbidden");
    }

    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const ws = await executeOne<{ tenant_id: string }>(
      "SELECT tenant_id FROM workspaces WHERE id = ? LIMIT 1",
      [data.workspaceId],
    );
    if (!ws) throw new Error("Workspace not found");

    const siblings = await execute<{ id: string; name: string }>(
      "SELECT id, name FROM workspaces WHERE tenant_id = ?",
      [ws.tenant_id],
    );
    const workspaceIds = (siblings ?? []).map((row) => row.id);
    if (!workspaceIds.length) return [];
    const nameById = new Map((siblings ?? []).map((row) => [row.id, row.name]));

    const placeholders = workspaceIds.map(() => "?").join(", ");
    const members = await execute<{ workspace_id: string; user_id: string; role: string }>(
      `SELECT workspace_id, user_id, role FROM workspace_members WHERE workspace_id IN (${placeholders})`,
      workspaceIds,
    );
    const userIds = [...new Set((members ?? []).map((row) => row.user_id))];
    if (!userIds.length) return [];

    const userPlaceholders = userIds.map(() => "?").join(", ");
    const profiles = await execute<{ id: string; full_name: string | null; email: string | null }>(
      `SELECT id, full_name, email FROM profiles WHERE id IN (${userPlaceholders})`,
      userIds,
    );
    const profileById = new Map((profiles ?? []).map((row) => [row.id, row]));

    return userIds.map((id) => ({
      userId: id,
      fullName: profileById.get(id)?.full_name ?? null,
      email: profileById.get(id)?.email ?? null,
      memberships: (members ?? [])
        .filter((row) => row.user_id === id)
        .map((row) => ({
          workspaceId: row.workspace_id,
          workspaceName: nameById.get(row.workspace_id) ?? row.workspace_id,
          role: row.role,
        })),
    }));
  });

/** #58 (BS New 3): beri akses workspace ini ke user tenant yang sudah ada. */
export const addExistingUserToWorkspace = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { workspaceId: string; targetUserId: string; role: "admin" | "staff" | "viewer" }) => {
    if (!data?.workspaceId || !data.targetUserId) throw new Error("Missing user or workspace");
    if (!["admin", "staff", "viewer"].includes(data.role)) throw new Error("Invalid role");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { hasWorkspaceRole } = await import("@/lib/auth-context.server");
    if (!(await hasWorkspaceRole(data.workspaceId, context.userId, ["owner", "admin"]))) {
      throw new Error("Forbidden");
    }

    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    const ws = await executeOne<{ tenant_id: string }>(
      "SELECT tenant_id FROM workspaces WHERE id = ? LIMIT 1",
      [data.workspaceId],
    );
    if (!ws) throw new Error("Workspace not found");

    // Hanya user yang memang sudah ada di tenant ini (di workspace mana pun).
    const belongs = await executeOne<{ c: number }>(
      `SELECT COUNT(*) AS c
         FROM workspace_members m
         JOIN workspaces w ON w.id = m.workspace_id
        WHERE m.user_id = ? AND w.tenant_id = ?`,
      [data.targetUserId, ws.tenant_id],
    );
    if (Number(belongs?.c ?? 0) === 0) throw new Error("That user does not belong to this organisation");

    await execute(
      `INSERT INTO workspace_members (id, workspace_id, user_id, role)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE role = VALUES(role)`,
      [uuid(), data.workspaceId, data.targetUserId, data.role],
    );
    return { ok: true };
  });