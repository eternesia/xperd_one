import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaginationBar, usePagination, searchRows } from "./ui-states";
import { TableSearch } from "./ProductionPagedTable";
import { AdminField, AdminSelect } from "./admin-ui";
import { getProductionAccounting, retryProductionJournals, reverseProductionJournals, saveProductionMapping } from "@/lib/production-orders.functions";

const KEYS = [
  ["rm_inventory", "Persediaan bahan baku"],
  ["wip_material", "WIP material"],
  ["wip_conversion", "WIP konversi"],
  ["fg_inventory", "Persediaan barang jadi"],
  ["labor_applied", "Tenaga kerja dibebankan"],
  ["overhead_applied", "Overhead dibebankan"],
  ["other_applied", "Biaya lain dibebankan"],
  ["production_variance", "Selisih produksi"],
  ["scrap_loss", "Rugi scrap/kedaluwarsa"],
] as const;
const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
type Tab = "costs" | "journals" | "mapping";

function DataTable({ head, children, pager }: { head: string[]; children: ReactNode; pager: Parameters<typeof PaginationBar>[0]["p"] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>{head.map((h, i) => <TableHead key={h} className={i > 0 && h !== "Status" && h !== "Event" && h !== "Catatan" ? "text-right" : undefined}>{h}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>{children}</TableBody>
        </Table>
      </div>
      <PaginationBar p={pager} />
    </div>
  );
}

export function ProductionAccountingView({ workspaceId }: { workspaceId: string }) {
  const get = useServerFn(getProductionAccounting);
  const save = useServerFn(saveProductionMapping);
  const retry = useServerFn(retryProductionJournals);
  const reverse = useServerFn(reverseProductionJournals);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["production-accounting", workspaceId], queryFn: () => get({ data: { workspaceId } }) });
  const [tab, setTab] = useState<Tab>("costs");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sc, setSc] = useState("");
  const [se, setSe] = useState("");
  const pc = usePagination(searchRows(q.data?.costs ?? [], sc), 10);
  const pe = usePagination(searchRows(q.data?.events ?? [], se), 25);
  async function run(reason: string, fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["production-accounting", workspaceId] });
      toast.success("Tersimpan");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Ditolak (${reason})`);
    } finally {
      setBusy(false);
    }
  }
  if (q.isPending) return <Loader2 className="m-8 animate-spin text-muted-foreground" />;
  if (q.isError) return <p className="py-12 text-muted-foreground">{q.error.message}</p>;
  const d = q.data;
  const orderNo = (id: string) => d.orders.find((o) => o.id === id)?.order_no ?? id.slice(0, 8);
  const blockedOrders = [...new Set(d.events.filter((e) => e.status.startsWith("blocked")).map((e) => e.order_id))];
  const postedOrders = [...new Set(d.events.filter((e) => e.status === "posted" && !e.event_code.startsWith("R-")).map((e) => e.order_id))];
  const r = d.reconciliation;
  const mismatch = r.mapped && (Math.abs(r.wip_difference) > 0.5 || Math.abs(r.inventory_difference) > 0.5);
  const tabs: [Tab, string][] = [["costs", "Biaya per order"], ["journals", `Jurnal${blockedOrders.length ? ` (${blockedOrders.length} tertahan)` : ""}`], ["mapping", "Pemetaan akun"]];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Biaya Produksi & Jurnal</h1>
        <p className="text-sm text-muted-foreground">Biaya dihitung saat order ditutup: bahan + tenaga kerja + overhead, dibagi hasil jadi.</p>
      </div>

      {!r.mapped ? (
        <p className="rounded-xl border border-destructive p-3 text-sm text-destructive">Pemetaan akun persediaan belum lengkap — lengkapi di tab Pemetaan akun.</p>
      ) : mismatch ? (
        <p className="rounded-xl border border-destructive p-3 text-sm text-destructive">
          Ada selisih pembukuan — WIP: {rp(r.wip_difference)} · Persediaan: {rp(r.inventory_difference)}. Cek tab Jurnal.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {tabs.map(([k, l]) => <Button key={k} variant={tab === k ? "default" : "outline"} onClick={() => setTab(k)}>{l}</Button>)}
      </div>

      {tab === "costs" && (
        <section className="space-y-3">
          <TableSearch value={sc} onChange={setSc} />
          <DataTable head={["Order", "Bahan", "Tenaga kerja", "Overhead", "Total", "Biaya / unit", "Selisih vs standar"]} pager={pc}>
            {pc.items.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{orderNo(c.order_id)}</TableCell>
                <TableCell className="text-right">{rp(c.material_cost)}</TableCell>
                <TableCell className="text-right">{rp(c.labor_cost)}</TableCell>
                <TableCell className="text-right">{rp(c.overhead_cost)}</TableCell>
                <TableCell className="text-right font-medium">{rp(c.total_cost)}</TableCell>
                <TableCell className="text-right">{rp(c.unit_cost)}</TableCell>
                <TableCell className={`text-right ${c.variance > 0 ? "text-destructive" : ""}`}>{rp(c.variance)}</TableCell>
              </TableRow>
            ))}
            {!d.costs.length && <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Belum ada biaya. Biaya muncul setelah order produksi ditutup.</TableCell></TableRow>}
          </DataTable>
        </section>
      )}

      {tab === "journals" && (
        <section className="space-y-3">
          {d.canWrite && (blockedOrders.length > 0 || postedOrders.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {blockedOrders.map((o) => (
                <Button key={o} size="sm" variant="outline" disabled={busy} onClick={() => run("Posting ulang", async () => { await retry({ data: { workspaceId, orderId: o, reason: "Posting ulang jurnal produksi" } }); })}>
                  Posting ulang {orderNo(o)}
                </Button>
              ))}
              {postedOrders.map((o) => (
                <Button key={`r${o}`} size="sm" variant="ghost" disabled={busy} onClick={() => run("Balik jurnal", async () => { if (!confirm(`Balik semua jurnal ${orderNo(o)}?`)) return; await reverse({ data: { workspaceId, orderId: o, reason: "Pembalikan jurnal produksi" } }); })}>
                  Balik jurnal {orderNo(o)}
                </Button>
              ))}
            </div>
          )}
          <TableSearch value={se} onChange={setSe} />
          <DataTable head={["Order", "Event", "Jumlah", "Status", "Catatan"]} pager={pe}>
            {pe.items.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{orderNo(e.order_id)}</TableCell>
                <TableCell>{e.event_code}</TableCell>
                <TableCell className="text-right">{rp(e.amount)}</TableCell>
                <TableCell><Badge variant={e.status === "posted" ? "default" : e.status.startsWith("blocked") ? "destructive" : "secondary"}>{e.status}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{e.message}</TableCell>
              </TableRow>
            ))}
            {!d.events.length && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Belum ada jurnal produksi.</TableCell></TableRow>}
          </DataTable>
        </section>
      )}

      {tab === "mapping" && (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Akun yang dipakai saat jurnal produksi dibuat. Biasanya cukup diatur sekali.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {KEYS.map(([k, label]) => {
              const current = d.mappings.find((m) => m.mapping_key === k)?.account_code ?? "";
              return (
                <div key={k} className="flex items-end gap-2">
                  <AdminField label={label}>
                    <AdminSelect value={draft[k] ?? current} onChange={(v) => setDraft({ ...draft, [k]: v })}>
                      <option value="">Pilih akun</option>
                      {d.accounts.map((a) => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
                    </AdminSelect>
                  </AdminField>
                  <Button variant="outline" disabled={!d.canWrite || busy || !(draft[k] && draft[k] !== current)} onClick={() => run("Pemetaan", async () => { await save({ data: { workspaceId, mappingKey: k, account: draft[k] as string, reason: `Ubah pemetaan akun ${label}` } }); })}>
                    Simpan
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
