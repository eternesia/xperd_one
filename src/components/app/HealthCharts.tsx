/**
 * Kesehatan Sistem — grafik riwayat metrik (RAM, beban CPU, disk, database, server render).
 * Data dari `system_metrics` (sampel tiap 5 menit, 14 hari).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Clapperboard, Database, Loader2, Server } from "lucide-react";

import { adminHealthHistory } from "@/lib/system-health.functions";
import { cn } from "@/lib/utils";

type Range = "24h" | "7d";
type Point = Awaited<ReturnType<typeof adminHealthHistory>>[number];

const C = {
  mem: "#2563eb",
  cpu: "#f59e0b",
  disk: "#10b981",
  ping: "#8b5cf6",
  conn: "#ec4899",
  size: "#0ea5e9",
  rcpu: "#f97316",
  rmem: "#6366f1",
};

const fmtTime = (iso: string, range: Range) => {
  const d = new Date(iso);
  return range === "24h"
    ? d.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      })
    : d.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
};
const fmtFull = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
const mb = (n: number) =>
  n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : `${(n / 1024 ** 2).toFixed(1)} MB`;

function ChartCard({
  icon: Icon,
  title,
  sub,
  children,
}: {
  icon: typeof Server;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 text-gold" /> {title}
        </h3>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
      <div>{children}</div>
    </section>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} /> {label}
        </span>
      ))}
    </div>
  );
}

const axis = { fontSize: 11, fill: "var(--muted-foreground, #64748b)" };

export function HealthCharts() {
  const [range, setRange] = useState<Range>("24h");
  const q = useQuery({
    queryKey: ["admin-health-history", range],
    queryFn: () => adminHealthHistory({ data: { range } }),
    refetchInterval: 5 * 60_000,
  });
  const data: Point[] = q.data ?? [];
  const last = data[data.length - 1];
  const hasRender = data.some((p) => p.renderCpu != null || p.renderMem != null);
  const tick = (v: string) => fmtTime(v, range);
  const tooltip = {
    labelFormatter: (v: unknown) => fmtFull(String(v)),
    contentStyle: { borderRadius: 12, fontSize: 12 },
  };
  const firstSize = data.find((p) => p.dbSize > 0)?.dbSize ?? 0;
  const growth = last && firstSize ? last.dbSize - firstSize : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Activity className="h-4 w-4 text-gold" /> Riwayat
        </h2>
        <div className="flex rounded-full bg-muted p-1 text-xs">
          {(
            [
              ["24h", "24 jam"],
              ["7d", "7 hari"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setRange(v)}
              className={cn(
                "rounded-full px-3 py-1 font-medium transition",
                range === v ? "bg-background shadow" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : data.length < 2 ? (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Riwayat mulai dikumpulkan tiap 5 menit. Grafik muncul setelah beberapa sampel tersimpan.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            icon={Server}
            title="Server aplikasi"
            sub={last ? `RAM ${last.mem}% · CPU ${last.cpu}% · Disk ${last.disk}%` : undefined}
          >
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={data} margin={{ top: 4, right: 8, left: -6, bottom: 0 }}>
                <defs>
                  {(["mem", "cpu", "disk"] as const).map((k) => (
                    <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C[k]} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={C[k]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.4} />
                <XAxis dataKey="t" tickFormatter={tick} tick={axis} minTickGap={40} />
                <YAxis domain={[0, 100]} unit="%" tick={axis} width={52} />
                <Tooltip {...tooltip} formatter={(v: number, name: string) => [`${v}%`, name]} />
                <Area
                  type="monotone"
                  dataKey="mem"
                  name="RAM"
                  stroke={C.mem}
                  fill="url(#g-mem)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="cpu"
                  name="Beban CPU"
                  stroke={C.cpu}
                  fill="url(#g-cpu)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="disk"
                  name="Disk"
                  stroke={C.disk}
                  fill="url(#g-disk)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
            <Legend
              items={[
                ["RAM", C.mem],
                ["Beban CPU", C.cpu],
                ["Disk", C.disk],
              ]}
            />
          </ChartCard>

          <ChartCard
            icon={Database}
            title="Respons database"
            sub={last ? `${last.ping} ms · ${last.conn} koneksi` : undefined}
          >
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={data} margin={{ top: 4, right: 8, left: -6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.4} />
                <XAxis dataKey="t" tickFormatter={tick} tick={axis} minTickGap={40} />
                <YAxis yAxisId="ms" unit=" ms" tick={axis} width={60} />
                <YAxis
                  yAxisId="c"
                  orientation="right"
                  tick={axis}
                  width={30}
                  allowDecimals={false}
                />
                <Tooltip
                  {...tooltip}
                  formatter={(v: number, name: string) => [
                    name === "Waktu respons" ? `${v} ms` : v,
                    name,
                  ]}
                />
                <Line
                  yAxisId="ms"
                  type="monotone"
                  dataKey="ping"
                  name="Waktu respons"
                  stroke={C.ping}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="c"
                  type="stepAfter"
                  dataKey="conn"
                  name="Koneksi"
                  stroke={C.conn}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
            <Legend
              items={[
                ["Waktu respons (ms)", C.ping],
                ["Koneksi aktif", C.conn],
              ]}
            />
          </ChartCard>

          <ChartCard
            icon={Database}
            title="Ukuran database"
            sub={
              last
                ? `${mb(last.dbSize)}${growth > 0 ? ` · +${mb(growth)} dalam ${range === "24h" ? "24 jam" : "7 hari"}` : ""}`
                : undefined
            }
          >
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="g-size" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.size} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.size} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.4} />
                <XAxis dataKey="t" tickFormatter={tick} tick={axis} minTickGap={40} />
                <YAxis
                  tick={axis}
                  width={64}
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v: number) => mb(v)}
                />
                <Tooltip {...tooltip} formatter={(v: number) => [mb(v), "Ukuran"]} />
                <Area
                  type="monotone"
                  dataKey="dbSize"
                  name="Ukuran"
                  stroke={C.size}
                  fill="url(#g-size)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {hasRender ? (
            <ChartCard
              icon={Clapperboard}
              title="Server render video"
              sub={
                last?.renderCpu != null
                  ? `CPU ${last.renderCpu}% · RAM ${last.renderMem ?? "-"}%`
                  : "tidak melapor saat ini"
              }
            >
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data} margin={{ top: 4, right: 8, left: -6, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.4} />
                  <XAxis dataKey="t" tickFormatter={tick} tick={axis} minTickGap={40} />
                  <YAxis domain={[0, 100]} unit="%" tick={axis} width={52} />
                  <Tooltip {...tooltip} formatter={(v: number, name: string) => [`${v}%`, name]} />
                  <Line
                    type="monotone"
                    dataKey="renderCpu"
                    name="Beban CPU"
                    stroke={C.rcpu}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="renderMem"
                    name="RAM"
                    stroke={C.rmem}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
              <Legend
                items={[
                  ["Beban CPU", C.rcpu],
                  ["RAM", C.rmem],
                ]}
              />
            </ChartCard>
          ) : (
            <ChartCard icon={Server} title="Memori proses aplikasi">
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.4} />
                  <XAxis dataKey="t" tickFormatter={tick} tick={axis} minTickGap={40} />
                  <YAxis tick={axis} width={64} tickFormatter={(v: number) => mb(v)} />
                  <Tooltip {...tooltip} formatter={(v: number) => [mb(v), "RSS"]} />
                  <Line
                    type="monotone"
                    dataKey="rss"
                    name="RSS"
                    stroke={C.mem}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </div>
      )}
    </div>
  );
}
