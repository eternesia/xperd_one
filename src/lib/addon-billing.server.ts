/**
 * Billing paket & opsi add-on Qalling lewat saldo wallet (BS New 11): padanan SQL `billing_quote`,
 * `billing_checkout` dan bagian add-on/opsi dari `billing_renew_tenant` (masa tenggang `billing_policy`).
 * Transaksi aplikasi: kunci langganan dulu lalu saldo wallet; idempotensi lewat `billing_operations`.
 */
import { isDeepStrictEqual } from "node:util";
import type { PoolConnection } from "mysql2/promise";
import { executeOne, transaction, uuid } from "@/integrations/mysql/pool";
import { walletPostEntryOn } from "./wallet.server";
import { isTenantOwner, jakartaToday, lockAccount } from "./billing-wallet.server";
import { tenantEntitlements, usageFits } from "./entitlements.server";
import type { BillingQuote } from "./entitlements";

const day = (s: string) => Date.parse(`${s}T00:00:00Z`) / 86_400_000;
const diffDays = (a: string, b: string) => Math.round(day(a) - day(b));
const d10 = (v: unknown) => (v ? String(v).slice(0, 10) : "");
const json = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : (v as T));
const months = (cycle: string | null) => (cycle === "yearly" ? 12 : 1);
const addDays = (d: string, n: number) =>
  new Date(day(d) * 86_400_000 + n * 86_400_000).toISOString().slice(0, 10);

interface Sub {
  id: string;
  status: string;
  billing_cycle: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  wallet_auto_renew: number;
}
interface TierRow {
  id: string;
  addon_id: string;
  name: string;
  monthly_price: number;
  limits: unknown;
  features: unknown;
}
interface OptionRow {
  id: string;
  addon_id: string;
  name: string;
  monthly_price: number;
  max_quantity: number;
  requires_features: unknown;
}
interface TenantAddon {
  id: string;
  tier_id: string | null;
  status: string;
  ends_at: string | null;
  monthly_price: number;
  limits_override: unknown;
}
interface TenantOption {
  id: string;
  quantity: number;
  monthly_price: number;
  status: string;
  ends_at: string;
}

export async function billingQuote(
  tenantId: string,
  kind: "tier" | "option",
  itemId: string,
  quantity = 1,
): Promise<BillingQuote> {
  const today = jakartaToday();
  const s = await executeOne<Sub>(
    "SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1",
    [tenantId],
  );
  if (!s || d10(s.current_period_end) <= today || !["active", "trialing"].includes(s.status))
    throw new Error("base_subscription_required");
  const period_end = d10(s.current_period_end);
  const period_start = d10(s.current_period_start);
  const total_days = diffDays(period_end, period_start);
  const remaining = Math.max(1, diffDays(period_end, today));
  if (total_days <= 0) throw new Error("invalid_billing_period");
  const m = months(s.billing_cycle);

  let price = 0;
  let oldprice = 0;
  let action: BillingQuote["action"] = "purchase";
  let name = "";
  let warning = false;
  const ents = await tenantEntitlements(tenantId);

  if (kind === "tier") {
    const t = await executeOne<TierRow>(
      "SELECT * FROM addon_tiers WHERE id = ? AND is_active = 1",
      [itemId],
    );
    if (!t || quantity !== 1) throw new Error("tier_unavailable");
    const ta = await executeOne<TenantAddon>(
      "SELECT * FROM tenant_addons WHERE tenant_id = ? AND addon_id = ?",
      [tenantId, t.addon_id],
    );
    const code = (
      await executeOne<{ code: string }>("SELECT code FROM addons WHERE id = ?", [t.addon_id])
    )?.code;
    if (ta && code && ents[code]) oldprice = Number(ta.monthly_price);
    price = Number(t.monthly_price);
    name = t.name;
    if (ta?.tier_id === t.id && ta.status === "active" && d10(ta.ends_at) >= today)
      action = "unchanged";
    else if (oldprice > price && oldprice > 0) action = "scheduled";
    const lim = {
      ...json<Record<string, number | null>>(t.limits),
      ...json<Record<string, number | null>>(ta?.limits_override ?? {}),
    };
    const fits = await usageFits(tenantId, lim);
    if (action !== "scheduled" && !fits) throw new Error("usage_exceeds_target_tier");
    warning = !fits;
  } else if (kind === "option") {
    const o = await executeOne<OptionRow>(
      "SELECT * FROM addon_options WHERE id = ? AND is_active = 1",
      [itemId],
    );
    if (!o || !Number.isInteger(quantity) || quantity < 0 || quantity > o.max_quantity)
      throw new Error("option_quantity_invalid");
    const code = (
      await executeOne<{ code: string }>("SELECT code FROM addons WHERE id = ?", [o.addon_id])
    )?.code;
    const en = code ? ents[code] : undefined;
    if (!en) throw new Error("addon_required");
    const req = json<string[]>(o.requires_features) ?? [];
    if (req.some((f) => !en.features[f] && !en.features.legacy))
      throw new Error("option_requires_feature");
    const x = await executeOne<TenantOption>(
      "SELECT * FROM tenant_addon_options WHERE tenant_id = ? AND option_id = ?",
      [tenantId, itemId],
    );
    const live = x && x.status === "active" && d10(x.ends_at) >= today;
    if (live) oldprice = Number(x.monthly_price) * x.quantity;
    price = Number(o.monthly_price) * quantity;
    name = o.name;
    if (x && quantity < x.quantity) action = "scheduled";
    if (x && x.quantity === quantity && live) action = "unchanged";
  } else throw new Error("invalid_item_kind");

  const charge =
    action === "purchase"
      ? Math.round((Math.max(0, price - oldprice) * m * remaining) / total_days)
      : 0;
  return {
    kind,
    item: itemId,
    quantity,
    action,
    monthly_price: price,
    charge,
    period_start,
    period_end,
    remaining_days: remaining,
    total_days,
    subscription: s.id,
    name,
    usage_warning: warning,
  };
}

