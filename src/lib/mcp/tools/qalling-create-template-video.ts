import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingSection, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";

export default defineTool({
  name: "qalling_create_template_video",
  title: "Create a Studio AI template video",
  description:
    "Render a short promo video from a Qalling video template (see qalling_list_video_templates) using photos already in the workspace media library and short text. Costs Qalling credits. Call with confirm=false first to get the price and a summary, show it to the user, and only call with confirm=true after the user approves and confirms the photos are theirs and show no public figures. Returns a job id; poll qalling_get_video_job until done, then use the media_id in qalling_create_post.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    template: z
      .enum(["promo", "showcase", "story", "catalog", "motion", "announce"])
      .describe("Template key from qalling_list_video_templates."),
    media_ids: z
      .array(z.string().uuid())
      .max(6)
      .default([])
      .describe(
        "Image media ids from qalling_list_media. One for promo/showcase/story, 2 to 6 in order for catalog/motion, none for announce.",
      ),
    item_texts: z
      .array(
        z.object({
          title: z.string().max(30).default("").describe("Name shown on this photo."),
          label: z.string().max(18).default("").describe("Price or short label on this photo."),
        }),
      )
      .max(6)
      .default([])
      .describe(
        "catalog/motion only: text per photo, same order as media_ids. Titles are required for catalog.",
      ),
    headline: z.string().min(1).max(40).describe("Main title (required)."),
    subline: z
      .string()
      .max(70)
      .default("")
      .describe("Description line (not used by catalog/motion)."),
    badge: z
      .string()
      .max(18)
      .default("")
      .describe("Price or promo badge (not used by catalog/motion)."),
    cta: z.string().max(24).default("").describe("Call to action, e.g. Order now."),
    accent: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .default("#6D28D9")
      .describe("Brand colour; one of accents from qalling_list_video_templates."),
    ratio: z
      .enum(["9:16", "1:1", "16:9"])
      .default("9:16")
      .describe("9:16 Reels, 1:1 Feed, 16:9 YouTube."),
    seconds: z
      .union([z.literal(6), z.literal(10), z.literal(15)])
      .default(6)
      .describe("Length for single-photo and announce templates."),
    sound: z
      .boolean()
      .default(true)
      .describe("Add whoosh/pop sound effects that follow the animation."),
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
    const { TEMPLATES } = await import("@/lib/ai-templates");
    const tpl = TEMPLATES.find((t) => t.key === a.template);
    if (!tpl) throw new ToolError("Unknown template.");
    const need = tpl.photos;
    if (need === "one" && a.media_ids.length !== 1)
      throw new ToolError(`Template ${a.template} needs exactly one photo in media_ids.`);
    if (need === "many" && (a.media_ids.length < 2 || a.media_ids.length > 6))
      throw new ToolError(`Template ${a.template} needs 2 to 6 photos in media_ids.`);
    if (need === "none" && a.media_ids.length)
      throw new ToolError(`Template ${a.template} uses no photos; pass media_ids as [].`);
    if (
      need === "many" &&
      a.template === "catalog" &&
      a.media_ids.some((_, i) => !a.item_texts[i]?.title?.trim())
    )
      throw new ToolError("catalog needs a title for every photo in item_texts.");

    const { studioAccess } = await import("@/lib/ai-studio.server");
    const access = await studioAccess(a.workspace_id, userId);
    if (!access.available || !access.template.available)
      throw new ToolError("Studio AI video templates are not enabled for this workspace yet.");

    if (!a.confirm)
      return json({
        status: "awaiting_confirmation",
        template: tpl.name_en,
        photos: a.media_ids.length,
        ratio: a.ratio,
        credits_cost: access.template.credits,
        credits_balance: access.credits,
        enough_credits: access.credits >= access.template.credits,
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
        sourceMediaId: need === "one" ? a.media_ids[0] : null,
        items:
          need === "many"
            ? a.media_ids.map((id, i) => ({
                mediaId: id,
                title: a.item_texts[i]?.title ?? "",
                price: a.item_texts[i]?.label ?? "",
              }))
            : [],
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
          "Poll qalling_get_video_job every 15 to 30 seconds until status is done or failed.",
      });
    } catch (e) {
      throw new ToolError((e as Error).message);
    }
  },
});
