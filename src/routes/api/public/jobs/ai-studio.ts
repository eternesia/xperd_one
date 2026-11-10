/** Cron (disarankan tiap 1 menit): periksa pekerjaan Studio AI di penyedia, simpan hasil ke Media, refund yang gagal. */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/jobs/ai-studio")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateCronRequest } = await import("@/lib/cron-auth.server");
        const failure = authenticateCronRequest(request);
        if (failure) return failure;
        const { processPendingJobs } = await import("@/lib/ai-studio.server");
        try {
          return Response.json(await processPendingJobs(undefined, 50));
        } catch {
          return Response.json({ error: "ai_studio_failed" }, { status: 500 });
        }
      },
    },
  },
});
