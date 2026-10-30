import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Eye, Users, Calendar, Smartphone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
  TableHeader,
} from "@/components/ui/table";
import { TablePager, TableSearch, usePaged } from "@/components/app/admin-table";
import { getVisitorDashboard } from "@/lib/visitor-dashboard.functions";

export const Route = createFileRoute("/app-admin/visitors")({
  head: () => ({
    meta: [
      { title: "Pengunjung Website — XPERD Super Admin" },
      { name: "description", content: "Statistik kunjungan website XPERD dan Qalling." },
      { property: "og:title", content: "Pengunjung Website — XPERD" },
      { property: "og:description", content: "Ringkasan kunjungan website XPERD dan Qalling." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Visitors,
});
function Visitors() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [site, setSite] = useState<"all" | "xperd" | "qalling">("all");
  const load = useServerFn(getVisitorDashboard);
  const stats = useQuery({
    queryKey: ["admin-visitors", site, days],
    queryFn: () => load({ data: { days, site } }),
  });
  const pages = usePaged(stats.data?.pages ?? [], (r) => r.name);
  return (
    <div className="space-y-6 min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">XPERD / QALLING</p>
          <h1 className="text-2xl font-medium">Pengunjung Website</h1>
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Segarkan statistik"
          onClick={() => stats.refetch()}
        >
          <RefreshCw className="size-4" />
        </Button>
      </header>
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex gap-1">
          {(["all", "xperd", "qalling"] as const).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={site === v ? "secondary" : "ghost"}
              onClick={() => setSite(v)}
            >
              {v === "all" ? "Semua website" : v.toUpperCase()}
            </Button>
          ))}
        </div>
        <div className="flex gap-1">
          {([7, 30, 90] as const).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={days === v ? "secondary" : "ghost"}
              onClick={() => setDays(v)}
            >
              {v} hari
            </Button>
          ))}
        </div>
      </div>
      {stats.error && <p className="text-destructive">{stats.error.message}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Kunjungan halaman", value: stats.data?.views, icon: Eye },
          { label: "Sesi pengunjung", value: stats.data?.sessions, icon: Users },
          { label: "Kunjungan hari ini", value: stats.data?.today, icon: Calendar },
          { label: "Kunjungan mobile", value: stats.data?.mobile, icon: Smartphone },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="p-5">
              <m.icon className="mb-4 size-5 text-primary" />
              <p className="text-sm text-muted-foreground">{m.label}</p>
              <p className="mt-1 text-3xl font-medium">
                {stats.isLoading ? "…" : (m.value ?? 0).toLocaleString("id-ID")}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <section className="border-t pt-5">
        <h2 className="mb-5 font-medium">Tren kunjungan</h2>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.data?.trend ?? []}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "var(--muted-foreground)" }} minTickGap={28} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)" }} />
              <Tooltip
                contentStyle={{
                  background: "var(--background)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              />
              <Area
                dataKey="views"
                name="Kunjungan"
                stroke="var(--primary)"
                fill="var(--primary)"
                fillOpacity={0.12}
              />
              <Area dataKey="sessions" name="Sesi" stroke="var(--gold)" fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <section className="min-w-0">
          <h2 className="mb-3 font-medium">Halaman terpopuler</h2>
          <TableSearch value={pages.query} onChange={pages.setQuery} placeholder="Cari halaman…" />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Halaman</TableHead>
                <TableHead className="text-right">Kunjungan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="break-all">{r.name}</TableCell>
                  <TableCell className="text-right">{r.count}</TableCell>
                </TableRow>
              ))}
              {pages.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                    Belum ada kunjungan.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <TablePager {...pages} />
        </section>
        <section>
          <h2 className="mb-3 font-medium">Sumber kunjungan</h2>
          {stats.data?.sources.slice(0, 10).map((r) => (
            <div key={r.name} className="flex justify-between gap-3 border-b py-3 text-sm">
              <span className="break-all">{r.name}</span>
              <span>{r.count}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
