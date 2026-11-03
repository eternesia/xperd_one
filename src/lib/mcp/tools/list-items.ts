import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertWorkspaceMember, getTokenUser, requireAuth } from "../db";

export default defineTool({
  name: "list_items",
  title: "List items",
  description: "List inventory items in a workspace with optional pagination.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace UUID."),
    limit: z.number().int().min(1).max(100).default(20).describe("Max items to return (1-100)."),
    offset: z.number().int().min(0).default(0).describe("Offset for pagination."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id, limit, offset }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertWorkspaceMember(workspace_id, userId);
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const countRow = await executeOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM md_items WHERE workspace_id = ?",
      [workspace_id],
    );
    const rows = await execute(
      `SELECT code,name,item_type,uom_code,category_code,sell_price,cost_price,min_stock,barcode,is_active
       FROM md_items WHERE workspace_id = ? ORDER BY code ASC LIMIT ? OFFSET ?`,
      [workspace_id, String(limit), String(offset)],
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ items: rows ?? [], total: Number(countRow?.c ?? 0) }, null, 2),
        },
      ],
      structuredContent: { items: rows ?? [], total: Number(countRow?.c ?? 0) },
    };
  },
});
