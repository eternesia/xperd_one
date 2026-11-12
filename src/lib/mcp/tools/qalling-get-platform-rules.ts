import { defineTool } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";
import { MEDIA_HOSTS } from "../qalling-rules";
import { CAPTION_RULES } from "../../caption-limits";

export default defineTool({
  name: "qalling_get_platform_rules",
  title: "Posting rules",
  description:
    "The posting rules this Qalling workspace enforces for MCP posts: caption and attachment limits, which platforms need media, which accounts can send carousels/video, accepted media CDNs and file-size limits. Check before creating a post to avoid rejections.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "publishing");
    const { loadMediaPolicy } = await import("@/lib/media-policy.server");
    const policy = await loadMediaPolicy();
    return json({
      caption_max_chars: 5000,
      caption_max_chars_per_platform: Object.fromEntries(
        Object.entries(CAPTION_RULES)
          .filter(([k]) => k !== "twitter")
          .map(([k, r]) => [
            k,
            r.maxWithMedia ? { text_only: r.max, with_media: r.maxWithMedia } : r.max,
          ]),
      ),
      caption_rules_note:
        "Limits are checked per platform: an account whose limit is exceeded fails on its own, the other accounts still publish. X counts links as 23 and emojis/CJK as 2; YouTube counts bytes. Threads captions over 500 characters are split automatically into a thread (up to 11 parts) unless platform_options.threads.thread is set. Create/update responses include caption_warnings.",
      max_attachments: 10,
      carousel: "Multiple attachments must all be images (a video must be posted alone).",
      platforms_requiring_media: ["instagram", "tiktok", "youtube", "pinterest"],
      account_sources: {
        tebar: "Tebar-connected accounts: carousel, video and scheduled delivery supported.",
        meta: "Native Meta (Instagram/Facebook): one image only; no carousel or video.",
      },
      accepted_media_hosts_for_media_urls: MEDIA_HOSTS,
      media_note:
        "For any other host, upload the file with qalling_upload_media (url or base64) and pass media_ids.",
      max_photo_mb: policy.photo_mb,
      max_video_mb: policy.video_mb,
      scheduling:
        "scheduled_at must be in the future, ISO 8601 with timezone offset. Delivery happens on the next scheduler tick.",
      immediate_publish:
        "Create a draft, then qalling_publish_post_now (preview, then confirm=true after user approval).",
    });
  },
});
