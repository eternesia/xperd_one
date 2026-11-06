import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, Pencil, Plus, Save, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminField, AdminSelect } from "./admin-ui";
import { TableSearch } from "./ProductionPagedTable";
import {
  getLotReconciliation,
  getProductionLotCard,
  getProductionLots,
  initLotsFromStock,
  saveProductionLot,
  saveProductionWarehouse,
} from "@/lib/production-lots.functions";

const fresh = {
  item_id: "",
  lot_no: "",
  supplier_lot_no: "",
  partner_id: null as string | null,
  mfg_date: null as string | null,
  expiry_date: null as string | null,
  retest_date: null as string | null,
  assay_pct: null as number | null,
  lod_pct: null as number | null,
  density_g_ml: null as number | null,
  is_active: true,
};
const FILTERS = [
  ["", "Semua"],
  ["quarantine", "Karantina"],
  ["released", "Rilis"],
  ["hold", "Hold"],
  ["rejected", "Ditolak"],
  ["expired", "Kedaluwarsa"],
] as const;
const STATUS_LABEL: Record<string, string> = { quarantine: "Karantina", released: "Rilis", hold: "Hold", rejected: "Ditolak", expired: "Kedaluwarsa" };
const tone = (s: string) => (s === "released" ? "default" : s === "rejected" || s === "expired" ? "destructive" : "secondary") as "default" | "destructive" | "secondary";
const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");
const qty = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 4 });

