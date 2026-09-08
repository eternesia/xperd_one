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