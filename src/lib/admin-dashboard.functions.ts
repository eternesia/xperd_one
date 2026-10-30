/**
 * Dasbor eksekutif Super Admin (BS New 11 `admin-dashboard.functions.ts`), query MySQL.
 * Bagian deposit/saldo/top-up bersumber dari tabel wallet (klaster wallet, belum diporting) —
 * dibaca dengan aman: tabel belum ada ⇒ nilai 0, sehingga tampilannya sama tanpa mengubah angka lain.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export interface AdminDashboardStats {
  tenants: { total: number; byStatus: Record<string, number> };
  users: number;
  pendingRegistrations: number;
  subscriptions: { total: number; byStatus: Record<string, number> };
  addons: { active: number; byAddon: { name: string; count: number }[] };
  deposit: {
    totalPaid: number;
    pendingCount: number;
    pendingAmount: number;
    walletBalance: number;
  };
  payments: { paid: number; outstanding: number; paidCount: number; outstandingCount: number };
  social: {
    accounts: number;
    byPlatform: { platform: string; count: number }[];
    posts: number;
    postsByStatus: Record<string, number>;
    conversations: number;
    openConversations: number;
  };
  openTickets: number;
  trend: { month: string; deposit: number; payment: number; posts: number; tenants: number }[];
  pendingTopups: { id: string; tenant: string; amount: number; created_at: string }[];
  recentPayments: {
    id: string;
    number: string;
    tenant: string;
    total: number;
    status: string;
    date: string;
  }[];
}

const count = <T>(rows: T[], key: (r: T) => string) =>
  rows.reduce<Record<string, number>>((acc, r) => {
    const k = key(r) || "unknown";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
const iso = (v: unknown) => {
  const d = new Date(
    String(v ?? "").replace(" ", "T") + (String(v ?? "").includes("T") ? "" : "Z"),
  );
  return Number.isFinite(d.getTime()) ? d.toISOString() : "";
};

export const getAdminDashboardStats = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }): Promise<AdminDashboardStats> => {
    const { hasRole } = await import("@/lib/auth-context.server");
    if (!(await hasRole(context.userId, "admin"))) throw new Error("Forbidden");
    const { execute } = await import("@/integrations/mysql/pool");
    /** Tabel yang belum ada (klaster wallet) dianggap kosong. */
    const safe = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      try {
        return await execute<T>(sql);
      } catch (e) {
        if ((e as { code?: string }).code === "ER_NO_SUCH_TABLE") return [];
        throw e;
      }
    };

    const [
      tenants,
      users,
      regs,
      subs,
      addons,
      addonCat,
      topups,
      wallets,
      invoices,
      accounts,
      posts,
      convs,
      tickets,
    ] = await Promise.all([
      safe<{ id: string; name: string; status: string; created_at: string }>(
        "SELECT id, name, status, created_at FROM tenants",
      ),
      safe<{ c: number }>("SELECT COUNT(*) AS c FROM profiles"),
      safe<{ c: number }>("SELECT COUNT(*) AS c FROM registrations WHERE status = 'pending'"),
      safe<{ status: string }>("SELECT status FROM subscriptions"),
      safe<{ addon_id: string; status: string }>("SELECT addon_id, status FROM tenant_addons"),
      safe<{ id: string; name: string }>("SELECT id, name FROM addons"),
      safe<{
        id: string;
        tenant_id: string;
        amount_idr: number;
        status: string;
        created_at: string;
        paid_at: string | null;
      }>(
        "SELECT id, tenant_id, amount_idr, status, created_at, paid_at FROM topups ORDER BY created_at DESC",
      ),
      safe<{ balance_idr: number }>("SELECT balance_idr FROM wallet_accounts"),
      safe<{
        id: string;
        invoice_number: string;
        tenant_id: string;
        total: number;
        status: string;
        product: string | null;
        issue_date: string | null;
        paid_at: string | null;
        created_at: string;
      }>(
        "SELECT id, invoice_number, tenant_id, total, status, product, issue_date, paid_at, created_at FROM invoices ORDER BY created_at DESC",
      ),
      safe<{ platform: string; status: string }>(
        "SELECT platform, status FROM crm_social_accounts",
      ),
      safe<{ status: string; created_at: string }>(
        "SELECT status, created_at FROM crm_scheduled_posts",
      ),
      safe<{ status: string }>("SELECT status FROM crm_conversations"),
      safe<{ status: string }>("SELECT status FROM support_tickets"),
    ]);

    const tRows = tenants.map((t) => ({ ...t, created_at: iso(t.created_at) }));
    const tName = new Map(tRows.map((t) => [t.id, t.name]));
    const topRows = topups.map((t) => ({
      ...t,
      created_at: iso(t.created_at),
      paid_at: t.paid_at ? iso(t.paid_at) : null,
    }));
    const invRows = invoices
      .filter((i) => i.product !== "wallet")
      .map((i) => ({
        ...i,
        created_at: iso(i.created_at),
        paid_at: i.paid_at ? iso(i.paid_at) : null,
      }));
    const postRows = posts.map((p) => ({ ...p, created_at: iso(p.created_at) }));
    const addonName = new Map(addonCat.map((a) => [a.id, a.name]));
    const activeAddons = addons.filter((a) => a.status === "active");

    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) =>
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + i, 1))
        .toISOString()
        .slice(0, 7),
    );
    const trend = months.map((m) => ({
      month: new Date(`${m}-01T00:00:00Z`).toLocaleDateString("id-ID", {
        month: "short",
        year: "2-digit",
      }),
      deposit: topRows
        .filter((t) => t.status === "paid" && (t.paid_at ?? t.created_at).startsWith(m))
        .reduce((s, t) => s + Number(t.amount_idr), 0),
      payment: invRows
        .filter((i) => i.status === "paid" && (i.paid_at ?? i.created_at).startsWith(m))
        .reduce((s, i) => s + Number(i.total ?? 0), 0),
      posts: postRows.filter((p) => p.created_at.startsWith(m)).length,
      tenants: tRows.filter((t) => t.created_at.startsWith(m)).length,
    }));

    const paid = invRows.filter((i) => i.status === "paid");
    const unpaid = invRows.filter(
      (i) => i.status !== "paid" && i.status !== "void" && i.status !== "draft",
    );
    const pending = topRows.filter((t) => t.status === "pending");

    return {
      tenants: { total: tRows.length, byStatus: count(tRows, (t) => t.status) },
      users: Number(users[0]?.c ?? 0),
      pendingRegistrations: Number(regs[0]?.c ?? 0),
      subscriptions: { total: subs.length, byStatus: count(subs, (s) => s.status) },
      addons: {
        active: activeAddons.length,
        byAddon: Object.entries(
          count(activeAddons, (a) => addonName.get(a.addon_id) ?? "Lainnya"),
        ).map(([name, c]) => ({ name, count: c })),
      },
      deposit: {
        totalPaid: topRows
          .filter((t) => t.status === "paid")
          .reduce((s, t) => s + Number(t.amount_idr), 0),
        pendingCount: pending.length,
        pendingAmount: pending.reduce((s, t) => s + Number(t.amount_idr), 0),
        walletBalance: wallets.reduce((s, w) => s + Number(w.balance_idr), 0),
      },
      payments: {
        paid: paid.reduce((s, i) => s + Number(i.total ?? 0), 0),
        outstanding: unpaid.reduce((s, i) => s + Number(i.total ?? 0), 0),
        paidCount: paid.length,
        outstandingCount: unpaid.length,
      },
      social: {
        accounts: accounts.length,
        byPlatform: Object.entries(count(accounts, (a) => a.platform)).map(([platform, c]) => ({
          platform,
          count: c,
        })),
        posts: postRows.length,
        postsByStatus: count(postRows, (p) => p.status),
        conversations: convs.length,
        openConversations: convs.filter((c) => c.status === "open").length,
      },
      openTickets: tickets.filter((t) => t.status !== "closed" && t.status !== "resolved").length,
      trend,
      pendingTopups: pending.slice(0, 5).map((t) => ({
        id: t.id,
        tenant: tName.get(t.tenant_id) ?? "—",
        amount: Number(t.amount_idr),
        created_at: t.created_at,
      })),
      recentPayments: invRows.slice(0, 5).map((i) => ({
        id: i.id,
        number: i.invoice_number,
        tenant: tName.get(i.tenant_id) ?? "—",
        total: Number(i.total ?? 0),
        status: i.status,
        date: i.paid_at ?? (i.issue_date ? iso(i.issue_date) : null) ?? i.created_at,
      })),
    };
  });