export async function billingCheckout(p: {
  tenantId: string;
  kind: "tier" | "option";
  itemId: string;
  quantity: number;
  idem: string;
  actor: string;
  expected: BillingQuote;
}): Promise<BillingQuote & { invoice_id?: string }> {
  if (!(await isTenantOwner(p.tenantId, p.actor))) throw new Error("owner_required");
  const key = `checkout:${p.tenantId}:${p.idem}`;
  const req = { kind: p.kind, item: p.itemId, quantity: p.quantity };
  return transaction(async (conn) => {
    await conn.execute(
      "SELECT id FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
      [p.tenantId],
    );
    const [ops] = await conn.execute(
      "SELECT request, result FROM billing_operations WHERE idempotency_key = ?",
      [key],
    );
    const op = (ops as { request: unknown; result: unknown }[])[0];
    if (op) {
      if (!isDeepStrictEqual(json(op.request), req)) throw new Error("idempotency_conflict");
      return json(op.result);
    }
    const q = await billingQuote(p.tenantId, p.kind, p.itemId, p.quantity);
    // Rincian yang dikonfirmasi pengguna harus sama persis dengan hitungan server saat ini.
    if (!isDeepStrictEqual(JSON.parse(JSON.stringify(q)), JSON.parse(JSON.stringify(p.expected))))
      throw new Error("quote_changed");
    if (q.action === "unchanged") return q;

    const addonId = (
      await executeOne<{ addon_id: string }>(
        `SELECT addon_id FROM ${p.kind === "tier" ? "addon_tiers" : "addon_options"} WHERE id = ?`,
        [p.itemId],
      )
    )?.addon_id;
    if (!addonId) throw new Error("tier_unavailable");
    let invoiceId: string | undefined;

    if (q.action === "scheduled") {
      if (p.kind === "tier")
        await conn.execute(
          "UPDATE tenant_addons SET pending_change = ?, wallet_managed = 1 WHERE tenant_id = ? AND addon_id = ?",
          [JSON.stringify({ tier_id: p.itemId }), p.tenantId, addonId],
        );
      else
        await conn.execute(
          "UPDATE tenant_addon_options SET pending_quantity = ? WHERE tenant_id = ? AND option_id = ?",
          [p.quantity, p.tenantId, p.itemId],
        );
    } else {
      invoiceId = uuid();
      await conn.execute(
        `INSERT INTO invoices (id, invoice_number, tenant_id, subscription_id, status, subtotal, total, paid_at, payment_method, product, notes, activation_applied_at)
         VALUES (?, ?, ?, ?, 'paid', ?, ?, NOW(6), 'wallet', 'addon', ?, NOW(6))`,
        [
          invoiceId,
          `BUY-${p.idem}`,
          p.tenantId,
          q.subscription,
          q.charge,
          q.charge,
          JSON.stringify(q),
        ],
      );
      if (q.charge > 0) {
        await lockAccount(conn, p.tenantId);
        const [codeRows] = await conn.execute("SELECT code FROM addons WHERE id = ?", [addonId]);
        await walletPostEntryOn(conn, {
          tenantId: p.tenantId,
          type: "addon",
          amount: -q.charge,
          product: (codeRows as { code: string }[])[0].code,
          ref: p.itemId,
          idem: key,
          description: q.name,
          actor: p.actor,
          invoice: invoiceId,
        });
      }
      const today = jakartaToday();
      const endsAt = addDays(q.period_end, -1);
      if (p.kind === "tier") {
        await conn.execute(
          `INSERT INTO tenant_addons (id, tenant_id, addon_id, tier_id, status, starts_at, ends_at, monthly_price, wallet_managed)
           VALUES (?, ?, ?, ?, 'active', ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE tier_id = VALUES(tier_id), status = 'active', starts_at = VALUES(starts_at),
             ends_at = VALUES(ends_at), monthly_price = VALUES(monthly_price), wallet_managed = 1,
             pending_change = NULL, grace_until = NULL`,
          [uuid(), p.tenantId, addonId, p.itemId, today, endsAt, q.monthly_price],
        );
      } else {
        await conn.execute(
          `INSERT INTO tenant_addon_options (id, tenant_id, option_id, quantity, monthly_price, status, ends_at)
           VALUES (?, ?, ?, ?, (SELECT monthly_price FROM addon_options WHERE id = ?), 'active', ?)
           ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), monthly_price = VALUES(monthly_price),
             status = 'active', ends_at = VALUES(ends_at), pending_quantity = NULL, grace_until = NULL`,
          [uuid(), p.tenantId, p.itemId, p.quantity, p.itemId, endsAt],
        );
      }
    }
    if (p.kind === "tier" && invoiceId && q.charge > 0) {
      const { rewardReferralOn } = await import("./referral.server");
      await rewardReferralOn(conn, { ref: invoiceId, tenant_id: p.tenantId, amount_idr: q.charge });
    }
    const result = { ...q, invoice_id: invoiceId };
    await conn.execute(
      "INSERT INTO billing_operations (id, tenant_id, idempotency_key, request, result) VALUES (?, ?, ?, ?, ?)",
      [uuid(), p.tenantId, key, JSON.stringify(req), JSON.stringify(result)],
    );
    return result;
  });
}

