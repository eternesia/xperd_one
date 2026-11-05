import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingSection, getTokenUser, requireAuth } from "../db";
import { postInputSchema, postTime, validatePostTargets } from "../qalling-rules";
import { resolveMedia } from "../qalling-media";

// BS New 17: `qalling_create_post` menggantikan `qalling_create_post_draft` — draft, carousel (hingga 10 lampiran) atau terjadwal.
export default defineTool({
  name: "qalling_create_post",
  title: "Create post — draft, carousel or schedule",
  description:
    "Create a Qalling post with a caption and up to 10 ordered image/video attachments from media_ids (library) or media_urls (supported HTTPS CDNs); multiple images create a carousel. Save for review with publish_mode=draft (default), or schedule directly with publish_mode=scheduled and a future scheduled_at including a timezone offset. Scheduled delivery requires the Qalling scheduler to be running. For immediate posting, create a draft then use qalling_publish_post_now with explicit user approval. Carousels/video require Tebar-connected accounts; native Meta supports one image only.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    account_ids: z.array(z.string().uuid()).min(1).max(10).describe("Ids from qalling_list_social_accounts."),
    title: z.string().min(1).max(150).describe("Short internal title."),
    caption: z.string().max(5000).default("").describe("Post caption; may be empty when media is attached."),
    scheduled_at: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe(
        "ISO 8601 with timezone offset. Required and future for scheduled mode; omitted for an unscheduled draft.",
      ),
    publish_mode: z
      .enum(["draft", "scheduled"])
      .default("draft")
      .describe("Draft saves for review; scheduled authorizes publication at scheduled_at."),
    media_ids: z
      .array(z.string().uuid())
      .max(10)
      .default([])
      .describe(
        "Ordered workspace media ids from qalling_list_media; multiple images form carousel slides in this order. Maximum 10 attachments total across media_ids and media_urls.",
      ),
    media_urls: z
      .array(z.string().url())
      .max(10)
      .default([])
      .describe(
        "Ordered HTTPS image/video URLs on supported OpenAI/Google Storage/Cloudinary/Unsplash/Replicate/Fal CDNs, imported into private workspace storage after media_ids. Multiple images form a carousel; maximum 10 attachments total. For other hosts upload in Qalling and use media_ids.",
      ),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async (args, ctx) => {
    requireAuth(ctx);
    const parsed = postInputSchema.safeParse(args);
    if (!parsed.success) throw new ToolError(parsed.error.issues.map((i) => i.message).join("; "));
    const input = parsed.data;
    const { workspace_id, account_ids, title, caption, publish_mode, media_ids, media_urls } = input;
    const { userId } = await getTokenUser(ctx);
    let scheduledAt: string;
    try {
      scheduledAt = postTime(publish_mode, input.scheduled_at, Date.now());
    } catch (e) {
      throw new ToolError((e as Error).message);
    }
    await assertQallingSection(workspace_id, userId, "post-scheduler", true);
    if (media_ids.length || media_urls.length)
      await assertQallingSection(workspace_id, userId, "media", media_urls.length > 0);
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    const unique = [...new Set(account_ids)];
    const owned = await execute<{ id: string; platform: string; source: string | null; status: string }>(
      `SELECT id, platform, source, status FROM crm_social_accounts WHERE workspace_id = ? AND id IN (${unique.map(() => "?").join(",")})`,
      [workspace_id, ...unique],
    );
    if (owned.length !== unique.length)
      throw new ToolError("account_not_found: use ids from qalling_list_social_accounts for this workspace.");
    try {
      validatePostTargets(owned, [], false);
    } catch (e) {
      throw new ToolError((e as Error).message);
    }
    const { media, cleanup } = await resolveMedia(workspace_id, userId, media_ids, media_urls);
    try {
      try {
        validatePostTargets(owned, media.map((m) => m.mime_type), publish_mode === "scheduled");
      } catch (e) {
        throw new ToolError((e as Error).message);
      }
      // Cek ulang setelah unduhan: jadwal yang sudah lewat tidak boleh masuk antrean.
      let time: string;
      try {
        time = postTime(publish_mode, input.scheduled_at ? scheduledAt : undefined, Date.now());
      } catch (e) {
        throw new ToolError((e as Error).message);
      }
      const when = new Date(time);
      try {
        const { assertPostQuota } = await import("@/lib/qalling-quota.server");
        await assertPostQuota(workspace_id, when);
      } catch {
        throw new ToolError("Monthly post quota of this plan is used up.");
      }
      const id = uuid();
      try {
        await execute(
          `INSERT INTO crm_scheduled_posts (id, workspace_id, title, caption, account_ids, media_paths, scheduled_at, status, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'mcp')`,
          [id, workspace_id, title, caption, JSON.stringify(unique), JSON.stringify(media.map((m) => m.file_path)), when, publish_mode],
        );
      } catch {
        throw new ToolError("Post could not be saved.");
      }
      const result = {
        id,
        status: publish_mode,
        scheduled_at: when.toISOString(),
        media_ids: media.map((m) => m.id),
        message:
          publish_mode === "scheduled"
            ? "Scheduled in Qalling; sent to the provider when due."
            : "Draft saved for review in Qalling → Posts.",
      };
      return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
    } catch (e) {
      await cleanup();
      throw e;
    }
  },
});
