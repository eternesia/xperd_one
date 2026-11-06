import { parsePlatformOptions } from "../../platform-options";
import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { arr, iso, json } from "../qalling-common";
import { canEditSchedule } from "../../post-delivery-rules";

export default defineTool({
  name: "qalling_get_post",
  title: "Get post details",
  description:
    "Full details of one Qalling post: caption, status, schedule, destination accounts, attached media, per-account delivery results, permalinks and last error. Also says whether the post can still be edited, cancelled or retried.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    post_id: z.string().uuid().describe("Post id from qalling_create_post or qalling_list_posts."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id, post_id }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "publishing");
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const p = await executeOne<Record<string, unknown>>(
      `SELECT id, title, caption, first_comment, platform_options, status, source, external_id, scheduled_at, published_at, account_ids,
              media_paths, permalinks, results, last_error, created_at
         FROM crm_scheduled_posts WHERE workspace_id = ? AND id = ?`,
      [workspace_id, post_id],
    );
    if (!p) throw new ToolError("Post not found in this workspace.");
    const ids = arr(p.account_ids).map(String);
    const accounts = ids.length
      ? await execute<Record<string, unknown>>(
          `SELECT id, account_name, platform, source, status FROM crm_social_accounts
            WHERE workspace_id = ? AND id IN (${ids.map(() => "?").join(",")})`,
          [workspace_id, ...ids],
        )
      : [];
    const paths = arr(p.media_paths).map(String);
    const media = paths.length
      ? await execute<Record<string, unknown>>(
          `SELECT id, name, mime_type FROM crm_media WHERE workspace_id = ? AND file_path IN (${paths.map(() => "?").join(",")})`,
          [workspace_id, ...paths],
        )
      : [];
    const results = arr(p.results) as { ok?: boolean }[];
    const status = String(p.status);
    const editable = canEditSchedule({
      status,
      source: String(p.source ?? ""),
      external_id: p.external_id ? String(p.external_id) : null,
    });
    return json({
      id: p.id,
      title: p.title,
      caption: p.caption,
      first_comment: p.first_comment ?? null,
      platform_options: parsePlatformOptions(p.platform_options),
      status,
      scheduled_at: iso(p.scheduled_at),
      published_at: iso(p.published_at),
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.account_name,
        platform: a.platform,
        provider: a.source,
        status: a.status,
      })),
      media: media.map((m) => ({ id: m.id, name: m.name, mime_type: m.mime_type })),
      results: p.results ? arr(p.results) : [],
      permalinks: arr(p.permalinks),
      last_error: p.last_error ?? null,
      can_edit: editable,
      can_cancel: editable && status === "scheduled",
      can_retry:
        status === "failed" &&
        !p.external_id &&
        String(p.source ?? "") !== "tebar" &&
        !results.some((r) => r?.ok),
    });
  },
});
