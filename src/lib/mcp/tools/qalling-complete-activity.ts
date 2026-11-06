import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";

export default defineTool({
  name: "qalling_complete_activity",
  title: "Mark a follow-up as done",
  description:
    "Mark an open CRM activity / follow-up task as done, optionally recording its outcome. Safe to repeat: an already completed activity is left unchanged.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    activity_id: z.string().uuid().describe("Activity id from qalling_list_activities."),
    outcome: z.string().max(255).optional().describe("Result of the activity."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ workspace_id, activity_id, outcome }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "crm", true);
    const { executeOne, execute, result } = await import("@/integrations/mysql/pool");
    const a = await executeOne<{ lead_id: string | null; done_at: string | null }>(
      "SELECT lead_id, done_at FROM crm_activities WHERE workspace_id = ? AND id = ?",
      [workspace_id, activity_id],
    );
    if (!a) throw new ToolError("Activity not found in this workspace.");
    if (a.done_at) return json({ id: activity_id, status: "done", message: "Already completed." });
    const r = await result(
      "UPDATE crm_activities SET done_at = UTC_TIMESTAMP(6), outcome = ? WHERE workspace_id = ? AND id = ? AND done_at IS NULL",
      [outcome ?? null, workspace_id, activity_id],
    );
    if (r.affectedRows && a.lead_id)
      await execute(
        "UPDATE crm_leads SET last_activity_at = UTC_TIMESTAMP(6) WHERE workspace_id = ? AND id = ?",
        [workspace_id, a.lead_id],
      );
    return json({ id: activity_id, status: "done" });
  },
});