/* --------------------- perpanjangan add-on & opsi (+ masa tenggang) --------------------- */

export async function addonGraceDays(conn: PoolConnection): Promise<number> {
  const [r] = await conn.execute("SELECT addon_grace_days FROM billing_policy WHERE singleton = 1");
  return Number((r as { addon_grace_days: number }[])[0]?.addon_grace_days ?? 3);
}

/** Add-on yang jatuh tempo masuk `grace` (maks `grace` hari) lalu `suspended`; dipakai saat dasar ERP gagal bayar. */
export async function markAddonsBaseBlocked(conn: PoolConnection, tenantId: string, grace: number) {
  const today = jakartaToday();
  const [rows] = await conn.execute(
    "SELECT id, ends_at, grace_until FROM tenant_addons WHERE tenant_id = ? AND wallet_managed = 1 AND ends_at < ? AND status IN ('active','grace')",
    [tenantId, today],
  );
  for (const r of rows as { id: string; ends_at: string; grace_until: string | null }[]) {
    const ends = d10(r.ends_at);
    await conn.execute(
      "UPDATE tenant_addons SET status = ?, grace_until = COALESCE(grace_until, ?), renewal_note = 'base_payment_required' WHERE id = ?",
      [addDays(ends, grace) < today ? "suspended" : "grace", addDays(ends, grace), r.id],
    );
  }
}

