import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingSection, getTokenUser, requireAuth } from "../db";
import { arr, json } from "../qalling-common";

export default defineTool({
  name: "qalling_retry_post",
  title: "Retry a failed post",
  description:
    "Re-queue a post whose delivery failed for every destination, for delivery on the next scheduler tick. Refused when any account already received the post (to avoid duplicates) or the post belongs to a provider. Call first with confirm=false to preview, and only after explicit user approval call again with confirm=true. Then read qalling_get_post for the outcome; never retry twice in a row.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    post_id: z.string().uuid().describe("Post id from qalling_list_posts (status failed)."),
    confirm: z
      .boolean()
      .default(false)
      .describe("False previews; true re-queues after explicit user approval."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async ({ workspace_id, post_id, confirm }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingSection(workspace_id, userId, "post-scheduler", true);
    const { executeOne, result: run } = await import("@/integrations/mysql/pool");
    const p = await executeOne<Record<string, unknown>>(
      `SELECT id, title, caption, status, source, external_id, scheduled_at, account_ids, results, last_error
         FROM crm_scheduled_posts WHERE workspace_id = ? AND id = ?`,
      [workspace_id, post_id],
    );
    if (!p) throw new ToolError("Post not found in this workspace.");
    if (p.status !== "failed")
      throw new ToolError(
        "Only failed posts can be retried. Check the status with qalling_get_post.",
      );
    if (p.external_id || String(p.source ?? "") === "tebar")
      throw new ToolError("This post is owned by a provider and cannot be retried from here.");
    if ((arr(p.results) as { ok?: boolean }[]).some((r) => r?.ok))
      throw new ToolError(
        "Some accounts already received this post. Create a new post for the remaining accounts instead of retrying.",
      );
    if (!confirm)
      return json({
        status: "awaiting_confirmation",
        post_id,
        title: p.title,
        caption: p.caption,
        account_ids: arr(p.account_ids),
        last_error: p.last_error ?? null,
        message: "Ask the user to approve retrying this post before calling with confirm=true.",
      });
    const upd = await run(
      `UPDATE crm_scheduled_posts SET status = 'scheduled', scheduled_at = UTC_TIMESTAMP(6), last_error = NULL
        WHERE workspace_id = ? AND id = ? AND status = 'failed' AND COALESCE(source,'') <> 'tebar' AND external_id IS NULL`,
      [workspace_id, post_id],
    );
    if (!upd.affectedRows)
      throw new ToolError(
        "Post changed or is being processed. Read its current status; do not retry.",
      );
    return json({
      post_id,
      status: "scheduled",
      message:
        "Queued for delivery on the next scheduler tick (about one minute). Not yet confirmed published; read qalling_get_post for the outcome.",
    });
  },
});
