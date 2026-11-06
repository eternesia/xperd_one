import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";

export default defineTool({
  name: "qalling_reply_to_comment",
  title: "Reply publicly to a comment",
  description:
    "Post a public reply, as the connected account, to one open comment. The reply is visible to everyone: call first with confirm=false to preview, show the exact text to the user, and only after explicit approval call again with confirm=true. Never retry a result of 'unknown' or 'sending'.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    comment_id: z.string().uuid().describe("Comment id from qalling_list_comments (status open)."),
    text: z.string().trim().min(1).max(2000).describe("Reply text."),
    confirm: z
      .boolean()
      .default(false)
      .describe("False previews; true posts after explicit user approval."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: async ({ workspace_id, comment_id, text, confirm }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "comments", true);
    const { executeOne } = await import("@/integrations/mysql/pool");
    const c = await executeOne<Record<string, unknown>>(
      `SELECT c.id, c.author_name, c.body, c.status, a.account_name, a.platform
         FROM crm_social_comments c LEFT JOIN crm_social_accounts a ON a.id = c.account_id
        WHERE c.workspace_id = ? AND c.id = ?`,
      [workspace_id, comment_id],
    );
    if (!c) throw new ToolError("Comment not found in this workspace.");
    if (c.status !== "open") throw new ToolError("Comment is already handled or being processed.");
    if (!confirm)
      return json({
        status: "awaiting_confirmation",
        replying_to: { author: c.author_name, comment: c.body },
        as_account: c.account_name,
        platform: c.platform,
        text,
        message:
          "Ask the user to approve this exact public reply before calling with confirm=true.",
      });
    const { replyCommentCore } = await import("@/lib/social-interactions.core.server");
    try {
      const r = await replyCommentCore({
        workspaceId: workspace_id,
        commentId: comment_id,
        body: text,
      });
      return json({
        status: r.status,
        message:
          r.status === "replied"
            ? "Reply posted."
            : r.status === "failed"
              ? "The provider rejected the reply; the comment is open again."
              : "Not confirmed. Do not resend; read qalling_list_comments for the outcome.",
      });
    } catch (e) {
      throw new ToolError((e as Error).message);
    }
  },
});
