import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingSection, getTokenUser, requireAuth } from "../db";

export default defineTool({
  name: "qalling_list_media",
  title: "List workspace media",
  description:
    "List private Qalling workspace images/videos with ids for attaching to posts; does not expose public file links.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    search: z.string().max(100).optional().describe("Filter file names."),
    type: z.enum(["image", "video"]).optional().describe("Filter by media type."),
    limit: z.number().int().min(1).max(50).default(20).describe("Page size."),
    offset: z
      .number()
      .int()
      .min(0)
      .max(10000)
      .default(0)
      .describe("Pagination offset; use next_offset from the previous result."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id, search, type, limit, offset }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingSection(workspace_id, userId, "media", false);
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const where = ["workspace_id = ?"];
    const params: unknown[] = [workspace_id];
    if (search) {
      where.push("name LIKE ?");
      params.push(`%${search.replace(/[%_\\]/g, "")}%`);
    }
    if (type) {
      where.push("mime_type LIKE ?");
      params.push(`${type}/%`);
    }
    try {
      const rows = await execute<{ id: string; name: string; mime_type: string; size_bytes: number; created_at: string }>(
        `SELECT id, name, mime_type, size_bytes, created_at FROM crm_media WHERE ${where.join(" AND ")}
          ORDER BY created_at DESC, id LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
        params,
      );
      const total = Number(
        (await executeOne<{ n: number }>(`SELECT COUNT(*) AS n FROM crm_media WHERE ${where.join(" AND ")}`, params))?.n ?? 0,
      );
      const result = {
        media: rows.map((m) => ({
          id: m.id,
          name: m.name,
          mime_type: m.mime_type,
          size_bytes: Number(m.size_bytes),
          created_at: new Date(`${String(m.created_at).replace(" ", "T")}Z`).toISOString(),
        })),
        total,
        next_offset: offset + limit < total ? offset + limit : null,
      };
      return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
    } catch {
      throw new ToolError("Workspace media could not be loaded.");
    }
  },
});
