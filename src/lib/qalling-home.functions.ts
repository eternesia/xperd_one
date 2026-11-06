import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

/** Hitungan ringkas widget CRM beranda Qalling (count, bukan memuat semua baris — New 12). */
export const getQallingHomeCounts = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { workspaceId: string }) => {
    if (!d?.workspaceId) throw new Error("Workspace wajib");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("@/lib/auth-context.server");
    if (!(await isWorkspaceMember(data.workspaceId, context.userId))) throw new Error("Forbidden");
    const { executeOne } = await import("@/integrations/mysql/pool");
    const n = async (sql: string) =>
      Number((await executeOne<{ n: number }>(sql, [data.workspaceId]))?.n ?? 0);
    const [leads, inbox, automation, followUpsOverdue, followUpsToday] = await Promise.all([
      n("SELECT COUNT(*) AS n FROM crm_leads WHERE workspace_id = ?"),
      n("SELECT COUNT(*) AS n FROM crm_conversations WHERE workspace_id = ? AND unread_count > 0"),
      n("SELECT COUNT(*) AS n FROM crm_automation_rules WHERE workspace_id = ? AND enabled = 1"),
      // Follow-up yang belum selesai dan sudah lewat jatuh tempo.
      n(
        "SELECT COUNT(*) AS n FROM crm_activities WHERE workspace_id = ? AND done_at IS NULL AND due_at < UTC_TIMESTAMP(6)",
      ),
      // Follow-up belum selesai yang jatuh tempo hari ini (zona Asia/Jakarta) dan belum lewat.
      n(
        `SELECT COUNT(*) AS n FROM crm_activities
          WHERE workspace_id = ? AND done_at IS NULL AND due_at >= UTC_TIMESTAMP(6)
            AND DATE(CONVERT_TZ(due_at, '+00:00', '+07:00')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00'))`,
      ),
    ]);
    return { leads, inbox, automation, followUpsOverdue, followUpsToday };
  });
