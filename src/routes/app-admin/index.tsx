import { createFileRoute, Link } from "@tanstack/react-router";
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
  XAxis,
  YAxis,
} from "recharts";
import {
  Building2,
  ClipboardCheck,
  CreditCard,
  FileWarning,
  LifeBuoy,
  MessageSquare,
  Send,
  Share2,
  Users,
  Wallet,
  Blocks,
  PiggyBank,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { getAdminDashboardStats } from "@/lib/admin-dashboard.functions";
import { formatDate, formatIDR } from "@/lib/xperd";

export const Route = createFileRoute("/app-admin/")({
  head: () => ({
    meta: [
      { title: "Dashboard — XPERD Super Admin" },
      {
        name: "description",
        content: "Ringkasan eksekutif tenant, deposit, pembayaran, dan aktivitas sosial XPERD.",
      },
      { property: "og:title", content: "Dashboard — XPERD Super Admin" },
      { property: "og:description", content: "Ringkasan eksekutif platform XPERD." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminDashboard,
});

const moneyConfig = {
  deposit: { label: "Deposit", color: "var(--chart-1)" },
  payment: { label: "Pembayaran", color: "var(--chart-2)" },
} satisfies ChartConfig;
const activityConfig = {
  tenants: { label: "Tenant baru", color: "var(--chart-3)" },
  posts: { label: "Postingan", color: "var(--chart-4)" },
} satisfies ChartConfig;
const PIE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
const short = (n: number) =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(1)}M`
    : n >= 1e6
      ? `${(n / 1e6).toFixed(1)}jt`
      : n >= 1e3
        ? `${Math.round(n / 1e3)}rb`
        : String(n);

function AdminDashboard() {
  const fetchStats = useServerFn(getAdminDashboardStats);
  const {
    data: d,
    error,
    isLoading,
  } = useQuery({ queryKey: ["admin-dashboard-stats"], queryFn: () => fetchStats() });

  const kpis = [
    {
      label: "Total deposit diterima",
      value: formatIDR(d?.deposit.totalPaid ?? 0),
      hint: `Saldo mengendap ${formatIDR(d?.deposit.walletBalance ?? 0)}`,
      icon: Wallet,
      to: "/app-admin/invoices",
    },
    {
      label: "Pembayaran diterima",
      value: formatIDR(d?.payments.paid ?? 0),
      hint: `${d?.payments.paidCount ?? 0} invoice lunas`,
      icon: CreditCard,
      to: "/app-admin/invoices",
    },
    {
      label: "Piutang berjalan",
      value: formatIDR(d?.payments.outstanding ?? 0),
      hint: `${d?.payments.outstandingCount ?? 0} invoice belum lunas`,
      icon: FileWarning,
      to: "/app-admin/invoices",
    },
    {
      label: "Top-up menunggu",
      value: formatIDR(d?.deposit.pendingAmount ?? 0),
      hint: `${d?.deposit.pendingCount ?? 0} pengajuan perlu verifikasi`,
      icon: PiggyBank,
      to: "/app-admin/invoices",
    },
  ];
  const ops = [
    {
      label: "Tenant",
      value: d?.tenants.total ?? 0,
      hint: `${d?.tenants.byStatus.active ?? 0} aktif · ${d?.tenants.byStatus.trial ?? 0} trial`,
      icon: Building2,
    },
    { label: "Pengguna", value: d?.users ?? 0, hint: "Semua akun terdaftar", icon: Users },
    {
      label: "Registrasi pending",
      value: d?.pendingRegistrations ?? 0,
      hint: "Menunggu proses",
      icon: ClipboardCheck,
    },
    { label: "Add-on aktif", value: d?.addons.active ?? 0, hint: "Langganan add-on", icon: Blocks },
    {
      label: "Akun sosial terhubung",
      value: d?.social.accounts ?? 0,
      hint: `${d?.social.byPlatform.length ?? 0} platform`,
      icon: Share2,
    },
    {
      label: "Postingan",
      value: d?.social.posts ?? 0,
      hint: `${d?.social.postsByStatus.published ?? 0} terbit · ${d?.social.postsByStatus.scheduled ?? 0} terjadwal`,
      icon: Send,
    },
    {
      label: "Percakapan inbox",
      value: d?.social.conversations ?? 0,
      hint: `${d?.social.openConversations ?? 0} terbuka`,
      icon: MessageSquare,
    },
    {
      label: "Tiket bantuan terbuka",
      value: d?.openTickets ?? 0,
      hint: "Help Desk",
      icon: LifeBuoy,
    },
  ];
  const tenantPie = Object.entries(d?.tenants.byStatus ?? {}).map(([name, value]) => ({
    name,
    value,
  }));
  const platformBars = d?.social.byPlatform ?? [];

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-semibold tracking-[0.28em] text-gold">EXECUTIVE OVERVIEW</p>
        <h1 className="text-2xl font-bold text-navy">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ringkasan keuangan, tenant, dan aktivitas sosial di seluruh platform.
        </p>
      </header>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((s) => (
          <Link key={s.label} to={s.to} className="block">
            <Card className="h-full transition-colors hover:border-gold/60">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {s.label}
                </CardTitle>
                <s.icon className="h-4 w-4 text-gold" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-navy">{isLoading ? "…" : s.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Tren deposit & pembayaran (6 bulan)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={moneyConfig} className="h-72 w-full">
              <AreaChart data={d?.trend ?? []} margin={{ left: 4, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={short} width={48} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(v, n) => (
                        <span>
                          {moneyConfig[n as keyof typeof moneyConfig]?.label}:{" "}
                          {formatIDR(Number(v))}
                        </span>
                      )}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Area
                  dataKey="deposit"
                  type="monotone"
                  stroke="var(--color-deposit)"
                  fill="var(--color-deposit)"
                  fillOpacity={0.2}
                />
                <Area
                  dataKey="payment"
                  type="monotone"
                  stroke="var(--color-payment)"
                  fill="var(--color-payment)"
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status tenant</CardTitle>
          </CardHeader>
          <CardContent>
            {tenantPie.length === 0 ? (
              <p className="py-20 text-center text-sm text-muted-foreground">Belum ada tenant.</p>
            ) : (
              <ChartContainer config={{}} className="mx-auto h-72 w-full">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                  <Pie
                    data={tenantPie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {tenantPie.map((_, i) => (
                      <Cell key={i} fill={PIE[i % PIE.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            )}
            <div className="flex flex-wrap justify-center gap-3 text-xs">
              {tenantPie.map((t, i) => (
                <span key={t.name} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: PIE[i % PIE.length] }}
                  />
                  {t.name} ({t.value})
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ops.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-start justify-between gap-3 p-5">
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-2xl font-bold text-navy">
                  {isLoading ? "…" : s.value.toLocaleString("id-ID")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
              </div>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary">
                <s.icon className="h-4 w-4 text-gold" />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pertumbuhan tenant & postingan</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={activityConfig} className="h-64 w-full">
              <BarChart data={d?.trend ?? []}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="tenants" fill="var(--color-tenants)" radius={4} />
                <Bar dataKey="posts" fill="var(--color-posts)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Akun sosial per platform & add-on aktif</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <MiniList
              title="Platform"
              rows={platformBars.map((p) => ({ name: p.platform, count: p.count }))}
              empty="Belum ada akun terhubung."
            />
            <MiniList
              title="Add-on"
              rows={d?.addons.byAddon ?? []}
              empty="Belum ada add-on aktif."
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Top-up menunggu verifikasi</CardTitle>
            <Link to="/app-admin/invoices" className="text-sm text-gold hover:underline">
              Lihat semua
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {(d?.pendingTopups ?? []).map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between border-b border-border/60 pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium text-navy">{t.tenant}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(t.created_at)}</p>
                </div>
                <span className="text-sm font-semibold">{formatIDR(t.amount)}</span>
              </div>
            ))}
            {!d?.pendingTopups.length && (
              <p className="text-sm text-muted-foreground">Tidak ada pengajuan menunggu.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Invoice terbaru</CardTitle>
            <Link to="/app-admin/invoices" className="text-sm text-gold hover:underline">
              Lihat semua
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {(d?.recentPayments ?? []).map((i) => (
              <div
                key={i.id}
                className="flex items-center justify-between gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-navy">{i.tenant}</p>
                  <p className="text-xs text-muted-foreground">
                    {i.number} · {formatDate(i.date)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatIDR(i.total)}</p>
                  <Badge variant="secondary">{i.status}</Badge>
                </div>
              </div>
            ))}
            {!d?.recentPayments.length && (
              <p className="text-sm text-muted-foreground">Belum ada invoice.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MiniList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { name: string; count: number }[];
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
      {rows.map((r) => (
        <div key={r.name} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="capitalize">{r.name}</span>
            <span className="font-semibold">{r.count}</span>
          </div>
          <div className="h-2 rounded-full bg-secondary">
            <div
              className="h-2 rounded-full bg-gold"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
