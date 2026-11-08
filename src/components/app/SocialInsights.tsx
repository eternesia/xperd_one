/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ExternalLink,
  RefreshCw,
  Star,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SocialIcon } from "@/components/qalling/SocialIcon";
import { listWorkspaceRows } from "@/lib/data.functions";
import { getSocialInsights } from "@/lib/social-insights.functions";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const LABELS: Record<string, [string, string]> = {
  followers_count: ["Followers", "Followers"],
  subscribers: ["Subscriber", "Subscribers"],
  views: ["Tayangan", "Views"],
  reach: ["Jangkauan", "Reach"],
  accounts_engaged: ["Akun berinteraksi", "Accounts engaged"],
  total_interactions: ["Interaksi", "Interactions"],
  likes: ["Suka", "Likes"],
  comments: ["Komentar", "Comments"],
  saves: ["Disimpan", "Saves"],
  shares: ["Dibagikan", "Shares"],
  replies: ["Balasan", "Replies"],
  reposts: ["Repost", "Reposts"],
  quotes: ["Kutipan", "Quotes"],
  clicks: ["Klik link", "Link clicks"],
  profile_views: ["Kunjungan profil", "Profile visits"],
  minutes_watched: ["Menit ditonton", "Minutes watched"],
};
/** Platform yang menurut Tebar tidak punya statistik akun. */
const NO_STATS = ["linkedin", "telegram", "discord", "x", "twitter", "pinterest", "whatsapp"];
const PRIMARY = ["followers_count", "subscribers", "views", "reach"];
const fmt = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "–"
    : new Intl.NumberFormat("id-ID", {
        notation: n >= 1e5 ? "compact" : "standard",
        maximumFractionDigits: 1,
      }).format(n);

