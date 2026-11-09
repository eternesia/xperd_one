import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Save, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminField, AdminSelect } from "./admin-ui";
import { ItemSearchAdd } from "./ItemSearchAdd";
import { ProductionPageShell, useProductionDocNav } from "./ProductionPageShell";
import { ProductionOrderExecution } from "./ProductionOrderExecution";
import { ORDER_STAGE } from "./ProductionOrdersView";
import { getBomLines } from "@/lib/production-bom.functions";
import { getProductionOrderDetail, getProductionOrders, saveProductionOrder, transitionProductionOrder } from "@/lib/production-orders.functions";

type Equip = { center_id: string | null; name: string; note: string };
type F = {
  source_type: "bom" | "qc";
  source_level: 1 | 2;
  item_id: string;
  bom_version_id: string;
  qc_spec_id: string | null;
  planned_qty: number;
  planned_start: string;
  planned_end: string;
  warehouse_from: string;
  warehouse_to: string;
  location_from: string;
  location_to: string;
  notes: string;
  equipment: Equip[];
};

/** Halaman Planning / Production Order. docId: "new" atau id order. */
export function ProductionOrderForm({ workspaceId, docId }: { workspaceId: string; docId: string }) {
  const go = useProductionDocNav(workspaceId, "orders");
  const qc = useQueryClient();
  const list = useServerFn(getProductionOrders);
  const detail = useServerFn(getProductionOrderDetail);
  const save = useServerFn(saveProductionOrder);
  const transition = useServerFn(transitionProductionOrder);
  const readLines = useServerFn(getBomLines);
  const isNew = docId === "new";

  const lq = useQuery({ queryKey: ["production-orders", workspaceId, ""], queryFn: () => list({ data: { workspaceId, status: "" } }) });
  const dq = useQuery({ queryKey: ["production-order", workspaceId, docId], enabled: !isNew, queryFn: () => detail({ data: { workspaceId, orderId: docId } }) });
  const [f, setF] = useState<F | null>(null);
  const [tab, setTab] = useState("umum");
  const [busy, setBusy] = useState(false);
  // Pilihan sumber per tab (BOM L1 / BOM L2 / QC) diingat, agar berpindah tab tidak menghapus BOM yang sudah dicari.
  const [memo, setMemo] = useState<Record<string, Pick<F, "item_id" | "bom_version_id" | "qc_spec_id" | "planned_qty">>>({});

  const d = lq.data;
  const order = dq.data?.order ?? null;
  useEffect(() => {
    if (!d || f) return;
    if (isNew) {
      setF({ source_type: "bom", source_level: 1, item_id: "", bom_version_id: "", qc_spec_id: null, planned_qty: 0, planned_start: "", planned_end: "",
        warehouse_from: d.warehouses[0]?.code ?? "", warehouse_to: d.warehouses[0]?.code ?? "", location_from: "", location_to: "", notes: "", equipment: [] });
    } else if (order) {
      const lvl = Number(d.boms.find((b) => d.versions.find((v) => v.id === order.bom_version_id)?.bom_id === b.id)?.bom_level ?? 1);
      setF({ source_type: order.source_type === "qc" ? "qc" : "bom", source_level: lvl === 2 ? 2 : 1, item_id: order.item_id, bom_version_id: order.bom_version_id,
        qc_spec_id: order.qc_spec_id ?? null, planned_qty: order.planned_qty, planned_start: order.planned_start ?? "", planned_end: order.planned_end ?? "",
        warehouse_from: order.warehouse_from, warehouse_to: order.warehouse_to, location_from: order.location_from ?? "", location_to: order.location_to ?? "",
        notes: order.notes ?? "", equipment: order.equipment ?? [] });
      if (!["draft", "planned"].includes(order.status)) setTab("eksekusi");
    }
  }, [d, order, f, isNew]);

  const version = d?.versions.find((v) => v.id === f?.bom_version_id);
  const linesQ = useQuery({
    queryKey: ["order-bom-lines", workspaceId, f?.bom_version_id],
    enabled: !!f?.bom_version_id,
    retry: false,
    queryFn: () => readLines({ data: { workspaceId, versionId: f!.bom_version_id } }),
  });
  const items = useMemo(() => new Map((d?.items ?? []).map((i) => [i.id, i])), [d?.items]);

  if (lq.isPending || (!isNew && dq.isPending) || !f || !d) {
    if (lq.isError) return <p className="py-12 text-muted-foreground">{lq.error.message}</p>;
    return <Loader2 className="m-8 animate-spin text-muted-foreground" />;
  }
  const status = order?.status ?? "draft";
  const editable = d.canWrite && ["draft", "planned"].includes(status);
  const set = (p: Partial<F>) => setF({ ...f, ...p });
  const versionsOfItem = (itemId: string) => d.versions.filter((v) => d.boms.find((b) => b.id === v.bom_id)?.item_id === itemId);
  const bomOf = (bomId: string) => d.boms.find((b) => b.id === bomId);
  const bomOptions = d.versions
    .filter((v) => Number(bomOf(v.bom_id)?.bom_level ?? 1) === f.source_level)
    .map((v) => ({ id: v.id, code: `${bomOf(v.bom_id)?.code} v${v.version_no}`, name: items.get(bomOf(v.bom_id)?.item_id ?? "")?.name ?? "", hint: `batch ${v.base_batch_qty} ${v.base_uom}` }));
  const specOptions = d.specs.map((s) => ({ id: s.id, code: s.code, name: `${items.get(s.item_id)?.code ?? ""} · ${s.name}`, hint: s.stage }));
  const specsOfItem = d.specs.filter((s) => s.item_id === f.item_id);
  const scale = version && version.base_batch_qty > 0 ? f.planned_qty / version.base_batch_qty : 0;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "Ditolak"); } finally { setBusy(false); }
  }
  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["production-orders", workspaceId] });
    await qc.invalidateQueries({ queryKey: ["production-order", workspaceId] });
  }
  async function saveDraft(): Promise<string> {
    const g = f!;
    if (!g.item_id || !g.bom_version_id) throw new Error("Pilih sumber (BOM atau QC) yang sudah approved.");
    if (!(g.planned_qty > 0)) throw new Error("Isi kuantitas rencana.");
    const r = await save({
      data: {
        workspaceId, id: isNew ? null : docId,
        values: { item_id: g.item_id, bom_version_id: g.bom_version_id, planned_qty: g.planned_qty, planned_start: g.planned_start, planned_end: g.planned_end,
          warehouse_from: g.warehouse_from, warehouse_to: g.warehouse_to, notes: g.notes, location_from: g.location_from || null, location_to: g.location_to || null,
          source_type: g.source_type, qc_spec_id: g.qc_spec_id, equipment: g.equipment },
        reason: isNew ? "Planning baru" : "Ubah planning",
      },
    });
    await refresh();
    return r.id;
  }
  async function approve() {
    const id = await saveDraft();
    const cur = isNew ? "draft" : status;
    if (cur === "draft") await transition({ data: { workspaceId, orderId: id, status: "planned", key: crypto.randomUUID(), reason: "Approve planning" } });
    try {
      await transition({ data: { workspaceId, orderId: id, status: "released", key: crypto.randomUUID(), reason: "Approve planning" } });
      toast.success("Planning di-approve — material dihitung dan order siap diproduksi");
    } catch (e) {
      toast.error(`Planning tersimpan sebagai Approved, tetapi penyiapan material gagal: ${e instanceof Error ? e.message : "ditolak"}. Perbaiki lalu tekan Approve lagi.`);
    }
    await refresh();
    if (isNew) void go(id);
  }

  const actions = editable ? (
    <>
      <Button variant="outline" disabled={busy} onClick={() => void run(async () => { const id = await saveDraft(); toast.success("Draft tersimpan"); if (isNew) void go(id); })}><Save className="size-4" />Simpan draft</Button>
      <Button disabled={busy} onClick={() => void run(approve)}><CheckCircle2 className="size-4" />Approve</Button>
      {!isNew && <Button variant="ghost" disabled={busy} onClick={() => void run(async () => { await transition({ data: { workspaceId, orderId: docId, status: "cancelled", key: crypto.randomUUID(), reason: "Batalkan planning" } }); toast.success("Planning dibatalkan"); await refresh(); })}><XCircle className="size-4 text-destructive" />Batalkan</Button>}
    </>
  ) : null;

  const picked = f.bom_version_id && version ? `${bomOf(version.bom_id)?.code} v${version.version_no} · ${items.get(f.item_id)?.name ?? ""}` : null;

  return (
    <ProductionPageShell workspaceId={workspaceId} section="orders" title={order ? `Planning ${order.order_no}` : "Planning baru"} status={status}
      subtitle={order ? ORDER_STAGE[status] : "Pilih sumber BOM atau QC yang sudah approved, lalu lengkapi tab di bawah."} actions={actions}>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="umum">Umum</TabsTrigger>
          <TabsTrigger value="bahan">Bahan</TabsTrigger>
          <TabsTrigger value="alat">Peralatan{f.equipment.length ? ` (${f.equipment.length})` : ""}</TabsTrigger>
          <TabsTrigger value="gudang">Gudang & Lokasi</TabsTrigger>
          <TabsTrigger value="catatan">Catatan</TabsTrigger>
          {order && !["draft", "planned"].includes(status) && <TabsTrigger value="eksekusi">Eksekusi & Biaya</TabsTrigger>}
        </TabsList>

        <fieldset disabled={!editable || busy}>
          <TabsContent value="umum" className="space-y-4 rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap gap-2">
              {([["bom1", "BOM Level 1 (barang jadi)"], ["bom2", "BOM Level 2 (bulk)"], ["qc", "Dari QC (spesifikasi)"]] as const).map(([k, label]) => {
                const active = k === "qc" ? f.source_type === "qc" : f.source_type === "bom" && f.source_level === (k === "bom1" ? 1 : 2);
                const keyOf = (x: F) => (x.source_type === "qc" ? "qc" : x.source_level === 2 ? "bom2" : "bom1");
                return <Button key={k} type="button" size="sm" variant={active ? "default" : "outline"}
                  onClick={() => {
                    if (active) return;
                    const saved = memo[k];
                    setMemo({ ...memo, [keyOf(f)]: { item_id: f.item_id, bom_version_id: f.bom_version_id, qc_spec_id: f.qc_spec_id, planned_qty: f.planned_qty } });
                    setF({ ...f, source_type: k === "qc" ? "qc" : "bom", source_level: k === "bom2" ? 2 : 1,
                      item_id: saved?.item_id ?? "", bom_version_id: saved?.bom_version_id ?? "", qc_spec_id: saved?.qc_spec_id ?? null, planned_qty: saved?.planned_qty ?? f.planned_qty });
                  }}>{label}</Button>;
              })}
            </div>
            {f.source_type === "bom" ? (
              <AdminField label="Cari BOM yang sudah approved">
                <ItemSearchAdd options={bomOptions} placeholder="Ketik kode BOM / nama produk lalu Enter"
                  onAdd={(o) => { const v = d.versions.find((x) => x.id === o.id)!; set({ bom_version_id: v.id, item_id: bomOf(v.bom_id)?.item_id ?? "", planned_qty: f.planned_qty || v.base_batch_qty, qc_spec_id: null }); }} />
                {bomOptions.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Belum ada BOM Level {f.source_level} berstatus Approved. Approve BOM di menu Formulasi lebih dulu.</p>}
              </AdminField>
            ) : (
              <AdminField label="Cari spesifikasi QC yang sudah approved">
                <ItemSearchAdd options={specOptions} placeholder="Ketik kode spesifikasi / produk lalu Enter"
                  onAdd={(o) => {
                    const s = d.specs.find((x) => x.id === o.id)!;
                    const vs = versionsOfItem(s.item_id);
                    const v = vs.sort((a, b) => b.version_no - a.version_no)[0];
                    if (!v) toast.error("Produk pada spesifikasi ini belum punya BOM approved.");
                    set({ qc_spec_id: s.id, item_id: s.item_id, bom_version_id: v?.id ?? "", planned_qty: f.planned_qty || v?.base_batch_qty || 0 });
                  }} />
                {specOptions.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Belum ada spesifikasi QC berstatus Approved. Approve di menu QC lebih dulu.</p>}
              </AdminField>
            )}
            {picked && <p className="rounded-xl bg-muted/50 px-3 py-2 text-sm">Terpilih: <strong>{picked}</strong></p>}
            {f.item_id && (
              <div className="grid gap-3 sm:grid-cols-2">
                <AdminField label="Versi BOM">
                  <AdminSelect value={f.bom_version_id} onChange={(v) => set({ bom_version_id: v })}>
                    {versionsOfItem(f.item_id).map((v) => <option key={v.id} value={v.id}>{bomOf(v.bom_id)?.code} v{v.version_no} · batch {v.base_batch_qty} {v.base_uom}</option>)}
                  </AdminSelect>
                </AdminField>
                <AdminField label="Spesifikasi QC (approved)">
                  <AdminSelect value={f.qc_spec_id ?? ""} onChange={(v) => set({ qc_spec_id: v || null })}>
                    <option value="">— tidak dipakai —</option>
                    {specsOfItem.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.stage}</option>)}
                  </AdminSelect>
                </AdminField>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <AdminField label={`Kuantitas rencana${version ? ` (${version.base_uom})` : ""}`}><Input type="number" min={0} step="any" value={f.planned_qty || ""} onChange={(e) => set({ planned_qty: Number(e.target.value) })} /></AdminField>
              <AdminField label="Mulai"><Input type="date" value={f.planned_start} onChange={(e) => set({ planned_start: e.target.value })} /></AdminField>
              <AdminField label="Selesai"><Input type="date" value={f.planned_end} onChange={(e) => set({ planned_end: e.target.value })} /></AdminField>
            </div>
          </TabsContent>

          <TabsContent value="bahan" className="rounded-2xl border border-border bg-card p-4">
            {!f.bom_version_id ? <p className="text-sm text-muted-foreground">Pilih BOM di tab Umum untuk melihat kebutuhan bahan.</p>
              : linesQ.isPending ? <Loader2 className="animate-spin" />
              : linesQ.isError ? <p className="text-sm text-muted-foreground">Kebutuhan bahan tidak dapat ditampilkan ({linesQ.error.message}).</p>
              : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Kebutuhan dihitung dari BOM × (qty rencana ÷ batch dasar). Material final & koreksi potensi ditetapkan saat Approve.</p>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <Table>
                      <TableHeader><TableRow>{["Phase", "Bahan", "Per batch dasar", "Kebutuhan"].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
                      <TableBody>
                        {linesQ.data.lines.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell>{l.phase || "—"}</TableCell>
                            <TableCell><strong>{items.get(l.item_id)?.code}</strong><div className="text-xs text-muted-foreground">{items.get(l.item_id)?.name}</div></TableCell>
                            <TableCell>{l.qty_per_base} {l.uom}</TableCell>
                            <TableCell className="font-medium">{(Math.round(l.qty_per_base * scale * 10000) / 10000).toLocaleString("id-ID")} {l.uom}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
          </TabsContent>

          <TabsContent value="alat" className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <Table>
              <TableHeader><TableRow><TableHead>Peralatan</TableHead><TableHead>Catatan penggunaan</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {f.equipment.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell>{e.name}</TableCell>
                    <TableCell><Input value={e.note} onChange={(ev) => set({ equipment: f.equipment.map((x, j) => (j === i ? { ...x, note: ev.target.value } : x)) })} /></TableCell>
                    <TableCell><Button type="button" variant="ghost" size="icon" aria-label="Hapus" onClick={() => set({ equipment: f.equipment.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button></TableCell>
                  </TableRow>
                ))}
                {editable && (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <ItemSearchAdd className="md:w-full md:max-w-md md:min-w-0" options={d.centers.map((c) => ({ id: c.id, code: c.code, name: c.name }))} exclude={new Set(f.equipment.map((e) => e.center_id ?? ""))}
                        placeholder="Tambah peralatan / work center lalu Enter (atau ketik nama bebas)"
                        onAdd={(o) => set({ equipment: [...f.equipment, { center_id: o.id, name: `${o.code} · ${o.name ?? ""}`, note: "" }] })}
                        onFreeText={(text) => set({ equipment: [...f.equipment, { center_id: null, name: text, note: "" }] })} />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="gudang" className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
            <AdminField label="Gudang bahan (asal)"><AdminSelect value={f.warehouse_from} onChange={(v) => set({ warehouse_from: v })}>{d.warehouses.map((w) => <option key={w.code} value={w.code}>{w.code} — {w.name}</option>)}</AdminSelect></AdminField>
            <AdminField label="Posisi / rak bahan"><Input maxLength={80} placeholder="mis. Rak RM-A2" value={f.location_from} onChange={(e) => set({ location_from: e.target.value })} /></AdminField>
            <AdminField label="Gudang hasil (tujuan)"><AdminSelect value={f.warehouse_to} onChange={(v) => set({ warehouse_to: v })}>{d.warehouses.map((w) => <option key={w.code} value={w.code}>{w.code} — {w.name}</option>)}</AdminSelect></AdminField>
            <AdminField label="Posisi / rak hasil"><Input maxLength={80} placeholder="mis. Area karantina FG" value={f.location_to} onChange={(e) => set({ location_to: e.target.value })} /></AdminField>
          </TabsContent>

          <TabsContent value="catatan" className="rounded-2xl border border-border bg-card p-4">
            <Textarea rows={6} maxLength={2000} placeholder="Catatan produksi, instruksi khusus, prioritas…" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
          </TabsContent>
        </fieldset>

        {order && !["draft", "planned"].includes(status) && (
          <TabsContent value="eksekusi"><ProductionOrderExecution workspaceId={workspaceId} orderId={order.id} /></TabsContent>
        )}
      </Tabs>
      {status === "planned" && d.canWrite && <p className="text-sm text-amber-600">Status Approved, tetapi material belum disiapkan. Tekan Approve lagi setelah masalah di atas diperbaiki.</p>}
    </ProductionPageShell>
  );
}
