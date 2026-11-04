// Padanan `mfg_action_allowed`: aksi tulis yang dibatasi peran produksi tertentu (admin/owner/pemilik tenant selalu lolos).
import { executeOne } from "@/integrations/mysql/pool";
import { canWriteWorkspace } from "@/lib/auth-context.server";
import { mfgCanAccess, mfgHasAnyRole, ProductionError } from "@/lib/production.server";

export async function mfgActionAllowed(
  workspaceId: string,
  userId: string,
  section: string,
  roles: string[],
): Promise<boolean> {
  if (!(await mfgCanAccess(workspaceId, userId, section, false))) return false;
  if (!(await canWriteWorkspace(workspaceId, userId))) return false;
  // matriks Role Access: can_view/can_edit eksplisit false memblokir
  const denied = await executeOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM workspace_members m JOIN workspace_role_access a ON a.workspace_id = m.workspace_id AND a.role = m.role
      WHERE m.workspace_id = ? AND m.user_id = ? AND a.module_id IN ('manufacturing', ?) AND (a.can_view = 0 OR a.can_edit = 0)`,
    [workspaceId, userId, `manufacturing/${section}`],
  );
  if (Number(denied?.n ?? 0) > 0) return false;
  return mfgHasAnyRole(workspaceId, userId, roles);
}

export async function mfgActionAssert(workspaceId: string, userId: string, section: string, roles: string[]) {
  if (!(await mfgActionAllowed(workspaceId, userId, section, roles)))
    throw new ProductionError("Akses Production tidak tersedia untuk aksi ini.", 403);
}
