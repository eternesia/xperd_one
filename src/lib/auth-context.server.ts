// Server-only auth context + role checks backed by MySQL.
// Replaces the Postgres RPCs (has_role / can_write_workspace / is_workspace_member /
// owns_tenant / has_workspace_role) and RLS with explicit app-side checks.
// IMPORTANT: server-only — never import from client code.

import { getCookie } from "@tanstack/react-start/server";

import { verifyAppJwt, APP_JWT_COOKIE, findAppUserById } from "@/lib/auth-jwt.server";
import { execute, executeOne, uuid } from "@/integrations/mysql/pool";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = getCookie(APP_JWT_COOKIE);
  if (!token) return null;
  const claims = await verifyAppJwt(token);
  if (!claims?.sub) return null;
  const row = await findAppUserById(claims.sub);
  if (!row) return null;
  return { id: row.id, email: row.email, fullName: row.full_name };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

async function count(sql: string, params: unknown[]): Promise<number> {
  const row = await executeOne<{ c: number }>(sql, params);
  return Number(row?.c ?? 0);
}

export async function hasRole(userId: string, role: string): Promise<boolean> {
  return (await count("SELECT COUNT(*) AS c FROM user_roles WHERE user_id = ? AND role = ?", [userId, role])) > 0;
}

export async function isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  return (
    (await count("SELECT COUNT(*) AS c FROM workspace_members WHERE workspace_id = ? AND user_id = ?", [
      workspaceId,
      userId,
    ])) > 0
  );
}

export async function hasWorkspaceRole(
  workspaceId: string,
  userId: string,
  roles: string[],
): Promise<boolean> {
  if (roles.length === 0) return false;
  const placeholders = roles.map(() => "?").join(", ");
  return (
    (await count(
      `SELECT COUNT(*) AS c FROM workspace_members WHERE workspace_id = ? AND user_id = ? AND role IN (${placeholders})`,
      [workspaceId, userId, ...roles],
    )) > 0
  );
}

export async function ownsTenant(tenantId: string, userId: string): Promise<boolean> {
  return (
    (await count("SELECT COUNT(*) AS c FROM tenants WHERE id = ? AND owner_id = ?", [tenantId, userId])) > 0
  );
}

export async function userCanAccessTenant(tenantId: string, userId: string): Promise<boolean> {
  if (await ownsTenant(tenantId, userId)) return true;
  return (
    (await count(
      `SELECT COUNT(*) AS c
         FROM workspaces w
         JOIN workspace_members m ON m.workspace_id = w.id
        WHERE w.tenant_id = ? AND m.user_id = ?`,
      [tenantId, userId],
    )) > 0
  );
}

// Mirrors Postgres can_write_workspace: owner/admin/staff OR tenant owner.
export async function canWriteWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  if (await hasWorkspaceRole(workspaceId, userId, ["owner", "admin", "staff"])) return true;
  return (
    (await count(
      `SELECT COUNT(*) AS c
         FROM workspaces w
         JOIN tenants t ON t.id = w.tenant_id
        WHERE w.id = ? AND t.owner_id = ?`,
      [workspaceId, userId],
    )) > 0
  );
}

export async function requireAdmin(userId: string): Promise<void> {
  if (!(await hasRole(userId, "admin"))) throw new Error("Forbidden: admin role required");
}

// Replaces Postgres claim_superadmin: grants admin only to the designated email
// and only while no admin exists yet.
export async function claimSuperadminIfAllowed(userId: string, email: string): Promise<boolean> {
  const adminCount = await count("SELECT COUNT(*) AS c FROM user_roles WHERE role = 'admin'", []);
  if (adminCount > 0) return false;
  const allowed = (process.env.SUPERADMIN_EMAIL ?? "dnicorp.id@gmail.com").toLowerCase();
  if (email.trim().toLowerCase() !== allowed) return false;
  await execute(
    "INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, 'admin') ON DUPLICATE KEY UPDATE role = VALUES(role)",
    [uuid(), userId],
  );
  return true;
}
