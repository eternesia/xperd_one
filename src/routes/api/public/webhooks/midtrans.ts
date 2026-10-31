import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";

export const Route = createFileRoute("/api/public/webhooks/midtrans")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: {
          order_id?: string;
          status_code?: string;
          gross_amount?: string;
          signature_key?: string;
          transaction_status?: string;
          payment_type?: string;
          transaction_id?: string;
        };
        try {
          payload = (await request.json()) as typeof payload;
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const { order_id, status_code, gross_amount, signature_key, transaction_status } = payload;
        if (!order_id || !status_code || !gross_amount || !signature_key) {
          return new Response("Missing fields", { status: 400 });
        }

        const { execute, executeOne } = await import("@/integrations/mysql/pool");

        const gateway = await executeOne<{
          server_key_secret_name: string | null;
          server_key: string | null;
          display_name: string | null;
        }>(
          "SELECT server_key_secret_name, server_key, display_name FROM payment_gateways WHERE provider = 'midtrans' AND is_active = 1 LIMIT 1",
        );

        const serverKey =
          gateway?.server_key ||
          process.env[gateway?.server_key_secret_name || "MIDTRANS_SERVER_KEY"];
        if (!serverKey) return new Response("Gateway not configured", { status: 503 });

        const expected = createHash("sha512")
          .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
          .digest("hex");
        if (expected !== signature_key) return new Response("Invalid signature", { status: 401 });

        const invoice = await executeOne<{
          id: string;
          tenant_id: string;
          subscription_id: string | null;
          status: string;
        }>("SELECT id, tenant_id, subscription_id, status FROM invoices WHERE invoice_number = ? LIMIT 1", [order_id]);
        if (!invoice) return new Response("Invoice not found", { status: 404 });

        if (transaction_status === "settlement" || transaction_status === "capture") {
          const { activateInvoice } = await import("@/lib/billing.server");
          await activateInvoice(invoice, {
            paymentMethod: payload.payment_type ?? gateway?.display_name ?? "midtrans",
            reference: payload.transaction_id ?? order_id,
          });
        } else if (transaction_status === "expire" || transaction_status === "cancel" || transaction_status === "deny") {
          await execute("UPDATE invoices SET payment_url = NULL WHERE id = ?", [invoice.id]);
        }

        return Response.json({ ok: true });
      },
    },
  },
});