import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingSection, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";

export default defineTool({
  name: "qalling_request_client_approval",
  title: "Request client approval for a post",
  description:
    "Agency plan. Holds a draft or scheduled post and creates a private review link the client can open without logging in to approve it or request changes. Returns the link; this tool does not contact the client, so share the link yourself. Approved posts go back to their schedule when it is still in the future. Check qalling_get_post afterwards.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    post_id: z.string().uuid().describe("Draft or scheduled post id from qalling_list_posts."),
    client_label: z.string().max(120).optional().describe("Client name shown on the review page."),
    message: z.string().max(2000).optional().describe("Short note shown to the client."),
    valid_days: z.number().int().min(1).max(60).default(14).describe("How long the link works."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async ({ workspace_id, post_id, client_label, message, valid_days }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingSection(workspace_id, userId, "post-scheduler", true);
    const { workspaceHasFeature } = await import("@/lib/entitlements.server");
    if (!(await workspaceHasFeature(workspace_id, "client_approval")))
      throw new ToolError("Client approval is part of the Agency plan.");
    const { requestApprovalCore } = await import("@/lib/agency.core.server");
    try {
      const r = await requestApprovalCore(
        workspace_id,
        post_id,
        { clientLabel: client_label, message, days: valid_days },
        { id: userId },
      );
      return json({
        approval_id: r.id,
        review_path: `/approve/${r.token}`,
        review_url: `https://qalling.id/approve/${r.token}`,
        post_status: "draft",
        message: "Post held as a draft until the client decides. Share the review link with them.",
      });
    } catch (e) {
      throw new ToolError((e as Error).message);
    }
  },
});
