/**
 * Super Admin → Studio AI: ringkasan bisnis (grafik) dan daftar kredit pengguna (server-only).
 * Penjualan & video tidak menghitung pembelian akun Super Admin dan video uji.
 */
import { execute, executeOne } from "@/integrations/mysql/pool";

const NOT_ADMIN =
  "(l.created_by IS NULL OR l.created_by NOT IN (SELECT user_id FROM user_roles WHERE role = 'admin'))";
const n = (v: unknown) => Number(v ?? 0);

export async function studioDashboard(days: number) {
  // Rangkaian harian (WIB) agar grafik tidak bolong.
  const series = await execute<Record<string, unknown>>(
    `WITH RECURSIVE d(day) AS (
        SELECT DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR) - INTERVAL ? DAY
        UNION ALL SELECT day + INTERVAL 1 DAY FROM d WHERE day < DATE(UTC_TIMESTAMP() + INTERVAL 7 HOUR))
     SELECT DATE_FORMAT(d.day, '%Y-%m-%d') AS day,
            COALESCE(s.sales_idr, 0) AS sales_idr, COALESCE(s.credits_sold, 0) AS credits_sold,
            COALESCE(s.bonus, 0) AS bonus, COALESCE(s.used, 0) AS credits_used,
            COALESCE(j.done, 0) AS done, COALESCE(j.failed, 0) AS failed
       FROM d
       LEFT JOIN (
         SELECT DATE(l.created_at + INTERVAL 7 HOUR) AS day,
                SUM(CASE WHEN l.kind = 'purchase' AND ${NOT_ADMIN} THEN l.amount_idr ELSE 0 END) AS sales_idr,
                SUM(CASE WHEN l.kind = 'purchase' AND ${NOT_ADMIN} THEN l.delta ELSE 0 END) AS credits_sold,
                SUM(CASE WHEN l.kind = 'bonus' THEN l.delta ELSE 0 END) AS bonus,
                -SUM(CASE WHEN l.kind IN ('usage', 'refund') THEN l.delta ELSE 0 END) AS used
           FROM ai_credit_ledger l
          WHERE l.created_at >= UTC_TIMESTAMP() - INTERVAL ? DAY
          GROUP BY DATE(l.created_at + INTERVAL 7 HOUR)) s ON s.day = d.day
       LEFT JOIN (
         SELECT DATE(created_at + INTERVAL 7 HOUR) AS day, SUM(status = 'done') AS done, SUM(status = 'failed') AS failed
           FROM ai_jobs WHERE is_admin_test = 0 AND created_at >= UTC_TIMESTAMP() - INTERVAL ? DAY
          GROUP BY DATE(created_at + INTERVAL 7 HOUR)) j ON j.day = d.day
      ORDER BY d.day`,
    [days - 1, days + 1, days + 1],
  );
  const totals = await executeOne<Record<string, unknown>>(
    `SELECT
       (SELECT COALESCE(SUM(credits), 0) FROM ai_credit_accounts) AS outstanding,
       (SELECT COUNT(*) FROM ai_credit_accounts WHERE credits > 0) AS holders,
       (SELECT COUNT(DISTINCT tenant_id) FROM ai_jobs WHERE is_admin_test = 0 AND created_at >= UTC_TIMESTAMP() - INTERVAL ? DAY) AS active_tenants,
       (SELECT COUNT(DISTINCT l.tenant_id) FROM ai_credit_ledger l WHERE l.kind = 'purchase' AND ${NOT_ADMIN}
          AND l.created_at >= UTC_TIMESTAMP() - INTERVAL ? DAY) AS buyers,
       (SELECT COUNT(*) FROM ai_jobs WHERE is_admin_test = 0 AND status IN ('queued', 'processing')) AS running,
       (SELECT AVG(TIMESTAMPDIFF(SECOND, COALESCE(claimed_at, submitted_at, created_at), finished_at)) FROM ai_jobs
          WHERE status = 'done' AND provider = 'render' AND finished_at IS NOT NULL
            AND created_at >= UTC_TIMESTAMP() - INTERVAL ? DAY) AS avg_render_s,
       (SELECT AVG(TIMESTAMPDIFF(SECOND, created_at, COALESCE(claimed_at, submitted_at))) FROM ai_jobs
          WHERE status = 'done' AND provider = 'render' AND created_at >= UTC_TIMESTAMP() - INTERVAL ? DAY) AS avg_wait_s`,
    [days, days, days, days],
  );
  const byTemplate = await execute<Record<string, unknown>>(
    `SELECT CASE WHEN tier = 'template' THEN model ELSE CONCAT('ai:', tier) END AS k,
            COUNT(*) AS jobs, SUM(status = 'done') AS done, SUM(status = 'failed') AS failed,
            COALESCE(SUM(CASE WHEN status = 'done' THEN credits ELSE 0 END), 0) AS credits
       FROM ai_jobs WHERE is_admin_test = 0 AND created_at >= UTC_TIMESTAMP() - INTERVAL ? DAY
      GROUP BY k ORDER BY jobs DESC`,
    [days],
  );
  const errors = await execute<Record<string, unknown>>(
    `SELECT LEFT(COALESCE(NULLIF(error, ''), 'tanpa pesan'), 120) AS e, COUNT(*) AS c
       FROM ai_jobs WHERE status = 'failed' AND is_admin_test = 0 AND created_at >= UTC_TIMESTAMP() - INTERVAL ? DAY
      GROUP BY e ORDER BY c DESC LIMIT 5`,
    [days],
  );
  const top = await execute<Record<string, unknown>>(
    `SELECT t.id, t.name, COUNT(*) AS videos, COALESCE(SUM(j.credits), 0) AS credits
       FROM ai_jobs j JOIN tenants t ON t.id = j.tenant_id
      WHERE j.status = 'done' AND j.is_admin_test = 0 AND j.created_at >= UTC_TIMESTAMP() - INTERVAL ? DAY
      GROUP BY t.id, t.name ORDER BY credits DESC LIMIT 5`,
    [days],
  );
  const pts = series.map((r) => ({
    day: String(r.day),
    sales_idr: n(r.sales_idr),
    credits_sold: n(r.credits_sold),
    bonus: n(r.bonus),
    credits_used: n(r.credits_used),
    done: n(r.done),
    failed: n(r.failed),
  }));
  const sum = (k: keyof (typeof pts)[number]) => pts.reduce((a, p) => a + Number(p[k]), 0);
  const done = sum("done");
  const failed = sum("failed");
  return {
    days,
    series: pts,
    totals: {
      sales_idr: sum("sales_idr"),
      credits_sold: sum("credits_sold"),
      credits_used: sum("credits_used"),
      bonus: sum("bonus"),
      done,
      failed,
      success_rate: done + failed ? Math.round((done / (done + failed)) * 1000) / 10 : null,
      outstanding: n(totals?.outstanding),
      holders: n(totals?.holders),
      active_tenants: n(totals?.active_tenants),
      buyers: n(totals?.buyers),
      running: n(totals?.running),
      avg_render_s: totals?.avg_render_s == null ? null : Math.round(n(totals.avg_render_s)),
      avg_wait_s: totals?.avg_wait_s == null ? null : Math.round(n(totals.avg_wait_s)),
    },
    byTemplate: byTemplate.map((r) => ({
      key: String(r.k),
      jobs: n(r.jobs),
      done: n(r.done),
      failed: n(r.failed),
      credits: n(r.credits),
    })),
    errors: errors.map((r) => ({ error: String(r.e), count: n(r.c) })),
    top: top.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      videos: n(r.videos),
      credits: n(r.credits),
    })),
  };
}

