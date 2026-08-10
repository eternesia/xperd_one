import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_purchase_documents",
  title: "List purchase documents",
  description: "List purchase requests, orders, goods receipts, AP invoices, payments, or returns in a workspace.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace UUID."),
    doc_type: z
      .enum([
        "purchase_request",
        "purchase_order",
        "goods_receipt",
        "ap_invoice",
        "payment",
        "purchase_return",
      ])
      .describe("Procurement document type to filter."),
    limit: z.number().int().min(1).max(100).default(20).describe("Max results to return."),
    offset: z.number().int().min(0).default(0).describe("Offset for pagination."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id, doc_type, limit, offset }, ctx) => {
    requireAuth(ctx);
    const supabase = supabaseForUser(ctx);
    const { data, error, count } = await supabase
      .from("prc_documents")
      .select("id,doc_number,doc_date,status,supplier_name,subtotal,tax_amount,total", { count: "exact" })
      .eq("workspace_id", workspace_id)
      .eq("doc_type", doc_type)
      .order("doc_date", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new ToolError(error.message);
    return {
      content: [{ type: "text", text: JSON.stringify({ documents: data ?? [], total: count ?? 0 }, null, 2) }],
      structuredContent: { documents: data ?? [], total: count ?? 0 },
    };
  },
});
