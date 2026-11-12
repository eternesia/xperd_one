import { captionWarnings } from "../../caption-limits";
import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingSection, getTokenUser, requireAuth } from "../db";
import { postInputSchema, postTime, validatePostTargets } from "../qalling-rules";
import { CHAT_FILE_META, chatFilesSchema, importChatFiles, resolveMedia } from "../qalling-media";
import { platformOptionsSchema, validatePlatformOptions } from "../../platform-options";

// BS New 17: `qalling_create_post` menggantikan `qalling_create_post_draft` — draft, carousel (hingga 10 lampiran) atau terjadwal.
export default defineTool({
  name: "qalling_create_post",
  title: "Create post — draft, carousel or schedule",
  description:
    "Create a Qalling post with a caption and up to 10 ordered image/video attachments from media_ids (library) or media_urls (supported HTTPS CDNs); multiple images create a carousel. Save for review with publish_mode=draft (default), or schedule directly with publish_mode=scheduled and a future scheduled_at including a timezone offset. Scheduled delivery requires the Qalling scheduler to be running. For immediate posting, create a draft then use qalling_publish_post_now with explicit user approval. Carousels/video require Tebar-connected accounts; native Meta supports one image only.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    account_ids: z
      .array(z.string().uuid())
      .min(1)
      .max(10)
      .describe("Ids from qalling_list_social_accounts."),
    title: z.string().min(1).max(150).describe("Short internal title."),
    caption: z
      .string()
      .max(5000)
      .default("")
      .describe("Post caption; may be empty when media is attached."),
    first_comment: z
      .string()
      .max(2200)
      .optional()
      .describe(
        "Optional first comment posted by the account right after publishing (e.g. hashtags or a link). Supported platforms only; limits differ per platform (TikTok 150 characters).",
      ),
    platform_options: platformOptionsSchema
      .optional()
      .describe(
        "Per-platform options keyed by platform name (instagram, facebook, threads, linkedin, youtube, tiktok, pinterest, x, telegram, discord); only for Tebar-connected accounts of a selected platform. E.g. threads.poll, instagram.collaborators/trial/format, linkedin.visibility/document, tiktok.privacy_level, pinterest.board_id. YouTube requires youtube.made_for_kids (ask the user). See qalling_get_platform_rules.",
      ),
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
    files: chatFilesSchema
      .optional()
      .describe(
        "Images/videos attached or generated in the ChatGPT conversation (up to 10, in carousel order). They are saved to the workspace media library and attached after media_ids.",
      ),
  },
  meta: CHAT_FILE_META,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: async (rawArgs, ctx) => {
    requireAuth(ctx);
    let args: Omit<typeof rawArgs, "files"> = rawArgs;
    if (rawArgs.files?.length) {
      const { userId: uid } = await getTokenUser(ctx);
      await assertQallingSection(rawArgs.workspace_id, uid, "media", true);
      if (rawArgs.media_ids.length + rawArgs.media_urls.length + rawArgs.files.length > 10)
        throw new ToolError("Maximum 10 media attachments in total.");
      const items = await importChatFiles(rawArgs.workspace_id, uid, rawArgs.files);
      args = { ...rawArgs, media_ids: [...rawArgs.media_ids, ...items.map((i) => i.media_id)] };
    }
    const parsed = postInputSchema.safeParse(args);
    if (!parsed.success) throw new ToolError(parsed.error.issues.map((i) => i.message).join("; "));
    const input = parsed.data;
    const { workspace_id, account_ids, title, caption, publish_mode, media_ids, media_urls } =
      input;
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
    const owned = await execute<{
      id: string;
      platform: string;
      source: string | null;
      status: string;
    }>(
      `SELECT id, platform, source, status FROM crm_social_accounts WHERE workspace_id = ? AND id IN (${unique.map(() => "?").join(",")})`,
      [workspace_id, ...unique],
    );
    if (owned.length !== unique.length)
      throw new ToolError(
        "account_not_found: use ids from qalling_list_social_accounts for this workspace.",
      );
    try {
      validatePostTargets(owned, [], false);
    } catch (e) {
      throw new ToolError((e as Error).message);
    }
    const { media, cleanup } = await resolveMedia(workspace_id, userId, media_ids, media_urls);
    try {
      try {
        validatePostTargets(
          owned,
          media.map((m) => m.mime_type),
          publish_mode === "scheduled",
        );
      } catch (e) {
        throw new ToolError((e as Error).message);
      }
      const optionsError = validatePlatformOptions(input.platform_options, owned, {
        singleVideo: media.length === 1 && !!media[0].mime_type?.startsWith("video/"),
        mediaCount: media.length,
        hasCaption: !!caption.trim(),
        requireYoutubeKids: true,
      });
      if (optionsError) throw new ToolError(optionsError);
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
          `INSERT INTO crm_scheduled_posts (id, workspace_id, title, caption, first_comment, platform_options, account_ids, media_paths, scheduled_at, status, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'mcp')`,
          [
            id,
            workspace_id,
            title,
            caption,
            input.first_comment?.trim() || null,
            input.platform_options && Object.keys(input.platform_options).length
              ? JSON.stringify(input.platform_options)
              : null,
            JSON.stringify(unique),
            JSON.stringify(media.map((m) => m.file_path)),
            when,
            publish_mode,
          ],
        );
      } catch {
        throw new ToolError("Post could not be saved.");
      }
      const result = {
        id,
        status: publish_mode,
        scheduled_at: when.toISOString(),
        media_ids: media.map((m) => m.id),
        caption_warnings: captionWarnings(
          owned.map((o) => o.platform),
          caption,
          {
            hasMedia: media.length > 0,
            threadsCustomParts: !!input.platform_options?.threads?.thread?.length,
          },
        ),
        message:
          publish_mode === "scheduled"
            ? "Scheduled in Qalling; sent to the provider when due."
            : "Draft saved for review in Qalling → Posts.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (e) {
      await cleanup();
      throw e;
    }
  },
});
