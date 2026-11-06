/**
 * Notifikasi email otomatis: reminder trial, reminder saldo (perpanjangan), bukti pembayaran (topup/perpanjangan)
 * dan ringkasan mingguan posting. Dijalankan dari cron per jam (`/api/public/jobs/subscription-renewal` atau
 * `/api/public/jobs/billing-notifications`).
 *
 * Jaminan:
 *  - Satu kejadian = satu email: `email_notifications.dedupe_key` UNIQUE + klaim atomik sebelum kirim.
 *  - Gateway email platform belum dikonfigurasi → tidak ada yang ditandai terkirim (dicoba lagi saat siap).
 *  - Kegagalan satu langkah/penerima tidak menghentikan langkah lain.
 *  - Email dikirim DI LUAR transaksi billing; kegagalan email tidak pernah membatalkan pembayaran/perpanjangan.
 */
import { execute, executeOne, result, uuid } from "@/integrations/mysql/pool";
import {
  loadGateway,
  sendViaGateway,
  PLATFORM_SCOPE,
  type GatewayRow,
} from "./email-gateway.server";
import { jakartaToday } from "./billing-wallet.server";
import {
  dateId,
  invoiceReceiptEmail,
  lowBalanceEmail,
  postSummaryEmail,
  renewalFailedEmail,
  trialEndingEmail,
  type Mail,
  type PostSummaryData,
} from "./billing-email-templates";

/** Jenis notifikasi yang boleh dimatikan pemilik tenant. Reminder saldo/gagal renewal selalu dikirim (memengaruhi layanan). */
export const OPTIONAL_PREFS = ["trial_reminder", "invoice_receipt", "post_summary"] as const;
export type OptionalPref = (typeof OPTIONAL_PREFS)[number];

export interface Tally {
  sent: number;
  failed: number;
  skipped: number;
}
const tally = (): Tally => ({ sent: 0, failed: 0, skipped: 0 });

const origin = () =>
  process.env.PUBLIC_APP_ORIGIN || process.env.PUBLIC_APP_URL || "https://qalling.id";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY = 86_400_000;
const dayNum = (s: string) => Math.round(Date.parse(`${s}T00:00:00Z`) / DAY);
export const diffDays = (a: string, b: string) => dayNum(a) - dayNum(b);
export const addDays = (s: string, n: number) =>
  new Date((dayNum(s) + n) * DAY).toISOString().slice(0, 10);
const d10 = (v: unknown) => (v ? String(v).slice(0, 10) : "");
/** Tahap peringatan: tenggat terdekat yang ≥ sisa hari (7/3/1/0 hari). */
export const reminderStage = (daysLeft: number) => [0, 1, 3, 7].find((t) => t >= daysLeft) ?? 7;

/* ------------------------------ pengiriman ------------------------------ */

async function isEnabled(tenantId: string, pref: OptionalPref | null) {
  if (!pref) return true;
  const r = await executeOne<{ enabled: number }>(
    "SELECT enabled FROM notification_prefs WHERE tenant_id = ? AND kind = ?",
    [tenantId, pref],
  );
  return r ? Number(r.enabled) === 1 : true;
}

interface Recipient {
  to: string;
  name: string;
  tenantName: string;
}
async function recipient(tenantId: string): Promise<Recipient | null> {
  const r = await executeOne<Record<string, string | null>>(
    `SELECT t.name AS tenant_name, t.pic_name, t.pic_email, p.email AS owner_email, p.full_name
       FROM tenants t LEFT JOIN profiles p ON p.id = t.owner_id WHERE t.id = ?`,
    [tenantId],
  );
  if (!r) return null;
  const to = [r.owner_email, r.pic_email].find((e) => e && EMAIL_RE.test(e.trim()))?.trim();
  if (!to) return null;
  return {
    to,
    name: r.full_name || r.pic_name || "Pengguna",
    tenantName: r.tenant_name ?? "akun Anda",
  };
}

