import { defineTool } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";

export default defineTool({
  name: "qalling_get_content_attribution",
  title: "Which content brings leads and closings",
  description:
    "Content attribution report: for each post and campaign that leads are linked to, the number of leads, closings (won), win rate, won value and open pipeline value, plus how many leads in the period have no content source. Link a lead to its source with source_post_id / source_campaign_id on qalling_create_lead or qalling_update_lead. Read-only.",
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
    const { contentAttributionCore } = await import("@/lib/attribution.core.server");
    return json(await contentAttributionCore(workspace_id, days));
  },
});
