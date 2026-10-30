/**
 * Billing ERP lewat saldo wallet (BS New 11). Padanan fungsi SQL `billing_pay_invoice`, `billing_renew_tenant`
 * (bagian paket ERP), `billing_package_quote` dan `billing_package_checkout`: transaksi aplikasi, kunci langganan
 * dahulu lalu saldo wallet (urutan konsisten → tanpa deadlock), idempotensi lewat kunci ledger/`billing_operations`.
 * Tanggal memakai zona Asia/Jakarta seperti fungsi SQL aslinya.
 */
import type { PoolConnection } from "mysql2/promise";
import { execute, executeOne, transaction, uuid } from "@/integrations/mysql/pool";
import { walletPostEntryOn } from "./wallet.server";

/** Tanggal (YYYY-MM-DD) saat ini di Asia/Jakarta. */
export const jakartaToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const day = (s: string) => Date.parse(`${s}T00:00:00Z`) / 86_400_000;
const diffDays = (a: string, b: string) => Math.round(day(a) - day(b));
export function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  const target = d.getUTCMonth() + months;
  const out = new Date(Date.UTC(d.getUTCFullYear(), target, 1));
  // Postgres `interval '1 month'`: hari dijepit ke akhir bulan tujuan.
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(d.getUTCDate(), last));
  return out.toISOString().slice(0, 10);
}
const cycleMonths = (c: string | null) => (c === "yearly" ? 12 : 1);
const dateOnly = (v: unknown) => (v ? String(v).slice(0, 10) : "");

interface SubRow {
  id: string;
  tenant_id: string;
  package_id: string | null;
  status: string;
  billing_cycle: string | null;
  unit_price: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  wallet_auto_renew: number;
}
interface InvoiceRow {
  id: string;
  tenant_id: string;
  subscription_id: string | null;
  invoice_number: string;
  status: string;
  total: number;
  product: string;
  activation_applied_at: string | null;
}

/** Kunci saldo wallet (setelah langganan) supaya cek saldo & posting satu kunci. */
export async function lockAccount(conn: PoolConnection, tenantId: string): Promise<number> {
  await conn.execute("INSERT IGNORE INTO wallet_accounts (tenant_id, balance_idr) VALUES (?, 0)", [
    tenantId,
  ]);
  const [rows] = await conn.execute(
    "SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ? FOR UPDATE",
    [tenantId],
  );
  return Number((rows as { balance_idr: number }[])[0].balance_idr);
}
export async function isTenantOwner(tenantId: string, userId: string): Promise<boolean> {
  return Boolean(
    await executeOne("SELECT 1 AS ok FROM tenants WHERE id = ? AND owner_id = ?", [
      tenantId,
      userId,
    ]),
  );
}

/* ------------------------------ bayar invoice ------------------------------ */

