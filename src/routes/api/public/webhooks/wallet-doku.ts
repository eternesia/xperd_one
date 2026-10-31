/**
 * Webhook DOKU Checkout untuk top-up wallet (BS New 13): HMAC atas body mentah + path tetap wajib, referensi & nominal harus
 * cocok, penyelesaian idempoten. Hanya SUCCESS yang menambah saldo; percobaan kanal gagal tidak membatalkan order yang
 * masih bisa dibayar. Gagal setelah verifikasi → 500 supaya DOKU mengulang.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/wallet-doku")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (Number(request.headers.get("content-length") || 0) > 65536)
          return new Response("Too large", { status: 413 });
        const body = await request.text();
        if (body.length > 65536) return new Response("Too large", { status: 413 });
        const { dokuNoticeSchema, verifyDokuNotice, getDokuCredentials, validateDokuPayment } =
          await import("@/lib/wallet/doku.server");
        let input: unknown;
        try {
          input = JSON.parse(body);
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }
        const parsed = dokuNoticeSchema.safeParse(input);
        if (!parsed.success) return new Response("Invalid payload", { status: 400 });
        const { executeOne } = await import("@/integrations/mysql/pool");
        const row = await executeOne<{
          id: string;
          tenant_id: string;
          amount_idr: number;
          gateway_id: string | null;
          gateway_ref: string | null;
        }>(
          "SELECT id, tenant_id, amount_idr, gateway_id, gateway_ref FROM topups WHERE gateway = 'doku' AND gateway_ref = ?",
          [parsed.data.order.invoice_number],
        );
        if (!row?.gateway_id || !row.gateway_ref) return new Response("Invalid payment", { status: 401 });
        const gateway = await executeOne<{
          merchant_id: string | null;
          mode: string;
          server_key: string | null;
          server_key_secret_name: string | null;
        }>(
          "SELECT merchant_id, mode, server_key, server_key_secret_name FROM payment_gateways WHERE id = ? AND provider = 'doku'",
          [row.gateway_id],
        );
        if (!gateway) return new Response("Unavailable", { status: 503 });
        let credentials;
        try {
          credentials = getDokuCredentials(gateway);
        } catch {
          return new Response("Unavailable", { status: 503 });
        }
        let notice;
        try {
          notice = verifyDokuNotice(body, request.headers, credentials);
        } catch {
          return new Response("Invalid signature", { status: 401 });
        }
        let paid;
        try {
          paid = validateDokuPayment(notice, row.gateway_ref, Number(row.amount_idr));
        } catch {
          return new Response("Payment mismatch", { status: 400 });
        }
        if (paid) {
          try {
            const { walletSettleTopup } = await import("@/lib/wallet.server");
            await walletSettleTopup({
              id: row.id,
              approve: true,
              note: "Notifikasi DOKU terverifikasi",
              gatewayVerified: true,
            });
            const { renewTenant } = await import("@/lib/billing-wallet.server");
            await renewTenant(row.tenant_id);
          } catch {
            return new Response("Retry later", { status: 500 });
          }
        }
        return Response.json({ ok: true });
      },
    },
  },
});
