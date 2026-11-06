import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingSection, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";
import { canEditSchedule } from "../../post-delivery-rules";

export default defineTool({
  name: "qalling_cancel_scheduled_post",
  title: "Cancel a scheduled post",
  description:
    "Stop a scheduled post from being delivered by moving it back to draft. Nothing is deleted: the caption, media and accounts stay and it can be scheduled again with qalling_update_post. Only works while the post is still scheduled and not yet handed to a provider.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    post_id: z.string().uuid().describe("Post id from qalling_list_posts (status scheduled)."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ workspace_id, post_id }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingSection(workspace_id, userId, "post-scheduler", true);
    const { executeOne, result: run } = await import("@/integrations/mysql/pool");
    const p = await executeOne<Record<string, unknown>>(
      "SELECT status, source, external_id FROM crm_scheduled_posts WHERE workspace_id = ? AND id = ?",
      [workspace_id, post_id],
    );
    if (!p) throw new ToolError("Post not found in this workspace.");
    if (p.status === "draft")
      return json({ id: post_id, status: "draft", message: "Already a draft." });
    if (
      p.status !== "scheduled" ||
      !canEditSchedule({
        status: String(p.status),
        source: String(p.source ?? ""),
        external_id: p.external_id ? String(p.external_id) : null,
      })
    )
      throw new ToolError(
        "This post is already publishing, published, failed or owned by a provider and cannot be cancelled here.",
      );
    const upd = await run(
      `UPDATE crm_scheduled_posts SET status = 'draft'
        WHERE workspace_id = ? AND id = ? AND status = 'scheduled' AND COALESCE(source,'') <> 'tebar' AND external_id IS NULL`,
      [workspace_id, post_id],
    );
    if (!upd.affectedRows)
      throw new ToolError(
        "The post was just picked up for delivery. Read qalling_get_post for its status.",
      );
    return json({
      id: post_id,
      status: "draft",
      message: "Moved back to draft; it will not be delivered.",
    });
  },
});
