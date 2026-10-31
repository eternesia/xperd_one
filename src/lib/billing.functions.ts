import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

/** Payment methods that tenants can use at checkout (no secrets returned). */
export const listPaymentMethods = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { execute } = await import("@/integrations/mysql/pool");
    return execute(
      "SELECT id, provider, display_name, mode, instructions, sort_order FROM payment_gateways WHERE is_active = 1 ORDER BY sort_order ASC",
    );
  });

/** Start checkout for one subscription invoice. */
export const startInvoiceCheckout = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { invoiceId: string; gatewayId: string }) => {
    if (!data?.invoiceId) throw new Error("Invoice is required");
    if (!data?.gatewayId) throw new Error("Payment method is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const { userCanAccessTenant } = await import("@/lib/auth-context.server");

    const invoice = await executeOne<{
      id: string;
      invoice_number: string;
      tenant_id: string;
      total: number | string;
      status: string;
      payment_url: string | null;
    }>(
      "SELECT id, invoice_number, tenant_id, total, status, payment_url FROM invoices WHERE id = ? LIMIT 1",
      [data.invoiceId],
    );
    if (!invoice) throw new Error("Invoice not found");
    if (!(await userCanAccessTenant(invoice.tenant_id, context.userId))) throw new Error("Forbidden");
    if (invoice.status === "paid") throw new Error("This invoice is already paid");

    const gateway = await executeOne<{
      id: string;
      provider: string;
      display_name: string;
      mode: string;
      instructions: string | null;
      server_key_secret_name: string | null;
      server_key: string | null;
      is_active: number;
    }>(
      "SELECT id, provider, display_name, mode, instructions, server_key_secret_name, server_key, is_active FROM payment_gateways WHERE id = ? LIMIT 1",
      [data.gatewayId],
    );
    if (!gateway || !gateway.is_active) throw new Error("Payment method is not available");

    if (gateway.provider === "manual_transfer") {
      return {
        kind: "manual" as const,
        instructions: gateway.instructions ?? "",
        displayName: gateway.display_name,
        amount: Number(invoice.total),
        reference: invoice.invoice_number,
      };
    }

    if (gateway.provider !== "midtrans") {
      throw new Error(`${gateway.display_name} checkout is not wired yet. Use manual transfer for now.`);
    }

    const secretName = gateway.server_key_secret_name || "MIDTRANS_SERVER_KEY";
    const serverKey = gateway.server_key || process.env[secretName];
    if (!serverKey) {
      throw new Error("Server key is not configured yet. Ask the administrator to add it.");
    }

    const { createMidtransSnap } = await import("@/lib/billing.server");

    const tenant = await executeOne<{ pic_name: string | null; pic_email: string | null }>(
      "SELECT pic_name, pic_email FROM tenants WHERE id = ? LIMIT 1",
      [invoice.tenant_id],
    );

    const url = await createMidtransSnap({
      serverKey,
      mode: gateway.mode,
      orderId: invoice.invoice_number,
      grossAmount: Number(invoice.total),
      customerName: tenant?.pic_name ?? null,
      customerEmail: tenant?.pic_email ?? null,
    });

    await execute("UPDATE invoices SET payment_url = ?, payment_method = ? WHERE id = ?", [
      url,
      gateway.display_name,
      invoice.id,
    ]);

    return { kind: "redirect" as const, url, displayName: gateway.display_name };
  });

/** Admin: confirm a payment received outside the gateway and activate the tenant. */
export const confirmInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { invoiceId: string; method?: string; reference?: string }) => {
    if (!data?.invoiceId) throw new Error("Invoice is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { hasRole } = await import("@/lib/auth-context.server");
    if (!(await hasRole(context.userId, "admin"))) throw new Error("Forbidden");

    const { executeOne } = await import("@/integrations/mysql/pool");
    const { activateInvoice } = await import("@/lib/billing.server");

    const invoice = await executeOne<{
      id: string;
      tenant_id: string;
      subscription_id: string | null;
      status: string;
    }>("SELECT id, tenant_id, subscription_id, status FROM invoices WHERE id = ? LIMIT 1", [data.invoiceId]);
    if (!invoice) throw new Error("Invoice not found");

    await activateInvoice(invoice, {
      paymentMethod: data.method ?? "manual_transfer",
      reference: data.reference ?? null,
    });
    return { ok: true };
  });