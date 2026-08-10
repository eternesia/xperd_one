import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { assertWorkspaceMember, getTokenUser, requireAuth } from "../db";

export default defineTool({
  name: "list_sales_documents",
  title: "List sales documents",
  description: "List sales orders, invoices, receipts, or returns in a workspace.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace UUID."),
    doc_type: z
      .enum(["sales_order", "ar_invoice", "sales_receipt", "sales_return"])
      .describe("Sales document type to filter."),
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
      "SELECT COUNT(*) AS c FROM sls_documents WHERE workspace_id = ? AND doc_type = ?",
      [workspace_id, doc_type],
    );
    const rows = await execute(
      `SELECT id,doc_number,doc_date,status,customer_name,subtotal,tax_amount,total
       FROM sls_documents WHERE workspace_id = ? AND doc_type = ? ORDER BY doc_date DESC LIMIT ? OFFSET ?`,
      [workspace_id, doc_type, String(limit), String(offset)],
    );
    return {
      content: [{ type: "text", text: JSON.stringify({ documents: rows ?? [], total: Number(countRow?.c ?? 0) }, null, 2) }],
      structuredContent: { documents: rows ?? [], total: Number(countRow?.c ?? 0) },
    };
  },
});