export function ProductionLotsView({ workspaceId }: { workspaceId: string }) {
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string | null; values: typeof fresh } | null>(null);
  const get = useServerFn(getProductionLots);
  const q = useQuery({
    queryKey: ["production-lots", workspaceId, page, status, search],
    queryFn: () => get({ data: { workspaceId, page, status, search } }),
    placeholderData: (p) => p,
  });
  if (q.isPending) return <Loader2 className="m-8 animate-spin text-muted-foreground" />;
  if (q.isError) return <p className="py-12 text-muted-foreground">{q.error.message}</p>;
  const data = q.data;
  if (edit) return <LotForm workspaceId={workspaceId} data={data} edit={edit} onClose={() => setEdit(null)} />;

  const itemOf = (id: string) => data.items.find((i) => i.id === id);
  const today = new Date().toLocaleDateString("en-CA");
  const kpis: [string, number][] = [
    ["Total lot", data.kpi.total],
    ["Karantina (menunggu QC)", data.kpi.quarantine],
    ["Rilis", data.kpi.released],
    ["Hold / ditolak", data.kpi.hold + data.kpi.rejected],
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Stok Bahan</h1>
          <p className="text-sm text-muted-foreground">Saldo bahan per lot dan status QC-nya. Lot baru otomatis terbentuk saat barang diterima (GRN).</p>
        </div>
        <Button disabled={!data.canWrite} onClick={() => setEdit({ id: null, values: fresh })}>
          <Plus className="size-4" />
          Lot baru
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(([label, n]) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{n.toLocaleString("id-ID")}</p>
          </div>
        ))}
      </div>

      <UnlottedBanner workspaceId={workspaceId} canWrite={data.canWrite} />

      <div className="flex flex-wrap items-center gap-3">
        <TableSearch value={search} onChange={(s) => { setSearch(s); setPage(0); }} />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(([k, l]) => (
            <Button key={k} size="sm" variant={status === k ? "default" : "outline"} onClick={() => { setStatus(k); setPage(0); }}>
              {l}
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {["Lot", "Item", "Gudang", "Saldo", "Status QC", "Kedaluwarsa"].map((h) => (
                  <TableHead key={h} className={h === "Saldo" ? "text-right" : undefined}>{h}</TableHead>
                ))}
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.lots.map((l) => {
                const it = itemOf(l.item_id);
                const expired = l.expiry_date && l.expiry_date < today;
                const isOpen = open === l.id;
                return (
                  <Fragment key={l.id}>
                    <TableRow className="cursor-pointer" onClick={() => setOpen(isOpen ? null : l.id)}>
                      <TableCell className="font-medium">{l.lot_no}</TableCell>
                      <TableCell>
                        {it?.code}
                        <div className="text-xs text-muted-foreground">{it?.name}</div>
                      </TableCell>
                      <TableCell>{data.lotWarehouses[l.id] ?? "—"}</TableCell>
                      <TableCell className="text-right">{qty(data.onHand[l.id] ?? 0)}</TableCell>
                      <TableCell><Badge variant={tone(expired ? "expired" : l.qc_status)}>{STATUS_LABEL[expired ? "expired" : l.qc_status] ?? l.qc_status}</Badge></TableCell>
                      <TableCell className={expired ? "text-destructive" : undefined}>{l.expiry_date ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" aria-label="Ubah lot" disabled={!data.canWrite} onClick={(e) => { e.stopPropagation(); setEdit({ id: l.id, values: { ...fresh, ...l, supplier_lot_no: l.supplier_lot_no ?? "" } }); }}>
                            <Pencil className="size-4" />
                          </Button>
                          {isOpen ? <ChevronUp className="m-2 size-4" /> : <ChevronDown className="m-2 size-4" />}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={7}><LotDetail workspaceId={workspaceId} lot={l} /></TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
              {!data.lots.length && (
                <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">Tidak ada lot yang cocok.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
          <p className="text-muted-foreground">
            Menampilkan {data.total ? page * 25 + 1 : 0}-{Math.min(data.total, (page + 1) * 25)} dari {data.total} lot
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Halaman sebelumnya" disabled={!page} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-[70px] text-center text-muted-foreground">{page + 1} / {Math.max(1, Math.ceil(data.total / 25))}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Halaman berikutnya" disabled={(page + 1) * 25 >= data.total} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      <Tools workspaceId={workspaceId} data={data} />
    </div>
  );
}

/** Detail lot di baris: ringkasan data lot + kartu stok (pergerakan). */
function LotDetail({ workspaceId, lot }: { workspaceId: string; lot: { id: string; supplier_lot_no: string | null; mfg_date: string | null; retest_date: string | null; assay_pct: number | null } }) {
  const [page, setPage] = useState(0);
  const get = useServerFn(getProductionLotCard);
  const q = useQuery({ queryKey: ["production-lot-card", workspaceId, lot.id, page], queryFn: () => get({ data: { workspaceId, lotId: lot.id, page } }) });
  return (
    <div className="space-y-3 py-1">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>Lot pemasok: <strong>{lot.supplier_lot_no || "—"}</strong></span>
        <span>Tgl produksi: <strong>{lot.mfg_date ?? "—"}</strong></span>
        <span>Uji ulang: <strong>{lot.retest_date ?? "—"}</strong></span>
        <span>Assay: <strong>{lot.assay_pct ?? "—"}</strong></span>
        {q.data?.balances.filter((b) => b.qty !== 0).map((b) => <span key={b.warehouse}>{b.warehouse}: <strong>{qty(b.qty)}</strong></span>)}
      </div>
      {q.isPending ? <Loader2 className="animate-spin text-muted-foreground" /> : q.isError ? <p className="text-sm text-muted-foreground">{q.error.message}</p> : (
        <>
          <Table>
            <TableHeader><TableRow>{["Tanggal", "Jenis", "Gudang", "Qty", "Biaya", "Referensi"].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {q.data.movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.movement_date}</TableCell>
                  <TableCell>{m.movement_type}</TableCell>
                  <TableCell>{m.warehouse_code}{m.counterpart_warehouse_code ? " → " + m.counterpart_warehouse_code : ""}</TableCell>
                  <TableCell>{qty(m.qty)}</TableCell>
                  <TableCell>{m.unit_cost.toLocaleString("id-ID")}</TableCell>
                  <TableCell>{m.ref_number}</TableCell>
                </TableRow>
              ))}
              {!q.data.movements.length && <TableRow><TableCell colSpan={6} className="text-muted-foreground">Belum ada pergerakan.</TableCell></TableRow>}
            </TableBody>
          </Table>
          {q.data.total > 25 && (
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" disabled={!page} onClick={() => setPage((p) => p - 1)}>Sebelumnya</Button>
              <Button size="sm" variant="outline" disabled={(page + 1) * 25 >= q.data.total} onClick={() => setPage((p) => p + 1)}>Berikutnya</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Banner satu tombol, hanya tampil bila ada stok yang belum punya lot. */
function UnlottedBanner({ workspaceId, canWrite }: { workspaceId: string; canWrite: boolean }) {
  const get = useServerFn(getLotReconciliation);
  const init = useServerFn(initLotsFromStock);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["production-lot-recon", workspaceId], queryFn: () => get({ data: { workspaceId } }) });
  const rows = (q.data?.rows ?? []).filter((r) => Math.abs(r.diff_value) > 0.5 && r.ledger_qty > r.lot_qty);
  if (!rows.length) return null;
  const total = rows.reduce((a, r) => a + r.diff_value, 0);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950/30">
      <p className="max-w-2xl">
        Ada stok senilai <strong>{rp(total)}</strong> ({rows.length} item) yang belum tercatat per lot. Buat lot karantina dari penerimaan barang lama agar bisa diperiksa QC dan dipakai produksi.
      </p>
      <Button
        disabled={!canWrite || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await init({ data: { workspaceId } });
            toast.success(`${r.linked} penerimaan dibuatkan lot karantina`);
            if (r.skipped?.length) toast.warning(`Dilewati (sudah ada pengeluaran tanpa lot): ${r.skipped.join(", ")}`);
            await qc.invalidateQueries({ queryKey: ["production-lots"] });
            await qc.invalidateQueries({ queryKey: ["production-lot-recon"] });
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Buat lot dari stok lama
      </Button>
    </div>
  );
}

/** Alat bantu jarang dipakai: status gudang & rincian selisih stok vs lot. Tertutup secara default. */
function Tools({ workspaceId, data }: { workspaceId: string; data: { warehouses: { id: string; code: string }[]; profiles: { warehouse_id: string; warehouse_status: string }[]; canWrite: boolean } }) {
  const [show, setShow] = useState(false);
  const save = useServerFn(saveProductionWarehouse);
  const recon = useServerFn(getLotReconciliation);
  const qc = useQueryClient();
  const [wh, setWh] = useState("");
  const [whStatus, setWhStatus] = useState("rm");
  const [busy, setBusy] = useState(false);
  const r = useQuery({ queryKey: ["production-lot-recon", workspaceId], queryFn: () => recon({ data: { workspaceId } }), enabled: show });
  return (
    <div className="rounded-2xl border border-border">
      <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium" onClick={() => setShow(!show)}>
        <Wrench className="size-4" />Alat bantu (jenis gudang & selisih stok)
        {show ? <ChevronUp className="ml-auto size-4" /> : <ChevronDown className="ml-auto size-4" />}
      </button>
      {show && (
        <div className="space-y-6 border-t border-border p-4">
          <section className="space-y-2">
            <h2 className="font-medium">Jenis gudang</h2>
            <p className="text-sm text-muted-foreground">Tentukan fungsi tiap gudang (bahan baku, WIP, barang jadi, karantina, reject).</p>
            <div className="flex flex-wrap gap-4 text-sm">
              {data.warehouses.map((w) => <span key={w.id}>{w.code}: <strong>{data.profiles.find((p) => p.warehouse_id === w.id)?.warehouse_status ?? "—"}</strong></span>)}
            </div>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await save({ data: { workspaceId, warehouseId: wh, status: whStatus as "rm", reason: "Pengaturan jenis gudang" } });
                  toast.success("Jenis gudang tersimpan");
                  await qc.invalidateQueries({ queryKey: ["production-lots", workspaceId] });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Ditolak");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <AdminField label="Gudang"><AdminSelect value={wh} onChange={setWh}><option value="">Pilih gudang</option>{data.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}</AdminSelect></AdminField>
              <AdminField label="Jenis"><AdminSelect value={whStatus} onChange={setWhStatus}>{["rm", "wip", "fg", "quarantine", "reject"].map((s) => <option key={s}>{s}</option>)}</AdminSelect></AdminField>
              <Button disabled={!data.canWrite || busy || !wh}><Save className="size-4" />Simpan</Button>
            </form>
          </section>
          <section className="space-y-2">
            <h2 className="font-medium">Selisih stok buku vs lot</h2>
            <p className="text-sm text-muted-foreground">Wajar untuk item non-produksi. Item BoM otomatis mendapat lot saat GRN berikutnya.</p>
            {r.isPending ? <Loader2 className="animate-spin" /> : r.isError ? <p className="text-sm">{r.error.message}</p> : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <Table>
                  <TableHeader><TableRow>{["Item", "Qty buku", "Qty lot", "Selisih nilai"].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>
                    {r.data.rows.slice(0, 50).map((x) => (
                      <TableRow key={x.item_code}>
                        <TableCell>{x.item_code} · {x.name}</TableCell>
                        <TableCell>{qty(x.ledger_qty)}</TableCell>
                        <TableCell>{qty(x.lot_qty)}</TableCell>
                        <TableCell className={Math.abs(x.diff_value) > 0.5 ? "text-destructive" : ""}>{rp(x.diff_value)}</TableCell>
                      </TableRow>
                    ))}
                    {!r.data.rows.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Belum ada stok.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** Form lot dalam halaman (bukan modal). */
function LotForm({ workspaceId, data, edit, onClose }: { workspaceId: string; data: { items: { id: string; code: string; name: string }[]; suppliers: { id: string; name: string }[] }; edit: { id: string | null; values: typeof fresh }; onClose: () => void }) {
  const save = useServerFn(saveProductionLot);
  const qc = useQueryClient();
  const [values, setValues] = useState(edit.values);
  const [busy, setBusy] = useState(false);
  const id = edit.id;
  return (
    <div className="space-y-5">
      <div>
        <button type="button" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onClick={onClose}><ChevronLeft className="size-4" />Kembali ke daftar</button>
        <h1 className="text-2xl font-semibold">{id ? `Ubah lot ${values.lot_no}` : "Lot baru"}</h1>
      </div>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await save({ data: { workspaceId, id, values, reason: id ? "Perubahan data lot" : "Pembuatan lot" } });
            toast.success("Lot tersimpan");
            await qc.invalidateQueries({ queryKey: ["production-lots", workspaceId] });
            onClose();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Ditolak");
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-3">
          <AdminField label="Item"><AdminSelect value={values.item_id} onChange={(v) => { if (!id) setValues({ ...values, item_id: v }); }}><option value="">Pilih item</option>{data.items.map((i) => <option key={i.id} value={i.id}>{i.code} · {i.name}</option>)}</AdminSelect></AdminField>
          <AdminField label="Nomor lot"><Input required disabled={!!id} value={values.lot_no} onChange={(e) => setValues({ ...values, lot_no: e.target.value })} /></AdminField>
          <AdminField label="Lot pemasok"><Input value={values.supplier_lot_no} onChange={(e) => setValues({ ...values, supplier_lot_no: e.target.value })} /></AdminField>
          <AdminField label="Pemasok"><AdminSelect value={values.partner_id ?? ""} onChange={(v) => setValues({ ...values, partner_id: v || null })}><option value="">—</option>{data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</AdminSelect></AdminField>
          {(["mfg_date", "expiry_date", "retest_date"] as const).map((k) => (
            <AdminField key={k} label={k === "mfg_date" ? "Tanggal produksi" : k === "expiry_date" ? "Kedaluwarsa" : "Uji ulang"}>
              <Input type="date" value={values[k] ?? ""} onChange={(e) => setValues({ ...values, [k]: e.target.value || null })} />
            </AdminField>
          ))}
          {(["assay_pct", "lod_pct", "density_g_ml"] as const).map((k) => (
            <AdminField key={k} label={k === "assay_pct" ? "Assay (%)" : k === "lod_pct" ? "LOD (%)" : "Densitas (g/ml)"}>
              <Input type="number" step={k === "density_g_ml" ? "0.0001" : "0.000001"} value={values[k] ?? ""} onChange={(e) => setValues({ ...values, [k]: e.target.value ? Number(e.target.value) : null })} />
            </AdminField>
          ))}
        </fieldset>
        <div className="flex gap-2">
          <Button disabled={busy || !values.item_id || !values.lot_no.trim()}><Save className="size-4" />Simpan lot</Button>
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
        </div>
      </form>
    </div>
  );
}
