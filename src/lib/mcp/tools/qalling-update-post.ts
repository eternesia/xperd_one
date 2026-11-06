import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingSection, getTokenUser, requireAuth } from "../db";
import { arr, iso, json } from "../qalling-common";
import { canEditSchedule, validateScheduleTime } from "../../post-delivery-rules";
import { validatePostTargets } from "../qalling-rules";
import { resolveMedia } from "../qalling-media";

export default defineTool({
  name: "qalling_update_post",
  title: "Edit a draft or scheduled post",
  description:
    "Edit a Qalling post that is still a draft or scheduled and has not been handed to a provider: title, caption, destination accounts, ordered library media, schedule time, or switch between draft and scheduled. Only the fields you pass change. Published, publishing, failed and Tebar-owned posts cannot be edited. Scheduling with publish_mode=scheduled needs a future scheduled_at (ISO 8601 with timezone offset).",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    post_id: z.string().uuid().describe("Post id from qalling_list_posts."),
    title: z.string().trim().min(1).max(150).optional(),
    caption: z.string().max(5000).optional(),
    first_comment: z
      .string()
      .max(2200)
      .optional()
      .describe("First comment posted right after publishing. Pass an empty string to remove it."),
    account_ids: z.array(z.string().uuid()).min(1).max(10).optional(),
    media_ids: z
      .array(z.string().uuid())
      .max(10)
      .optional()
      .describe("Replaces the attachments, in order. Pass [] to remove all media."),
    scheduled_at: z.string().datetime({ offset: true }).optional(),
    publish_mode: z
      .enum(["draft", "scheduled"])
      .optional()
      .describe("Change status. 'scheduled' authorizes publication at scheduled_at."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (a, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingSection(a.workspace_id, userId, "post-scheduler", true);
    if (a.media_ids?.length) await assertQallingSection(a.workspace_id, userId, "media", false);
    const { execute, executeOne, result: run } = await import("@/integrations/mysql/pool");
    const p = await executeOne<Record<string, unknown>>(
      `SELECT id, title, caption, status, source, external_id, scheduled_at, account_ids, media_paths
         FROM crm_scheduled_posts WHERE workspace_id = ? AND id = ?`,
      [a.workspace_id, a.post_id],
    );
    if (!p) throw new ToolError("Post not found in this workspace.");
    if (
      !canEditSchedule({
        status: String(p.status),
        source: String(p.source ?? ""),
        external_id: p.external_id ? String(p.external_id) : null,
      })
    )
      throw new ToolError("This post was already submitted or cannot be edited. Check its status.");
    if (
      a.scheduled_at === undefined &&
      a.publish_mode === undefined &&
      a.title === undefined &&
      a.caption === undefined &&
      a.account_ids === undefined &&
      a.media_ids === undefined
    )
      throw new ToolError("Nothing to change: pass at least one field.");

    const status = a.publish_mode ?? String(p.status);
    const accountIds = [...new Set(a.account_ids ?? arr(p.account_ids).map(String))];
    const accounts = await execute<{
      id: string;
      platform: string;
      source: string | null;
      status: string;
    }>(
      `SELECT id, platform, source, status FROM crm_social_accounts WHERE workspace_id = ? AND id IN (${accountIds.map(() => "?").join(",")})`,
      [a.workspace_id, ...accountIds],
    );
    if (accounts.length !== accountIds.length)
      throw new ToolError(
        "account_not_found: use ids from qalling_list_social_accounts for this workspace.",
      );

    const { media, cleanup } = a.media_ids
      ? await resolveMedia(a.workspace_id, userId, a.media_ids, [])
      : {
          media: arr(p.media_paths).length
            ? await execute<{ id: string; file_path: string; mime_type: string }>(
                `SELECT id, file_path, mime_type FROM crm_media WHERE workspace_id = ? AND file_path IN (${arr(
                  p.media_paths,
                )
                  .map(() => "?")
                  .join(",")})`,
                [a.workspace_id, ...arr(p.media_paths).map(String)],
              )
            : [],
          cleanup: async () => undefined,
        };
    try {
      const caption = a.caption ?? String(p.caption ?? "");
      if (!caption.trim() && !media.length) throw new ToolError("Add a caption or media.");
      try {
        validatePostTargets(
          accounts,
          media.map((m) => m.mime_type),
          status === "scheduled",
        );
      } catch (e) {
        throw new ToolError((e as Error).message);
      }
      let when: string | null = null;
      if (a.scheduled_at !== undefined || status === "scheduled") {
        try {
          when = validateScheduleTime(a.scheduled_at ?? iso(p.scheduled_at) ?? "", Date.now());
        } catch (e) {
          throw new ToolError((e as Error).message);
        }
      }
      if (when) {
        try {
          const { assertPostQuota } = await import("@/lib/qalling-quota.server");
          await assertPostQuota(a.workspace_id, new Date(when), a.post_id);
        } catch {
          throw new ToolError("Monthly post quota of this plan is used up.");
        }
      }
      const sets = ["title = ?", "caption = ?", "account_ids = ?", "media_paths = ?", "status = ?"];
      const params: unknown[] = [
        a.title ?? String(p.title),
        caption,
        JSON.stringify(accountIds),
        JSON.stringify(media.map((m) => m.file_path)),
        status,
      ];
      if (a.first_comment !== undefined) {
        sets.push("first_comment = ?");
        params.push(a.first_comment.trim() || null);
      }
      if (when) {
        sets.push("scheduled_at = ?");
        params.push(new Date(when));
      }
      // Compare-and-set: tidak menimpa post yang baru saja diambil scheduler.
      const upd = await run(
        `UPDATE crm_scheduled_posts SET ${sets.join(", ")}
          WHERE workspace_id = ? AND id = ? AND status = ? AND COALESCE(source,'') <> 'tebar' AND external_id IS NULL`,
        [...params, a.workspace_id, a.post_id, String(p.status)],
      );
      if (!upd.affectedRows)
        throw new ToolError(
          "Post changed or is being processed. Read its current status; do not retry blindly.",
        );
      return json({
        id: a.post_id,
        status,
        scheduled_at: when ?? iso(p.scheduled_at),
        account_ids: accountIds,
        media_ids: media.map((m) => m.id),
      });
    } catch (e) {
      if (a.media_ids) await cleanup();
      throw e;
    }
  },
});
