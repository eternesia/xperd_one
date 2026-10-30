import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";

export default defineTool({
  name: "qalling_list_social_accounts",
  title: "List social accounts",
  description:
    "List the social media accounts connected to a Qalling workspace (use their ids when drafting posts).",
  inputSchema: { workspace_id: z.string().uuid().describe("Workspace id from list_workspaces.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "publishing");
    const { execute } = await import("@/integrations/mysql/pool");
    const rows = await execute<{
      id: string;
      platform: string;
      account_name: string;
      handle: string | null;
      status: string;
    }>(
      "SELECT id, platform, account_name, handle, status FROM crm_social_accounts WHERE workspace_id = ? ORDER BY platform",
      [workspace_id],
    );
    const accounts = rows.map((a) => ({
      id: a.id,
      platform: a.platform,
      name: a.account_name,
      handle: a.handle,
      status: a.status,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(accounts) }],
      structuredContent: { accounts },
    };
  },
});