/** Perpanjang add-on (tier) dan opsi wallet-managed yang sudah lewat `ends_at`. Dasar ERP harus aktif. */
export async function renewAddonsOn(
  conn: PoolConnection,
  tenantId: string,
  s: Sub,
  owner: string | null,
): Promise<number> {
  const today = jakartaToday();
  const m = months(s.billing_cycle);
  const grace = await addonGraceDays(conn);
  const endsNew = addDays(d10(s.current_period_end), -1);
  let n = 0;

  const [addons] = await conn.execute(
    `SELECT ta.*, c.code FROM tenant_addons ta JOIN addons c ON c.id = ta.addon_id
      WHERE ta.tenant_id = ? AND ta.wallet_managed = 1 AND ta.ends_at < ? AND ta.status IN ('active','grace','suspended')
      ORDER BY (c.code = 'qalling') DESC, ta.id FOR UPDATE`,
    [tenantId, today],
  );
  for (const ta of addons as (TenantAddon & {
    code: string;
    price_locked_until: string | null;
    pending_change: unknown;
  })[]) {
    const key = `renew:addon:${ta.id}:${d10(ta.ends_at)}`;
    const [t0] = await conn.execute("SELECT * FROM addon_tiers WHERE id = ?", [ta.tier_id]);
    let t = (t0 as TierRow[])[0];
    const pend = json<{ tier_id?: string } | null>(ta.pending_change);
    let note: string | null = null;
    if (pend?.tier_id) {
      const [t1] = await conn.execute("SELECT * FROM addon_tiers WHERE id = ?", [pend.tier_id]);
      const target = (t1 as TierRow[])[0];
      const lim = {
        ...json<Record<string, number | null>>(target.limits),
        ...json<Record<string, number | null>>(ta.limits_override),
      };
      if (await usageFits(tenantId, lim)) t = target;
      else note = "downgrade_blocked_usage";
    }
    const locked = ta.price_locked_until && d10(ta.price_locked_until) >= today;
    const price = locked ? Number(ta.monthly_price) : Number(t?.monthly_price ?? ta.monthly_price);
    const amount = Math.round(price * m);
    const balance = await lockAccount(conn, tenantId);
    if (balance < amount) {
      const ends = d10(ta.ends_at);
      await conn.execute(
        "UPDATE tenant_addons SET status = ?, grace_until = COALESCE(grace_until, ?), renewal_note = 'insufficient_balance' WHERE id = ?",
        [addDays(ends, grace) < today ? "suspended" : "grace", addDays(ends, grace), ta.id],
      );
      continue;
    }
    const invId = uuid();
    await conn.execute(
      `INSERT INTO invoices (id, invoice_number, tenant_id, subscription_id, status, subtotal, total, paid_at, payment_method, product, notes, activation_applied_at)
       VALUES (?, ?, ?, ?, 'paid', ?, ?, NOW(6), 'wallet', 'addon', ?, NOW(6))`,
      [invId, key, tenantId, s.id, amount, amount, ta.code],
    );
    if (amount > 0)
      await walletPostEntryOn(conn, {
        tenantId,
        type: "addon",
        amount: -amount,
        product: ta.code,
        ref: ta.id,
        idem: key,
        description: `Perpanjangan ${ta.code}`,
        actor: owner,
        invoice: invId,
      });
    await conn.execute(
      `UPDATE tenant_addons SET status = 'active', starts_at = ?, ends_at = ?, tier_id = ?, monthly_price = ?,
              grace_until = NULL, pending_change = NULL, renewal_note = ? WHERE id = ?`,
      [d10(s.current_period_start), endsNew, t?.id ?? ta.tier_id, price, note, ta.id],
    );
    n++;
  }

  const [opts] = await conn.execute(
    `SELECT z.*, o.addon_id, o.monthly_price AS catalog_price FROM tenant_addon_options z
       JOIN addon_options o ON o.id = z.option_id
      WHERE z.tenant_id = ? AND z.ends_at < ? AND z.status IN ('active','grace','suspended')
      ORDER BY z.id FOR UPDATE`,
    [tenantId, today],
  );
  for (const x of opts as (TenantOption & {
    addon_id: string;
    catalog_price: number;
    pending_quantity: number | null;
  })[]) {
    const [live] = await conn.execute(
      "SELECT 1 AS ok FROM tenant_addons WHERE tenant_id = ? AND addon_id = ? AND status = 'active' AND ends_at >= ?",
      [tenantId, x.addon_id, today],
    );
    if (!(live as unknown[]).length) continue;
    if (x.pending_quantity === 0) {
      await conn.execute(
        "UPDATE tenant_addon_options SET status = 'cancelled', pending_quantity = NULL WHERE id = ?",
        [x.id],
      );
      continue;
    }
    const key = `renew:option:${x.id}:${d10(x.ends_at)}`;
    const qty = x.pending_quantity ?? x.quantity;
    const amount = Number(x.catalog_price) * qty * m;
    const balance = await lockAccount(conn, tenantId);
    if (balance < amount) {
      const ends = d10(x.ends_at);
      await conn.execute(
        "UPDATE tenant_addon_options SET status = ?, grace_until = COALESCE(grace_until, ?) WHERE id = ?",
        [addDays(ends, grace) < today ? "suspended" : "grace", addDays(ends, grace), x.id],
      );
      continue;
    }
    const invId = uuid();
    await conn.execute(
      `INSERT INTO invoices (id, invoice_number, tenant_id, subscription_id, status, subtotal, total, paid_at, payment_method, product, activation_applied_at)
       VALUES (?, ?, ?, ?, 'paid', ?, ?, NOW(6), 'wallet', 'addon', NOW(6))`,
      [invId, key, tenantId, s.id, amount, amount],
    );
    if (amount > 0)
      await walletPostEntryOn(conn, {
        tenantId,
        type: "addon",
        amount: -amount,
        product: "qalling",
        ref: x.id,
        idem: key,
        description: "Perpanjangan opsi",
        actor: owner,
        invoice: invId,
      });
    await conn.execute(
      `UPDATE tenant_addon_options SET quantity = ?, pending_quantity = NULL, monthly_price = ?, status = 'active',
              ends_at = ?, grace_until = NULL WHERE id = ?`,
      [qty, x.catalog_price, endsNew, x.id],
    );
    n++;
  }
  return n;
}
