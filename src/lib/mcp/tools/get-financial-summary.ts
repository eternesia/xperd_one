import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_financial_summary",
  title: "Financial summary",
  description: "Get a high-level financial summary for a workspace: cash balance, AR, AP, and inventory value.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id }, ctx) => {
    requireAuth(ctx);
    const supabase = supabaseForUser(ctx);

    const cashAccount = await supabase
      .from("md_accounts")
      .select("code,name")
      .eq("workspace_id", workspace_id)
      .eq("account_type", "asset")
      .or("code.ilike.110%,code.ilike.111%,code.ilike.1-10%")
      .limit(10);
    if (cashAccount.error) throw new ToolError(cashAccount.error.message);

    const arDocs = await supabase
      .from("sls_documents")
      .select("total", { count: "exact" })
      .eq("workspace_id", workspace_id)
      .eq("doc_type", "ar_invoice")
      .eq("status", "open");
    if (arDocs.error) throw new ToolError(arDocs.error.message);

    const apDocs = await supabase
      .from("prc_documents")
      .select("total", { count: "exact" })
      .eq("workspace_id", workspace_id)
      .eq("doc_type", "ap_invoice")
      .eq("status", "open");
    if (apDocs.error) throw new ToolError(apDocs.error.message);

    const inventory = await supabase
      .from("inv_movements")
      .select("item_code,qty,unit_cost")
      .eq("workspace_id", workspace_id)
      .gt("qty", 0);
    if (inventory.error) throw new ToolError(inventory.error.message);

    const arTotal = (arDocs.data ?? []).reduce((sum, d) => sum + (d.total ?? 0), 0);
    const apTotal = (apDocs.data ?? []).reduce((sum, d) => sum + (d.total ?? 0), 0);
    const inventoryValue = (inventory.data ?? []).reduce(
      (sum, s) => sum + (s.qty ?? 0) * (s.unit_cost ?? 0),
      0,
    );

    const summary = {
      cash_accounts: cashAccount.data ?? [],
      ar_total: arTotal,
      ar_count: arDocs.count ?? 0,
      ap_total: apTotal,
      ap_count: apDocs.count ?? 0,
      inventory_value: inventoryValue,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      structuredContent: summary,
    };
  },
});
