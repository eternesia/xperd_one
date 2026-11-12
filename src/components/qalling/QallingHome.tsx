import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SignupBonusBanner } from "@/components/qalling/SignupBonusBanner";
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
import { getQallingHomeCounts } from "@/lib/qalling-home.functions";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { SocialIcon } from "./SocialIcon";
import { OnboardingWizard } from "./OnboardingWizard";
import { ReferralHomeCard } from "./ReferralHomeCard";
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
      getWorkspaceEntitlements({
        data: { workspaceId: workspaceId ?? "" },
      }) as Promise<Entitlements>,
  });
}

export function QallingHome() {
  const { activeWorkspace, tenant, canViewSubmodule } = useApp();
  const workspaceId = activeWorkspace?.id;
  const { pick, lang } = useI18n();
  const [period, setPeriod] = useState(30);
  const [account, setAccount] = useState("all");
  const ent = useWorkspaceEntitlements(workspaceId);
  const q = ent.data?.qalling as (Entitlements[string] & { status?: string }) | undefined;

  const { data: accounts = [] } = useQuery({
    queryKey: ["qalling-home-accounts", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const res = await listWorkspaceRows({
        data: { table: "crm_social_accounts", workspaceId: workspaceId ?? "", limit: 500 },
      });
      return (res?.rows ?? []) as {
        id: string;
        platform: string;
        account_name: string;
        source: string;
      }[];
    },
  });
  const { data: allPosts = [] } = useQuery({
    queryKey: ["qalling-home-posts", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const res = await listWorkspaceRows({
        data: {
          table: "crm_scheduled_posts",
          workspaceId: workspaceId ?? "",
          orderBy: "scheduled_at",
          orderDir: "asc",
          limit: 2000,
        },
      });
      return ((res?.rows ?? []) as Post[])
        .map((p) => ({
          ...p,
          scheduled_at: new Date(`${String(p.scheduled_at).replace(" ", "T")}Z`).toISOString(),
        }))
        .filter((p) => p.scheduled_at >= since);
    },
  });

  const posts = allPosts.filter(
    (p) =>
      (account === "all" || p.account_ids?.includes(account)) &&
      new Date(p.scheduled_at).getTime() >= Date.now() - period * 86_400_000,
  );
  const hasCrm = canViewSubmodule("crm", "leads");
  const { data: crm } = useQuery({
    queryKey: ["qalling-home-crm", workspaceId],
    enabled: Boolean(workspaceId && hasCrm),
    queryFn: () => getQallingHomeCounts({ data: { workspaceId: workspaceId ?? "" } }),
  });

  const stats = useMemo(() => {
    const now = Date.now();
    const week = now + 7 * 86_400_000;
    const days: { day: string; label: string; terbit: number; terjadwal: number }[] = [];
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(now - i * 86_400_000);
      days.push({
        day: dayKey(d),
        label: d.toLocaleDateString(lang === "id" ? "id-ID" : "en-US", {
          day: "numeric",
          month: "short",
        }),
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
  }, [posts, accounts, period, lang]);

  const maxAccounts = q?.limits?.max_accounts ?? null;
  const tierName = q?.tier
    ? q.tier.replace("qalling_", "").replace(/^\w/, (c) => c.toUpperCase())
    : "—";
  const isTrial = q?.status === "trial";
  const trialLeft = tenant?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(tenant.trial_ends_at).getTime() - Date.now()) / 86_400_000))
    : null;
  const isTop = q?.tier === "qalling_agency";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="hidden text-xs font-semibold uppercase tracking-[0.2em] text-gold sm:block">
            Qalling
          </p>
          <h1 className="text-2xl font-bold text-navy dark:text-foreground">
            {pick("Hello", "Halo")}, {activeWorkspace?.name}
          </h1>
          <p className="hidden text-sm text-muted-foreground sm:block">
            {pick(
              "Your content and social performance at a glance.",
              "Ringkasan konten dan performa akun sosial Anda.",
            )}
          </p>
        </div>
        <div className="hidden flex-wrap gap-2 md:flex">
          {canViewSubmodule("crm", "post-scheduler") && (
            <Button asChild variant="gold">
              <Link to="/qalling/app/$submoduleId" params={{ submoduleId: "post-scheduler" }}>
                <PenSquare />
                {pick("Create post", "Buat postingan")}
              </Link>
            </Button>
          )}
          {canViewSubmodule("crm", "media") && (
            <Button asChild variant="outline">
              <Link to="/qalling/app/$submoduleId" params={{ submoduleId: "media" }}>
                <ImageIcon />
                {pick("Upload media", "Unggah media")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {workspaceId && <SignupBonusBanner workspaceId={workspaceId} />}

      {workspaceId && (
        <OnboardingWizard
          workspaceId={workspaceId}
          accountCount={accounts.length}
          hasPosts={allPosts.length > 0}
          canPost={canViewSubmodule("crm", "post-scheduler")}
        />
      )}

      <div className="space-y-4">
        <section className="rounded-2xl border bg-card p-4 shadow-sm sm:rounded-xl sm:p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {pick("Current plan", "Paket aktif")}
              </p>
              <p className="mt-1 flex items-center gap-2 text-2xl font-bold">
                {tierName}
                {q?.grant && (
                  <Badge variant="outline" className="border-emerald-500 text-emerald-600">
                    {pick("Trial access", "Akses uji coba")}
                    {q.grant.tier ? ` ${q.grant.tier.replace("qalling_", "")}` : ""} ·{" "}
                    {pick("until", "sampai")} {q.grant.ends_at}
                  </Badge>
                )}
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
                {isTop
                  ? pick("Manage plan", "Kelola paket")
                  : pick("Upgrade plan", "Upgrade paket")}
              </Link>
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:grid-cols-4 sm:gap-3">
            <Kpi
              icon={Share2}
              label={pick("Connected accounts", "Akun terhubung")}
              value={`${accounts.length}${maxAccounts != null ? ` / ${maxAccounts}` : ""}`}
              progress={maxAccounts ? accounts.length / maxAccounts : undefined}
            />
            <Kpi
              icon={CalendarClock}
              label={pick("Scheduled this week", "Terjadwal 7 hari")}
              value={String(stats.weekScheduled)}
            />
            <Kpi
              icon={CheckCircle2}
              label={pick("Published", "Terbit")}
              value={String(stats.published)}
            />
            <Kpi icon={PenSquare} label={pick("Drafts", "Draft")} value={String(stats.drafts)} />
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          aria-label={pick("Filter social account", "Filter akun sosial")}
          className="h-10 w-full rounded-full border bg-background px-4 text-sm sm:w-auto sm:rounded-md"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
        >
          <option value="all">{pick("All accounts", "Semua akun")}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.account_name} · {a.platform}
            </option>
          ))}
        </select>
        <div className="inline-flex rounded-full bg-secondary p-1">
          {[7, 14, 30].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPeriod(n)}
              className={
                period === n
                  ? "rounded-full bg-background px-4 py-1.5 text-sm font-medium shadow-sm"
                  : "rounded-full px-4 py-1.5 text-sm text-muted-foreground"
              }
            >
              {n} {pick("days", "hari")}
            </button>
          ))}
        </div>
      </div>
      {hasCrm && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
          {[
            ["leads", pick("Leads", "Prospek"), crm?.leads],
            [
              "follow-ups",
              pick("Follow-ups overdue", "Follow up terlambat"),
              crm?.followUpsOverdue,
            ],
            ["follow-ups", pick("Follow-ups today", "Follow up hari ini"), crm?.followUpsToday],
            ["inbox", pick("Unread conversations", "Percakapan belum dibaca"), crm?.inbox],
            ["automations", pick("Active automations", "Automasi aktif"), crm?.automation],
          ].map(([key, label, count], i) => (
            <Link
              key={`${String(key)}-${i}`}
              to="/qalling/app/$submoduleId"
              params={{ submoduleId: String(key) }}
              className="rounded-2xl border bg-card p-4 active:bg-muted/50 sm:rounded-lg"
            >
              <p className="text-sm text-muted-foreground">{label}</p>
              <p
                className={`mt-2 text-2xl font-medium ${
                  i === 1 && Number(count) > 0 ? "text-destructive" : ""
                }`}
              >
                {count ?? "—"}
              </p>
            </Link>
          ))}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border bg-card p-4 shadow-sm sm:rounded-xl sm:p-5 lg:col-span-2">
          <h2 className="font-semibold">
            {pick("Publishing activity", "Aktivitas publikasi")} · {period} {pick("days", "hari")}
          </h2>
          <div className="mt-4 h-48 sm:h-64">
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
                  name={pick("Published", "Terbit")}
                  stroke="var(--chart-1)"
                  fill="url(#qTerbit)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="terjadwal"
                  name={pick("Scheduled", "Terjadwal")}
                  stroke="var(--chart-2)"
                  fill="transparent"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-2xl border bg-card p-4 shadow-sm sm:rounded-xl sm:p-5">
          <h2 className="font-semibold">{pick("Accounts by platform", "Akun per platform")}</h2>
          {stats.platform.length ? (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                {stats.platform.length > 4 ? (
                  <BarChart data={stats.platform}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar
                      dataKey="value"
                      name={pick("Accounts", "Akun")}
                      fill="var(--chart-1)"
                      radius={4}
                    />
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
              <p>{pick("No social accounts connected yet.", "Belum ada akun sosial terhubung.")}</p>
              <Button asChild size="sm" variant="outline">
                <Link to="/qalling/app/$submoduleId" params={{ submoduleId: "social-accounts" }}>
                  <Plus />
                  {pick("Add account", "Tambah akun")}
                </Link>
              </Button>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:rounded-xl sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{pick("Upcoming posts", "Jadwal tayang terdekat")}</h2>
          {canViewSubmodule("crm", "post-scheduler") && (
            <Link
              to="/qalling/app/$submoduleId"
              params={{ submoduleId: "post-scheduler" }}
              className="text-xs text-gold hover:underline"
            >
              {pick("Open calendar", "Buka kalender")}
            </Link>
          )}
        </div>
        <div className="mt-3 divide-y divide-border">
          {stats.upcoming.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate">{p.title || p.caption || "Tanpa judul"}</span>
                <span className="mt-1 flex gap-2">
                  {accounts
                    .filter((a) => p.account_ids?.includes(a.id))
                    .map((a) => (
                      <SocialIcon key={a.id} platform={a.platform} />
                    ))}
                </span>
              </span>
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
              {pick("No scheduled posts yet.", "Belum ada postingan terjadwal.")}
            </p>
          )}
        </div>
      </section>
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-gradient-to-r from-primary/10 to-transparent p-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">XPERD ERP</p>
          <h2 className="mt-1 text-base font-semibold">
            {pick(
              "Closed the deal? Let XPERD handle the books.",
              "Sudah closing? Lanjutkan pembukuan di XPERD.",
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            {pick(
              "Accounting, inventory, sales invoices and tax in one ERP connected to your Qalling workspace.",
              "Akuntansi, stok gudang, faktur penjualan, dan pajak dalam satu ERP yang terhubung dengan workspace Qalling Anda.",
            )}
          </p>
        </div>
        <Button asChild variant="outline">
          <a href="https://xperd.id" target="_blank" rel="noopener noreferrer">
            {pick("Explore XPERD", "Lihat XPERD")}
          </a>
        </Button>
      </section>
      {tenant?.id && <ReferralHomeCard tenantId={tenant.id} />}
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
