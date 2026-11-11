import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingSection, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";

export default defineTool({
  name: "qalling_get_video_job",
  title: "Get a Studio AI video job",
  description:
    "Status of a video job from qalling_create_template_video. When status is done, media_id is the finished MP4 in the workspace media library, ready for qalling_create_post. A failed job has already been refunded.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    job_id: z.string().uuid().describe("job_id from qalling_create_template_video."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id, job_id }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingSection(workspace_id, userId, "media", false);
    const { executeOne } = await import("@/integrations/mysql/pool");
    const j = await executeOne<Record<string, unknown>>(
      `SELECT j.id, j.status, j.model, j.aspect_ratio, j.duration_s, j.credits, j.refunded, j.error,
              j.result_media_id, j.created_at, j.finished_at, m.name AS media_name
         FROM ai_jobs j LEFT JOIN crm_media m ON m.id = j.result_media_id
        WHERE j.id = ? AND j.workspace_id = ?`,
      [job_id, workspace_id],
    );
    if (!j) throw new ToolError("Video job not found in this workspace.");
    const status = String(j.status);
    return json({
      job_id: j.id,
      status: status === "saving" ? "processing" : status,
      template: j.model,
      ratio: j.aspect_ratio,
      seconds: Number(j.duration_s),
      credits: Number(j.credits),
      ...(status === "done"
        ? { media_id: j.result_media_id, media_name: j.media_name }
        : status === "failed"
          ? { error: j.error, refunded: Boolean(j.refunded) }
          : { hint: "Still rendering or queued; check again in 15 to 30 seconds." }),
    });
  },
});
