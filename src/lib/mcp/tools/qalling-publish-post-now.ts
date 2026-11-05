import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingSection, getTokenUser, requireAuth } from "../db";
import { canEditSchedule } from "../../post-delivery-rules";
import { validatePostTargets } from "../qalling-rules";

const arr = (v: unknown): string[] =>
  typeof v === "string" ? JSON.parse(v) : Array.isArray(v) ? (v as string[]) : [];

export default defineTool({
  name: "qalling_publish_post_now",
  title: "Publish post now",
  description:
    "Preview an existing Qalling draft/schedule, then with explicit user confirmation queue it for immediate delivery by the next scheduler tick (within about one minute). Never resends published, failed or processing posts. Only pass confirm=true after the user approves the exact post and destination accounts.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    post_id: z.string().uuid().describe("Post id from qalling_create_post or qalling_list_posts."),
    confirm: z
      .boolean()
      .default(false)
      .describe("False previews; true authorizes immediate publication after explicit user approval."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async ({ workspace_id, post_id, confirm }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingSection(workspace_id, userId, "post-scheduler", true);
    const { execute, executeOne, result: run } = await import("@/integrations/mysql/pool");
    const post = await executeOne<{
      id: string;
      title: string;
      caption: string | null;
      status: string;
      source: string | null;
      external_id: string | null;
      scheduled_at: string;
      account_ids: unknown;
      media_paths: unknown;
      media_url: string | null;
    }>(
      `SELECT id, title, caption, status, source, external_id, scheduled_at, account_ids, media_paths, media_url
         FROM crm_scheduled_posts WHERE workspace_id = ? AND id = ?`,
      [workspace_id, post_id],
    );
    if (!post) throw new ToolError("Post not found in this workspace.");
    if (!canEditSchedule({ status: post.status, source: post.source ?? undefined, external_id: post.external_id }))
      throw new ToolError("Post already submitted or cannot be resent. Check its status; do not retry.");
    const ids = [...new Set(arr(post.account_ids))];
    const accounts = ids.length
      ? await execute<{ id: string; account_name: string; platform: string; source: string | null; status: string }>(
          `SELECT id, account_name, platform, source, status FROM crm_social_accounts
            WHERE workspace_id = ? AND id IN (${ids.map(() => "?").join(",")})`,
          [workspace_id, ...ids],
        )
      : [];
    if (!accounts.length || accounts.length !== ids.length)
      throw new ToolError("Destination accounts are not available in this workspace.");
    const paths = arr(post.media_paths);
    const media = paths.length
      ? await execute<{ file_path: string; mime_type: string }>(
          `SELECT file_path, mime_type FROM crm_media WHERE workspace_id = ? AND file_path IN (${paths.map(() => "?").join(",")})`,
          [workspace_id, ...paths],
        )
      : [];
    if (paths.some((p) => !media.some((m) => m.file_path === p))) throw new ToolError("Media not found in this workspace.");
    if (post.media_url)
      throw new ToolError("Attach workspace library media before publishing this post through MCP.");
    if (!post.caption?.trim() && !paths.length) throw new ToolError("Add a caption or media before publishing.");
    try {
      validatePostTargets(accounts, media.map((m) => m.mime_type), true);
    } catch (e) {
      throw new ToolError((e as Error).message);
    }
    if (!confirm) {
      const preview = {
        status: "awaiting_confirmation",
        post_id,
        title: post.title,
        caption: post.caption,
        accounts: accounts.map((a) => ({ id: a.id, name: a.account_name, platform: a.platform })),
        media_count: paths.length,
        message:
          "Ask the user to approve this post and these destination accounts before calling with confirm=true.",
      };
      return { content: [{ type: "text", text: JSON.stringify(preview) }], structuredContent: preview };
    }
    const now = Date.now();
    const due = Date.parse(`${String(post.scheduled_at).replace(" ", "T")}Z`) <= now;
    if (post.status === "scheduled" && due) {
      const queuedAlready = {
        post_id,
        status: "scheduled",
        message: "Already queued for delivery. Do not submit again; read status with qalling_list_posts.",
      };
      return { content: [{ type: "text", text: JSON.stringify(queuedAlready) }], structuredContent: queuedAlready };
    }
    // Compare-and-set: tidak berebut dengan cron dan tidak mengubah post yang sudah diproses.
    const upd = await run(
      `UPDATE crm_scheduled_posts SET status = 'scheduled', scheduled_at = UTC_TIMESTAMP(6), last_error = NULL
        WHERE workspace_id = ? AND id = ? AND status = ? AND scheduled_at = ? AND COALESCE(source,'') <> 'tebar' AND external_id IS NULL`,
      [workspace_id, post_id, post.status, post.scheduled_at],
    );
    if (!upd.affectedRows)
      throw new ToolError("Post changed or is being processed. Read its current status; do not resend.");
    const after = await executeOne<{ id: string; status: string; scheduled_at: string }>(
      "SELECT id, status, scheduled_at FROM crm_scheduled_posts WHERE id = ?",
      [post_id],
    );
    const out = {
      post_id,
      status: after?.status ?? "scheduled",
      scheduled_at: after ? new Date(`${String(after.scheduled_at).replace(" ", "T")}Z`).toISOString() : null,
      message:
        "Queued for immediate delivery on the next scheduler tick (about one minute). Not yet confirmed published; read qalling_list_posts for the outcome.",
    };
    return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
  },
});
