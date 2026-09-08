import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { assertWorkspaceMember, getTokenUser, requireAuth } from "../db";

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
    const { userId } = await getTokenUser(ctx);
    await assertWorkspaceMember(workspace_id, userId);
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const countRow = await executeOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM prc_documents WHERE workspace_id = ? AND doc_type = ?",
      [workspace_id, doc_type],
    );
    const rows = await execute(
      `SELECT id,doc_number,doc_date,status,supplier_name,subtotal,tax_amount,total
       FROM prc_documents WHERE workspace_id = ? AND doc_type = ? ORDER BY doc_date DESC LIMIT ? OFFSET ?`,
      [workspace_id, doc_type, String(limit), String(offset)],
    );
    return {
      content: [{ type: "text", text: JSON.stringify({ documents: rows ?? [], total: Number(countRow?.c ?? 0) }, null, 2) }],
      structuredContent: { documents: rows ?? [], total: Number(countRow?.c ?? 0) },
    };
  },
});
