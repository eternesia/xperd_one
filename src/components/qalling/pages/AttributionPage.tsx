import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getContentAttribution } from "@/lib/attribution.functions";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

type Row = {
  id: string;
  title: string;
  leads: number;
  won: number;
  lost: number;
  open: number;
  wonValue: number;
  pipelineValue: number;
  winRate: number | null;
};

function Table({ rows, label }: { rows: Row[]; label: string }) {
  const { pick } = useI18n();
  if (!rows.length)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {pick("No leads linked yet.", "Belum ada prospek yang terhubung.")}
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
            <th className="px-3 py-2 text-right">{pick("Win rate", "Rasio closing")}</th>
            <th className="px-3 py-2 text-right">{pick("Won value", "Nilai closing")}</th>
            <th className="px-3 py-2 text-right">{pick("In pipeline", "Di pipeline")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="max-w-xs truncate px-3 py-2 font-medium">{r.title}</td>
              <td className="px-3 py-2 text-right">{r.leads}</td>
              <td className="px-3 py-2 text-right">{r.won}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {r.winRate === null ? "—" : `${r.winRate}%`}
              </td>
              <td className="px-3 py-2 text-right">{idr(r.wonValue)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{idr(r.pipelineValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AttributionPage() {
  const { activeWorkspace } = useApp();
  const { pick } = useI18n();
  const ws = activeWorkspace?.id;
  const [days, setDays] = useState(90);
  const q = useQuery({
    queryKey: ["content-attribution", ws, days],
    enabled: Boolean(ws),
    queryFn: () => getContentAttribution({ data: { workspaceId: ws!, days } }),
  });
  const d = q.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy dark:text-foreground">
            {pick("Content attribution", "Atribusi konten")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {pick(
              "See which posts and campaigns bring in leads and closings. Link a lead to its content source in the lead form.",
              "Lihat postingan dan kampanye mana yang menghasilkan prospek dan closing. Hubungkan prospek ke sumber kontennya di form prospek.",
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
              {pick(`Last ${n} days`, `${n} hari terakhir`)}
            </option>
          ))}
        </select>
      </div>
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {d && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                [pick("Leads in period", "Prospek pada periode"), String(d.totalLeads)],
                [
                  pick("With a content source", "Punya sumber konten"),
                  `${d.attributedLeads}${d.attributionRate === null ? "" : ` (${d.attributionRate}%)`}`,
                ],
                [pick("Unknown source", "Sumber tidak diketahui"), String(d.unattributedLeads)],
              ] as [string, string][]
            ).map(([label, value]) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-bold text-primary">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          {d.totalLeads > 0 && d.attributedLeads === 0 && (
            <p className="rounded-lg border bg-secondary/40 p-4 text-sm text-muted-foreground">
              {pick(
                "No lead has a content source yet. Open Leads, edit a lead and choose its post or campaign under “Content source”.",
                "Belum ada prospek yang punya sumber konten. Buka Prospek, ubah prospek, lalu pilih postingan atau kampanyenya di “Konten sumber”.",
              )}
            </p>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{pick("By post", "Per postingan")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table rows={d.posts} label={pick("Post", "Postingan")} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{pick("By campaign", "Per kampanye")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table rows={d.campaigns} label={pick("Campaign", "Kampanye")} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
