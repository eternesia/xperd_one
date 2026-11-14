// Production · MRP — Sales Order → kebutuhan barang jadi → explosion BOM → cek stok bahan → PR draf / order produksi draf.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Factory,
  Loader2,
  PackagePlus,
  RefreshCw,
  Settings2,
  ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminField, AdminSelect } from "./admin-ui";
import {
  createMrpProductionOrders,
  createMrpPurchaseRequest,
  getMrpSettings,
  runMrp,
  saveMrpItemParams,
  saveMrpSettings,
} from "@/lib/production-mrp.functions";
import { defaultMrpSettings, type MrpRow, type MrpSettings } from "@/lib/production-mrp";
import { toCsv } from "@/lib/production-report";

const fmt = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 4 });
const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const card = "overflow-hidden rounded-2xl border border-border bg-card";
const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
const errMsg = (e: unknown, f: string) => (e instanceof Error ? e.message : f);
const SOURCE_LABEL = {
  sales: "Sales Order",
  order: "Order produksi",
  plan: "Saran produksi",
} as const;

function download(name: string, rows: Record<string, unknown>[]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ProductionMrpView({ workspaceId }: { workspaceId: string }) {
  const get = useServerFn(getMrpSettings);
  const s = useQuery({
    queryKey: ["mfg-mrp-settings", workspaceId],
    queryFn: () => get({ data: { workspaceId } }),
  });
  const [openSettings, setOpenSettings] = useState(false);
  if (s.isLoading) return <Loader2 className="m-8 animate-spin text-muted-foreground" />;
  if (s.isError) return <p className="text-destructive">{s.error.message}</p>;
  const d = s.data!;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <PackagePlus className="h-7 w-7 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Production</p>
            <h1 className="text-2xl font-semibold">MRP · Perencanaan Bahan</h1>
            <p className="text-sm text-muted-foreground">
              Sales Order dan order produksi → kebutuhan bahan → beli atau produksi.
            </p>
          </div>
        </div>
        {d.canConfigure && (
          <Button variant="outline" onClick={() => setOpenSettings(true)}>
            <Settings2 className="size-4" />
            Pengaturan MRP
          </Button>
        )}
      </header>
      {!d.settings.enabled ? (
        <div className={`${card} space-y-3 p-6 text-sm`}>
          <p className="font-medium">MRP belum diaktifkan di workspace ini.</p>
          <p className="text-muted-foreground">
            Setelah aktif, sistem menghitung kebutuhan dari Sales Order terbuka dan perintah
            produksi, menetkannya terhadap stok lot rilis, PO/PR terbuka, dan order produksi
            terbuka, lalu menyarankan pembelian atau produksi.
          </p>
          {d.canConfigure ? (
            <Button onClick={() => setOpenSettings(true)}>Aktifkan MRP</Button>
          ) : (
            <p className="text-muted-foreground">
              Minta admin atau supervisor produksi untuk mengaktifkannya.
            </p>
          )}
        </div>
      ) : (
        <MrpPlan workspaceId={workspaceId} canPlan={d.canPlan} />
      )}
      <SettingsDialog
        key={d.settings.updated_at ?? "new"}
        workspaceId={workspaceId}
        open={openSettings}
        onOpenChange={setOpenSettings}
        initial={d.settings}
      />
    </div>
  );
}

