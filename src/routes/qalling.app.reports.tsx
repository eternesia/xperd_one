import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { countWorkspaceRows, listWorkspaceRows } from "@/lib/data.functions";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { SocialIcon } from "@/components/qalling/SocialIcon";

export const Route = createFileRoute("/qalling/app/reports")({
  head: () => ({
    meta: [
      { title: "Laporan Performa — Qalling" },
      { name: "description", content: "Laporan postingan, komentar dan leads per klien, ekspor PDF atau Excel." },
      { property: "og:title", content: "Laporan Performa — Qalling" },
      { property: "og:description", content: "Laporan postingan, komentar dan leads per klien, ekspor PDF atau Excel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

type Row = { account: string; platform: string; client: string; published: number; scheduled: number; failed: number; comments: number };

function ReportsPage() {
  const { activeWorkspace } = useApp();
  const { pick } = useI18n();
  const ws = activeWorkspace?.id;
  const [days, setDays] = useState(30);
  const [client, setClient] = useState("all");
  const since = useMemo(() => new Date(Date.now() - days * 86400000).toISOString(), [days]);

  const { data, isLoading } = useQuery({
    queryKey: ["qalling-report", ws, since],
    enabled: Boolean(ws),
    queryFn: async () => {
      const list = async (table: string, extra: Record<string, unknown> = {}) =>
        ((await listWorkspaceRows({ data: { table, workspaceId: ws!, limit: 5000, ...extra } }))?.rows ?? []) as Record<string, unknown>[];
      const utc = (v: unknown) => new Date(`${String(v).replace(" ", "T")}Z`).toISOString();
      const [g, a, p, c, l] = await Promise.all([
        list("crm_client_groups", { limit: 500 }),
        list("crm_social_accounts", { limit: 500 }),
        list("crm_scheduled_posts", { orderBy: "scheduled_at", orderDir: "desc" }),
        list("crm_social_comments", { orderBy: "created_at", orderDir: "desc" }),
        countWorkspaceRows({ data: { table: "crm_leads", workspaceId: ws!, ranges: { created_at: { gte: since.replace("T", " ").replace("Z", "") } } } }),
      ]);
      const arr = (v: unknown): string[] => (typeof v === "string" ? JSON.parse(v) : Array.isArray(v) ? (v as string[]) : []);
      return {
        groups: g as { id: string; name: string }[],
        accounts: a as { id: string; platform: string; account_name: string; client_group_id: string | null }[],
        posts: p.filter((x) => utc(x.scheduled_at) >= since).map((x) => ({ status: String(x.status), account_ids: arr(x.account_ids) })),
        comments: c.filter((x) => utc(x.created_at) >= since).map((x) => ({ account_id: String(x.account_id) })),
        leads: l.count,
      };
    },
  });

  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    const gname = new Map(data.groups.map((g) => [g.id, g.name]));
    return data.accounts
      .filter((a) => client === "all" || a.client_group_id === client)
      .map((a) => {
        const mine = data.posts.filter((p) => (p.account_ids ?? []).includes(a.id));
        return {
          account: a.account_name,
          platform: a.platform,
          client: (a.client_group_id && gname.get(a.client_group_id)) || "—",
          published: mine.filter((p) => p.status === "published").length,
          scheduled: mine.filter((p) => p.status === "scheduled").length,
          failed: mine.filter((p) => p.status === "failed").length,
          comments: data.comments.filter((c) => c.account_id === a.id).length,
        };
      });
  }, [data, client]);

  const totals = rows.reduce((t, r) => ({ published: t.published + r.published, scheduled: t.scheduled + r.scheduled, failed: t.failed + r.failed, comments: t.comments + r.comments }), { published: 0, scheduled: 0, failed: 0, comments: 0 });
  const clientName = client === "all" ? pick("All clients", "Semua klien") : data?.groups.find((g) => g.id === client)?.name ?? "";
  const headers = [pick("Client", "Klien"), pick("Account", "Akun"), "Platform", pick("Published", "Terbit"), pick("Scheduled", "Terjadwal"), pick("Failed", "Gagal"), pick("Comments", "Komentar")];
  const body = rows.map((r) => [r.client, r.account, r.platform, r.published, r.scheduled, r.failed, r.comments]);
  const fileBase = `laporan-qalling-${new Date().toISOString().slice(0, 10)}`;

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.aoa_to_sheet([[`${pick("Report", "Laporan")} ${clientName} — ${days} ${pick("days", "hari")}`], [], headers, ...body]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Laporan");
    XLSX.writeFile(wb, `${fileBase}.xlsx`);
  }
  async function exportPdf() {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`${pick("Performance report", "Laporan Performa")} — ${clientName}`, 14, 16);
    doc.setFontSize(10);
    doc.text(`${activeWorkspace?.name ?? ""} · ${days} ${pick("days", "hari terakhir")} · ${pick("New leads", "Leads baru")}: ${data?.leads ?? 0}`, 14, 23);
    autoTable(doc, { startY: 28, head: [headers], body, foot: [["", pick("Total", "Total"), "", totals.published, totals.scheduled, totals.failed, totals.comments]] });
    doc.save(`${fileBase}.pdf`);
  }

  const kpis: [string, number][] = [
    [pick("Published", "Terbit"), totals.published],
    [pick("Scheduled", "Terjadwal"), totals.scheduled],
    [pick("Comments", "Komentar"), totals.comments],
    [pick("New leads", "Leads baru"), data?.leads ?? 0],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{pick("Reports", "Laporan")}</h1>
          <p className="text-sm text-muted-foreground">{pick("Per-client performance, ready to send.", "Performa per klien, siap dikirim.")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={client} onChange={(e) => setClient(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Klien">
            <option value="all">{pick("All clients", "Semua klien")}</option>
            {(data?.groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Periode">
            {[7, 30, 90].map((d) => <option key={d} value={d}>{d} {pick("days", "hari")}</option>)}
          </select>
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => void exportExcel()}><FileSpreadsheet />Excel</Button>
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => void exportPdf()}><FileDown />PDF</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map(([l, v]) => (
          <Card key={l}><CardContent className="pt-5"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-semibold">{v}</p></CardContent></Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">{pick("Per account", "Per akun")}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>{headers.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7}>…</TableCell></TableRow>}
              {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">{pick("No data.", "Belum ada data.")}</TableCell></TableRow>}
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.client}</TableCell>
                  <TableCell><span className="flex items-center gap-2"><SocialIcon platform={r.platform} className="h-4 w-4" />{r.account}</span></TableCell>
                  <TableCell className="capitalize">{r.platform}</TableCell>
                  <TableCell>{r.published}</TableCell>
                  <TableCell>{r.scheduled}</TableCell>
                  <TableCell>{r.failed}</TableCell>
                  <TableCell>{r.comments}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