/** Halaman tagihan/top up: Qalling bila tenant punya add-on Qalling, selain itu penagihan ERP workspace pertama. */
async function billingUrl(tenantId: string) {
  const q = await executeOne(
    `SELECT 1 AS ok FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id
      WHERE ta.tenant_id = ? AND a.code = 'qalling' AND ta.status IN ('active','trial','grace','suspended') LIMIT 1`,
    [tenantId],
  );
  if (q) return `${origin()}/qalling/app/billing`;
  const w = await executeOne<{ id: string }>(
    "SELECT id FROM workspaces WHERE tenant_id = ? ORDER BY created_at LIMIT 1",
    [tenantId],
  );
  return w ? `${origin()}/w/${w.id}/billing` : `${origin()}/wallet`;
}

/** Klaim atomik lalu kirim. `skipped` bila sudah terkirim/sedang diproses/melebihi 3 percobaan. */
async function deliver(
  g: GatewayRow,
  p: {
    tenantId: string | null;
    workspaceId?: string | null;
    kind: string;
    dedupe: string;
    to: string;
    mail: Mail;
  },
): Promise<"sent" | "failed" | "skipped"> {
  await execute(
    `INSERT IGNORE INTO email_notifications (id, tenant_id, workspace_id, kind, dedupe_key, to_email, subject)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      p.tenantId,
      p.workspaceId ?? null,
      p.kind,
      p.dedupe,
      p.to,
      p.mail.subject.slice(0, 255),
    ],
  );
  const claim = await result(
    `UPDATE email_notifications SET status = 'sending', attempts = attempts + 1, error = NULL
      WHERE dedupe_key = ? AND status IN ('pending','failed') AND attempts < 3`,
    [p.dedupe],
  );
  if (!claim.affectedRows) return "skipped";
  try {
    await sendViaGateway(g, { to: p.to, ...p.mail });
    await execute(
      "UPDATE email_notifications SET status = 'sent', sent_at = UTC_TIMESTAMP(6) WHERE dedupe_key = ?",
      [p.dedupe],
    );
    return "sent";
  } catch (e) {
    await execute(
      "UPDATE email_notifications SET status = 'failed', error = ? WHERE dedupe_key = ?",
      [String((e as Error).message).slice(0, 500), p.dedupe],
    );
    return "failed";
  }
}

const count = (t: Tally, r: "sent" | "failed" | "skipped") => void (t[r] += 1);

/* ------------------------------ 1. trial ------------------------------ */

export async function runTrialReminders(g: GatewayRow): Promise<Tally> {
  const t = tally();
  const today = jakartaToday();
  const rows = await execute<{ id: string; trial_ends_at: string }>(
    `SELECT id, trial_ends_at FROM tenants
      WHERE status = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at >= ? AND trial_ends_at <= ?
      LIMIT 200`,
    [today, addDays(today, 7)],
  );
  for (const r of rows) {
    try {
      if (!(await isEnabled(r.id, "trial_reminder"))) continue;
      const rc = await recipient(r.id);
      if (!rc) continue;
      const endsOn = d10(r.trial_ends_at);
      const daysLeft = Math.max(0, diffDays(endsOn, today));
      const stage = reminderStage(daysLeft);
      count(
        t,
        await deliver(g, {
          tenantId: r.id,
          kind: "trial_ending",
          dedupe: `trial:${r.id}:${endsOn}:${stage}`,
          to: rc.to,
          mail: trialEndingEmail({
            name: rc.name,
            tenantName: rc.tenantName,
            daysLeft,
            endsOn,
            url: await billingUrl(r.id),
          }),
        }),
      );
    } catch (e) {
      console.error("[notify] trial", r.id, (e as Error).message);
      t.failed++;
    }
  }
  return t;
}

/* ------------------------------ 2. saldo vs perpanjangan ------------------------------ */

export async function runBalanceReminders(g: GatewayRow): Promise<Tally> {
  const t = tally();
  const today = jakartaToday();
  const horizon = addDays(today, 7);
  const subs = await execute<{
    id: string;
    tenant_id: string;
    status: string;
    billing_cycle: string | null;
    unit_price: number | null;
    current_period_end: string | null;
    monthly_price: number | null;
  }>(
    `SELECT s.id, s.tenant_id, s.status, s.billing_cycle, s.unit_price, s.current_period_end, p.monthly_price
       FROM subscriptions s LEFT JOIN packages p ON p.id = s.package_id
      WHERE s.wallet_auto_renew = 1 AND s.status IN ('active','past_due') AND s.current_period_end IS NOT NULL
        AND s.id = (SELECT x.id FROM subscriptions x WHERE x.tenant_id = s.tenant_id ORDER BY x.created_at DESC LIMIT 1)
      LIMIT 300`,
  );
  for (const s of subs) {
    try {
      const months = s.billing_cycle === "yearly" ? 12 : 1;
      const end = d10(s.current_period_end);
      const items: { label: string; amount: number; dueOn: string }[] = [];
      if (end <= horizon) {
        const price = Number(s.monthly_price ?? s.unit_price ?? 0);
        if (price > 0)
          items.push({ label: "Paket ERP", amount: Math.round(price * months), dueOn: end });
      }
      const addons = await execute<{ code: string; monthly_price: number; ends_at: string }>(
        `SELECT a.code, ta.monthly_price, ta.ends_at FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id
          WHERE ta.tenant_id = ? AND ta.wallet_managed = 1 AND ta.ends_at IS NOT NULL AND ta.ends_at < ?
            AND ta.status IN ('active','grace','suspended')`,
        [s.tenant_id, horizon],
      );
      for (const a of addons) {
        const amount = Math.round(Number(a.monthly_price) * months);
        if (amount > 0)
          items.push({ label: `Add-on ${a.code}`, amount, dueOn: addDays(d10(a.ends_at), 1) });
      }
      if (!items.length) continue;
      const needed = items.reduce((x, i) => x + i.amount, 0);
      const bal = await executeOne<{ balance_idr: number }>(
        "SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?",
        [s.tenant_id],
      );
      const balance = Number(bal?.balance_idr ?? 0);
      if (balance >= needed) continue;
      const rc = await recipient(s.tenant_id);
      if (!rc) continue;
      const dueOn = items.map((i) => i.dueOn).sort()[0];
      const daysLeft = Math.max(0, diffDays(dueOn, today));
      const url = await billingUrl(s.tenant_id);
      if (s.status === "past_due") {
        count(
          t,
          await deliver(g, {
            tenantId: s.tenant_id,
            kind: "renewal_failed",
            dedupe: `renewfail:${s.tenant_id}:${end}`,
            to: rc.to,
            mail: renewalFailedEmail({
              name: rc.name,
              tenantName: rc.tenantName,
              balance,
              needed,
              url,
            }),
          }),
        );
      } else {
        count(
          t,
          await deliver(g, {
            tenantId: s.tenant_id,
            kind: "low_balance",
            dedupe: `lowbal:${s.tenant_id}:${end}:${reminderStage(daysLeft)}`,
            to: rc.to,
            mail: lowBalanceEmail({
              name: rc.name,
              tenantName: rc.tenantName,
              balance,
              needed,
              dueOn,
              daysLeft,
              items,
              url,
            }),
          }),
        );
      }
    } catch (e) {
      console.error("[notify] balance", s.tenant_id, (e as Error).message);
      t.failed++;
    }
  }
  return t;
}

/* ------------------------------ 3. bukti pembayaran ------------------------------ */

interface InvoiceRow {
  id: string;
  tenant_id: string;
  invoice_number: string;
  total: number;
  paid_at: string;
  payment_method: string | null;
  product: string | null;
  notes: string | null;
}

export function describeInvoice(
  i: Pick<InvoiceRow, "id" | "invoice_number" | "paid_at" | "notes">,
) {
  const n = i.invoice_number;
  const ymd = d10(i.paid_at).replace(/-/g, "");
  if (n.startsWith("renew:base:"))
    return {
      number: `RNW-${ymd}-${i.id.slice(0, 6).toUpperCase()}`,
      description: "Perpanjangan paket ERP",
    };
  if (n.startsWith("renew:addon:"))
    return {
      number: `RNW-${ymd}-${i.id.slice(0, 6).toUpperCase()}`,
      description: `Perpanjangan add-on${i.notes ? ` ${i.notes}` : ""}`,
    };
  if (n.startsWith("TOP-"))
    return { number: `TOP-${n.slice(4, 12).toUpperCase()}`, description: "Top up saldo" };
  return { number: n, description: (i.notes ?? "").slice(0, 120) || "Pembayaran paket" };
}
const methodLabel = (m: string | null) =>
  m === "wallet"
    ? "Saldo wallet"
    : m === "manual_transfer"
      ? "Transfer manual"
      : m
        ? `Pembayaran online (${m})`
        : "—";

async function sendInvoice(g: GatewayRow, i: InvoiceRow): Promise<"sent" | "failed" | "skipped"> {
  if (!(await isEnabled(i.tenant_id, "invoice_receipt"))) return "skipped";
  const rc = await recipient(i.tenant_id);
  if (!rc) return "skipped";
  const bal = await executeOne<{ balance_idr: number }>(
    "SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?",
    [i.tenant_id],
  );
  const d = describeInvoice(i);
  return deliver(g, {
    tenantId: i.tenant_id,
    kind: "invoice_receipt",
    dedupe: `invoice:${i.id}`,
    to: rc.to,
    mail: invoiceReceiptEmail({
      name: rc.name,
      tenantName: rc.tenantName,
      invoiceNumber: d.number,
      paidOn: d10(i.paid_at),
      description: d.description,
      method: methodLabel(i.payment_method),
      amount: Number(i.total),
      balance: bal ? Number(bal.balance_idr) : null,
      url: await billingUrl(i.tenant_id),
    }),
  });
}

/** Penanda awal fitur: invoice yang lunas sebelum fitur ini aktif tidak dikirimi email susulan. */
async function receiptsStart(): Promise<string> {
  await execute(
    `INSERT IGNORE INTO email_notifications (id, kind, dedupe_key, to_email, subject, status)
     VALUES (?, 'system', 'invoice-receipts-start', 'system', 'marker', 'sent')`,
    [uuid()],
  );
  const r = await executeOne<{ created_at: string }>(
    "SELECT created_at FROM email_notifications WHERE dedupe_key = 'invoice-receipts-start'",
  );
  return String(r?.created_at ?? "1970-01-01 00:00:00");
}

export async function runInvoiceReceipts(g: GatewayRow): Promise<Tally> {
  const t = tally();
  const start = await receiptsStart();
  const rows = await execute<InvoiceRow>(
    `SELECT i.id, i.tenant_id, i.invoice_number, i.total, i.paid_at, i.payment_method, i.product, i.notes
       FROM invoices i LEFT JOIN email_notifications e ON e.dedupe_key = CONCAT('invoice:', i.id)
      WHERE i.status = 'paid' AND i.total > 0 AND i.paid_at >= ? AND i.paid_at >= UTC_TIMESTAMP(6) - INTERVAL 3 DAY
        AND (e.id IS NULL OR (e.status = 'failed' AND e.attempts < 3))
      ORDER BY i.paid_at LIMIT 50`,
    [start],
  );
  for (const i of rows) {
    try {
      count(t, await sendInvoice(g, i));
    } catch (e) {
      console.error("[notify] invoice", i.id, (e as Error).message);
      t.failed++;
    }
  }
  return t;
}

/** Kirim bukti segera setelah topup/pembayaran (best-effort; cron per jam menjadi jaring pengaman). */
export async function sendInvoiceReceiptNow(invoiceId: string): Promise<void> {
  try {
    const g = await loadGateway(PLATFORM_SCOPE);
    if (!g?.enabled) return;
    await receiptsStart();
    const i = await executeOne<InvoiceRow>(
      `SELECT id, tenant_id, invoice_number, total, paid_at, payment_method, product, notes
         FROM invoices WHERE id = ? AND status = 'paid' AND total > 0`,
      [invoiceId],
    );
    if (i) await sendInvoice(g, i);
  } catch (e) {
    console.error("[notify] invoice now", invoiceId, (e as Error).message);
  }
}

/* ------------------------------ 4. ringkasan posting mingguan ------------------------------ */

const WIB = 7 * 3_600_000;
/** Minggu penuh terakhir (Senin–Minggu, Asia/Jakarta) sebagai {mon, sun, startUtc, endUtc}. */
export function lastFullWeek(today = jakartaToday()) {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Minggu
  const thisMon = addDays(today, -((dow + 6) % 7));
  const mon = addDays(thisMon, -7);
  return {
    mon,
    sun: addDays(thisMon, -1),
    startUtc: new Date(Date.parse(`${mon}T00:00:00Z`) - WIB),
    endUtc: new Date(Date.parse(`${thisMon}T00:00:00Z`) - WIB),
  };
}

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);

const PREFERRED_METRICS = [
  "followers",
  "followers_count",
  "views",
  "reach",
  "impressions",
  "total_interactions",
  "interactions",
  "likes",
];

async function buildPostSummary(
  workspaceId: string,
  week: ReturnType<typeof lastFullWeek>,
): Promise<{ data: PostSummaryData; tenantId: string } | null> {
  const ws = await executeOne<{ name: string; tenant_id: string }>(
    "SELECT name, tenant_id FROM workspaces WHERE id = ?",
    [workspaceId],
  );
  if (!ws) return null;
  const posts = await execute<Record<string, unknown>>(
    `SELECT title, status, account_ids, last_error FROM crm_scheduled_posts
      WHERE workspace_id = ? AND scheduled_at >= ? AND scheduled_at < ? LIMIT 1000`,
    [workspaceId, week.startUtc, week.endUtc],
  );
  const accounts = await execute<{
    id: string;
    account_name: string;
    platform: string;
    source: string | null;
    external_id: string | null;
    status: string;
  }>(
    "SELECT id, account_name, platform, source, external_id, status FROM crm_social_accounts WHERE workspace_id = ?",
    [workspaceId],
  );
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const totals = { published: 0, failed: 0, scheduled: 0, draft: 0 };
  const perAccount = new Map<string, number>();
  const failed: { title: string; error: string }[] = [];
  for (const p of posts) {
    const st = String(p.status);
    if (st === "published") {
      totals.published++;
      const ids = (() => {
        try {
          const v = typeof p.account_ids === "string" ? JSON.parse(p.account_ids) : p.account_ids;
          return Array.isArray(v) ? v.map(String) : [];
        } catch {
          return [];
        }
      })();
      for (const id of ids) perAccount.set(id, (perAccount.get(id) ?? 0) + 1);
    } else if (st === "failed") {
      totals.failed++;
      if (failed.length < 5)
        failed.push({
          title: String(p.title ?? "(tanpa judul)"),
          error: String(p.last_error ?? "Gagal").slice(0, 120),
        });
    } else if (st === "scheduled" || st === "publishing") totals.scheduled++;
    else if (st === "draft") totals.draft++;
  }
  if (totals.published + totals.failed + totals.scheduled === 0) return null;
  const up = await executeOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM crm_scheduled_posts
      WHERE workspace_id = ? AND status = 'scheduled' AND scheduled_at >= UTC_TIMESTAMP(6)
        AND scheduled_at < UTC_TIMESTAMP(6) + INTERVAL 7 DAY`,
    [workspaceId],
  );
  const byAccount = [...perAccount.entries()]
    .map(([id, published]) => ({
      name: byId.get(id)?.account_name ?? "Akun",
      platform: byId.get(id)?.platform ?? "",
      published,
    }))
    .sort((a, b) => b.published - a.published);

  // Insight akun (best-effort; hanya akun Tebar, maks 3, tiap panggilan dibatasi waktu).
  const metrics: PostSummaryData["metrics"] = [];
  const topPosts: PostSummaryData["topPosts"] = [];
  try {
    const { getSocialInsightsCore } = await import("./social-insights.core.server");
    for (const a of accounts
      .filter((x) => x.source === "tebar" && x.external_id && x.status === "connected")
      .slice(0, 3)) {
      try {
        const r = await withTimeout(getSocialInsightsCore(workspaceId, a.id, 7), 8000);
        if (!r.available) continue;
        const picked = PREFERRED_METRICS.map((k) => r.metrics.find((m) => m.key === k))
          .filter(Boolean)
          .slice(0, 3);
        for (const m of picked as typeof r.metrics) {
          metrics.push({
            account: a.account_name,
            key: m.key.replace(/_/g, " "),
            total: m.total,
            changePct:
              m.total !== null && m.prev
                ? Math.round(((m.total - m.prev) / Math.abs(m.prev)) * 1000) / 10
                : null,
          });
        }
        for (const p of r.posts.slice(0, 20))
          topPosts.push({
            account: a.account_name,
            text: p.text,
            url: p.url,
            interactions: p.interactions,
            views: p.views,
          });
      } catch {
        /* insight gagal/timeout: lewati, ringkasan tetap dikirim */
      }
    }
  } catch {
    /* modul insight tidak tersedia */
  }
  topPosts.sort((a, b) => (b.interactions ?? -1) - (a.interactions ?? -1));
  return {
    tenantId: ws.tenant_id,
    data: {
      workspaceName: ws.name,
      periodLabel: `${dateId(week.mon)} – ${dateId(week.sun)}`,
      totals,
      upcoming: Number(up?.n ?? 0),
      byAccount,
      failed,
      metrics,
      topPosts: topPosts.slice(0, 3),
    },
  };
}

