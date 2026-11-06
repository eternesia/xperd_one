import { defineTool } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";
import { CRM_STAGES } from "@/lib/crm";

const JAKARTA_TODAY = "DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00'))";

export default defineTool({
  name: "qalling_get_crm_summary",
  title: "CRM pipeline summary",
  description:
    "One-call overview of the sales pipeline: leads and total value per stage, open pipeline value, leads won this month, new leads in the last 7 days, and follow-ups that are overdue or due today (Asia/Jakarta). Good starting point for 'what needs my attention'.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "crm");
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const month = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
    const [stages, follow, tasks, fresh, won] = await Promise.all([
      execute<{ stage: string; n: number; v: number }>(
        "SELECT stage, COUNT(*) AS n, COALESCE(SUM(estimated_value),0) AS v FROM crm_leads WHERE workspace_id = ? GROUP BY stage",
        [workspace_id],
      ),
      executeOne<{ overdue: number; today: number }>(
        `SELECT COALESCE(SUM(next_follow_up_at < ${JAKARTA_TODAY}),0) AS overdue,
                COALESCE(SUM(next_follow_up_at = ${JAKARTA_TODAY}),0) AS today
           FROM crm_leads WHERE workspace_id = ? AND status = 'open' AND next_follow_up_at IS NOT NULL`,
        [workspace_id],
      ),
      executeOne<{ open: number; overdue: number }>(
        `SELECT COUNT(*) AS open, COALESCE(SUM(due_at < UTC_TIMESTAMP(6)),0) AS overdue
           FROM crm_activities WHERE workspace_id = ? AND done_at IS NULL`,
        [workspace_id],
      ),
      executeOne<{ n: number }>(
        "SELECT COUNT(*) AS n FROM crm_leads WHERE workspace_id = ? AND created_at >= UTC_TIMESTAMP(6) - INTERVAL 7 DAY",
        [workspace_id],
      ),
      executeOne<{ n: number; v: number }>(
        `SELECT COUNT(*) AS n, COALESCE(SUM(estimated_value),0) AS v FROM crm_leads
          WHERE workspace_id = ? AND status = 'won'
            AND DATE_FORMAT(CONVERT_TZ(stage_changed_at, '+00:00', '+07:00'), '%Y-%m') = ?`,
        [workspace_id, month],
      ),
    ]);
    const byStage = new Map(stages.map((s) => [s.stage, s]));
    const pipeline = CRM_STAGES.map((s) => ({
      stage: s.id,
      label: s.id_,
      leads: Number(byStage.get(s.id)?.n ?? 0),
      value: Number(byStage.get(s.id)?.v ?? 0),
    }));
    const openValue = pipeline
      .filter((p) => p.stage !== "won" && p.stage !== "lost")
      .reduce((s, p) => s + p.value, 0);
    return json({
      pipeline,
      open_pipeline_value: openValue,
      won_this_month: { month, leads: Number(won?.n ?? 0), value: Number(won?.v ?? 0) },
      new_leads_last_7_days: Number(fresh?.n ?? 0),
      lead_follow_ups: {
        overdue: Number(follow?.overdue ?? 0),
        due_today: Number(follow?.today ?? 0),
      },
      activities: { open: Number(tasks?.open ?? 0), overdue: Number(tasks?.overdue ?? 0) },
    });
  },
});
