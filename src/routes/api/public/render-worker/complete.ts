/** Mesin render Template: unggah hasil MP4 (`?job=<id>`, body = berkas). Auth: Bearer token mesin render. */
import { createFileRoute } from "@tanstack/react-router";

const MAX_BYTES = 60 * 1024 * 1024;

export const Route = createFileRoute("/api/public/render-worker/complete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateWorker, completeRenderJob } = await import("@/lib/ai-templates.server");
        if (!(await authenticateWorker(request)))
          return Response.json({ error: "unauthorized" }, { status: 401 });
        const job = new URL(request.url).searchParams.get("job") ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(job))
          return Response.json({ error: "bad_job" }, { status: 400 });
        if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES)
          return Response.json({ error: "too_large" }, { status: 413 });
        const bytes = Buffer.from(await request.arrayBuffer());
        if (bytes.length > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
        try {
          return Response.json(await completeRenderJob(job, bytes));
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 409 });
        }
      },
    },
  },
});
