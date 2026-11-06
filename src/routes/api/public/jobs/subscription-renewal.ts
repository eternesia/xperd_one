/** Cron per jam: perpanjang langganan ERP tenant yang opt-in perpanjangan dari saldo (maks 25 per panggilan). */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/jobs/subscription-renewal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateCronRequest } = await import("@/lib/cron-auth.server");
        const failure = authenticateCronRequest(request);
        if (failure) return failure;
        const { renewDueTenants } = await import("@/lib/billing-wallet.server");
        try {
          const renewal = await renewDueTenants(25);
          // Email notifikasi best-effort: kegagalan di sini tidak boleh memengaruhi hasil perpanjangan.
          let notifications: unknown = null;
          try {
            const { runBillingNotifications } = await import("@/lib/billing-notifications.server");
            notifications = await runBillingNotifications();
          } catch {
            notifications = { error: "notifications_failed" };
          }
          return Response.json({ ...renewal, notifications });
        } catch {
          return Response.json({ error: "renewal_failed" }, { status: 500 });
        }
      },
    },
  },
});
