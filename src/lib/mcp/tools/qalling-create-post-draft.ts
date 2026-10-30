import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";

export default defineTool({
  name: "qalling_create_post_draft",
  title: "Create post draft",
  description:
    "Create a social post draft in Qalling for the given accounts and planned time. Nothing is published: the user reviews and schedules it in the Qalling app.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    account_ids: z
      .array(z.string().uuid())
      .min(1)
      .max(10)
      .describe("Ids from qalling_list_social_accounts."),
    title: z.string().min(1).max(150).describe("Short internal title."),
    caption: z.string().min(1).max(5000).describe("Post caption."),
    scheduled_at: z
      .string()
      .datetime({ offset: true })
      .describe("Planned time, ISO 8601 with offset (e.g. 2026-11-02T09:00:00+07:00)."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async ({ workspace_id, account_ids, title, caption, scheduled_at }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "publishing", true);
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    const unique = [...new Set(account_ids)];
    const owned = await execute<{ id: string }>(
      `SELECT id FROM crm_social_accounts WHERE workspace_id = ? AND id IN (${unique.map(() => "?").join(",")})`,
      [workspace_id, ...unique],
    );
    if (owned.length !== unique.length)
      throw new ToolError(
        "account_not_found: use ids from qalling_list_social_accounts for this workspace.",
      );
    const when = new Date(scheduled_at);
    try {
      const { assertPostQuota } = await import("@/lib/qalling-quota.server");
      await assertPostQuota(workspace_id, when);
    } catch {
      throw new ToolError("Monthly post quota of this plan is used up.");
    }
    const id = uuid();
    await execute(
      `INSERT INTO crm_scheduled_posts (id, workspace_id, title, caption, account_ids, scheduled_at, status, source)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', 'mcp')`,
      [id, workspace_id, title, caption, JSON.stringify(account_ids), when],
    );
    const result = {
      id,
      status: "draft",
      scheduled_at: when.toISOString(),
      message: "Draft saved. Review and schedule it in Qalling → Posts.",
    };
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});