export async function runPostSummaries(g: GatewayRow): Promise<Tally> {
  const t = tally();
  const week = lastFullWeek();
  const rows = await execute<{ workspace_id: string }>(
    `SELECT DISTINCT p.workspace_id FROM crm_scheduled_posts p
       LEFT JOIN email_notifications e ON e.dedupe_key = CONCAT('postsum:', p.workspace_id, ':', ?)
      WHERE p.scheduled_at >= ? AND p.scheduled_at < ? AND p.status IN ('published','failed','scheduled')
        AND (e.id IS NULL OR (e.status = 'failed' AND e.attempts < 3))
      LIMIT 15`,
    [week.mon, week.startUtc, week.endUtc],
  );
  for (const r of rows) {
    try {
      const built = await buildPostSummary(r.workspace_id, week);
      if (!built) continue;
      if (!(await isEnabled(built.tenantId, "post_summary"))) continue;
      const rc = await recipient(built.tenantId);
      if (!rc) continue;
      count(
        t,
        await deliver(g, {
          tenantId: built.tenantId,
          workspaceId: r.workspace_id,
          kind: "post_summary",
          dedupe: `postsum:${r.workspace_id}:${week.mon}`,
          to: rc.to,
          mail: postSummaryEmail({
            name: rc.name,
            data: built.data,
            url: `${origin()}/qalling/app/reports`,
          }),
        }),
      );
    } catch (e) {
      console.error("[notify] post summary", r.workspace_id, (e as Error).message);
      t.failed++;
    }
  }
  return t;
}

/* ------------------------------ orkestrasi ------------------------------ */

export async function runBillingNotifications() {
  const g = await loadGateway(PLATFORM_SCOPE);
  if (!g?.enabled) return { skipped: "email_gateway_not_configured" as const };
  const steps = {
    trial: runTrialReminders,
    balance: runBalanceReminders,
    invoices: runInvoiceReceipts,
    postSummaries: runPostSummaries,
  };
  const out: Record<string, Tally | { error: string }> = {};
  for (const [name, fn] of Object.entries(steps)) {
    try {
      out[name] = await fn(g);
    } catch (e) {
      console.error(`[notify] ${name}`, (e as Error).message);
      out[name] = { error: "step_failed" };
    }
  }
  return out;
}
