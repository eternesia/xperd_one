import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { assertWorkspaceMember, getTokenUser, requireAuth } from "../db";

export default defineTool({
  name: "search_items",
  title: "Search items",
  description: "Search inventory items by name, code, or barcode in a workspace.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace UUID."),
    query: z.string().min(1).describe("Search term (name, code, or barcode)."),
    limit: z.number().int().min(1).max(20).default(10).describe("Max results to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id, query, limit }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertWorkspaceMember(workspace_id, userId);
    const { execute } = await import("@/integrations/mysql/pool");
    const like = `%${query}%`;
    const rows = await execute(
      `SELECT code,name,item_type,uom_code,sell_price,cost_price,barcode,is_active
       FROM md_items
       WHERE workspace_id = ? AND (name LIKE ? OR code LIKE ? OR barcode LIKE ?)
       ORDER BY name ASC LIMIT ?`,
      [workspace_id, like, like, like, String(limit)],
    );
    return {
      content: [{ type: "text", text: JSON.stringify({ items: rows ?? [] }, null, 2) }],
      structuredContent: { items: rows ?? [] },
    };
  },
});
