/** Super Admin → Studio AI → Ringkasan: grafik penjualan, kredit, video + ringkasan pengguna. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Coins,
  Loader2,
  ShoppingCart,
  Users,
  Wallet,
} from "lucide-react";

import { adminStudioDashboard } from "@/lib/ai-studio.functions";
import { TEMPLATES } from "@/lib/ai-templates";
import { cn } from "@/lib/utils";

const rp = (v: number) => `Rp${Math.round(v).toLocaleString("id-ID")}`;
const num = (v: number) => v.toLocaleString("id-ID");
const shortRp = (v: number) =>
  v >= 1e6 ? `${(v / 1e6).toFixed(1)} jt` : v >= 1e3 ? `${Math.round(v / 1e3)} rb` : String(v);
const day = (s: string) =>
  new Date(`${s}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
const tplName = (k: string) =>
  TEMPLATES.find((t) => t.key === k)?.name ??
  (k.startsWith("ai:") ? `Video AI (${k.slice(3)})` : k);
const axis = { fontSize: 11, fill: "var(--muted-foreground, #64748b)" };
const tip = { contentStyle: { borderRadius: 12, fontSize: 12 } };

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="min-w-0 rounded-2xl border bg-card p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate text-xl font-semibold tabular-nums",
          tone === "good" && "text-emerald-600",
          tone === "bad" && "text-rose-600",
        )}
      >
        {value}
      </p>
      {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export function StudioAdminDashboard() {
  const [days, setDays] = useState(30);
  const q = useQuery({
    queryKey: ["admin-studio-dashboard", days],
    queryFn: () => adminStudioDashboard({ data: { days } }),
  });
  const d = q.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Kinerja Studio</h2>
        <div className="flex rounded-full bg-muted p-1 text-xs">
          {[7, 30, 90].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setDays(v)}
              className={cn(
                "rounded-full px-3 py-1 font-medium",
                days === v ? "bg-background shadow" : "text-muted-foreground",
              )}
            >
              {v} hari
            </button>
          ))}
        </div>
      </div>
      {q.isLoading || !d ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={ShoppingCart}
              label="Penjualan kredit"
              value={rp(d.totals.sales_idr)}
              sub={`${num(d.totals.credits_sold)} kredit · ${d.totals.buyers} pembeli`}
            />
            <Kpi
              icon={Coins}
              label="Kredit terpakai"
              value={num(d.totals.credits_used)}
              sub={`bonus diberikan ${num(d.totals.bonus)}`}
            />
            <Kpi
              icon={Wallet}
              label="Kredit di saldo pengguna"
              value={num(d.totals.outstanding)}
              sub={`${d.totals.holders} tenant punya saldo`}
            />
            <Kpi
              icon={Users}
              label="Tenant aktif membuat video"
              value={num(d.totals.active_tenants)}
              sub={`${d.days} hari terakhir`}
            />
            <Kpi
              icon={CheckCircle2}
              label="Video berhasil"
              value={num(d.totals.done)}
              tone="good"
              sub={
                d.totals.success_rate == null
                  ? undefined
                  : `tingkat berhasil ${d.totals.success_rate}%`
              }
            />
            <Kpi
              icon={AlertTriangle}
              label="Video gagal"
              value={num(d.totals.failed)}
              tone={d.totals.failed ? "bad" : undefined}
              sub="kredit otomatis dikembalikan"
            />
            <Kpi
              icon={Clock}
              label="Rata-rata render"
              value={d.totals.avg_render_s == null ? "-" : `${d.totals.avg_render_s} dtk`}
              sub={
                d.totals.avg_wait_s == null
                  ? undefined
                  : `menunggu antrean ±${d.totals.avg_wait_s} dtk`
              }
            />
            <Kpi
              icon={Loader2}
              label="Sedang diproses"
              value={num(d.totals.running)}
              sub="antre + render sekarang"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Penjualan kredit per hari">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={d.series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g-sales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.4} />
                  <XAxis dataKey="day" tickFormatter={day} tick={axis} minTickGap={24} />
                  <YAxis tickFormatter={shortRp} tick={axis} width={52} />
                  <Tooltip
                    {...tip}
                    labelFormatter={(v) => day(String(v))}
                    formatter={(v: number) => [rp(v), "Penjualan"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="sales_idr"
                    stroke="#7c3aed"
                    fill="url(#g-sales)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Kredit: terjual, bonus, terpakai">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={d.series} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.4} />
                  <XAxis dataKey="day" tickFormatter={day} tick={axis} minTickGap={24} />
                  <YAxis tick={axis} allowDecimals={false} />
                  <Tooltip {...tip} labelFormatter={(v) => day(String(v))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="credits_sold" name="Terjual" fill="#7c3aed" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="bonus" name="Bonus" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  <Bar
                    dataKey="credits_used"
                    name="Terpakai"
                    fill="#0ea5e9"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Video per hari">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={d.series} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.4} />
                  <XAxis dataKey="day" tickFormatter={day} tick={axis} minTickGap={24} />
                  <YAxis tick={axis} allowDecimals={false} />
                  <Tooltip {...tip} labelFormatter={(v) => day(String(v))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="done" name="Berhasil" stackId="v" fill="#10b981" />
                  <Bar
                    dataKey="failed"
                    name="Gagal"
                    stackId="v"
                    fill="#f43f5e"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Per template / tingkat">
              {d.byTemplate.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={d.byTemplate.map((r) => ({ ...r, name: tplName(r.key) }))}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.4} />
                    <XAxis type="number" tick={axis} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={axis} width={120} />
                    <Tooltip {...tip} />
                    <Bar dataKey="done" name="Berhasil" stackId="t" fill="#10b981" />
                    <Bar
                      dataKey="failed"
                      name="Gagal"
                      stackId="t"
                      fill="#f43f5e"
                      radius={[0, 3, 3, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">Belum ada video.</p>
              )}
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Pengguna kredit terbanyak">
              {d.top.length ? (
                <ul className="divide-y text-sm">
                  {d.top.map((t, i) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0 truncate">
                        <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                        {t.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {t.videos} video · {t.credits} kredit
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Belum ada.</p>
              )}
            </ChartCard>
            <ChartCard title="Penyebab gagal teratas">
              {d.errors.length ? (
                <ul className="divide-y text-sm">
                  {d.errors.map((e) => (
                    <li key={e.error} className="flex items-start justify-between gap-2 py-2">
                      <span className="min-w-0 break-words text-muted-foreground">{e.error}</span>
                      <span className="shrink-0 tabular-nums">{e.count}×</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Tidak ada video gagal. 🎉</p>
              )}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
