/**
 * Webhook Midtrans untuk top-up wallet (BS New 11): tanda tangan SHA-512 wajib, nominal harus sama,
 * penyelesaian idempoten. Settlement/capture-accept → saldo masuk; expire/cancel/deny → status gagal.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/wallet-midtrans")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let input: unknown;
        try {
          input = await request.json();
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }
        const { midtransNoticeSchema } = await import("@/lib/wallet/rules");
        const parsed = midtransNoticeSchema.safeParse(input);
        if (!parsed.success) return new Response("Invalid payload", { status: 400 });
        const { executeOne, execute } = await import("@/integrations/mysql/pool");
        const row = await executeOne<{
          id: string;
          tenant_id: string;
          amount_idr: number;
          gateway_id: string | null;
          gateway: string;
        }>(
          "SELECT id, tenant_id, amount_idr, gateway_id, gateway FROM topups WHERE gateway_ref = ?",
          [parsed.data.order_id],
        );
        if (!row?.gateway_id || row.gateway !== "midtrans")
          return new Response("Not found", { status: 404 });
        const gateway = await executeOne<{ server_key_secret_name: string | null }>(
          "SELECT server_key_secret_name FROM payment_gateways WHERE id = ? AND provider = 'midtrans'",
          [row.gateway_id],
        );
        const key = process.env[gateway?.server_key_secret_name || "MIDTRANS_SERVER_KEY"];
        if (!key) return new Response("Unavailable", { status: 503 });
        const { verifyMidtransNotice, isSettledPayment } =
          await import("@/lib/wallet/gateway.server");
        let notice;
        try {
          notice = await verifyMidtransNotice(input, key);
        } catch {
          return new Response("Invalid signature", { status: 401 });
        }
        if (Number(notice.gross_amount) !== Number(row.amount_idr))
          return new Response("Amount mismatch", { status: 400 });
        try {
          if (isSettledPayment(notice.transaction_status, notice.fraud_status)) {
            const { walletSettleTopup } = await import("@/lib/wallet.server");
            await walletSettleTopup({
              id: row.id,
              approve: true,
              note: "Webhook gateway terverifikasi",
              gatewayVerified: true,
            });
            // Saldo masuk → coba perpanjangan otomatis yang tertunda (best-effort).
            const { renewTenant } = await import("@/lib/billing-wallet.server");
            await renewTenant(row.tenant_id).catch(() => undefined);
          } else if (["expire", "cancel", "deny"].includes(notice.transaction_status)) {
            await execute("UPDATE topups SET status = ? WHERE id = ? AND status <> 'paid'", [
              notice.transaction_status === "expire" ? "expired" : "failed",
              row.id,
            ]);
          }
        } catch {
          return new Response("Retry later", { status: 500 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
