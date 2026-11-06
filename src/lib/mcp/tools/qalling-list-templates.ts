import { defineTool } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";

export default defineTool({
  name: "qalling_list_templates",
  title: "List saved message templates",
  description:
    "List the team's saved message templates (quick replies) so replies and follow-ups reuse the team's wording. Placeholders such as the customer's name are filled when the template is used in the Qalling app; adapt them yourself when drafting.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    channel: z
      .string()
      .max(30)
      .optional()
      .describe("Only templates for this channel, e.g. whatsapp."),
    search: z.string().max(100).optional().describe("Filter by text in name or body."),
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum templates to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id, channel, search, limit }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "crm");
    const { execute } = await import("@/integrations/mysql/pool");
    const where = ["workspace_id = ?", "is_active = 1"];
    const params: unknown[] = [workspace_id];
    if (channel) {
      where.push("channel = ?");
      params.push(channel);
    }
    if (search) {
      const like = `%${search.replace(/[%_\\]/g, "")}%`;
      where.push("(name LIKE ? OR body LIKE ?)");
      params.push(like, like);
    }
    const rows = await execute<Record<string, unknown>>(
      `SELECT id, name, channel, body FROM crm_templates WHERE ${where.join(" AND ")}
        ORDER BY name LIMIT ${Number(limit)}`,
      params,
    );
    return json({
      templates: rows.map((t) => ({ id: t.id, name: t.name, channel: t.channel, body: t.body })),
    });
  },
});
