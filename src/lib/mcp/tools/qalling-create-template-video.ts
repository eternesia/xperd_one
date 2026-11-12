import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingSection, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";

export default defineTool({
  name: "qalling_create_template_video",
  title: "Create a Studio Video template video",
  description:
    "Render a promo video from a Qalling video template (see qalling_list_video_templates) using photos already in the workspace media library and short text. Colours come from the photos, the ratio from the first photo, and a themed soundtrack is added. Costs Qalling credits by final duration. Call with confirm=false first to get the price and a summary, show it to the user, and only call with confirm=true after the user approves and confirms the photos are theirs and show no public figures. Returns a job id; poll qalling_get_video_job until done, then use the media_id in qalling_create_post.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    template: z
      .enum(["steps", "motion", "promo", "showcase", "catalog", "story", "announce"])
      .describe("Template key from qalling_list_video_templates."),
    media_ids: z
      .array(z.string().uuid())
      .max(10)
      .default([])
      .describe(
        "Image media ids from qalling_list_media, in order: 1 to 8 for every template (announce: 0 to 8, used as background).",
      ),
    item_texts: z
      .array(
        z.object({
          title: z
            .string()
            .max(40)
            .default("")
            .describe("Title shown with this photo (falls back to headline)."),
          label: z
            .string()
            .max(24)
            .default("")
            .describe("Price, step name or short label for this photo."),
        }),
      )
      .max(10)
      .default([])
      .describe("Optional text per photo, same order as media_ids."),
    headline: z.string().min(1).max(40).describe("Main title (required)."),
    subline: z.string().max(70).default("").describe("Description line."),
    badge: z.string().max(18).default("").describe("Price, promo or brand badge."),
    cta: z.string().max(24).default("").describe("Call to action, e.g. Order now."),
    accent: z
      .string()
      .regex(/^(auto|#[0-9A-Fa-f]{6})$/)
      .default("auto")
      .describe("auto = theme colour from the photos (recommended), or a #RRGGBB brand colour."),
    ratio: z
      .enum(["auto", "9:16", "1:1", "16:9"])
      .default("auto")
      .describe("auto = from the first photo's shape; or 9:16 Reels, 1:1 Feed, 16:9 YouTube."),
    seconds: z
      .number()
      .int()
      .refine((n) => [8, 10, 15, 20, 30, 45, 60].includes(n), "Use 8, 10, 15, 20, 30, 45 or 60.")
      .default(10)
      .describe("Requested length: 8, 10, 15, 20, 30, 45 or 60. May grow to fit many photos."),
    sound: z.boolean().default(true).describe("Themed soundtrack plus whoosh/pop effects."),
    confirm: z
      .boolean()
      .default(false)
      .describe(
        "false returns the price and summary only. true creates the job and charges credits; only after explicit user approval and the user confirming photo rights.",
      ),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async (a, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingSection(a.workspace_id, userId, "media", true);
    const { finalSeconds, templateCredits, TEMPLATES } = await import("@/lib/ai-templates");
    const tpl = TEMPLATES.find((t) => t.key === a.template);
    if (!tpl) throw new ToolError("Unknown template.");
    if (tpl.photos === "required" && !a.media_ids.length)
      throw new ToolError(`Template ${a.template} needs 1 to 10 photos in media_ids.`);

    const { studioAccess } = await import("@/lib/ai-studio.server");
    const access = await studioAccess(a.workspace_id, userId);
    if (!access.available || !access.template.available)
      throw new ToolError("Studio Video templates are not enabled for this workspace yet.");

    const seconds = finalSeconds(a.template, a.media_ids.length, a.seconds);
    const cost = templateCredits(access.template.prices, seconds);
    if (!a.confirm)
      return json({
        status: "awaiting_confirmation",
        template: tpl.name_en,
        photos: a.media_ids.length,
        seconds,
        credits_cost: cost,
        credits_balance: access.credits,
        enough_credits: access.credits >= cost,
        render_machine_online: access.template.worker_online,
        next_step:
          "Show this summary and price to the user. Ask them to approve and to confirm the photos are theirs and show no public figures, then call again with confirm=true.",
      });

    const { createTemplateJob } = await import("@/lib/ai-templates.server");
    try {
      const r = await createTemplateJob({
        workspaceId: a.workspace_id,
        userId,
        template: a.template,
        sourceMediaId: null,
        items: a.media_ids.map((id, i) => ({
          mediaId: id,
          title: a.item_texts[i]?.title ?? "",
          price: a.item_texts[i]?.label ?? "",
        })),
        aspectRatio: a.ratio,
        seconds: a.seconds,
        sound: a.sound,
        text: {
          headline: a.headline,
          subline: a.subline,
          badge: a.badge,
          cta: a.cta,
          accent: a.accent,
        },
      });
      return json({
        status: "queued",
        job_id: r.id,
        credits_charged: r.credits,
        next_step:
          "Poll qalling_get_video_job every 20 to 30 seconds until status is done or failed (about 5 seconds of rendering per second of video).",
      });
    } catch (e) {
      throw new ToolError((e as Error).message);
    }
  },
});