export async function payInvoiceFromWallet(invoiceId: string, actor: string) {
  const head = await executeOne<{ tenant_id: string; subscription_id: string | null }>(
    "SELECT tenant_id, subscription_id FROM invoices WHERE id = ?",
    [invoiceId],
  );
  if (!head) throw new Error("invoice_not_found");
  if (!(await isTenantOwner(head.tenant_id, actor))) throw new Error("owner_required");
  return transaction(async (conn) => {
    if (head.subscription_id)
      await conn.execute("SELECT id FROM subscriptions WHERE id = ? FOR UPDATE", [
        head.subscription_id,
      ]);
    const [irows] = await conn.execute("SELECT * FROM invoices WHERE id = ? FOR UPDATE", [
      invoiceId,
    ]);
    const i = (irows as InvoiceRow[])[0];
    if (i.product !== "xperd" || !i.subscription_id || i.status === "void")
      throw new Error("base_invoice_required");
    if (i.activation_applied_at !== null || i.status === "paid")
      return { paid: true, invoice: i.id };
    const total = Number(i.total);
    if (total < 0 || total !== Math.trunc(total)) throw new Error("invalid_invoice_amount");
    const [srows] = await conn.execute(
      "SELECT * FROM subscriptions WHERE id = ? AND tenant_id = ? FOR UPDATE",
      [i.subscription_id, i.tenant_id],
    );
    const s = (srows as SubRow[])[0];
    if (!s) throw new Error("subscription_not_found");
    const today = jakartaToday();
    const end0 = dateOnly(s.current_period_end);
    const st = s.status === "active" && end0 > today ? end0 : today;
    const en = addMonths(st, cycleMonths(s.billing_cycle));
    if (total > 0) {
      await lockAccount(conn, i.tenant_id);
      await walletPostEntryOn(conn, {
        tenantId: i.tenant_id,
        type: "subscription",
        amount: -total,
        product: "xperd",
        ref: i.id,
        idem: `invoice:${i.id}`,
        description: "Paket ERP",
        actor,
        invoice: i.id,
      });
    }
    await conn.execute(
      "UPDATE invoices SET status = 'paid', paid_at = NOW(6), payment_method = 'wallet', activation_applied_at = NOW(6) WHERE id = ?",
      [i.id],
    );
    await conn.execute(
      "UPDATE subscriptions SET status = 'active', current_period_start = ?, current_period_end = ? WHERE id = ?",
      [st, en, s.id],
    );
    await conn.execute("UPDATE tenants SET status = 'active', ends_at = ? WHERE id = ?", [
      en,
      i.tenant_id,
    ]);
    return { paid: true, invoice: i.id, period_end: en };
  });
}

/* ------------------------- perpanjangan otomatis (ERP) ------------------------- */

export async function setWalletRenewal(tenantId: string, enabled: boolean) {
  const s = await executeOne<{ id: string }>(
    "SELECT id FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1",
    [tenantId],
  );
  if (!s) throw new Error("subscription_not_found");
  await execute("UPDATE subscriptions SET wallet_auto_renew = ? WHERE id = ?", [
    enabled ? 1 : 0,
    s.id,
  ]);
}

export async function renewTenant(tenantId: string): Promise<Record<string, unknown>> {
  const { addonGraceDays, markAddonsBaseBlocked, renewAddonsOn } =
    await import("./addon-billing.server");
  return transaction(async (conn) => {
    const [srows] = await conn.execute(
      "SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
      [tenantId],
    );
    let s = (srows as SubRow[])[0];
    if (!s || !s.wallet_auto_renew || !s.current_period_end) return { skipped: true };
    const today = jakartaToday();
    const months = cycleMonths(s.billing_cycle);
    const end0 = dateOnly(s.current_period_end);
    const [orows] = await conn.execute("SELECT owner_id FROM tenants WHERE id = ?", [tenantId]);
    const owner = (orows as { owner_id: string | null }[])[0]?.owner_id ?? null;
    const out: Record<string, unknown> = { renewed: false };
    if (end0 <= today && addMonths(end0, months) <= today)
      return { blocked: "expired_period_checkout_required" };
    if (end0 <= today) {
      const key = `renew:base:${s.id}:${end0}`;
      const [prows] = await conn.execute("SELECT monthly_price FROM packages WHERE id = ?", [
        s.package_id,
      ]);
      const price = Number(
        (prows as { monthly_price: number | null }[])[0]?.monthly_price ?? s.unit_price ?? 0,
      );
      if (!price || price <= 0) return { blocked: "custom_price" };
      const amount = Math.round(price * months);
      const en = addMonths(end0, months);
      const balance = await lockAccount(conn, tenantId);
      if (balance < amount) {
        await conn.execute("UPDATE subscriptions SET status = 'past_due' WHERE id = ?", [s.id]);
        // Add-on wallet-managed yang jatuh tempo masuk masa tenggang / ditangguhkan.
        await markAddonsBaseBlocked(conn, tenantId, await addonGraceDays(conn));
        return { blocked: "insufficient_balance" };
      }
      const invId = uuid();
      await conn.execute(
        `INSERT INTO invoices (id, invoice_number, tenant_id, subscription_id, status, subtotal, total, paid_at, payment_method, product, activation_applied_at)
         VALUES (?, ?, ?, ?, 'paid', ?, ?, NOW(6), 'wallet', 'xperd', NOW(6))`,
        [invId, key, tenantId, s.id, amount, amount],
      );
      await walletPostEntryOn(conn, {
        tenantId,
        type: "subscription",
        amount: -amount,
        product: "xperd",
        ref: s.id,
        idem: key,
        description: "Perpanjangan ERP",
        actor: owner,
        invoice: invId,
      });
      await conn.execute(
        "UPDATE subscriptions SET status = 'active', current_period_start = ?, current_period_end = ?, unit_price = ? WHERE id = ?",
        [end0, en, price, s.id],
      );
      await conn.execute("UPDATE tenants SET status = 'active', ends_at = ? WHERE id = ?", [
        en,
        tenantId,
      ]);
      s = { ...s, status: "active", current_period_start: end0, current_period_end: en };
      Object.assign(out, { renewed: true, period_end: en, charged: amount });
    }
    if (s.status !== "active") return { blocked: "base_not_active" };
    const renewedAddons = await renewAddonsOn(conn, tenantId, s, owner);
    if (renewedAddons) out.addons = renewedAddons;
    return out;
  });
}

