import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { assertWorkspaceMember, getTokenUser, requireAuth } from "../db";

export default defineTool({
  name: "get_workspace_summary",
  title: "Workspace summary",
  description: "Get a high-level summary of one workspace: tenant, package, status, and trial info.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace UUID to summarize."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertWorkspaceMember(workspace_id, userId);
    const { executeOne } = await import("@/integrations/mysql/pool");
    const ws = await executeOne(
      "SELECT id,name,slug,legal_name,currency,status,default_costing_method,tenant_id FROM workspaces WHERE id = ? LIMIT 1",
      [workspace_id],
    );
    if (!ws) throw new ToolError("Workspace not found or access denied.");

    const tenant = ws.tenant_id
      ? await executeOne(
          "SELECT name,subdomain,status,trial_ends_at,workspace_count,user_count,package_id FROM tenants WHERE id = ? LIMIT 1",
          [ws.tenant_id],
        )
      : null;

    const pkg = tenant?.package_id
      ? await executeOne(
          "SELECT name,max_workspace,max_users,monthly_price FROM packages WHERE id = ? LIMIT 1",
          [tenant.package_id],
        )
      : null;

    const summary = {
      workspace: ws,
      tenant: tenant ?? null,
      package: pkg ?? null,
      trial_days_left: tenant?.trial_ends_at
        ? Math.max(0, Math.ceil((new Date(tenant.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : null,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      structuredContent: summary,
    };
  },
});
