/** Mesin render Template: lapor aktif + ambil satu pekerjaan (bila ada). Auth: Bearer token mesin render. */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/render-worker/claim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateWorker, claimRenderJob } = await import("@/lib/ai-templates.server");
        if (!(await authenticateWorker(request)))
          return Response.json({ error: "unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const info = `${String(body.host ?? "?")} · v${String(body.version ?? "?")} · ${String(body.cpus ?? "?")} CPU`;
        const { securePublicOrigin } = await import("@/lib/crm-media.server");
        const metrics =
          body.metrics && typeof body.metrics === "object"
            ? (body.metrics as Record<string, unknown>)
            : null;
        return Response.json({
          job: await claimRenderJob(securePublicOrigin(request.url), info, metrics),
        });
      },
    },
  },
});