/** Tenant yang perlu diperpanjang (maks 25): cron per jam. */
export async function renewDueTenants(limit = 25): Promise<{ processed: number }> {
  const today = jakartaToday();
  const rows = await execute<{ tenant_id: string }>(
    `SELECT s.tenant_id FROM subscriptions s
      WHERE s.wallet_auto_renew = 1 AND s.status IN ('active','past_due')
        AND (s.current_period_end <= ?
          OR EXISTS (SELECT 1 FROM tenant_addons ta WHERE ta.tenant_id = s.tenant_id AND ta.wallet_managed = 1
                      AND ta.ends_at < ? AND ta.status IN ('active','grace','suspended'))
          OR EXISTS (SELECT 1 FROM tenant_addon_options o WHERE o.tenant_id = s.tenant_id
                      AND o.ends_at < ? AND o.status IN ('active','grace','suspended')))
      ORDER BY s.current_period_end, s.id LIMIT ${Math.max(1, Math.min(limit, 100))}`,
    [today, today, today],
  );
  let processed = 0;
  for (const r of rows) {
    await renewTenant(r.tenant_id);
    processed++;
  }
  return { processed };
}

/* --------------------------- ganti paket instan (prorata) --------------------------- */

export interface PackageQuote {
  package: string;
  name: string;
  action: "upgrade" | "activate";
  monthly_price: number;
  old_price: number;
  charge: number;
  remaining_days: number;
  total_days: number;
  period_start: string;
  period_end: string;
  balance: number;
}

export async function packageQuote(
  tenantId: string,
  packageId: string,
  conn?: PoolConnection,
): Promise<PackageQuote> {
  const q = async <T>(sql: string, p: unknown[]) =>
    conn ? ((await conn.execute(sql, p as never))[0] as unknown as T[]) : await execute<T>(sql, p);
  const p = (
    await q<{ id: string; name: string; monthly_price: number | null }>(
      "SELECT id, name, monthly_price FROM packages WHERE id = ? AND is_active = 1",
      [packageId],
    )
  )[0];
  if (!p) throw new Error("package_unavailable");
  const price = Math.round(Number(p.monthly_price ?? 0));
  const s = (
    await q<SubRow>(
      "SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1",
      [tenantId],
    )
  )[0];
  const today = jakartaToday();
  const end = s ? dateOnly(s.current_period_end) : "";
  if (s && s.package_id === packageId && s.status === "active" && end > today)
    throw new Error("package_unchanged");
  let oldprice = 0;
  let charge: number;
  let action: PackageQuote["action"];
  let remaining: number;
  let days: number;
  let pstart: string;
  let pend: string;
  if (s && s.status === "active" && end > today) {
    oldprice = Math.round(Number(s.unit_price ?? 0));
    if (price < oldprice) throw new Error("downgrade_at_period_end");
    const start0 = dateOnly(s.current_period_start);
    days = Math.max(1, diffDays(end, start0));
    remaining = Math.max(1, diffDays(end, today));
    charge = Math.round(((price - oldprice) * remaining) / days);
    action = "upgrade";
    pstart = start0;
    pend = end;
  } else {
    charge = price;
    action = "activate";
    pstart = today;
    pend = addMonths(today, 1);
    days = diffDays(pend, pstart);
    remaining = days;
  }
  const bal = (
    await q<{ balance_idr: number }>(
      "SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?",
      [tenantId],
    )
  )[0];
  return {
    package: packageId,
    name: p.name,
    action,
    monthly_price: price,
    old_price: oldprice,
    charge,
    remaining_days: remaining,
    total_days: days,
    period_start: pstart,
    period_end: pend,
    balance: Number(bal?.balance_idr ?? 0),
  };
}

