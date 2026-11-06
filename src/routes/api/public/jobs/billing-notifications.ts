/** Cron (disarankan per jam): email reminder trial & saldo, bukti pembayaran, ringkasan mingguan posting. Idempoten. */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/jobs/billing-notifications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateCronRequest } = await import("@/lib/cron-auth.server");
        const failure = authenticateCronRequest(request);
        if (failure) return failure;
        const { runBillingNotifications } = await import("@/lib/billing-notifications.server");
        try {
          return Response.json(await runBillingNotifications());
        } catch {
          return Response.json({ error: "notifications_failed" }, { status: 500 });
        }
      },
    },
  },
});
