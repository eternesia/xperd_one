import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertWorkspaceMember, getTokenUser, requireAuth } from "../db";

export default defineTool({
  name: "get_financial_summary",
  title: "Financial summary",
  description:
    "Get a high-level financial summary for a workspace: cash balance, AR, AP, and inventory value.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertWorkspaceMember(workspace_id, userId);
    const { execute } = await import("@/integrations/mysql/pool");

    const [cashAccount, arDocs, apDocs, inventory] = await Promise.all([
      execute(
        `SELECT code,name FROM md_accounts
         WHERE workspace_id = ? AND account_type = 'asset' AND (code LIKE '110%' OR code LIKE '111%' OR code LIKE '1-10%')
         LIMIT 10`,
        [workspace_id],
      ),
      execute(
        "SELECT total FROM sls_documents WHERE workspace_id = ? AND doc_type = 'ar_invoice' AND status = 'open'",
        [workspace_id],
      ),
      execute(
        "SELECT total FROM prc_documents WHERE workspace_id = ? AND doc_type = 'ap_invoice' AND status = 'open'",
        [workspace_id],
      ),
      execute(
        "SELECT item_code,qty,unit_cost FROM inv_movements WHERE workspace_id = ? AND qty > 0",
        [workspace_id],
      ),
    ]);

    const arList = (arDocs ?? []) as { total?: unknown }[];
    const apList = (apDocs ?? []) as { total?: unknown }[];
    const invList = (inventory ?? []) as { qty?: unknown; unit_cost?: unknown }[];
    const arTotal = arList.reduce((sum, d) => sum + Number(d.total ?? 0), 0);
    const apTotal = apList.reduce((sum, d) => sum + Number(d.total ?? 0), 0);
    const inventoryValue = invList.reduce(
      (sum, s) => sum + Number(s.qty ?? 0) * Number(s.unit_cost ?? 0),
      0,
    );

    const summary = {
      cash_accounts: cashAccount ?? [],
      ar_total: arTotal,
      ar_count: arList.length,
      ap_total: apTotal,
      ap_count: apList.length,
      inventory_value: inventoryValue,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      structuredContent: summary,
    };
  },
});
