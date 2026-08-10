import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, supabaseForUser } from "../supabase";

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
    const supabase = supabaseForUser(ctx);
    const { data: ws, error: wsError } = await supabase
      .from("workspaces")
      .select("id,name,slug,legal_name,currency,status,default_costing_method,tenant_id")
      .eq("id", workspace_id)
      .maybeSingle();
    if (wsError) throw new ToolError(wsError.message);
    if (!ws) throw new ToolError("Workspace not found or access denied.");

    const { data: tenant } = await supabase
      .from("tenants")
      .select("name,subdomain,status,trial_ends_at,workspace_count,user_count,package_id")
      .eq("id", ws.tenant_id)
      .maybeSingle();

    const { data: pkg } = await supabase
      .from("packages")
      .select("name,max_workspace,max_users,monthly_price")
      .eq("id", tenant?.package_id ?? "")
      .maybeSingle();

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
