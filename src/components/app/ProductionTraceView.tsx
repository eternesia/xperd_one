import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Search, Loader2, Download, Printer, Plus, Pencil, Trash2, Save, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminField, AdminSelect } from './admin-ui';
import { PaginationBar, usePagination, searchRows } from './ui-states';
import { TableSearch } from './ProductionPagedTable';
import { searchTraceLots, traceProductionLot, getProductionReport, getWasteLogs, saveWasteLog, getProductionLetterhead, type WasteValues } from '@/lib/production-trace.functions';
import { toCsv } from '@/lib/production-report';
import { saveProductionPdf } from '@/lib/production-pdf';

async function reportPdf(workspaceId: string, section: 'traceability' | 'reports' | 'waste', name: string, title: string, tables: { title: string; rows: Record<string, unknown>[] }[]) {
  try {
    const head = await getProductionLetterhead({ data: { workspaceId, section } });
    await saveProductionPdf(name, title, head, tables.map((t) => { const headers = Object.keys(t.rows[0] ?? {}); return { title: t.title, headers, rows: t.rows.map((r) => headers.map((k) => r[k] == null ? '-' : String(r[k]))) }; }));
  } catch (e) { toast.error(e instanceof Error ? e.message : 'PDF tidak dapat dibuat'); }
}

