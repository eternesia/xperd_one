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
          return Response.json(await renewDueTenants(25));
        } catch {
          return Response.json({ error: "renewal_failed" }, { status: 500 });
        }
      },
    },
  },
});