export type CreditUserSort = "balance" | "used" | "purchased" | "recent" | "name";

/** Daftar kredit per tenant (pengguna Studio) dengan cari + halaman. */
export async function creditUsers(opts: {
  q: string;
  page: number;
  pageSize: number;
  sort: CreditUserSort;
  filter: "all" | "has_credits" | "buyers" | "zero";
}) {
  const where: string[] = [
    // Hanya tenant yang pernah tersentuh Studio (punya akun kredit atau riwayat).
    "(a.tenant_id IS NOT NULL OR EXISTS (SELECT 1 FROM ai_credit_ledger x WHERE x.tenant_id = t.id))",
  ];
  const args: unknown[] = [];
  if (opts.q.trim()) {
    const like = `%${opts.q.trim().replace(/[%_]/g, "\\$&")}%`;
    where.push(
      "(t.name LIKE ? OR t.subdomain LIKE ? OR t.pic_email LIKE ? OR u.email LIKE ? OR t.pic_name LIKE ?)",
    );
    args.push(like, like, like, like, like);
  }
  if (opts.filter === "has_credits") where.push("COALESCE(a.credits, 0) > 0");
  if (opts.filter === "zero") where.push("COALESCE(a.credits, 0) <= 0");
  if (opts.filter === "buyers") where.push("COALESCE(g.purchased, 0) > 0");
  const order = {
    balance: "balance DESC, t.name",
    used: "used DESC, t.name",
    purchased: "purchased_idr DESC, t.name",
    recent: "last_at IS NULL, last_at DESC",
    name: "t.name",
  }[opts.sort];
  const base = `FROM tenants t
       LEFT JOIN ai_credit_accounts a ON a.tenant_id = t.id
       LEFT JOIN app_users u ON u.id = t.owner_id
       LEFT JOIN (
         SELECT tenant_id,
                SUM(CASE WHEN kind = 'purchase' THEN delta ELSE 0 END) AS purchased,
                SUM(CASE WHEN kind = 'purchase' THEN amount_idr ELSE 0 END) AS purchased_idr,
                SUM(CASE WHEN kind = 'bonus' THEN delta ELSE 0 END) AS bonus,
                -SUM(CASE WHEN kind IN ('usage', 'refund') THEN delta ELSE 0 END) AS used,
                SUM(CASE WHEN kind = 'adjustment' THEN delta ELSE 0 END) AS adjusted,
                MAX(created_at) AS last_at
           FROM ai_credit_ledger GROUP BY tenant_id) g ON g.tenant_id = t.id
      WHERE ${where.join(" AND ")}`;
  const totalRow = await executeOne<{ c: number }>(`SELECT COUNT(*) AS c ${base}`, args);
  const offset = (opts.page - 1) * opts.pageSize;
  const rows = await execute<Record<string, unknown>>(
    `SELECT t.id, t.name, t.subdomain, t.status, COALESCE(u.email, t.pic_email) AS email,
            COALESCE(a.credits, 0) AS balance, COALESCE(g.purchased, 0) AS purchased,
            COALESCE(g.purchased_idr, 0) AS purchased_idr, COALESCE(g.bonus, 0) AS bonus,
            COALESCE(g.used, 0) AS used, COALESCE(g.adjusted, 0) AS adjusted, g.last_at,
            (SELECT COUNT(*) FROM ai_jobs j WHERE j.tenant_id = t.id AND j.status = 'done') AS videos
     ${base}
     ORDER BY ${order}
     LIMIT ${Math.floor(opts.pageSize)} OFFSET ${Math.floor(offset)}`,
    args,
  );
  const summary = await executeOne<Record<string, unknown>>(
    `SELECT COUNT(*) AS tenants, COALESCE(SUM(COALESCE(a.credits, 0)), 0) AS balance,
            SUM(COALESCE(a.credits, 0) > 0) AS with_credits,
            COALESCE(SUM(g.purchased), 0) AS purchased, COALESCE(SUM(g.purchased_idr), 0) AS purchased_idr,
            COALESCE(SUM(g.bonus), 0) AS bonus, COALESCE(SUM(g.used), 0) AS used
     ${base.replace(/WHERE[\s\S]*$/, `WHERE ${where[0]}`)}`,
  );
  return {
    total: n(totalRow?.c),
    page: opts.page,
    pageSize: opts.pageSize,
    rows: rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      subdomain: r.subdomain ? String(r.subdomain) : null,
      status: String(r.status ?? ""),
      email: r.email ? String(r.email) : null,
      balance: n(r.balance),
      purchased: n(r.purchased),
      purchased_idr: n(r.purchased_idr),
      bonus: n(r.bonus),
      used: n(r.used),
      adjusted: n(r.adjusted),
      videos: n(r.videos),
      last_at: r.last_at ? String(r.last_at) : null,
    })),
    summary: {
      tenants: n(summary?.tenants),
      balance: n(summary?.balance),
      with_credits: n(summary?.with_credits),
      purchased: n(summary?.purchased),
      purchased_idr: n(summary?.purchased_idr),
      bonus: n(summary?.bonus),
      used: n(summary?.used),
    },
  };
}

