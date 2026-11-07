import { defineTool } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";

export default defineTool({
  name: "qalling_get_sales_funnel",
  title: "Sales funnel and report",
  description:
    "Sales funnel report for leads created in the last N days: leads currently at or beyond each stage with step conversion, win rate, average days to close, lost reasons, performance by source and by owner, open-pipeline forecast (value and value × probability) and this month's target realization per owner plus invoice collection (paid, outstanding, overdue). Lost leads are not counted in later stages because their furthest stage is not recorded. Read-only.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    days: z.number().int().min(7).max(730).default(90).describe("Look-back window in days."),
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ workspace_id, days }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "crm", false);
    const { funnelReportCore } = await import("@/lib/funnel.core.server");
    return json(await funnelReportCore(workspace_id, days));
  },
});
