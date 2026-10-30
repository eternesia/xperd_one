// MySQL-backed auth + helpers for the MCP tools. Replaces the old Supabase
// client (mcp/supabase.ts). The MCP bearer token is verified as the app's own
// JWT (auth-jwt.server), and every workspace-scoped tool gates the caller as a
// workspace member. All MySQL imports are dynamic so mysql2 stays server-side.

import type { ToolContext } from "@lovable.dev/mcp-js";

export function requireAuth(ctx: ToolContext) {
  if (!ctx.isAuthenticated()) {
    throw new Error("Authentication required. Connect this MCP client with a valid token.");
  }
}

// Verify the MCP bearer token as our app JWT and return the user id.
export async function getTokenUser(ctx: ToolContext): Promise<{ userId: string }> {
  const token = ctx.getToken();
  if (!token) throw new Error("Missing access token.");
  const { verifyAppJwt } = await import("@/lib/auth-jwt.server");
  const payload = await verifyAppJwt(token);
  if (!payload?.sub) throw new Error("Invalid or expired token.");
  return { userId: payload.sub };
}

export async function assertWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
  const { executeOne } = await import("@/integrations/mysql/pool");
  const row = await executeOne<{ id: string }>(
    "SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ? LIMIT 1",
    [workspaceId, userId],
  );
  if (!row) throw new Error("Access denied: not a member of this workspace.");
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
