import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, supabaseForUser } from "../supabase";

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
    const supabase = supabaseForUser(ctx);
    const { data, error, count } = await supabase
      .from("md_items")
      .select("code,name,item_type,uom_code,category_code,sell_price,cost_price,min_stock,barcode,is_active", {
        count: "exact",
      })
      .eq("workspace_id", workspace_id)
      .order("code", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw new ToolError(error.message);
    return {
      content: [{ type: "text", text: JSON.stringify({ items: data ?? [], total: count ?? 0 }, null, 2) }],
      structuredContent: { items: data ?? [], total: count ?? 0 },
    };
  },
});