export async function packageCheckout(p: {
  tenantId: string;
  packageId: string;
  idem: string;
  actor: string;
  expectedCharge: number;
}): Promise<PackageQuote & { invoice_id: string }> {
  if (!(await isTenantOwner(p.tenantId, p.actor))) throw new Error("owner_required");
  const key = `package:${p.tenantId}:${p.idem}`;
  const req = JSON.stringify({ kind: "package", item: p.packageId });
  return transaction(async (conn) => {
    const [subRows] = await conn.execute(
      "SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
      [p.tenantId],
    );
    const sid = (subRows as SubRow[])[0]?.id ?? null;
    const [ops] = await conn.execute(
      "SELECT request, result FROM billing_operations WHERE idempotency_key = ?",
      [key],
    );
    const op = (ops as { request: unknown; result: unknown }[])[0];
    if (op) {
      const r = typeof op.request === "string" ? JSON.parse(op.request) : op.request;
      if (JSON.stringify(r) !== req) throw new Error("idempotency_conflict");
      return (typeof op.result === "string" ? JSON.parse(op.result) : op.result) as PackageQuote & {
        invoice_id: string;
      };
    }
    const q = await packageQuote(p.tenantId, p.packageId, conn);
    if (q.charge !== p.expectedCharge) throw new Error("quote_changed");
    if (!sid) throw new Error("subscription_not_found");
    const invId = uuid();
    await conn.execute(
      `INSERT INTO invoices (id, invoice_number, tenant_id, subscription_id, status, subtotal, total, paid_at, payment_method, product, notes, activation_applied_at)
       VALUES (?, ?, ?, ?, 'paid', ?, ?, NOW(6), 'wallet', 'xperd', ?, NOW(6))`,
      [invId, `PKG-${p.idem}`, p.tenantId, sid, q.charge, q.charge, `Paket ${q.name}`],
    );
    if (q.charge > 0) {
      await lockAccount(conn, p.tenantId);
      await walletPostEntryOn(conn, {
        tenantId: p.tenantId,
        type: "subscription",
        amount: -q.charge,
        product: "platform",
        ref: p.packageId,
        idem: key,
        description: `Paket ${q.name}`,
        actor: p.actor,
        invoice: invId,
      });
    }
    await conn.execute(
      "UPDATE subscriptions SET package_id = ?, unit_price = ?, status = 'active', current_period_start = ?, current_period_end = ? WHERE id = ?",
      [p.packageId, q.monthly_price, q.period_start, q.period_end, sid],
    );
    await conn.execute("UPDATE tenants SET package_id = ?, status = 'active' WHERE id = ?", [
      p.packageId,
      p.tenantId,
    ]);
    const result = { ...q, invoice_id: invId };
    await conn.execute(
      "INSERT INTO billing_operations (id, tenant_id, idempotency_key, request, result) VALUES (?, ?, ?, ?, ?)",
      [uuid(), p.tenantId, key, req, JSON.stringify(result)],
    );
    return result;
  });
}
