import { defineTool } from "../framework";
import { z } from "zod/v4";
import { assertQallingSection, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";

export default defineTool({
  name: "qalling_list_video_templates",
  title: "List Studio AI video templates",
  description:
    "List the Qalling Studio AI video templates (rendered by Qalling from library photos and short text, no AI model), their photo needs, ratios, durations, the credit price per video, the workspace credit balance and whether the render machine is online. Call before qalling_create_template_video.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingSection(workspace_id, userId, "media", false);
    const { studioAccess } = await import("@/lib/ai-studio.server");
    const {
      CATALOG,
      TEMPLATE_ACCENTS,
      TEMPLATE_DURATIONS,
      TEMPLATE_LIMITS,
      TEMPLATE_RATIOS,
      TEMPLATES,
    } = await import("@/lib/ai-templates");
    const access = await studioAccess(workspace_id, userId);
    const available = access.available && access.template.available;
    return json({
      available,
      ...(available
        ? {}
        : { reason: "Studio AI video templates are not enabled for this workspace yet." }),
      credits_balance: access.credits,
      credits_per_video: access.template.credits,
      render_machine_online: access.template.worker_online,
      daily_limit: access.daily_limit,
      used_today: access.used_today,
      templates: TEMPLATES.map((t) => ({
        key: t.key,
        name: t.name_en,
        description: t.hint_en,
        photos:
          t.photos === "one"
            ? "exactly 1 (media_ids[0])"
            : t.photos === "many"
              ? `${CATALOG.min} to ${CATALOG.max} (media_ids, in order)`
              : "none",
        duration:
          t.photos === "many"
            ? "automatic from the number of photos"
            : `seconds: ${TEMPLATE_DURATIONS.join(", ")}`,
      })),
      ratios: TEMPLATE_RATIOS,
      accents: TEMPLATE_ACCENTS,
      text_limits: { ...TEMPLATE_LIMITS, item_title: CATALOG.title, item_label: CATALOG.price },
      notes: [
        "Credits are charged when the job is created and refunded automatically if rendering fails or the job is not picked up within 20 minutes.",
        "Rendering takes about 20 to 60 seconds once the render machine picks the job. Poll qalling_get_video_job.",
        "For a fully custom video (any style), make the MP4 yourself if you can run code, then upload it with qalling_upload_media or qalling_create_upload_link. That path uses no Qalling credits. Use H.264 MP4, 1080x1920 (9:16), 1080x1080 (1:1) or 1920x1080 (16:9), 30 fps, at most 60 seconds and 50 MB.",
      ],
    });
  },
});
