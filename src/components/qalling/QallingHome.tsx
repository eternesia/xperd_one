import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Image as ImageIcon,
  PenSquare,
  Plus,
  Share2,
  Sparkles,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getWorkspaceEntitlements } from "@/lib/addon-catalog.functions";
import { listWorkspaceRows } from "@/lib/data.functions";
import { useApp } from "@/lib/app-context";
import { getWallet } from "@/lib/wallet.functions";
import type { Entitlements } from "@/lib/entitlements";

const money = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const PIE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

type Post = {
  id: string;
  title: string | null;
  caption: string | null;
  scheduled_at: string;
  status: string;
  account_ids: string[] | null;
};

export function useWorkspaceEntitlements(workspaceId?: string) {
  return useQuery({
    queryKey: ["workspace-entitlements", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () =>
      getWorkspaceEntitlements({ data: { workspaceId: workspaceId! } }) as Promise<Entitlements>,
  });
}

export function QallingHome() {
  const { activeWorkspace, tenant, canViewSubmodule } = useApp();
  const workspaceId = activeWorkspace?.id;
  const fetchWallet = useServerFn(getWallet);
  const wallet = useQuery({
    queryKey: ["wallet", tenant?.id, 0],
    enabled: Boolean(tenant?.id),
    queryFn: () => fetchWallet({ data: { tenantId: tenant!.id, page: 0 } }),
  });
  const ent = useWorkspaceEntitlements(workspaceId);
  const q = ent.data?.qalling as (Entitlements[string] & { status?: string }) | undefined;

  const { data: accounts = [] } = useQuery({
    queryKey: ["qalling-home-accounts", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const res = await listWorkspaceRows({
        data: { table: "crm_social_accounts", workspaceId: workspaceId!, limit: 500 },
      });
      return (res?.rows ?? []) as {
        id: string;
        platform: string;
        account_name: string;
        source: string;
      }[];
    },
  });
  const { data: posts = [] } = useQuery({
    queryKey: ["qalling-home-posts", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const res = await listWorkspaceRows({
        data: {
          table: "crm_scheduled_posts",
          workspaceId: workspaceId!,
          orderBy: "scheduled_at",
          orderDir: "asc",
          limit: 1000,
        },
      });
      return ((res?.rows ?? []) as Post[])
        .map((p) => ({
          ...p,
          scheduled_at: new Date(
            `${String(p.scheduled_at).replace(" ", "T")}${/[zZ]|[+-]\d\d:?\d\d$/.test(String(p.scheduled_at)) ? "" : "Z"}`,
          ).toISOString(),
        }))
        .filter((p) => p.scheduled_at >= since);
    },
  });

  const stats = useMemo(() => {
    const now = Date.now();
    const week = now + 7 * 86_400_000;
    const days: { day: string; label: string; terbit: number; terjadwal: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * 86_400_000);
      days.push({
        day: dayKey(d),
        label: d.toLocaleDateString("id-ID", { day: "numeric", month: "short" }),
        terbit: 0,
        terjadwal: 0,
      });
    }
    const map = new Map(days.map((d) => [d.day, d]));
    posts.forEach((p) => {
      const row = map.get(p.scheduled_at.slice(0, 10));
      if (!row) return;
      if (p.status === "published") row.terbit += 1;
      else if (p.status === "scheduled") row.terjadwal += 1;
    });
    const platform = new Map<string, number>();
    accounts.forEach((a) => platform.set(a.platform, (platform.get(a.platform) ?? 0) + 1));
    const upcoming = posts
      .filter((p) => p.status === "scheduled" && new Date(p.scheduled_at).getTime() >= now)
      .slice(0, 6);
    return {
      days,
      platform: [...platform.entries()].map(([name, value]) => ({ name, value })),
      upcoming,
      weekScheduled: posts.filter(
        (p) =>
          p.status === "scheduled" &&
          new Date(p.scheduled_at).getTime() >= now &&
          new Date(p.scheduled_at).getTime() <= week,
      ).length,
      published: posts.filter((p) => p.status === "published").length,
      drafts: posts.filter((p) => p.status === "draft").length,
    };
  }, [posts, accounts]);

  const maxAccounts = q?.limits?.max_accounts ?? null;
  const tierName = q?.tier
    ? q.tier.replace("qalling_", "").replace(/^\w/, (c) => c.toUpperCase())
    : "—";
  const isTrial = q?.status === "trial";
  const trialLeft = tenant?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(tenant.trial_ends_at).getTime() - Date.now()) / 86_400_000))
    : null;
  const isTop = q?.tier === "qalling_agency";
  const balance = wallet.data?.balance ?? 0;
  const hasCrm = canViewSubmodule("crm", "leads");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Qalling</p>
          <h1 className="text-2xl font-bold text-navy dark:text-foreground">
            Halo, {activeWorkspace?.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Ringkasan konten, akun sosial, dan saldo Anda.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canViewSubmodule("crm", "post-scheduler") && (
            <Button asChild variant="gold">
              <Link to="/qalling/app/$submoduleId" params={{ submoduleId: "post-scheduler" }}>
                <PenSquare />
                Buat postingan
              </Link>
            </Button>
          )}
          {canViewSubmodule("crm", "media") && (
            <Button asChild variant="outline">
              <Link to="/qalling/app/$submoduleId" params={{ submoduleId: "media" }}>
                <ImageIcon />
                Unggah media
              </Link>
            </Button>
          )}
          {hasCrm && (
            <Button asChild variant="outline">
              <Link to="/qalling/app/$submoduleId" params={{ submoduleId: "dashboard" }}>
                Dasbor penjualan
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5 shadow-sm lg:col-span-1">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Wallet className="h-4 w-4 text-gold" />
              Saldo deposit
            </p>
            <Button asChild size="sm" variant="gold">
              <Link to="/qalling/app/billing" search={{ tab: "saldo" }}>
                <Plus />
                Top up
              </Link>
            </Button>
          </div>
          <p className="mt-3 text-3xl font-bold tabular-nums">
            {wallet.isLoading ? "…" : money(balance)}
          </p>
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Mutasi terakhir</p>
            {(wallet.data?.ledger ?? []).slice(0, 3).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{r.description}</span>
                <span
                  className={
                    Number(r.amount_idr) < 0 ? "shrink-0 text-destructive" : "shrink-0 text-success"
                  }
                >
                  {money(Number(r.amount_idr))}
                </span>
              </div>
            ))}
            {!wallet.data?.ledger?.length && (
              <p className="text-sm text-muted-foreground">Belum ada mutasi.</p>
            )}
            <Link
              to="/qalling/app/billing"
              search={{ tab: "saldo" }}
              className="inline-flex items-center gap-1 text-xs text-gold hover:underline"
            >
              Lihat semua mutasi <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Paket aktif</p>
              <p className="mt-1 flex items-center gap-2 text-2xl font-bold">
                {tierName}
                {isTrial && (
                  <Badge variant="outline" className="border-gold text-gold">
                    Trial{trialLeft != null ? ` · sisa ${trialLeft} hari` : ""}
                  </Badge>
                )}
              </p>
            </div>
            <Button asChild variant={isTop ? "outline" : "gold"}>
              <Link to="/qalling/app/billing" search={{ tab: "paket" }}>
                <Sparkles />
                {isTop ? "Kelola paket" : "Upgrade paket"}
              </Link>
            </Button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <Kpi
              icon={Share2}
              label="Akun terhubung"
              value={`${accounts.length}${maxAccounts != null ? ` / ${maxAccounts}` : ""}`}
              progress={maxAccounts ? accounts.length / maxAccounts : undefined}
            />
            <Kpi
              icon={CalendarClock}
              label="Terjadwal 7 hari"
              value={String(stats.weekScheduled)}
            />
            <Kpi icon={CheckCircle2} label="Terbit 30 hari" value={String(stats.published)} />
            <Kpi icon={PenSquare} label="Draft" value={String(stats.drafts)} />
          </div>
          {!hasCrm && (
            <p className="mt-4 rounded-lg border border-dashed border-gold/50 bg-gold/5 p-3 text-sm">
              Butuh Inbox DM terpadu, CRM prospek, dan automasi?{" "}
              <Link
                to="/qalling/app/billing"
                search={{ tab: "paket" }}
                className="font-semibold text-gold hover:underline"
              >
                Upgrade ke Pro
              </Link>{" "}
              — dipotong dari saldo, langsung aktif.
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5 shadow-sm lg:col-span-2">
          <h2 className="font-semibold">Aktivitas publikasi · 14 hari</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.days} margin={{ left: -20, right: 8 }}>
                <defs>
                  <linearGradient id="qTerbit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={1} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="terbit"
                  name="Terbit"
                  stroke="var(--chart-1)"
                  fill="url(#qTerbit)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="terjadwal"
                  name="Terjadwal"
                  stroke="var(--chart-2)"
                  fill="transparent"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Akun per platform</h2>
          {stats.platform.length ? (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                {stats.platform.length > 4 ? (
                  <BarChart data={stats.platform}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" name="Akun" fill="var(--chart-1)" radius={4} />
                  </BarChart>
                ) : (
                  <PieChart>
                    <Pie
                      data={stats.platform}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={3}
                      label={(e) => e.name}
                    >
                      {stats.platform.map((_, i) => (
                        <Cell key={i} fill={PIE[i % PIE.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                )}
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mt-6 space-y-3 text-center text-sm text-muted-foreground">
              <p>Belum ada akun sosial terhubung.</p>
              <Button asChild size="sm" variant="outline">
                <Link to="/qalling/app/$submoduleId" params={{ submoduleId: "social-accounts" }}>
                  <Plus />
                  Tambah akun
                </Link>
              </Button>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Jadwal tayang terdekat</h2>
          {canViewSubmodule("crm", "post-scheduler") && (
            <Link
              to="/qalling/app/$submoduleId"
              params={{ submoduleId: "post-scheduler" }}
              className="text-xs text-gold hover:underline"
            >
              Buka kalender
            </Link>
          )}
        </div>
        <div className="mt-3 divide-y divide-border">
          {stats.upcoming.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="truncate">{p.title || p.caption || "Tanpa judul"}</span>
              <span className="shrink-0 text-muted-foreground">
                {new Date(p.scheduled_at).toLocaleString("id-ID", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                · {p.account_ids?.length ?? 0} akun
              </span>
            </div>
          ))}
          {!stats.upcoming.length && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Belum ada postingan terjadwal.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  progress,
}: {
  icon: typeof Share2;
  label: string;
  value: string;
  progress?: number;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      {progress != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-gold"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
