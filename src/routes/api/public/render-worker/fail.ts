/** Mesin render Template: lapor render gagal → kredit pengguna dikembalikan. Auth: Bearer token mesin render. */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/render-worker/fail")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateWorker, failRenderJob } = await import("@/lib/ai-templates.server");
        if (!(await authenticateWorker(request)))
          return Response.json({ error: "unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const job = String(body.job ?? "");
        if (!/^[0-9a-f-]{36}$/i.test(job))
          return Response.json({ error: "bad_job" }, { status: 400 });
        return Response.json(await failRenderJob(job, String(body.error ?? "").slice(0, 500)));
      },
    },
  },
});
