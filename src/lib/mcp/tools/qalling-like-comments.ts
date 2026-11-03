import { defineTool } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";

export default defineTool({
  name: "qalling_like_comments",
  title: "Like social comments",
  description:
    "Like comments on the workspace's Facebook Page and TikTok accounts (other platforms do not allow liking comments via API). Pass comment ids, or omit them to like recent unliked comments, optionally filtered by keyword.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    comment_ids: z
      .array(z.string().uuid())
      .max(50)
      .optional()
      .describe("Specific comment ids from qalling_list_comments."),
    keyword: z
      .string()
      .max(100)
      .optional()
      .describe("Only like comments containing this text when ids are omitted."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .describe("Maximum comments to like when ids are omitted."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async ({ workspace_id, comment_ids, keyword, limit }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "comments", true);
    const { execute } = await import("@/integrations/mysql/pool");
    let ids = comment_ids ?? [];
    if (!ids.length) {
      const like = keyword ? `%${keyword.replace(/[%_\\]/g, "")}%` : null;
      const rows = await execute<{ id: string }>(
        `SELECT id FROM crm_social_comments WHERE workspace_id = ? AND liked_at IS NULL ${like ? "AND body LIKE ?" : ""}
          ORDER BY created_at DESC LIMIT ${Number(limit)}`,
        like ? [workspace_id, like] : [workspace_id],
      );
      ids = rows.map((r) => r.id);
    }
    if (!ids.length)
      return {
        content: [{ type: "text", text: "No unliked comments found." }],
        structuredContent: { liked: 0, skipped: 0, failed: 0 },
      };
    const { likeCommentsCore } = await import("@/lib/social-interactions.server");
    const r = await likeCommentsCore(workspace_id, ids);
    return {
      content: [
        {
          type: "text",
          text: `Liked ${r.liked}, skipped ${r.skipped} (unsupported platform or already liked), failed ${r.failed}.`,
        },
      ],
      structuredContent: r,
    };
  },
});
