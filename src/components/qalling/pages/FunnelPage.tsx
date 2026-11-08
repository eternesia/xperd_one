import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFunnelReport } from "@/lib/funnel.functions";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { CRM_STAGES } from "@/lib/crm";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

type G = {
  name: string;
  leads: number;
  won: number;
  lost: number;
  wonValue: number;
  winRate: number | null;
};

function Group({ rows, label }: { rows: G[]; label: string }) {
  const { pick } = useI18n();
  if (!rows.length)
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        {pick("No data yet.", "Belum ada data.")}
      </p>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-left">
          <tr>
            <th className="px-3 py-2">{label}</th>
            <th className="px-3 py-2 text-right">{pick("Leads", "Prospek")}</th>
            <th className="px-3 py-2 text-right">{pick("Won", "Closing")}</th>
            <th className="px-3 py-2 text-right">{pick("Lost", "Batal")}</th>
            <th className="px-3 py-2 text-right">{pick("Win rate", "Rasio")}</th>
            <th className="px-3 py-2 text-right">{pick("Won value", "Nilai closing")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t">
              <td className="px-3 py-2 font-medium">{r.name}</td>
              <td className="px-3 py-2 text-right">{r.leads}</td>
              <td className="px-3 py-2 text-right">{r.won}</td>
              <td className="px-3 py-2 text-right">{r.lost}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {r.winRate === null ? "—" : `${r.winRate}%`}
              </td>
              <td className="px-3 py-2 text-right">{idr(r.wonValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FunnelPage() {
  const { activeWorkspace } = useApp();
  const { pick, lang } = useI18n();
  const ws = activeWorkspace?.id;
  const [days, setDays] = useState(90);
  const q = useQuery({
    queryKey: ["funnel-report", ws, days],
    enabled: Boolean(ws),
    queryFn: () => getFunnelReport({ data: { workspaceId: ws!, days } }),
  });
  const d = q.data;
  const stageName = (id: string) => {
    const s = CRM_STAGES.find((x) => x.id === id);
    return s ? (lang === "id" ? s.id_ : s.en) : id;
  };
  const max = Math.max(1, ...(d?.stages.map((s) => s.reached) ?? [1]));
  const tiles: [string, string][] = d
    ? [
        [pick("Leads", "Prospek"), String(d.totals.leads)],
        [pick("Won", "Closing"), `${d.totals.won} · ${d.totals.winRate ?? 0}%`],
        [pick("Won value", "Nilai closing"), idr(d.totals.wonValue)],
        [
          pick("Avg days to close", "Rata-rata hari closing"),
          d.totals.avgDaysToClose === null ? "—" : String(d.totals.avgDaysToClose),
        ],
        [pick("Weighted forecast", "Forecast tertimbang"), idr(d.forecast.weighted)],
      ]
    : [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy dark:text-foreground">
            {pick("Sales funnel", "Funnel penjualan")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {pick(
              "Conversion per stage, lost reasons, performance by source and owner, forecast, and target realization.",
              "Konversi tiap tahap, alasan batal, performa per sumber dan penanggung jawab, forecast, serta realisasi target.",
            )}
          </p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="h-9 rounded-md border bg-background px-3 text-sm"
          aria-label={pick("Period", "Periode")}
        >
          {[30, 90, 180, 365].map((n) => (
            <option key={n} value={n}>
              {pick(`Leads created in the last ${n} days`, `Prospek masuk ${n} hari terakhir`)}
            </option>
          ))}
        </select>
      </div>
      {q.isLoading && (
        <p className="text-sm text-muted-foreground">{pick("Loading…", "Memuat…")}</p>
      )}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {d && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {tiles.map(([k, v]) => (
              <Card key={k}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{k}</p>
                  <p className="mt-1 text-lg font-bold">{v}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{pick("Stages", "Tahapan")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {d.stages.map((s, i) => (
                <div
                  key={s.id}
                  className="grid grid-cols-[88px_1fr_auto] items-center gap-2 text-sm sm:grid-cols-[130px_1fr_150px] sm:gap-3"
                >
                  <span>{stageName(s.id)}</span>
                  <div className="h-6 rounded bg-secondary/60">
                    <div
                      className="h-6 rounded bg-primary/80"
                      style={{ width: `${Math.max(2, (s.reached / max) * 100)}%` }}
                    />
                  </div>
                  <span className="text-right">
                    <b>{s.reached}</b>
                    {s.fromPrevPct !== null && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {s.fromPrevPct}%{" "}
                        {i === 0 ? pick("of all", "dari semua") : pick("of prev.", "dari sblm.")}
                      </span>
                    )}
                  </span>
                </div>
              ))}
              <p className="pt-1 text-xs text-muted-foreground">
                {pick(
                  "Counts leads currently at or beyond each stage. Lost leads are shown separately because their furthest stage is not recorded.",
                  "Menghitung prospek yang saat ini berada di tahap tersebut atau lebih jauh. Prospek batal ditampilkan terpisah karena tahap terjauhnya tidak tercatat.",
                )}
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {pick("Lost reasons", "Alasan batal")} ({d.totals.lost})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {d.lostReasons.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {pick(
                      "No lost leads in this period.",
                      "Tidak ada prospek batal pada periode ini.",
                    )}
                  </p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {d.lostReasons.map((r, i) => (
                      <li key={i} className="flex justify-between gap-3 border-b py-1">
                        <span className="truncate">
                          {r.reason ?? pick("(no reason recorded)", "(tanpa alasan)")}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {r.count} · {idr(r.value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {pick("Forecast (open pipeline)", "Forecast (pipeline terbuka)")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <tbody>
                    {d.forecast.byStage.map((s) => (
                      <tr key={s.id} className="border-b">
                        <td className="py-1">{stageName(s.id)}</td>
                        <td className="text-right text-muted-foreground">{s.count}</td>
                        <td className="text-right">{idr(s.value)}</td>
                        <td className="text-right font-medium">{idr(s.weighted)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="pt-2">Total</td>
                      <td />
                      <td className="pt-2 text-right">{idr(d.forecast.pipeline)}</td>
                      <td className="pt-2 text-right">{idr(d.forecast.weighted)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-muted-foreground">
                  {pick(
                    "Columns: stage, leads, value, value × probability.",
                    "Kolom: tahap, prospek, nilai, nilai × peluang.",
                  )}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {pick("Target realization", "Realisasi target")} · {d.month.period}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {d.month.targets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {pick(
                    "No targets or closings this month.",
                    "Belum ada target atau closing bulan ini.",
                  )}
                </p>
              ) : (
                d.month.targets.map((t) => (
                  <div key={t.owner ?? "—"} className="text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">
                        {t.owner ?? pick("Unassigned", "Tanpa penanggung jawab")}
                      </span>
                      <span>
                        {idr(t.won)} / {idr(t.target)}
                        {t.pct !== null ? ` · ${t.pct}%` : ""}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded bg-secondary/60">
                      <div
                        className="h-2 rounded bg-primary"
                        style={{ width: `${Math.min(100, t.pct ?? 0)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
              <div className="grid gap-2 border-t pt-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {pick("Collected this month", "Tertagih bulan ini")}
                  </p>
                  <p className="font-semibold">{idr(d.month.invoices.paid)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {pick("Outstanding invoices", "Invoice belum dibayar")}
                  </p>
                  <p className="font-semibold">{idr(d.month.invoices.outstanding)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {pick("Overdue", "Lewat jatuh tempo")}
                  </p>
                  <p className="font-semibold text-destructive">{idr(d.month.invoices.overdue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{pick("By source", "Per sumber")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Group rows={d.bySource} label={pick("Source", "Sumber")} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {pick("By owner", "Per penanggung jawab")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Group rows={d.byOwner} label={pick("Owner", "Penanggung jawab")} />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
