import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

/** Tetapkan akun sosial ke klien/brand (atau lepas). Klien harus di workspace yang sama (FK komposit New 12 → dijaga di sini). */
export const assignAccountClient = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string; accountId: string; groupId: string | null }) => {
    if (!d?.workspaceId || !d?.accountId) throw new Error("Data tidak lengkap");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { canWriteWorkspace } = await import("@/lib/auth-context.server");
    if (!(await canWriteWorkspace(data.workspaceId, context.userId))) throw new Error("Forbidden");
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    if (data.groupId) {
      const g = await executeOne(
        "SELECT 1 AS ok FROM crm_client_groups WHERE id = ? AND workspace_id = ?",
        [data.groupId, data.workspaceId],
      );
      if (!g) throw new Error("Klien tidak ditemukan");
    }
    await execute(
      "UPDATE crm_social_accounts SET client_group_id = ? WHERE id = ? AND workspace_id = ?",
      [data.groupId, data.accountId, data.workspaceId],
    );
    return { ok: true };
  });