export function SocialInsightsView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const id = lang === "id";
  const fetchInsights = useServerFn(getSocialInsights);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [days, setDays] = useState<7 | 30 | 90>(7);
  const [focus, setFocus] = useState<string | null>(null);

  const accounts = useQuery({
    queryKey: ["insight-accounts", workspaceId],
    queryFn: async () => {
      const res = await listWorkspaceRows({
        data: {
          table: "crm_social_accounts",
          workspaceId,
          orderBy: "platform",
          orderDir: "asc",
          limit: 500,
        },
      });
      return ((res as { rows?: any[] } | undefined)?.rows ?? []).filter(
        (a) => a.status === "connected",
      ) as {
        id: string;
        platform: string;
        account_name: string;
        handle: string | null;
        source: string;
        status: string;
      }[];
    },
  });
  useEffect(() => {
    if (!accountId && accounts.data?.length) setAccountId(accounts.data[0].id);
  }, [accounts.data, accountId]);

  const q = useQuery({
    queryKey: ["social-insights", workspaceId, accountId, days],
    enabled: !!accountId,
    staleTime: 5 * 60_000,
    queryFn: () => fetchInsights({ data: { workspaceId, accountId: accountId!, days } }),
  });

  const label = (k: string) => (LABELS[k] ? LABELS[k][id ? 0 : 1] : k.replace(/_/g, " "));
  const metrics = q.data?.metrics ?? [];
  const primary = metrics.filter((m) => PRIMARY.includes(m.key));
  const secondary = metrics.filter((m) => !PRIMARY.includes(m.key));
  const get = (k: string) => metrics.find((m) => m.key === k)?.total ?? null;
  const interactions =
    get("total_interactions") ??
    (["likes", "comments", "shares", "saves", "replies", "reposts"].reduce(
      (s, k) => s + (get(k) ?? 0),
      0,
    ) ||
      null);
  const base = get("reach") ?? get("views");
  const er = interactions !== null && base ? (interactions / base) * 100 : null;
  const focusKey =
    focus && metrics.some((m) => m.key === focus)
      ? focus
      : (primary[0]?.key ?? metrics[0]?.key ?? null);

  const chart = useMemo(() => {
    const series = metrics.find((m) => m.key === focusKey);
    const out: { date: string; value: number | null; posts: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
      out.push({
        date: d,
        value: series?.daily.find((x) => x.date === d)?.value ?? null,
        posts: q.data?.postsPerDay[d] ?? 0,
      });
    }
    return out;
  }, [metrics, focusKey, days, q.data]);

  const posts = q.data?.posts ?? [];
  const top = [...posts].sort(
    (a, b) =>
      (b.interactions ?? (b.likes ?? 0) + (b.comments ?? 0)) -
      (a.interactions ?? (a.likes ?? 0) + (a.comments ?? 0)),
  )[0];
  const current = accounts.data?.find((a) => a.id === accountId);

  if (accounts.isLoading)
    return (
      <p className="text-sm text-muted-foreground">{id ? "Memuat akun…" : "Loading accounts…"}</p>
    );
  if (!accounts.data?.length)
    return (
      <Card>
        <CardContent className="py-14 text-center text-sm text-muted-foreground">
          {id
            ? "Hubungkan akun media sosial untuk melihat insight."
            : "Connect a social account to see insights."}
        </CardContent>
      </Card>
    );

  const Delta = ({ cur, prev }: { cur: number | null; prev: number | null }) => {
    if (cur === null || prev === null || prev === 0) return null;
    const diff = cur - prev;
    const pct = Math.round((diff / Math.abs(prev)) * 100);
    const up = diff >= 0;
    return (
      <span
        className={cn(
          "mt-1 inline-flex items-center gap-0.5 text-xs font-medium",
          up ? "text-success" : "text-destructive",
        )}
      >
        {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
        {pct > 0 ? "+" : ""}
        {pct}%
      </span>
    );
  };

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex items-center justify-between gap-3 sm:hidden">
        <label className="relative flex min-w-0 items-center gap-3">
          <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-secondary text-lg font-semibold">
            {(current?.account_name ?? "?").charAt(0).toUpperCase()}
            {current && (
              <span className="absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full border-2 border-background bg-background">
                <SocialIcon platform={current.platform} className="size-3.5" />
              </span>
            )}
          </span>
          <span className="truncate text-xl font-semibold">{current?.account_name ?? "—"}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          <select
            aria-label={id ? "Pilih akun" : "Choose account"}
            className="absolute inset-0 opacity-0"
            value={accountId ?? ""}
            onChange={(e) => {
              setAccountId(e.target.value);
              setFocus(null);
            }}
          >
            {accounts.data.map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_name} ({a.platform})
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0 rounded-2xl"
          aria-label={id ? "Perbarui" : "Refresh"}
          onClick={() => q.refetch()}
          disabled={q.isFetching}
        >
          <RefreshCw className={cn("size-4", q.isFetching && "animate-spin")} />
        </Button>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-sm:hidden">
          <p className="text-xs uppercase tracking-widest text-gold">Insight</p>
          <h1 className="text-2xl font-semibold">
            {id ? "Insight Media Sosial" : "Social Insights"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full bg-secondary p-1">
            {([7, 30, 90] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm",
                  days === d
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {d} {id ? "hari" : "days"}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="max-sm:hidden"
            aria-label={id ? "Perbarui" : "Refresh"}
            onClick={() => q.refetch()}
            disabled={q.isFetching}
          >
            <RefreshCw className={cn("size-4", q.isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 max-sm:hidden">
        {accounts.data.map((a) => (
          <button
            key={a.id}
            onClick={() => {
              setAccountId(a.id);
              setFocus(null);
            }}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
              a.id === accountId
                ? "border-primary bg-primary/10 text-foreground"
                : "bg-background text-muted-foreground hover:border-primary/40",
            )}
          >
            <SocialIcon platform={a.platform} className="size-4" />
            <span className="max-w-[10rem] truncate font-medium">{a.account_name}</span>
            {NO_STATS.includes(a.platform) && (
              <span className="text-[10px] text-muted-foreground">
                {id ? "tanpa statistik" : "no stats"}
              </span>
            )}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">
          {id ? "Mengambil insight…" : "Loading insights…"}
        </p>
      ) : q.error ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            {(q.error as Error).message}
          </CardContent>
        </Card>
      ) : !q.data?.available ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {q.data?.reason === "config"
              ? id
                ? "Koneksi insight belum dikonfigurasi admin."
                : "Insights connection not configured."
              : id
                ? "Insight belum tersedia untuk akun ini. Hubungkan lewat tombol Tambah Akun."
                : "Insights unavailable for this account."}
          </CardContent>
        </Card>
      ) : metrics.length === 0 && posts.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              {id
                ? `Statistik ${current?.platform ?? ""} belum tersedia`
                : `No ${current?.platform ?? ""} statistics yet`}
            </p>
            <p>
              {NO_STATS.includes(current?.platform ?? "")
                ? id
                  ? "Platform ini tidak menyediakan statistik akun lewat koneksi Tebar. Postingan tetap bisa dijadwalkan dan dikirim seperti biasa."
                  : "This platform does not provide account statistics through the Tebar connection. You can still schedule and publish posts as usual."
                : id
                  ? "Data biasanya muncul 1–2 hari setelah akun terhubung dan ada postingan yang terbit. Bila tetap kosong, hubungkan ulang akun agar izin statistik ikut diberikan."
                  : "Data usually appears 1–2 days after the account is connected and posts are published. If it stays empty, reconnect the account so the statistics permission is granted."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {top && (
            <Card className="border-primary/30 bg-gradient-to-r from-primary/10 to-transparent">
              <CardContent className="flex items-center gap-3 p-4 text-sm">
                <Star className="size-4 shrink-0 text-gold" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-muted-foreground">
                    {id ? "Paling ramai: " : "Top post: "}
                  </span>
                  <span className="font-medium">{top.text || "Post"}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {fmt(top.interactions ?? (top.likes ?? 0) + (top.comments ?? 0))}{" "}
                    {id ? "interaksi" : "interactions"}
                  </span>
                </span>
                {top.url && (
                  <a
                    href={top.url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-primary hover:underline"
                  >
                    {id ? "Lihat" : "View"}
                  </a>
                )}
              </CardContent>
            </Card>
          )}
          {q.data.reason === "permission" && (
            <p className="text-xs text-muted-foreground">
              {id
                ? "Sebagian metrik butuh izin tambahan — hubungkan ulang akun."
                : "Some metrics need extra permission — reconnect the account."}
            </p>
          )}

          <div className="grid grid-cols-2 overflow-hidden rounded-2xl border bg-card sm:gap-3 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent lg:grid-cols-4">
            {primary.map((m) => (
              <button
                key={m.key}
                onClick={() => setFocus(m.key)}
                className={cn(
                  "border-b p-4 text-left transition-shadow odd:border-r sm:rounded-xl sm:border sm:bg-card sm:odd:border-r hover:sm:shadow-md",
                  focusKey === m.key && "ring-2 ring-primary",
                )}
              >
                <p className="text-xs text-muted-foreground">{label(m.key)}</p>
                <p className="mt-1 text-2xl font-semibold">{fmt(m.total)}</p>
                <Delta cur={m.total} prev={m.prev} />
              </button>
            ))}
            <div className="border-b p-4 sm:rounded-xl sm:border sm:bg-card">
              <p className="text-xs text-muted-foreground">Engagement rate</p>
              <p className="mt-1 text-2xl font-semibold">
                {er === null ? "–" : `${er.toFixed(2).replace(".", ",")}%`}
              </p>
            </div>
          </div>
          {secondary.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
              {secondary.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setFocus(m.key)}
                  className={cn(
                    "rounded-lg border bg-card px-3 py-2 text-left",
                    focusKey === m.key && "ring-2 ring-primary",
                  )}
                >
                  <p className="truncate text-[11px] text-muted-foreground">{label(m.key)}</p>
                  <p className="text-lg font-semibold">{fmt(m.total)}</p>
                </button>
              ))}
            </div>
          )}

          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {id ? "Dampak konten" : "Content impact"} · {focusKey ? label(focusKey) : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {id ? "Batang = post per hari" : "Bars = posts per day"}
                </p>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d) =>
                        new Date(d).toLocaleDateString(id ? "id-ID" : "en-US", {
                          day: "numeric",
                          month: "short",
                        })
                      }
                      fontSize={11}
                      minTickGap={24}
                    />
                    <YAxis yAxisId="v" fontSize={11} width={40} />
                    <YAxis
                      yAxisId="p"
                      orientation="right"
                      fontSize={11}
                      width={24}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                      }}
                    />
                    <Bar
                      yAxisId="p"
                      dataKey="posts"
                      name="Post"
                      fill="var(--color-muted-foreground, #94a3b8)"
                      opacity={0.35}
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      yAxisId="v"
                      type="monotone"
                      dataKey="value"
                      name={focusKey ? label(focusKey) : ""}
                      stroke="var(--color-primary, #1d6fe0)"
                      strokeWidth={2.5}
                      dot={false}
                      connectNulls
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <p className="p-5 pb-2 font-semibold">
                {id ? "Performa per post" : "Post performance"}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  · {current?.account_name}
                </span>
              </p>
              {posts.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-foreground">
                  {id ? "Belum ada post di rentang ini." : "No posts in this range."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Post</TableHead>
                        <TableHead className="text-right">{label("views")}</TableHead>
                        <TableHead className="text-right">{label("likes")}</TableHead>
                        <TableHead className="text-right">{label("comments")}</TableHead>
                        <TableHead className="text-right">{label("shares")}</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {posts.slice(0, 20).map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="max-w-xs">
                            <p className="truncate text-sm">{p.text || "—"}</p>
                            <p className="text-xs text-muted-foreground">
                              {p.date
                                ? new Date(p.date).toLocaleDateString(id ? "id-ID" : "en-US")
                                : ""}
                            </p>
                          </TableCell>
                          <TableCell className="text-right">{fmt(p.views)}</TableCell>
                          <TableCell className="text-right">{fmt(p.likes)}</TableCell>
                          <TableCell className="text-right">{fmt(p.comments)}</TableCell>
                          <TableCell className="text-right">{fmt(p.shares)}</TableCell>
                          <TableCell>
                            {p.url && (
                              <a href={p.url} target="_blank" rel="noreferrer" aria-label="Buka">
                                <ExternalLink className="size-4 text-muted-foreground" />
                              </a>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