const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
const num = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 4 });
const card = 'overflow-hidden rounded-2xl border border-border bg-card';
function download(name: string, rows: Record<string, unknown>[]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

export function ProductionTraceView({ workspaceId, section }: { workspaceId: string; section: string }) {
  if (section === 'reports') return <Reports workspaceId={workspaceId} />;
  if (section === 'waste') return <Waste workspaceId={workspaceId} />;
  return <Trace workspaceId={workspaceId} />;
}

function Trace({ workspaceId }: { workspaceId: string }) {
  const [search, setSearch] = useState(''), [lot, setLot] = useState('');
  const find = useServerFn(searchTraceLots), trace = useServerFn(traceProductionLot);
  const lots = useQuery({ queryKey: ['mfg-trace-lots', workspaceId, search], queryFn: () => find({ data: { workspaceId, search } }), placeholderData: (p) => p });
  const t = useQuery({ queryKey: ['mfg-trace', workspaceId, lot], enabled: !!lot, queryFn: () => trace({ data: { workspaceId, lotId: lot } }) });
  const chosen = lots.data?.find((l) => l.id === lot);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">Traceability & Recall</h1><p className="text-sm text-muted-foreground">Telusuri asal bahan dan sebaran produk dari satu lot.</p></div>{t.data && <Button variant="outline" onClick={() => { if (!t.data) return; void reportPdf(workspaceId, 'traceability', 'recall', 'Traceability & Recall', [{title:'Bahan asal',rows:t.data.backward},{title:'Lot turunan',rows:t.data.forward},{title:'Stok terdampak',rows:t.data.recall.lots},{title:'Pelanggan terdampak',rows:t.data.recall.customers}]); }}><Download className="size-4" />PDF laporan</Button>}</div>
    <div className="flex flex-wrap items-end gap-3 print:hidden"><AdminField label="Cari nomor lot"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="w-56 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nomor lot" /></div></AdminField><AdminField label="Lot"><AdminSelect className="w-80" value={lot} onChange={setLot}><option value="">Pilih lot</option>{lots.data?.map((l) => <option key={l.id} value={l.id}>{l.lot_no} · {l.item} · {l.qc_status}</option>)}</AdminSelect></AdminField></div>
    {!lot && <p className="py-12 text-center text-muted-foreground">Pilih lot untuk melihat penelusuran.</p>}
    {t.isFetching && <Loader2 className="m-8 animate-spin text-muted-foreground" />}
    {t.isError && <p className="text-destructive">{t.error.message}</p>}
    {t.data && <>
      <p className="text-xs text-muted-foreground">Lot {chosen?.lot_no} · dihitung dalam {t.data.ms} ms</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Sisa stok terdampak', num(t.data.recall.remaining_qty)], ['Nilai stok tersisa', rp(t.data.recall.remaining_value)], ['Kuantitas terjual', num(t.data.recall.sold_qty)], ['Nilai penjualan terdampak', rp(t.data.recall.sold_value)]].map(([k, v]) => <div key={k} className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-1 text-xl font-semibold">{v}</p></div>)}</div>
      <TraceTable title="Mundur — bahan asal" rows={t.data.backward} />
      <TraceTable title="Maju — lot turunan" rows={t.data.forward} />
      <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-lg font-medium">Lot dalam simulasi recall</h2><Button variant="outline" size="sm" className="print:hidden" onClick={() => { if (t.data) download('recall-lot.csv', t.data.recall.lots); }}><Download className="size-4" />CSV</Button></div><div className={card}><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-14 text-center">#</TableHead>{['Lot', 'Item', 'QC', 'Sisa', 'Nilai sisa', 'Terjual'].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{t.data.recall.lots.map((l, i) => <TableRow key={l.lot_id}><TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell><TableCell>{l.lot_no}</TableCell><TableCell>{l.item_code} · {l.item_name}</TableCell><TableCell>{l.qc_status}</TableCell><TableCell>{num(l.remaining_qty)}</TableCell><TableCell>{rp(l.remaining_value)}</TableCell><TableCell>{num(l.sold_qty)}</TableCell></TableRow>)}</TableBody></Table></div></div></section>
      <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-lg font-medium">Pelanggan terdampak</h2><Button variant="outline" size="sm" className="print:hidden" disabled={!t.data.recall.customers.length} onClick={() => { if (t.data) download('recall-pelanggan.csv', t.data.recall.customers); }}><Download className="size-4" />CSV</Button></div><div className={card}><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-14 text-center">#</TableHead>{['Kode', 'Pelanggan', 'Kuantitas', 'Nilai', 'Dokumen', 'Terakhir'].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{t.data.recall.customers.map((c, i) => <TableRow key={c.customer_code}><TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell><TableCell>{c.customer_code}</TableCell><TableCell>{c.customer_name}</TableCell><TableCell>{num(c.qty)}</TableCell><TableCell>{rp(c.value)}</TableCell><TableCell>{c.documents}</TableCell><TableCell>{c.last_date}</TableCell></TableRow>)}{!t.data.recall.customers.length && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Belum ada penjualan dari lot ini.</TableCell></TableRow>}</TableBody></Table></div></div></section>
    </>}
  </div>;
}

function TraceTable({ title, rows }: { title: string; rows: { lot_id: string; parent_id: string; depth: number; lot_no: string; item_code: string; item_name: string; qc_status: string; qty: number; uom: string | null; order_no: string | null }[] }) {
  const [s, setS] = useState(''); const p = usePagination(searchRows(rows, s), 10);
  return <section className="space-y-3"><h2 className="text-lg font-medium">{title}</h2><TableSearch value={s} onChange={setS} /><div className={card}><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-14 text-center">#</TableHead>{['Level', 'Lot', 'Item', 'QC', 'Kuantitas', 'Perintah produksi'].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{p.items.map((r, i) => <TableRow key={`${r.lot_id}-${r.parent_id}-${i}`}><TableCell className="text-center text-xs text-muted-foreground">{p.start + i + 1}</TableCell><TableCell>{r.depth}</TableCell><TableCell>{r.lot_no}</TableCell><TableCell>{r.item_code} · {r.item_name}</TableCell><TableCell>{r.qc_status}</TableCell><TableCell>{num(Number(r.qty))} {r.uom}</TableCell><TableCell>{r.order_no ?? '—'}</TableCell></TableRow>)}{!rows.length && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Tidak ada hubungan lot.</TableCell></TableRow>}</TableBody></Table></div><PaginationBar p={p as never} /></div></section>;
}

function Reports({ workspaceId }: { workspaceId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)), [to, setTo] = useState(today);
  const get = useServerFn(getProductionReport);
  const q = useQuery({ queryKey: ['mfg-report', workspaceId, from, to], queryFn: () => get({ data: { workspaceId, from, to } }) });
  const rows = q.data ?? []; const [s, setS] = useState(''); const p = usePagination(searchRows(rows, s), 25);
  const tot = rows.reduce((a, r) => ({ planned: a.planned + r.planned_qty, output: a.output + r.output_qty, cost: a.cost + r.total_cost, variance: a.variance + r.variance }), { planned: 0, output: 0, cost: 0, variance: 0 });
  return <div className="space-y-6"><div className="flex flex-wrap items-end justify-between gap-3"><h1 className="text-2xl font-semibold">Laporan Produksi</h1><div className="flex flex-wrap items-end gap-3 print:hidden"><AdminField label="Dari"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></AdminField><AdminField label="Sampai"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></AdminField><Button variant="outline" disabled={!rows.length} onClick={() => download(`laporan-produksi-${from}-${to}.csv`, rows.map(({ id: _id, ...r }) => r))}><Download className="size-4" />CSV</Button><Button variant="outline" disabled={!rows.length} onClick={() => void reportPdf(workspaceId, 'reports', `produksi-${from}-${to}`, "Laporan Produksi", [{title:`${from} — ${to}`,rows}])}><Download className="size-4" />PDF</Button><Button variant="outline" onClick={async () => { const { utils, writeFile } = await import("xlsx"); const book = utils.book_new(); utils.book_append_sheet(book, utils.json_to_sheet(rows), "Produksi"); writeFile(book, `produksi-${from}-${to}.xlsx`); }} disabled={!rows.length}><Download className="size-4" />Excel</Button></div></div>
    {q.isPending ? <Loader2 className="m-8 animate-spin text-muted-foreground" /> : q.isError ? <p className="text-muted-foreground">{q.error.message}</p> : <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Jumlah order', String(rows.length)], ['Rencana vs hasil', `${num(tot.planned)} / ${num(tot.output)}`], ['Total biaya', rp(tot.cost)], ['Total selisih', rp(tot.variance)]].map(([k, v]) => <div key={k} className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-1 text-xl font-semibold">{v}</p></div>)}</div>
      <TableSearch value={s} onChange={setS} /><div className={card}><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-14 text-center">#</TableHead>{['Order', 'Tanggal', 'Item', 'Lot', 'Status', 'Rencana', 'Hasil', 'Yield', 'Biaya', 'Per unit', 'Selisih'].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{p.items.map((r, i) => <TableRow key={r.id}><TableCell className="text-center text-xs text-muted-foreground">{p.start + i + 1}</TableCell><TableCell>{r.order_no}</TableCell><TableCell>{r.planned_start ?? '—'}</TableCell><TableCell>{r.item}</TableCell><TableCell>{r.batch_lot_no ?? '—'}</TableCell><TableCell>{r.status}</TableCell><TableCell>{num(r.planned_qty)} {r.uom}</TableCell><TableCell>{num(r.output_qty)}</TableCell><TableCell>{r.yield_pct != null ? `${num(r.yield_pct)}%` : '—'}</TableCell><TableCell>{rp(r.total_cost)}</TableCell><TableCell>{rp(r.unit_cost)}</TableCell><TableCell className={r.variance > 0 ? 'text-destructive' : ''}>{rp(r.variance)}</TableCell></TableRow>)}{!rows.length && <TableRow><TableCell colSpan={12} className="py-12 text-center text-muted-foreground">Belum ada perintah produksi di periode ini.</TableCell></TableRow>}</TableBody></Table></div><PaginationBar p={p as never} /></div>
    </>}</div>;
}