/** Riwayat kredit satu tenant (terbaru dulu) + video terkait. */
export async function creditUserDetail(tenantId: string, page: number, pageSize: number) {
  const t = await executeOne<Record<string, unknown>>(
    `SELECT t.id, t.name, t.subdomain, COALESCE(u.email, t.pic_email) AS email, COALESCE(a.credits, 0) AS balance
       FROM tenants t LEFT JOIN ai_credit_accounts a ON a.tenant_id = t.id LEFT JOIN app_users u ON u.id = t.owner_id
      WHERE t.id = ?`,
    [tenantId],
  );
  if (!t) throw new Error("Tenant tidak ditemukan");
  const total = await executeOne<{ c: number }>(
    "SELECT COUNT(*) AS c FROM ai_credit_ledger WHERE tenant_id = ?",
    [tenantId],
  );
  const rows = await execute<Record<string, unknown>>(
    `SELECT l.id, l.kind, l.delta, l.balance_after, l.amount_idr, l.description, l.created_at,
            j.id AS job_id, j.status AS job_status, j.tier, j.model, j.duration_s, j.aspect_ratio,
            COALESCE(p.full_name, u.email) AS by_name
       FROM ai_credit_ledger l
       LEFT JOIN ai_jobs j ON j.id = l.ref_id
       LEFT JOIN profiles p ON p.id = l.created_by LEFT JOIN app_users u ON u.id = l.created_by
      WHERE l.tenant_id = ?
      ORDER BY l.created_at DESC
      LIMIT ${Math.floor(pageSize)} OFFSET ${Math.floor((page - 1) * pageSize)}`,
    [tenantId],
  );
  const agg = await executeOne<Record<string, unknown>>(
    `SELECT SUM(CASE WHEN kind = 'purchase' THEN delta ELSE 0 END) AS purchased,
            SUM(CASE WHEN kind = 'purchase' THEN amount_idr ELSE 0 END) AS purchased_idr,
            SUM(CASE WHEN kind = 'bonus' THEN delta ELSE 0 END) AS bonus,
            -SUM(CASE WHEN kind IN ('usage', 'refund') THEN delta ELSE 0 END) AS used,
            (SELECT COUNT(*) FROM ai_jobs WHERE tenant_id = ? AND status = 'done') AS done,
            (SELECT COUNT(*) FROM ai_jobs WHERE tenant_id = ? AND status = 'failed') AS failed
       FROM ai_credit_ledger WHERE tenant_id = ?`,
    [tenantId, tenantId, tenantId],
  );
  return {
    tenant: {
      id: String(t.id),
      name: String(t.name),
      subdomain: t.subdomain ? String(t.subdomain) : null,
      email: t.email ? String(t.email) : null,
      balance: n(t.balance),
    },
    summary: {
      purchased: n(agg?.purchased),
      purchased_idr: n(agg?.purchased_idr),
      bonus: n(agg?.bonus),
      used: n(agg?.used),
      done: n(agg?.done),
      failed: n(agg?.failed),
    },
    total: n(total?.c),
    page,
    pageSize,
    rows: rows.map((r) => ({
      id: String(r.id),
      kind: String(r.kind),
      delta: n(r.delta),
      balance_after: n(r.balance_after),
      amount_idr: n(r.amount_idr),
      description: r.description ? String(r.description) : null,
      created_at: String(r.created_at),
      by: r.by_name ? String(r.by_name) : null,
      job: r.job_id
        ? {
            id: String(r.job_id),
            status: String(r.job_status),
            template: r.tier === "template" ? String(r.model) : null,
            tier: String(r.tier),
            duration_s: n(r.duration_s),
            ratio: r.aspect_ratio ? String(r.aspect_ratio) : null,
          }
        : null,
    })),
  };
}
