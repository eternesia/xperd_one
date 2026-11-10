/** Cron (disarankan per jam): email reminder trial & saldo, bukti pembayaran, ringkasan mingguan posting, pengingat tugas XPro. Idempoten. */
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
          const billing = await runBillingNotifications();
          const { runXproTaskReminders } = await import("@/lib/xpro-reminders.server");
          const xpro = await runXproTaskReminders().catch(() => ({ error: "xpro_failed" }));
          return Response.json({ ...billing, xpro });
        } catch {
          return Response.json({ error: "notifications_failed" }, { status: 500 });
        }
      },
    },
  },
});