const freshWaste = (): WasteValues => ({ log_date: new Date().toISOString().slice(0, 10), waste_code: '', description: '', qty: 1, uom: 'KG', storage_location: null, handler_name: null, manifest_no: null, status: 'stored' });
const wasteStatus: Record<string, string> = { stored: 'Disimpan', handed_over: 'Diserahkan', disposed: 'Dimusnahkan' };
function Waste({ workspaceId }: { workspaceId: string }) {
  const get = useServerFn(getWasteLogs), save = useServerFn(saveWasteLog), qc = useQueryClient();
  const q = useQuery({ queryKey: ['mfg-waste', workspaceId], queryFn: () => get({ data: { workspaceId } }) });
  const [open, setOpen] = useState(false), [view, setView] = useState(false), [id, setId] = useState<string | null>(null), [v, setV] = useState<WasteValues>(freshWaste), [busy, setBusy] = useState(false);
  const rows = q.data?.rows ?? []; const [s, setS] = useState(''); const p = usePagination(searchRows(rows, s), 25);
  async function run(fn: () => Promise<unknown>, ok: string) { setBusy(true); try { await fn(); await qc.invalidateQueries({ queryKey: ['mfg-waste', workspaceId] }); toast.success(ok); setOpen(false); } catch (e) { toast.error(e instanceof Error ? e.message : 'Ditolak'); } finally { setBusy(false); } }
  const edit = (r: (typeof rows)[number], readOnly: boolean) => { setId(r.id); setV({ log_date: r.log_date, waste_code: r.waste_code, description: r.description, qty: Number(r.qty), uom: r.uom, storage_location: r.storage_location, handler_name: r.handler_name, manifest_no: r.manifest_no, status: r.status as WasteValues['status'] }); setView(readOnly); setOpen(true); };
  const canWrite = !!q.data?.canWrite;
  return <div className="space-y-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">Log Limbah B3</h1><p className="text-sm text-muted-foreground">Catatan penyimpanan, penyerahan, dan pemusnahan limbah B3.</p></div><Button disabled={!canWrite} onClick={() => { setId(null); setV(freshWaste()); setView(false); setOpen(true); }}><Plus className="size-4" />Catat limbah</Button></div>
    {q.isPending ? <Loader2 className="m-8 animate-spin text-muted-foreground" /> : q.isError ? <p className="text-muted-foreground">{q.error.message}</p> :
      <div className="space-y-3"><TableSearch value={s} onChange={setS} /><div className={card}><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-14 text-center">#</TableHead>{['Tanggal', 'Kode', 'Uraian', 'Jumlah', 'Lokasi', 'Manifest', 'Status'].map((h) => <TableHead key={h}>{h}</TableHead>)}<TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader><TableBody>{p.items.map((r, i) => <TableRow key={r.id}><TableCell className="text-center text-xs text-muted-foreground">{p.start + i + 1}</TableCell><TableCell>{r.log_date}</TableCell><TableCell>{r.waste_code}</TableCell><TableCell className="max-w-64 truncate">{r.description}</TableCell><TableCell>{num(Number(r.qty))} {r.uom}</TableCell><TableCell>{r.storage_location ?? '—'}</TableCell><TableCell>{r.manifest_no ?? '—'}</TableCell><TableCell>{wasteStatus[r.status] ?? r.status}</TableCell><TableCell className="text-right"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label="Lihat" onClick={() => edit(r, true)}><Eye className="size-4" /></Button><Button variant="ghost" size="icon" aria-label="Edit" disabled={!canWrite} onClick={() => edit(r, false)}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" aria-label="Arsipkan" disabled={!canWrite || busy} onClick={() => { if (confirm('Arsipkan catatan limbah ini?')) void run(() => save({ data: { workspaceId, id: r.id, values: null, archive: true } }), 'Catatan diarsipkan'); }}><Trash2 className="size-4" /></Button></div></TableCell></TableRow>)}{!rows.length && <TableRow><TableCell colSpan={9} className="py-12 text-center text-muted-foreground">Belum ada catatan limbah.</TableCell></TableRow>}</TableBody></Table></div><PaginationBar p={p as never} /></div></div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{view ? 'Detail limbah' : id ? 'Edit limbah' : 'Catat limbah B3'}</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void run(() => save({ data: { workspaceId, id, values: v, archive: false } }), 'Catatan tersimpan'); }}><fieldset disabled={view || busy} className="grid gap-4 sm:grid-cols-2">
      <AdminField label="Tanggal"><Input type="date" required disabled={!!id} value={v.log_date} onChange={(e) => setV({ ...v, log_date: e.target.value })} /></AdminField>
      <AdminField label="Kode limbah"><Input required disabled={!!id} placeholder="mis. B105d" value={v.waste_code} onChange={(e) => setV({ ...v, waste_code: e.target.value })} /></AdminField>
      <div className="sm:col-span-2"><AdminField label="Uraian"><Input required value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></AdminField></div>
      <AdminField label="Jumlah"><Input type="number" min="0.0001" step="0.0001" required disabled={!!id} value={v.qty} onChange={(e) => setV({ ...v, qty: Number(e.target.value) })} /></AdminField>
      <AdminField label="Satuan"><Input required disabled={!!id} value={v.uom} onChange={(e) => setV({ ...v, uom: e.target.value })} /></AdminField>
      <AdminField label="Lokasi simpan"><Input value={v.storage_location ?? ''} onChange={(e) => setV({ ...v, storage_location: e.target.value || null })} /></AdminField>
      <AdminField label="Pengangkut / pengolah"><Input value={v.handler_name ?? ''} onChange={(e) => setV({ ...v, handler_name: e.target.value || null })} /></AdminField>
      <AdminField label="No. manifest"><Input value={v.manifest_no ?? ''} onChange={(e) => setV({ ...v, manifest_no: e.target.value || null })} /></AdminField>
      <AdminField label="Status"><AdminSelect value={v.status} onChange={(s) => setV({ ...v, status: s as WasteValues['status'] })}>{Object.entries(wasteStatus).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</AdminSelect></AdminField>
    </fieldset>{!view && <Button disabled={busy || !canWrite}><Save className="size-4" />Simpan</Button>}</form></DialogContent></Dialog>
  </div>;
}
