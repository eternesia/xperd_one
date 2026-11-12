/** Mesin render Template: lapor kemajuan render (0–100) → progres % di Studio. Auth: Bearer token mesin render. */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/render-worker/progress")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateWorker } = await import("@/lib/ai-templates.server");
        if (!(await authenticateWorker(request)))
          return Response.json({ error: "unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const job = String(body.job ?? "");
        const progress = Math.round(Number(body.progress));
        if (!/^[0-9a-f-]{36}$/i.test(job) || !Number.isFinite(progress))
          return Response.json({ error: "bad_request" }, { status: 400 });
        const { execute } = await import("@/integrations/mysql/pool");
        await execute(
          "UPDATE ai_jobs SET progress = ? WHERE id = ? AND status = 'processing' AND provider = 'render'",
          [Math.max(0, Math.min(100, progress)), job],
        );
        return Response.json({ ok: true });
      },
    },
  },
});
