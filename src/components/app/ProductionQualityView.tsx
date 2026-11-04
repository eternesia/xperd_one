import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { CheckCircle2, Eye, Loader2, PauseCircle, Pencil, Plus, Trash2, XCircle } from 'lucide-react';
import { ProductionPagedTable, RowNo } from './ProductionPagedTable';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminField, AdminSelect } from './admin-ui';
import { ProductionSignDialog } from './ProductionSignDialog';
import { closeDeviation, createQcInspection, decideLot, getInspectionResults, getProductionQuality, recordQcResults, saveDeviation, saveQcSpec } from '@/lib/production-quality.functions';
import { evaluateQcValue } from '@/lib/production-quality';

type Param = { param: string; method: string; unit: string; min_value: number | null; max_value: number | null; is_critical: boolean };
const blankParam: Param = { param: '', method: '', unit: '', min_value: null, max_value: null, is_critical: false };
const num = (v: string) => (v.trim() === '' ? null : Number(v));
const tone = (s: string) => (s === 'passed' || s === 'released' || s === 'closed' ? 'default' : s === 'failed' || s === 'rejected' ? 'destructive' : 'secondary') as 'default' | 'destructive' | 'secondary';

export function ProductionQualityView({ workspaceId }: { workspaceId: string }) {
  const get = useServerFn(getProductionQuality), saveSpec = useServerFn(saveQcSpec), createIns = useServerFn(createQcInspection), record = useServerFn(recordQcResults), results = useServerFn(getInspectionResults), decide = useServerFn(decideLot), saveDev = useServerFn(saveDeviation), closeDev = useServerFn(closeDeviation);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['production-quality', workspaceId], queryFn: () => get({ data: { workspaceId } }) });
  const [tab, setTab] = useState<'specs' | 'inspections' | 'deviations'>('inspections');
  const [busy, setBusy] = useState(false);
  const [spec, setSpec] = useState<{ id: string | null; item_id: string; stage: 'incoming' | 'in_process' | 'final'; code: string; name: string; params: Param[]; reason: string } | null>(null);
  const [ins, setIns] = useState<{ specId: string; lotId: string; sample: string; reason: string } | null>(null);
  const [entry, setEntry] = useState<{ id: string; values: Record<string, string>; reason: string } | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [dev, setDev] = useState<{ id: string | null; lot_id: string; description: string; impact: string; root_cause: string; capa: string; reason: string } | null>(null);
  const [sign, setSign] = useState<{ entityTable: 'mfg_lots' | 'mfg_deviations'; entityId: string; action: string; title: string } | null>(null);
  const viewQ = useQuery({ queryKey: ['production-qc-results', workspaceId, view], enabled: !!view, queryFn: () => results({ data: { workspaceId, inspectionId: view as string } }) });

  async function run(fn: () => Promise<void>) { setBusy(true); try { await fn(); await qc.invalidateQueries({ queryKey: ['production-quality', workspaceId] }); } catch (e) { toast.error(e instanceof Error ? e.message : 'Ditolak'); } finally { setBusy(false); } }
  if (q.isPending) return <Loader2 className="m-8 animate-spin text-muted-foreground" />;
  if (q.isError) return <p className="py-12 text-muted-foreground">{q.error.message}</p>;
  const d = q.data;
  const item = (id: string) => d.items.find((i) => i.id === id)?.code ?? '—';
  const lot = (id: string | null) => d.lots.find((l) => l.id === id);
  const specOf = (id: string) => d.specs.find((s) => s.id === id);
  const paramsOf = (id: string) => d.params.filter((p) => p.spec_id === id);

  return <div className="space-y-6">
    <h1 className="text-2xl font-semibold">Quality</h1>
    <div className="flex flex-wrap gap-2">{([['inspections', 'Inspeksi & rilis lot'], ['specs', 'Spesifikasi'], ['deviations', 'Deviasi & CAPA']] as const).map(([k, l]) => <Button key={k} variant={tab === k ? 'default' : 'outline'} onClick={() => setTab(k)}>{l}</Button>)}</div>
    {!d.isQaManager && <p className="text-sm text-muted-foreground">Rilis/tolak lot dan penutupan deviasi hanya untuk peran QA manager.</p>}

    {tab === 'specs' && <div className="space-y-3">
      <div className="flex justify-end"><Button disabled={!d.canWrite || busy} onClick={() => setSpec({ id: null, item_id: '', stage: 'incoming', code: '', name: '', params: [{ ...blankParam }], reason: '' })}><Plus className="size-4" />Spesifikasi baru</Button></div>
      <ProductionPagedTable rows={d.specs} headers={['Kode', 'Nama', 'Item', 'Tahap', 'Parameter', 'Aksi']} empty="Belum ada spesifikasi." row={(s, no) => <TableRow key={s.id}><RowNo no={no} /><TableCell>{s.code}</TableCell><TableCell>{s.name}</TableCell><TableCell>{item(s.item_id)}</TableCell><TableCell>{s.stage}</TableCell><TableCell>{paramsOf(s.id).map((p) => `${p.param} ${p.min_value ?? '…'}–${p.max_value ?? '…'}${p.unit ? ` ${p.unit}` : ''}`).join('; ')}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" aria-label="Edit spesifikasi" disabled={!d.canWrite} onClick={() => setSpec({ id: s.id, item_id: s.item_id, stage: s.stage as 'incoming', code: s.code, name: s.name, params: paramsOf(s.id).map((p) => ({ param: p.param, method: p.method ?? '', unit: p.unit ?? '', min_value: p.min_value, max_value: p.max_value, is_critical: p.is_critical })), reason: '' })}><Pencil className="h-4 w-4" /></Button></TableCell></TableRow>} />
    </div>}

    {tab === 'inspections' && <div className="space-y-6">
      <div className="flex justify-end"><Button disabled={!d.canWrite || busy || !d.specs.length} onClick={() => setIns({ specId: '', lotId: '', sample: '', reason: '' })}><Plus className="size-4" />Inspeksi baru</Button></div>
      <ProductionPagedTable rows={d.inspections} headers={['Sampel', 'Lot', 'Spesifikasi', 'Tahap', 'Status', 'Aksi']} empty="Belum ada inspeksi." row={(x, no) => <TableRow key={x.id}><RowNo no={no} /><TableCell>{x.sample_id}</TableCell><TableCell>{lot(x.lot_id)?.lot_no ?? '—'}</TableCell><TableCell>{specOf(x.spec_id)?.code}</TableCell><TableCell>{x.stage}</TableCell><TableCell><Badge variant={tone(x.status)}>{x.status}</Badge></TableCell><TableCell className="whitespace-nowrap text-right">{x.status === 'pending' ? <Button variant="ghost" size="icon" aria-label="Input hasil" disabled={!d.canWrite} onClick={() => setEntry({ id: x.id, values: {}, reason: '' })}><Pencil className="h-4 w-4" /></Button> : <Button variant="ghost" size="icon" aria-label="Lihat hasil" onClick={() => setView(x.id)}><Eye className="h-4 w-4" /></Button>}</TableCell></TableRow>} />
      <h2 className="text-lg font-medium">Status lot</h2>
      <ProductionPagedTable rows={d.lots.filter((l) => l.qc_status !== 'rejected')} perPage={10} headers={['Lot', 'Item', 'Status QC', 'Kedaluwarsa', 'Aksi']} empty="Belum ada lot." row={(l, no) => <TableRow key={l.id}><RowNo no={no} /><TableCell>{l.lot_no}</TableCell><TableCell>{item(l.item_id)}</TableCell><TableCell><Badge variant={tone(l.qc_status)}>{l.qc_status}</Badge></TableCell><TableCell>{l.expiry_date ?? '—'}</TableCell><TableCell className="whitespace-nowrap text-right">{(['released', 'hold', 'rejected'] as const).filter((s) => s !== l.qc_status).map((s) => { const label = s === 'released' ? 'Rilis' : s === 'hold' ? 'Tahan' : 'Tolak'; const Icon = s === 'released' ? CheckCircle2 : s === 'hold' ? PauseCircle : XCircle; return <Button key={s} variant="ghost" size="icon" aria-label={`${label} lot`} title={label} disabled={!d.isQaManager || busy} onClick={() => setSign({ entityTable: 'mfg_lots', entityId: l.id, action: `lot_${s}`, title: `${label} lot ${l.lot_no}` })}><Icon className={`h-4 w-4 ${s === 'rejected' ? 'text-destructive' : ''}`} /></Button>; })}</TableCell></TableRow>} />
    </div>}

    {tab === 'deviations' && <div className="space-y-3">
      <div className="flex justify-end"><Button disabled={!d.canWrite || busy} onClick={() => setDev({ id: null, lot_id: '', description: '', impact: '', root_cause: '', capa: '', reason: '' })}><Plus className="size-4" />Deviasi baru</Button></div>
      <ProductionPagedTable rows={d.deviations} headers={['Nomor', 'Sumber', 'Lot', 'Deskripsi', 'Status', 'Aksi']} empty="Tidak ada deviasi." row={(v, no) => <TableRow key={v.id}><RowNo no={no} /><TableCell>{v.deviation_no}</TableCell><TableCell>{v.source}</TableCell><TableCell>{lot(v.lot_id)?.lot_no ?? '—'}</TableCell><TableCell className="max-w-xs truncate">{v.description}</TableCell><TableCell><Badge variant={tone(v.status)}>{v.status}</Badge></TableCell><TableCell className="whitespace-nowrap text-right">
        <Button variant="ghost" size="icon" aria-label="Lihat / investigasi" disabled={busy} onClick={() => setDev({ id: v.id, lot_id: v.lot_id ?? '', description: v.description, impact: v.impact ?? '', root_cause: v.root_cause ?? '', capa: v.capa ?? '', reason: '' })}>{v.status === 'closed' ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</Button>
        {v.status !== 'closed' && <Button variant="ghost" size="icon" aria-label="Tutup deviasi" disabled={!d.isQaManager || !v.root_cause || !v.capa} onClick={() => setSign({ entityTable: 'mfg_deviations', entityId: v.id, action: 'deviation_close', title: `Tutup ${v.deviation_no}` })}><CheckCircle2 className="h-4 w-4" /></Button>}
      </TableCell></TableRow>} />
    </div>}

    <Dialog open={!!spec} onOpenChange={(o) => { if (!o) setSpec(null); }}><DialogContent className="max-w-3xl">{spec && <><DialogHeader><DialogTitle>{spec.id ? 'Edit spesifikasi' : 'Spesifikasi baru'}</DialogTitle></DialogHeader><div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminField label="Item"><AdminSelect value={spec.item_id} onChange={(v) => { if (!spec.id) setSpec({ ...spec, item_id: v }); }}><option value="">Pilih item</option>{d.items.map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}</AdminSelect></AdminField>
        <AdminField label="Tahap"><AdminSelect value={spec.stage} onChange={(v) => { if (!spec.id) setSpec({ ...spec, stage: v as 'incoming' }); }}><option value="incoming">Bahan masuk</option><option value="in_process">In-process</option><option value="final">Rilis akhir</option></AdminSelect></AdminField>
        <AdminField label="Kode"><Input disabled={!!spec.id} value={spec.code} onChange={(e) => setSpec({ ...spec, code: e.target.value.toUpperCase() })} /></AdminField>
        <AdminField label="Nama"><Input value={spec.name} onChange={(e) => setSpec({ ...spec, name: e.target.value })} /></AdminField>
      </div>
      <div className="space-y-2">{spec.params.map((p, i) => { const set = (patch: Partial<Param>) => setSpec({ ...spec, params: spec.params.map((x, j) => (j === i ? { ...x, ...patch } : x)) }); return <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto_auto] sm:items-center">
        <Input aria-label="Parameter" placeholder="Parameter (mis. Kadar AI)" value={p.param} onChange={(e) => set({ param: e.target.value })} />
        <Input aria-label="Metode" placeholder="Metode" value={p.method} onChange={(e) => set({ method: e.target.value })} />
        <Input aria-label="Satuan" placeholder="Satuan" value={p.unit} onChange={(e) => set({ unit: e.target.value })} />
        <Input aria-label="Min" placeholder="Min" type="number" step="any" value={p.min_value ?? ''} onChange={(e) => set({ min_value: num(e.target.value) })} />
        <Input aria-label="Maks" placeholder="Maks" type="number" step="any" value={p.max_value ?? ''} onChange={(e) => set({ max_value: num(e.target.value) })} />
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={p.is_critical} onChange={(e) => set({ is_critical: e.target.checked })} />Kritis</label>
        <Button variant="ghost" size="icon" aria-label="Hapus parameter" disabled={spec.params.length === 1} onClick={() => setSpec({ ...spec, params: spec.params.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button>
      </div>; })}<Button variant="outline" size="sm" onClick={() => setSpec({ ...spec, params: [...spec.params, { ...blankParam }] })}><Plus className="size-4" />Parameter</Button></div>
      <AdminField label="Alasan perubahan"><Input value={spec.reason} onChange={(e) => setSpec({ ...spec, reason: e.target.value })} /></AdminField>
      <div className="flex justify-end"><Button disabled={busy || !spec.item_id || !spec.code || !spec.name || !spec.reason.trim()} onClick={() => run(async () => { await saveSpec({ data: { workspaceId, id: spec.id, values: { item_id: spec.item_id, bom_version_id: '', stage: spec.stage, code: spec.code, name: spec.name, is_active: true }, params: spec.params, reason: spec.reason } }); toast.success('Spesifikasi tersimpan'); setSpec(null); })}>Simpan</Button></div>
    </div></>}</DialogContent></Dialog>

    <Dialog open={!!ins} onOpenChange={(o) => { if (!o) setIns(null); }}><DialogContent>{ins && <><DialogHeader><DialogTitle>Inspeksi baru</DialogTitle></DialogHeader><div className="space-y-4">
      <AdminField label="Lot"><AdminSelect value={ins.lotId} onChange={(v) => setIns({ ...ins, lotId: v, specId: '' })}><option value="">Pilih lot</option>{d.lots.map((l) => <option key={l.id} value={l.id}>{l.lot_no} — {item(l.item_id)} ({l.qc_status})</option>)}</AdminSelect></AdminField>
      <AdminField label="Spesifikasi"><AdminSelect value={ins.specId} onChange={(v) => setIns({ ...ins, specId: v })}><option value="">Pilih spesifikasi</option>{d.specs.filter((s) => s.is_active && s.item_id === lot(ins.lotId)?.item_id).map((s) => <option key={s.id} value={s.id}>{s.code} — {s.stage}</option>)}</AdminSelect></AdminField>
      <AdminField label="ID sampel"><Input value={ins.sample} onChange={(e) => setIns({ ...ins, sample: e.target.value })} /></AdminField>
      <AdminField label="Alasan"><Input value={ins.reason} onChange={(e) => setIns({ ...ins, reason: e.target.value })} /></AdminField>
      <div className="flex justify-end"><Button disabled={busy || !ins.lotId || !ins.specId || !ins.sample.trim() || !ins.reason.trim()} onClick={() => run(async () => { await createIns({ data: { workspaceId, specId: ins.specId, lotId: ins.lotId, orderId: null, sampleId: ins.sample, key: crypto.randomUUID(), reason: ins.reason } }); setIns(null); })}>Buat</Button></div>
    </div></>}</DialogContent></Dialog>

    <Dialog open={!!entry} onOpenChange={(o) => { if (!o) setEntry(null); }}><DialogContent className="max-w-2xl">{entry && (() => { const x = d.inspections.find((i) => i.id === entry.id); const ps = x ? paramsOf(x.spec_id) : []; return <><DialogHeader><DialogTitle>Input hasil {x?.sample_id}</DialogTitle></DialogHeader><div className="space-y-3">
      {ps.map((p) => { const raw = entry.values[p.id] ?? ''; const ok = raw === '' ? null : evaluateQcValue(Number(raw), p.min_value, p.max_value); return <div key={p.id} className="grid grid-cols-[1fr_8rem_4rem] items-center gap-2"><span className="text-sm">{p.param} <span className="text-muted-foreground">({p.min_value ?? '…'}–{p.max_value ?? '…'} {p.unit}){p.is_critical ? ' · kritis' : ''}</span></span><Input aria-label={p.param} type="number" step="any" value={raw} onChange={(e) => setEntry({ ...entry, values: { ...entry.values, [p.id]: e.target.value } })} /><span className="text-sm">{ok === null ? '' : ok ? 'OK' : 'Di luar'}</span></div>; })}
      <AdminField label="Alasan"><Input value={entry.reason} onChange={(e) => setEntry({ ...entry, reason: e.target.value })} /></AdminField>
      <p className="text-sm text-muted-foreground">Server mengevaluasi hasil. Nilai di luar batas otomatis menggagalkan inspeksi dan membuka deviasi.</p>
      <div className="flex justify-end"><Button disabled={busy || !entry.reason.trim() || ps.some((p) => (entry.values[p.id] ?? '') === '')} onClick={() => run(async () => { const r = await record({ data: { workspaceId, inspectionId: entry.id, reason: entry.reason, results: ps.map((p) => ({ param_id: p.id, value: Number(entry.values[p.id]), method_note: '', instrument_id: '' })) } }); toast[r.status === 'passed' ? 'success' : 'error'](r.status === 'passed' ? 'Inspeksi lulus' : 'Inspeksi gagal — deviasi dibuka'); setEntry(null); })}>Simpan hasil</Button></div>
    </div></>; })()}</DialogContent></Dialog>

    <Dialog open={!!view} onOpenChange={(o) => { if (!o) setView(null); }}><DialogContent><DialogHeader><DialogTitle>Hasil inspeksi</DialogTitle></DialogHeader>{viewQ.isPending ? <Loader2 className="animate-spin" /> : <Table><TableBody>{(viewQ.data ?? []).map((r) => <TableRow key={r.id}><TableCell>{d.params.find((p) => p.id === r.param_id)?.param}</TableCell><TableCell>{r.value} {r.unit}</TableCell><TableCell><Badge variant={r.pass ? 'default' : 'destructive'}>{r.pass ? 'OK' : 'Di luar'}</Badge></TableCell></TableRow>)}</TableBody></Table>}</DialogContent></Dialog>

    <Dialog open={!!dev} onOpenChange={(o) => { if (!o) setDev(null); }}><DialogContent>{dev && <><DialogHeader><DialogTitle>{dev.id ? 'Investigasi deviasi' : 'Deviasi baru'}</DialogTitle></DialogHeader><div className="space-y-3">
      {!dev.id && <><AdminField label="Lot (opsional)"><AdminSelect value={dev.lot_id} onChange={(v) => setDev({ ...dev, lot_id: v })}><option value="">—</option>{d.lots.map((l) => <option key={l.id} value={l.id}>{l.lot_no}</option>)}</AdminSelect></AdminField><AdminField label="Deskripsi"><Input value={dev.description} onChange={(e) => setDev({ ...dev, description: e.target.value })} /></AdminField></>}
      <AdminField label="Dampak"><Input value={dev.impact} onChange={(e) => setDev({ ...dev, impact: e.target.value })} /></AdminField>
      {dev.id && <><AdminField label="Akar masalah"><Input value={dev.root_cause} onChange={(e) => setDev({ ...dev, root_cause: e.target.value })} /></AdminField><AdminField label="CAPA"><Input value={dev.capa} onChange={(e) => setDev({ ...dev, capa: e.target.value })} /></AdminField></>}
      <AdminField label="Alasan"><Input value={dev.reason} onChange={(e) => setDev({ ...dev, reason: e.target.value })} /></AdminField>
      <div className="flex justify-end"><Button disabled={busy || !dev.reason.trim() || (!dev.id && !dev.description.trim())} onClick={() => run(async () => { await saveDev({ data: { workspaceId, id: dev.id, values: { lot_id: dev.lot_id, order_id: '', description: dev.description, impact: dev.impact, root_cause: dev.root_cause, capa: dev.capa }, reason: dev.reason } }); setDev(null); })}>Simpan</Button></div>
    </div></>}</DialogContent></Dialog>

    <ProductionSignDialog workspaceId={workspaceId} target={sign} onClose={() => setSign(null)} onSigned={async (signature, reason) => { const t = sign; if (!t) return; await run(async () => { if (t.entityTable === 'mfg_lots') await decide({ data: { workspaceId, lotId: t.entityId, status: t.action.replace('lot_', '') as 'released', signature, reason } }); else await closeDev({ data: { workspaceId, id: t.entityId, signature, reason } }); toast.success('Ditandatangani'); }); }} />
  </div>;
}