function SettingsDialog({
  workspaceId,
  open,
  onOpenChange,
  initial,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: MrpSettings;
}) {
  const save = useServerFn(saveMrpSettings);
  const qc = useQueryClient();
  const [v, setV] = useState<MrpSettings>({
    ...defaultMrpSettings,
    enabled: initial.enabled,
    horizon_days: initial.horizon_days,
    include_draft: initial.include_draft,
    include_open_pr: initial.include_open_pr,
  });
  const [reason, setReason] = useState("Pengaturan MRP");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await save({ data: { workspaceId, values: v, reason } });
      toast.success("Pengaturan MRP tersimpan");
      onOpenChange(false);
      await qc.invalidateQueries({ queryKey: ["mfg-mrp-settings", workspaceId] });
      await qc.invalidateQueries({ queryKey: ["mfg-mrp", workspaceId] });
    } catch (e) {
      toast.error(errMsg(e, "Pengaturan belum tersimpan"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pengaturan MRP</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={v.enabled} onCheckedChange={(x) => setV({ ...v, enabled: x })} />
            MRP aktif
          </label>
          <AdminField label="Horizon perencanaan (hari)">
            <Input
              type="number"
              min={1}
              max={365}
              step={1}
              value={v.horizon_days}
              onChange={(e) =>
                setV({
                  ...v,
                  horizon_days: Math.max(1, Math.min(365, Math.round(Number(e.target.value) || 1))),
                })
              }
            />
          </AdminField>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={v.include_draft}
              onCheckedChange={(x) => setV({ ...v, include_draft: x })}
            />
            Hitung order produksi berstatus draf
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={v.include_open_pr}
              onCheckedChange={(x) => setV({ ...v, include_open_pr: x })}
            />
            Anggap PR terbuka sebagai pasokan (cegah PR dobel)
          </label>
          <AdminField label="Alasan perubahan">
            <Input
              required
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </AdminField>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || !reason.trim()}>
              {busy && <Loader2 className="size-4 animate-spin" />}Simpan
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MrpPlan({ workspaceId, canPlan }: { workspaceId: string; canPlan: boolean }) {
  const run = useServerFn(runMrp);
  const [warehouse, setWarehouse] = useState("");
  const q = useQuery({
    queryKey: ["mfg-mrp", workspaceId, warehouse],
    queryFn: () => run({ data: { workspaceId, warehouse: warehouse || null } }),
    placeholderData: (p) => p,
  });
  const [detail, setDetail] = useState<MrpRow | null>(null);
  const [tab, setTab] = useState("buy");
  const r = q.data;
  const buys = useMemo(() => r?.rows.filter((x) => x.action === "buy") ?? [], [r]);
  const makes = useMemo(() => r?.rows.filter((x) => x.action === "make") ?? [], [r]);
  if (q.isError) return <p className="text-destructive">{q.error.message}</p>;
  if (!r) return <Loader2 className="m-8 animate-spin text-muted-foreground" />;
  const cards: [string, string, string?][] = [
    ["Baris Sales Order terbuka", fmt(r.summary.sales_lines)],
    ["Order produksi dihitung", fmt(r.summary.orders)],
    ["Saran beli", fmt(r.summary.buy), rp(r.summary.buy_value)],
    ["Saran produksi", fmt(r.summary.make), `${fmt(r.summary.ready)} siap diproduksi`],
    ["Terlambat dipesan/dimulai", fmt(r.summary.late)],
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <AdminField label="Gudang">
            <AdminSelect className="w-56" value={warehouse} onChange={setWarehouse}>
              <option value="">Semua gudang</option>
              {r.warehouses.map((w) => (
                <option key={w.code} value={w.code}>
                  {w.code} · {w.name}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          <Button variant="outline" onClick={() => void q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Hitung ulang
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!r.rows.length}
          onClick={() => download(`mrp-${r.today}.csv`, r.rows.map(csvRow))}
        >
          <Download className="size-4" />
          CSV
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Per {r.today} · horizon s.d. {r.horizon_end} · dihitung dalam {r.ms} ms
        {r.settings.include_draft ? "" : " · order draf tidak dihitung"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(([k, v, sub]) => (
          <div key={k} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="mt-1 text-xl font-semibold">{v}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
        ))}
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="buy">Beli ({buys.length})</TabsTrigger>
          <TabsTrigger value="make">Produksi ({makes.length})</TabsTrigger>
          <TabsTrigger value="all">Semua item ({r.rows.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="buy">
          <BuyTable
            workspaceId={workspaceId}
            rows={buys}
            canPlan={canPlan}
            warehouse={warehouse || null}
            onDetail={setDetail}
          />
        </TabsContent>
        <TabsContent value="make">
          <MakeTable
            workspaceId={workspaceId}
            rows={makes}
            canPlan={canPlan}
            warehouses={r.warehouses}
            defaults={r.default_warehouses}
            onDetail={setDetail}
          />
        </TabsContent>
        <TabsContent value="all">
          <AllTable rows={r.rows} onDetail={setDetail} />
        </TabsContent>
      </Tabs>
      {r.history.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Dokumen dari MRP</h2>
          <div className={card}>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {["Waktu", "Jenis", "Nomor", "Baris"].map((h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.history.map((h, i) => (
                    <TableRow key={`${h.doc_number}-${i}`}>
                      <TableCell>{new Date(h.created_at).toLocaleString("id-ID")}</TableCell>
                      <TableCell>
                        {h.kind === "pr" ? "Purchase Request (draf)" : "Order produksi (draf)"}
                      </TableCell>
                      <TableCell>{h.doc_number}</TableCell>
                      <TableCell>{h.line_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>
      )}
      <DetailDialog
        workspaceId={workspaceId}
        row={detail}
        canPlan={canPlan}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}

function csvRow(x: MrpRow) {
  return {
    level: x.level,
    kode: x.code,
    nama: x.name,
    satuan: x.uom ?? "",
    saran: x.action === "buy" ? "beli" : x.action === "make" ? "produksi" : "-",
    kebutuhan: x.gross,
    stok_pengaman: x.safety,
    stok_tersedia: x.on_hand,
    karantina: x.quarantine,
    po_terbuka: x.open_po,
    pr_terbuka: x.open_pr,
    order_produksi_terbuka: x.open_mo,
    kekurangan: x.net,
    qty_saran: x.suggested_qty,
    tgl_butuh: x.need_date,
    tgl_pesan_mulai: x.order_date,
    terlambat: x.late ? "ya" : "",
    estimasi_nilai: x.est_value,
    bahan_kurang: x.short_components.join(" "),
    catatan: x.warnings.join(" | "),
  };
}

function Flags({ row }: { row: MrpRow }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {row.late && <Badge variant="destructive">Terlambat</Badge>}
      {row.warnings.length > 0 && (
        <span title={row.warnings.join("\n")}>
          <AlertTriangle className="size-4 text-amber-500" />
        </span>
      )}
    </span>
  );
}

function useSelection(rows: MrpRow[]) {
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, number>>({});
  const chosen = rows.filter((r) => picked[r.item_id]);
  const all = rows.length > 0 && chosen.length === rows.length;
  return {
    picked,
    chosen,
    all,
    qtyOf: (r: MrpRow) => qty[r.item_id] ?? r.suggested_qty,
    setQty: (id: string, n: number) => setQty((p) => ({ ...p, [id]: n })),
    toggle: (id: string, v: boolean) => setPicked((p) => ({ ...p, [id]: v })),
    toggleAll: (v: boolean) =>
      setPicked(v ? Object.fromEntries(rows.map((r) => [r.item_id, true])) : {}),
    reset: () => {
      setPicked({});
      setQty({});
    },
  };
}

function BuyTable({
  workspaceId,
  rows,
  canPlan,
  warehouse,
  onDetail,
}: {
  workspaceId: string;
  rows: MrpRow[];
  canPlan: boolean;
  warehouse: string | null;
  onDetail: (r: MrpRow) => void;
}) {
  const create = useServerFn(createMrpPurchaseRequest);
  const qc = useQueryClient();
  const sel = useSelection(rows);
  const [busy, setBusy] = useState(false);
  async function submit() {
    const lines = sel.chosen
      .map((r) => ({ itemId: r.item_id, qty: sel.qtyOf(r), needDate: r.need_date }))
      .filter((l) => l.qty > 0);
    if (!lines.length) return;
    setBusy(true);
    try {
      const res = await create({
        data: { workspaceId, key: newKey(), warehouseCode: warehouse, lines },
      });
      toast.success(
        `Purchase Request draf ${res.doc_number} dibuat. Lanjutkan di modul Pembelian.`,
      );
      sel.reset();
      await qc.invalidateQueries({ queryKey: ["mfg-mrp", workspaceId] });
    } catch (e) {
      toast.error(errMsg(e, "PR belum dibuat"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Bahan/barang tanpa BOM yang stoknya tidak mencukupi → diteruskan ke Pembelian sebagai PR
          draf.
        </p>
        {canPlan && (
          <Button disabled={busy || !sel.chosen.length} onClick={() => void submit()}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShoppingCart className="size-4" />
            )}
            Buat PR draf ({sel.chosen.length})
          </Button>
        )}
      </div>
      <div className={card}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {canPlan && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={sel.all}
                      onCheckedChange={(v) => sel.toggleAll(v === true)}
                      aria-label="Pilih semua"
                    />
                  </TableHead>
                )}
                {[
                  "Item",
                  "Kebutuhan",
                  "Tersedia",
                  "PO / PR",
                  "Kurang",
                  "Qty PR",
                  "Butuh",
                  "Pesan paling lambat",
                  "Estimasi",
                  "",
                ].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.item_id}>
                  {canPlan && (
                    <TableCell>
                      <Checkbox
                        checked={!!sel.picked[r.item_id]}
                        onCheckedChange={(v) => sel.toggle(r.item_id, v === true)}
                        aria-label={`Pilih ${r.code}`}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => onDetail(r)}
                    >
                      <span className="font-medium">{r.code}</span> · {r.name}
                    </button>
                  </TableCell>
                  <TableCell>
                    {fmt(r.gross)} {r.uom}
                  </TableCell>
                  <TableCell>
                    {fmt(r.on_hand)}
                    {r.quarantine > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        +{fmt(r.quarantine)} karantina
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {fmt(r.open_po)} / {fmt(r.open_pr)}
                  </TableCell>
                  <TableCell className="font-medium text-destructive">{fmt(r.net)}</TableCell>
                  <TableCell>
                    {canPlan ? (
                      <Input
                        className="w-28"
                        type="number"
                        min={0}
                        step="0.0001"
                        value={sel.qtyOf(r)}
                        onChange={(e) => sel.setQty(r.item_id, Number(e.target.value) || 0)}
                      />
                    ) : (
                      fmt(r.suggested_qty)
                    )}
                  </TableCell>
                  <TableCell>{r.need_date}</TableCell>
                  <TableCell>{r.order_date}</TableCell>
                  <TableCell>{rp(r.est_value)}</TableCell>
                  <TableCell>
                    <Flags row={r} />
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                    <CheckCircle2 className="mx-auto mb-2 size-5 text-emerald-600" />
                    Semua bahan tercukupi untuk horizon ini.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function MakeTable({
  workspaceId,
  rows,
  canPlan,
  warehouses,
  defaults,
  onDetail,
}: {
  workspaceId: string;
  rows: MrpRow[];
  canPlan: boolean;
  warehouses: { code: string; name: string }[];
  defaults: { from: string | null; to: string | null };
  onDetail: (r: MrpRow) => void;
}) {
  const create = useServerFn(createMrpProductionOrders);
  const qc = useQueryClient();
  const sel = useSelection(rows);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState(defaults.from ?? warehouses[0]?.code ?? "");
  const [to, setTo] = useState(defaults.to ?? warehouses[0]?.code ?? "");
  const [key, setKey] = useState(newKey);
  async function submit() {
    const lines = sel.chosen
      .filter((r) => r.bom_version_id && sel.qtyOf(r) > 0)
      .map((r) => ({
        itemId: r.item_id,
        bomVersionId: r.bom_version_id!,
        qty: sel.qtyOf(r),
        plannedStart: r.order_date,
        plannedEnd: r.need_date,
      }));
    if (!lines.length) return;
    setBusy(true);
    try {
      const res = await create({
        data: { workspaceId, key, warehouseFrom: from, warehouseTo: to, lines },
      });
      toast.success(`Order produksi draf dibuat: ${res.orders.map((o) => o.order_no).join(", ")}`);
      setOpen(false);
      setKey(newKey());
      sel.reset();
      await qc.invalidateQueries({ queryKey: ["mfg-mrp", workspaceId] });
    } catch (e) {
      toast.error(errMsg(e, "Order belum dibuat"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Barang jadi/setengah jadi ber-BOM yang kurang. "Siap produksi" = semua bahan langsungnya
          tercukupi.
        </p>
        {canPlan && (
          <Button disabled={!sel.chosen.length} onClick={() => setOpen(true)}>
            <Factory className="size-4" />
            Buat order produksi draf ({sel.chosen.length})
          </Button>
        )}
      </div>
      <div className={card}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {canPlan && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={sel.all}
                      onCheckedChange={(v) => sel.toggleAll(v === true)}
                      aria-label="Pilih semua"
                    />
                  </TableHead>
                )}
                {[
                  "Item",
                  "BOM",
                  "Kebutuhan",
                  "Tersedia",
                  "Order terbuka",
                  "Kurang",
                  "Qty produksi",
                  "Mulai",
                  "Selesai",
                  "Status bahan",
                  "",
                ].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.item_id}>
                  {canPlan && (
                    <TableCell>
                      <Checkbox
                        checked={!!sel.picked[r.item_id]}
                        onCheckedChange={(v) => sel.toggle(r.item_id, v === true)}
                        aria-label={`Pilih ${r.code}`}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => onDetail(r)}
                    >
                      <span className="font-medium">{r.code}</span> · {r.name}
                    </button>
                  </TableCell>
                  <TableCell className="text-xs">{r.bom_code}</TableCell>
                  <TableCell>
                    {fmt(r.gross)} {r.uom}
                  </TableCell>
                  <TableCell>{fmt(r.on_hand)}</TableCell>
                  <TableCell>{fmt(r.open_mo)}</TableCell>
                  <TableCell className="font-medium text-destructive">{fmt(r.net)}</TableCell>
                  <TableCell>
                    {canPlan ? (
                      <Input
                        className="w-28"
                        type="number"
                        min={0}
                        step="0.0001"
                        value={sel.qtyOf(r)}
                        onChange={(e) => sel.setQty(r.item_id, Number(e.target.value) || 0)}
                      />
                    ) : (
                      fmt(r.suggested_qty)
                    )}
                  </TableCell>
                  <TableCell>{r.order_date}</TableCell>
                  <TableCell>{r.need_date}</TableCell>
                  <TableCell>
                    {r.short_components.length ? (
                      <span className="text-xs text-amber-700 dark:text-amber-400">
                        Menunggu bahan: {r.short_components.join(", ")}
                      </span>
                    ) : (
                      <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-300">
                        Siap produksi
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Flags row={r} />
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={12} className="py-10 text-center text-muted-foreground">
                    <CheckCircle2 className="mx-auto mb-2 size-5 text-emerald-600" />
                    Tidak ada barang yang perlu diproduksi untuk horizon ini.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Buat order produksi draf</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              {sel.chosen.length} order akan dibuat berstatus draf. Rilis tetap lewat menu Perintah
              Produksi (cek stok lot, potensi, eBMR).
            </p>
            <AdminField label="Gudang bahan (asal)">
              <AdminSelect value={from} onChange={setFrom}>
                {warehouses.map((w) => (
                  <option key={w.code} value={w.code}>
                    {w.code} · {w.name}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Gudang hasil (tujuan)">
              <AdminSelect value={to} onChange={setTo}>
                {warehouses.map((w) => (
                  <option key={w.code} value={w.code}>
                    {w.code} · {w.name}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            {sel.chosen.some((r) => r.short_components.length) && (
              <p className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                Sebagian order masih menunggu bahan. Buat PR dari tab Beli agar bahan tersedia
                sebelum rilis.
              </p>
            )}
            <div className="flex justify-end">
              <Button disabled={busy || !from || !to} onClick={() => void submit()}>
                {busy && <Loader2 className="size-4 animate-spin" />}Buat order
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AllTable({ rows, onDetail }: { rows: MrpRow[]; onDetail: (r: MrpRow) => void }) {
  return (
    <div className={card}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {[
                "Lv",
                "Item",
                "Saran",
                "Kebutuhan",
                "Pengaman",
                "Tersedia",
                "PO",
                "PR",
                "Order",
                "Kurang",
                "",
              ].map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.item_id}>
                <TableCell>{r.level}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => onDetail(r)}
                  >
                    <span className="font-medium">{r.code}</span> · {r.name}
                  </button>
                </TableCell>
                <TableCell>
                  {r.action === "buy" ? (
                    <Badge variant="outline">Beli</Badge>
                  ) : r.action === "make" ? (
                    <Badge variant="outline">Produksi</Badge>
                  ) : (
                    <span className="text-xs text-emerald-700 dark:text-emerald-400">Cukup</span>
                  )}
                </TableCell>
                <TableCell>
                  {fmt(r.gross)} {r.uom}
                </TableCell>
                <TableCell>{fmt(r.safety)}</TableCell>
                <TableCell>{fmt(r.on_hand)}</TableCell>
                <TableCell>{fmt(r.open_po)}</TableCell>
                <TableCell>{fmt(r.open_pr)}</TableCell>
                <TableCell>{fmt(r.open_mo)}</TableCell>
                <TableCell className={r.net > 0 ? "font-medium text-destructive" : ""}>
                  {fmt(r.net)}
                </TableCell>
                <TableCell>
                  <Flags row={r} />
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                  Belum ada kebutuhan: tidak ada Sales Order terbuka atau order produksi dalam
                  horizon.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DetailDialog({
  workspaceId,
  row,
  canPlan,
  onClose,
}: {
  workspaceId: string;
  row: MrpRow | null;
  canPlan: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!row} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>
                {row.code} · {row.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-5 text-sm">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Kebutuhan", row.gross],
                  ["Stok pengaman", row.safety],
                  ["Tersedia", row.on_hand],
                  ["Karantina", row.quarantine],
                  ["PO terbuka", row.open_po],
                  ["PR terbuka", row.open_pr],
                  ["Order terbuka", row.open_mo],
                  ["Kekurangan", row.net],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-xl border border-border p-3">
                    <p className="text-xs text-muted-foreground">{k}</p>
                    <p className="font-semibold">{fmt(v as number)}</p>
                  </div>
                ))}
              </div>
              {row.warnings.length > 0 && (
                <ul className="space-y-1 text-amber-700 dark:text-amber-400">
                  {row.warnings.map((w) => (
                    <li key={w} className="flex gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              )}
              <section className="space-y-2">
                <h3 className="font-medium">Asal kebutuhan (pegging)</h3>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {["Tanggal", "Sumber", "Dokumen", "Qty"].map((h) => (
                          <TableHead key={h}>{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {row.pegs.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell>{p.date}</TableCell>
                          <TableCell>{SOURCE_LABEL[p.source]}</TableCell>
                          <TableCell>
                            {p.source === "plan"
                              ? `Bahan untuk ${p.parent_code}`
                              : `${p.doc_no}${p.partner ? ` · ${p.partner}` : ""}${p.doc_status ? ` (${p.doc_status})` : ""}`}
                          </TableCell>
                          <TableCell>
                            {fmt(p.qty)} {p.uom}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
              {canPlan && <ParamsForm key={row.item_id} workspaceId={workspaceId} row={row} />}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ParamsForm({ workspaceId, row }: { workspaceId: string; row: MrpRow }) {
  const save = useServerFn(saveMrpItemParams);
  const qc = useQueryClient();
  const [lead, setLead] = useState(row.lead_time_days);
  const [safety, setSafety] = useState<string>(
    row.params?.safety_stock == null ? "" : String(row.params.safety_stock),
  );
  const [moq, setMoq] = useState(row.params?.min_order_qty ?? 0);
  const [mult, setMult] = useState(row.params?.order_multiple ?? 0);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await save({
        data: {
          workspaceId,
          itemId: row.item_id,
          values: {
            lead_time_days: Math.max(0, Math.round(lead)),
            safety_stock: safety.trim() === "" ? null : Math.max(0, Number(safety)),
            min_order_qty: Math.max(0, moq),
            order_multiple: Math.max(0, mult),
          },
        },
      });
      toast.success("Parameter MRP tersimpan");
      await qc.invalidateQueries({ queryKey: ["mfg-mrp", workspaceId] });
    } catch (e) {
      toast.error(errMsg(e, "Parameter belum tersimpan"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 border-t border-border pt-4">
      <h3 className="font-medium">Parameter perencanaan item</h3>
      <p className="text-xs text-muted-foreground">
        Stok pengaman kosong = memakai stok minimum di master item. Lead time menggeser tanggal
        pesan/mulai produksi.
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <AdminField label="Lead time (hari)">
          <Input
            type="number"
            min={0}
            max={730}
            step={1}
            value={lead}
            onChange={(e) => setLead(Number(e.target.value) || 0)}
          />
        </AdminField>
        <AdminField label="Stok pengaman">
          <Input
            type="number"
            min={0}
            step="0.0001"
            placeholder={fmt(row.safety)}
            value={safety}
            onChange={(e) => setSafety(e.target.value)}
          />
        </AdminField>
        <AdminField label="Min. order (MOQ)">
          <Input
            type="number"
            min={0}
            step="0.0001"
            value={moq}
            onChange={(e) => setMoq(Number(e.target.value) || 0)}
          />
        </AdminField>
        <AdminField label="Kelipatan">
          <Input
            type="number"
            min={0}
            step="0.0001"
            value={mult}
            onChange={(e) => setMult(Number(e.target.value) || 0)}
          />
        </AdminField>
      </div>
      <div className="flex justify-end">
        <Button size="sm" disabled={busy} onClick={() => void submit()}>
          {busy && <Loader2 className="size-4 animate-spin" />}Simpan parameter
        </Button>
      </div>
    </section>
  );
}
