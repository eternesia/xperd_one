import { execute, executeOne } from "@/integrations/mysql/pool";

interface SubscriptionRow {
  id: string;
  billing_cycle: string;
  current_period_end: string | null;
}

/** Activate the tenant + subscription tied to a paid invoice. Idempotent. */
export async function activateInvoice(
  invoice: { id: string; tenant_id: string; subscription_id: string | null; status: string },
  opts: { paymentMethod?: string | null; reference?: string | null } = {},
) {
  if (invoice.status !== "paid") {
    await execute(
      "UPDATE invoices SET status = 'paid', paid_at = CURRENT_TIMESTAMP(6), payment_method = ?, gateway_reference = ? WHERE id = ?",
      [opts.paymentMethod ?? null, opts.reference ?? null, invoice.id],
    );
  }

  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const sub = invoice.subscription_id
    ? await executeOne<SubscriptionRow>(
        "SELECT id, billing_cycle, current_period_end FROM subscriptions WHERE id = ? LIMIT 1",
        [invoice.subscription_id],
      )
    : await executeOne<SubscriptionRow>(
        "SELECT id, billing_cycle, current_period_end FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1",
        [invoice.tenant_id],
      );

  if (sub) {
    const base = new Date(sub.current_period_end ?? iso(today));
    const start = base > today ? base : today;
    const end = new Date(start);
    if (sub.billing_cycle === "yearly") end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);

    await execute(
      "UPDATE subscriptions SET status = 'active', current_period_start = ?, current_period_end = ? WHERE id = ?",
      [iso(start), iso(end), sub.id],
    );
    await execute("UPDATE tenants SET status = 'active', ends_at = ? WHERE id = ?", [iso(end), invoice.tenant_id]);
  } else {
    await execute("UPDATE tenants SET status = 'active' WHERE id = ?", [invoice.tenant_id]);
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