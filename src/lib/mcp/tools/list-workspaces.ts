import { defineTool, ToolError } from "../framework";
import { getTokenUser, requireAuth } from "../db";

export default defineTool({
  name: "list_workspaces",
  title: "List workspaces",
  description: "List all XPERD workspaces the signed-in user can access.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    const { execute } = await import("@/integrations/mysql/pool");
    const { workspaceHasFeature } = await import("@/lib/entitlements.server");
    const all = await execute(
      `SELECT w.id, w.name, w.slug, w.legal_name, w.currency, w.status, w.default_costing_method
       FROM workspaces w
       JOIN workspace_members m ON m.workspace_id = w.id
       WHERE m.user_id = ?
       ORDER BY w.created_at ASC`,
      [userId],
    );
    // Hanya workspace yang paketnya menyertakan Integrasi AI (mcp_api).
    const rows = [];
    for (const w of all ?? []) if (await workspaceHasFeature(w.id, "mcp_api")) rows.push(w);
    return {
      content: [{ type: "text", text: JSON.stringify(rows ?? [], null, 2) }],
      structuredContent: { workspaces: rows ?? [] },
    };
  },
});
