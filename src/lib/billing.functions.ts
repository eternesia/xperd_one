import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Payment methods that tenants can use at checkout (no secrets returned). */
export const listPaymentMethods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("payment_gateways")
      .select("id,provider,display_name,mode,instructions,sort_order")
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Start checkout for one subscription invoice. */
export const startInvoiceCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { invoiceId: string; gatewayId: string }) => {
    if (!data?.invoiceId) throw new Error("Invoice is required");
    if (!data?.gatewayId) throw new Error("Payment method is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    // RLS scopes this read to invoices the caller may see.
    const { data: invoice, error } = await context.supabase
      .from("invoices")
      .select("id,invoice_number,tenant_id,total,status,payment_url")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status === "paid") throw new Error("This invoice is already paid");

    const { data: gateway, error: gwErr } = await context.supabase
      .from("payment_gateways")
      .select("id,provider,display_name,mode,instructions,server_key_secret_name,is_active")
      .eq("id", data.gatewayId)
      .maybeSingle();
    if (gwErr) throw new Error(gwErr.message);
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
    const serverKey = process.env[secretName];
    if (!serverKey) {
      throw new Error(`Server key "${secretName}" is not configured yet. Ask the administrator to add it.`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createMidtransSnap } = await import("@/lib/billing.server");

    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("pic_name,pic_email")
      .eq("id", invoice.tenant_id)
      .maybeSingle();

    const url = await createMidtransSnap({
      serverKey,
      mode: gateway.mode,
      orderId: invoice.invoice_number,
      grossAmount: Number(invoice.total),
      customerName: tenant?.pic_name ?? null,
      customerEmail: tenant?.pic_email ?? null,
    });

    await supabaseAdmin
      .from("invoices")
      .update({ payment_url: url, payment_method: gateway.display_name })
      .eq("id", invoice.id);

    return { kind: "redirect" as const, url, displayName: gateway.display_name };
  });

/** Admin: confirm a payment received outside the gateway and activate the tenant. */
export const confirmInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { invoiceId: string; method?: string; reference?: string }) => {
    if (!data?.invoiceId) throw new Error("Invoice is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { activateInvoice } = await import("@/lib/billing.server");

    const { data: invoice, error } = await supabaseAdmin
      .from("invoices")
      .select("id,tenant_id,subscription_id,status")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invoice) throw new Error("Invoice not found");

    await activateInvoice(supabaseAdmin as never, invoice as never, {
      paymentMethod: data.method ?? "manual_transfer",
      reference: data.reference ?? null,
    });
    return { ok: true };
  });