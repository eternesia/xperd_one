import { defineTool } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";

const arr = (v: unknown): unknown[] =>
  typeof v === "string" ? JSON.parse(v) : Array.isArray(v) ? v : [];
const iso = (v: unknown) => (v ? new Date(`${String(v).replace(" ", "T")}Z`).toISOString() : null);

export default defineTool({
  name: "qalling_list_posts",
  title: "List social posts",
  description:
    "List recent and upcoming social posts in a Qalling workspace, optionally filtered by status.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    status: z
      .enum(["draft", "scheduled", "published", "failed"])
      .optional()
      .describe("Only posts with this status."),
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum posts to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id, status, limit }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "publishing");
    const { execute } = await import("@/integrations/mysql/pool");
    const rows = await execute<Record<string, unknown>>(
      `SELECT id, title, caption, status, scheduled_at, published_at, account_ids, last_error, permalinks
         FROM crm_scheduled_posts WHERE workspace_id = ? ${status ? "AND status = ?" : ""}
        ORDER BY scheduled_at DESC LIMIT ${Number(limit)}`,
      status ? [workspace_id, status] : [workspace_id],
    );
    const posts = rows.map((p) => ({
      ...p,
      scheduled_at: iso(p.scheduled_at),
      published_at: iso(p.published_at),
      account_ids: arr(p.account_ids),
      permalinks: arr(p.permalinks),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(posts) }],
      structuredContent: { posts },
    };
  },
});
