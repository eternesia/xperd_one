import type { SupabaseClient } from "@supabase/supabase-js";

type AnyClient = SupabaseClient<any, any, any>;

/** Activate the tenant + subscription tied to a paid invoice. Idempotent. */
export async function activateInvoice(
  admin: AnyClient,
  invoice: { id: string; tenant_id: string; subscription_id: string | null; status: string },
  opts: { paymentMethod?: string | null; reference?: string | null } = {},
) {
  if (invoice.status !== "paid") {
    await admin
      .from("invoices")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        payment_method: opts.paymentMethod ?? null,
        gateway_reference: opts.reference ?? null,
      })
      .eq("id", invoice.id);
  }

  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const { data: sub } = invoice.subscription_id
    ? await admin.from("subscriptions").select("*").eq("id", invoice.subscription_id).maybeSingle()
    : await admin
        .from("subscriptions")
        .select("*")
        .eq("tenant_id", invoice.tenant_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  if (sub) {
    const base = new Date(sub.current_period_end ?? iso(today));
    const start = base > today ? base : today;
    const end = new Date(start);
    if (sub.billing_cycle === "yearly") end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);

    await admin
      .from("subscriptions")
      .update({ status: "active", current_period_start: iso(start), current_period_end: iso(end) })
      .eq("id", sub.id);

    await admin.from("tenants").update({ status: "active", ends_at: iso(end) }).eq("id", invoice.tenant_id);
  } else {
    await admin.from("tenants").update({ status: "active" }).eq("id", invoice.tenant_id);
  }

  return { activated: true };
}

/** Create a Midtrans Snap transaction and return its redirect URL. */
export async function createMidtransSnap(params: {
  serverKey: string;
  mode: string;
  orderId: string;
  grossAmount: number;
  customerName?: string | null;
  customerEmail?: string | null;
}) {
  const host =
    params.mode === "live"
      ? "https://app.midtrans.com/snap/v1/transactions"
      : "https://app.sandbox.midtrans.com/snap/v1/transactions";

  const res = await fetch(host, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Basic ${btoa(`${params.serverKey}:`)}`,
    },
    body: JSON.stringify({
      transaction_details: { order_id: params.orderId, gross_amount: Math.round(params.grossAmount) },
      customer_details: {
        first_name: params.customerName ?? undefined,
        email: params.customerEmail ?? undefined,
      },
    }),
  });

  const body = await res.text();
  if (!res.ok) throw new Error(`Midtrans error [${res.status}]: ${body}`);
  const json = JSON.parse(body) as { redirect_url?: string };
  if (!json.redirect_url) throw new Error(`Midtrans returned no redirect URL: ${body}`);
  return json.redirect_url;
}