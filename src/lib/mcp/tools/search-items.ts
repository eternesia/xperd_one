import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, supabaseForUser } from "../supabase";

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
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("md_items")
      .select("code,name,item_type,uom_code,sell_price,cost_price,barcode,is_active")
      .eq("workspace_id", workspace_id)
      .or(`name.ilike.%${query}%,code.ilike.%${query}%,barcode.ilike.%${query}%`)
      .order("name", { ascending: true })
      .limit(limit);
    if (error) throw new ToolError(error.message);
    return {
      content: [{ type: "text", text: JSON.stringify({ items: data ?? [] }, null, 2) }],
      structuredContent: { items: data ?? [] },
    };
  },
});
