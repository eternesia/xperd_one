// MySQL-backed auth + helpers for the MCP tools. Replaces the old Supabase
// client (mcp/supabase.ts). The MCP bearer token is verified as the app's own
// JWT (auth-jwt.server), and every workspace-scoped tool gates the caller as a
// workspace member. All MySQL imports are dynamic so mysql2 stays server-side.

import { ToolError, type ToolContext } from "./framework";

export function requireAuth(ctx: ToolContext) {
  if (!ctx.isAuthenticated()) {
    throw new ToolError("Authentication required. Connect this MCP client with a valid token.");
  }
}

// Pengguna sudah diautentikasi oleh route /mcp (token pribadi atau token OAuth); id-nya dibawa di konteks.
export async function getTokenUser(ctx: ToolContext): Promise<{ userId: string }> {
  if (!ctx.userId) throw new ToolError("Invalid or expired token.");
  return { userId: ctx.userId };
}

export async function assertWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
  const { executeOne } = await import("@/integrations/mysql/pool");
  const row = await executeOne<{ id: string }>(
    "SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ? LIMIT 1",
    [workspaceId, userId],
  );
  if (!row) throw new Error("Access denied: not a member of this workspace.");
  // Integrasi AI/MCP diatur katalog paket (fitur `mcp_api`): workspace tanpa fitur ini tidak bisa diakses lewat MCP.
  const { workspaceHasFeature } = await import("@/lib/entitlements.server");
  if (!(await workspaceHasFeature(workspaceId, "mcp_api")))
    throw new Error("This workspace plan does not include AI integration (MCP).");
}

/** Hak setara RLS New 11: anggota workspace + fitur Qalling aktif (+ izin tulis bila `write`). */
export async function assertQallingAccess(
  workspaceId: string,
  userId: string,
  feature: string,
  write = false,
): Promise<void> {
  await assertWorkspaceMember(workspaceId, userId);
  const { canWriteWorkspace } = await import("@/lib/auth-context.server");
  if (write && !(await canWriteWorkspace(workspaceId, userId)))
    throw new Error("Access denied: your role cannot modify this workspace.");
  const { workspaceHasFeature } = await import("@/lib/entitlements.server");
  if (!(await workspaceHasFeature(workspaceId, feature)))
    throw new Error("This workspace plan does not include this Qalling feature.");
}

/**
 * BS New 17: akses Qalling per bagian (`media` atau `post-scheduler`) untuk tool posting/media. Syarat: anggota workspace,
 * fitur `mcp_api` DAN `publishing` aktif, izin Role Access / peran kustom untuk `crm`, `crm/ai`, `crm/<bagian>`
 * (view; edit bila `write`), dan hak tulis workspace bila `write`. Pemilik tenant/owner selalu lolos izin menu.
 */
export async function assertQallingSection(
  workspaceId: string,
  userId: string,
  section: "media" | "post-scheduler",
  write: boolean,
): Promise<void> {
  const { execute, executeOne } = await import("@/integrations/mysql/pool");
  const { workspaceHasFeature } = await import("@/lib/entitlements.server");
  const member = await executeOne<{ role: string; custom_role_id: string | null }>(
    "SELECT role, custom_role_id FROM workspace_members WHERE workspace_id = ? AND user_id = ? LIMIT 1",
    [workspaceId, userId],
  );
  const denied = "Access denied: your plan or workspace membership does not allow this Qalling integration.";
  if (!member) throw new Error(denied);
  for (const f of ["mcp_api", "publishing"])
    if (!(await workspaceHasFeature(workspaceId, f))) throw new Error(denied);
  const { allowsSection } = await import("./qalling-rules");
  const permissions = new Map<string, { canView: boolean; canEdit: boolean }>();
  if (member.role !== "owner") {
    if (member.custom_role_id) {
      const c = await executeOne<{ permissions: unknown }>(
        "SELECT permissions FROM workspace_custom_roles WHERE id = ? AND workspace_id = ?",
        [member.custom_role_id, workspaceId],
      );
      if (!c) throw new Error("Access denied: workspace permissions could not be checked.");
      const entries = (typeof c.permissions === "string" ? JSON.parse(c.permissions) : c.permissions) as Record<
        string,
        { view?: boolean; edit?: boolean }
      >;
      for (const [k, p] of Object.entries(entries ?? {}))
        permissions.set(k, { canView: !!p?.view, canEdit: !!p?.view && !!p?.edit });
    } else {
      const rows = await execute<{ module_id: string; can_view: number; can_edit: number }>(
        "SELECT module_id, can_view, can_edit FROM workspace_role_access WHERE workspace_id = ? AND role = ?",
        [workspaceId, member.role],
      );
      for (const p of rows)
        permissions.set(p.module_id, { canView: Number(p.can_view) === 1, canEdit: Number(p.can_edit) === 1 });
    }
  }
  if (!allowsSection(member.role, permissions, section, write))
    throw new Error("Access denied: your role does not allow this action.");
  if (write) {
    const { canWriteWorkspace } = await import("@/lib/auth-context.server");
    if (!(await canWriteWorkspace(workspaceId, userId)))
      throw new Error("Access denied: your role cannot write in this workspace.");
  }
}
