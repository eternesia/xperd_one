import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useNavigate } from '@tanstack/react-router';
import { Check, CheckCircle2, Loader2, PauseCircle, Save, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminField, AdminSelect } from './admin-ui';
import { ItemSearchAdd, type SearchOption } from './ItemSearchAdd';
import { ProductionPageShell } from './ProductionPageShell';
import { closeDeviation, createQcInspection, decideLot, getInspectionResults, getProductionQuality, recordQcResults, saveDeviation, saveQcSpec, transitionQcSpec } from '@/lib/production-quality.functions';
import { evaluateQcValue } from '@/lib/production-quality';

type Data = Awaited<ReturnType<typeof getProductionQuality>>;
type Param = { param: string; method: string; unit: string; min_value: number | null; max_value: number | null; is_critical: boolean };
const num = (v: string) => (v.trim() === '' ? null : Number(v));
const STAGE: Record<string, string> = { incoming: 'Bahan masuk', in_process: 'In-process', final: 'Rilis akhir' };
const LOT: Record<string, string> = { quarantine: 'Karantina', released: 'Rilis', hold: 'Tahan', rejected: 'Ditolak', expired: 'Kedaluwarsa' };

// Parameter uji umum kosmetik/skincare; batas diisi sesuai spesifikasi pabrik.
const COMMON: (SearchOption & { p: Omit<Param, 'param'> })[] = [
  ['pH', '', 'pH'], ['Viskositas', 'Viskometer', 'cps'], ['Bobot jenis', 'Piknometer', 'g/mL'], ['Organoleptik – penampilan', 'Visual (1 = sesuai)', ''],
  ['Warna', 'Visual (1 = sesuai)', ''], ['Bau', 'Organoleptik (1 = sesuai)', ''], ['Angka lempeng total (ALT)', 'Cawan tuang', 'CFU/g'], ['Kapang & khamir', 'Cawan tuang', 'CFU/g'],
  ['Patogen (negatif = 0)', 'Mikrobiologi', 'CFU/g'], ['SPF in vitro', 'Spektrofotometer', ''], ['Kadar bahan aktif', 'HPLC', '%'], ['Volume / berat bersih', 'Timbang', 'g'],
  ['Stabilitas (sentrifugasi)', 'Sentrifuge (1 = stabil)', ''], ['Kadar air', 'Karl Fischer', '%'],
].map(([name, method, unit], i) => ({ id: `c${i}`, code: name, hint: unit || undefined, p: { method, unit, min_value: null, max_value: null, is_critical: false } }));

function useQuality(workspaceId: string) {
  const get = useServerFn(getProductionQuality);
  return useQuery({ queryKey: ['production-quality', workspaceId], queryFn: () => get({ data: { workspaceId } }) });
}

export function ProductionQualityDoc({ workspaceId, docId }: { workspaceId: string; docId: string }) {
  const q = useQuality(workspaceId);
  if (q.isPending) return <Loader2 className="m-8 animate-spin text-muted-foreground" />;
  if (q.isError) return <p className="py-12 text-muted-foreground">{q.error.message}</p>;
  const [kind, ...rest] = docId.split('-');
  const id = rest.join('-');
  if (kind === 'spec') return <SpecPage workspaceId={workspaceId} d={q.data} id={id === 'new' ? null : id} />;
  if (kind === 'insp') return <InspectionPage workspaceId={workspaceId} d={q.data} id={id === 'new' ? null : id} />;
  if (kind === 'dev') return <DeviationPage workspaceId={workspaceId} d={q.data} id={id === 'new' ? null : id} />;
  return <p className="text-sm text-muted-foreground">Halaman tidak tersedia.</p>;
}

function useRun(workspaceId: string) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); await qc.invalidateQueries({ queryKey: ['production-quality', workspaceId] }); } catch (e) { toast.error(e instanceof Error ? e.message : 'Ditolak'); } finally { setBusy(false); }
  }
  return { busy, run };
}

/* ------------------------------------------------------------------ spesifikasi */
function SpecPage({ workspaceId, d, id }: { workspaceId: string; d: Data; id: string | null }) {
  const nav = useNavigate();
  const save = useServerFn(saveQcSpec), transition = useServerFn(transitionQcSpec);
  const { busy, run } = useRun(workspaceId);
  const spec = id ? d.specs.find((s) => s.id === id) : null;
  const [f, setF] = useState({ item_id: '', stage: 'incoming' as 'incoming' | 'in_process' | 'final', code: '', name: '' });
  const [params, setParams] = useState<Param[]>([]);
  useEffect(() => {
    if (!spec) return;
    setF({ item_id: spec.item_id, stage: spec.stage, code: spec.code, name: spec.name });
    setParams(d.params.filter((p) => p.spec_id === spec.id).map((p) => ({ param: p.param, method: p.method ?? '', unit: p.unit ?? '', min_value: p.min_value, max_value: p.max_value, is_critical: p.is_critical })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec?.id]);
  if (id && !spec) return <p className="py-12 text-muted-foreground">Spesifikasi tidak ditemukan.</p>;
  const approved = spec ? spec.status === 'approved' : false;
  const editable = d.canWrite && !approved;
  const patch = (i: number, p: Partial<Param>) => setParams((ps) => ps.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const options = useMemo(() => COMMON, []);
  const bad = params.find((p) => p.min_value === null && p.max_value === null);
  const problem = !f.item_id ? 'Pilih item.' : !f.code.trim() || !f.name.trim() ? 'Kode dan nama wajib.' : params.length === 0 ? 'Tambahkan minimal satu parameter.' : bad ? `Isi batas min/maks untuk "${bad.param}".` : '';

  async function persist(): Promise<string> {
    const r = await save({ data: { workspaceId, id, values: { item_id: f.item_id, bom_version_id: '', stage: f.stage, code: f.code, name: f.name, is_active: true }, params, reason: id ? 'Ubah spesifikasi QC' : 'Spesifikasi QC baru' } });
    return r.id as string;
  }
  const goto = (sid: string) => void nav({ to: '/app/w/$workspaceId/$moduleId/$submoduleId/$docId', search: { print: undefined }, params: { workspaceId, moduleId: 'manufacturing', submoduleId: 'quality', docId: `spec-${sid}` } });

  return <ProductionPageShell workspaceId={workspaceId} section="quality" title={spec ? `Spesifikasi ${spec.code}` : 'Spesifikasi QC baru'} status={spec ? spec.status : 'draft'}
    actions={<>
      {editable && <Button variant="outline" disabled={busy || !!problem} onClick={() => void run(async () => { const sid = await persist(); toast.success('Draft tersimpan'); if (!id) goto(sid); })}><Save className="size-4" />Simpan draft</Button>}
      {editable && <Button disabled={busy || !!problem} onClick={() => void run(async () => { const sid = await persist(); await transition({ data: { workspaceId, id: sid, status: 'approved' } }); toast.success('Spesifikasi di-approve'); if (!id) goto(sid); })}><Check className="size-4" />Approve</Button>}
      {approved && d.canWrite && <Button variant="outline" disabled={busy} onClick={() => void run(async () => { await transition({ data: { workspaceId, id: id as string, status: 'draft' } }); toast.success('Dikembalikan ke draft'); })}>Kembalikan ke draft</Button>}
    </>}>
    {!d.canWrite && <p className="text-sm text-muted-foreground">Anda hanya dapat melihat spesifikasi ini.</p>}
    <fieldset disabled={!editable || busy} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <AdminField label="Item"><AdminSelect value={f.item_id} onChange={(v) => !id && setF({ ...f, item_id: v })}><option value="">Pilih item</option>{d.items.map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}</AdminSelect></AdminField>
        <AdminField label="Tahap"><AdminSelect value={f.stage} onChange={(v) => !id && setF({ ...f, stage: v as typeof f.stage })}><option value="incoming">Bahan masuk</option><option value="in_process">In-process</option><option value="final">Rilis akhir</option></AdminSelect></AdminField>
        <AdminField label="Kode"><Input disabled={!!id} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></AdminField>
        <AdminField label="Nama"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></AdminField>
      </div>
      <div className="space-y-3">
        <h2 className="font-medium">Parameter uji</h2>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card"><Table>
          <TableHeader><TableRow>{['Parameter', 'Metode', 'Satuan', 'Min', 'Maks', 'Kritis', ''].map((h, i) => <TableHead key={i}>{h}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {params.map((p, i) => <TableRow key={i}>
              <TableCell><Input aria-label="Parameter" className="min-w-44" value={p.param} onChange={(e) => patch(i, { param: e.target.value })} /></TableCell>
              <TableCell><Input aria-label="Metode" value={p.method} onChange={(e) => patch(i, { method: e.target.value })} /></TableCell>
              <TableCell><Input aria-label="Satuan" className="w-24" value={p.unit} onChange={(e) => patch(i, { unit: e.target.value })} /></TableCell>
              <TableCell><Input aria-label="Min" className="w-24" type="number" step="any" value={p.min_value ?? ''} onChange={(e) => patch(i, { min_value: num(e.target.value) })} /></TableCell>
              <TableCell><Input aria-label="Maks" className="w-24" type="number" step="any" value={p.max_value ?? ''} onChange={(e) => patch(i, { max_value: num(e.target.value) })} /></TableCell>
              <TableCell><input type="checkbox" aria-label="Kritis" checked={p.is_critical} onChange={(e) => patch(i, { is_critical: e.target.checked })} /></TableCell>
              <TableCell><Button type="button" variant="ghost" size="icon" aria-label="Hapus parameter" onClick={() => setParams((ps) => ps.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button></TableCell>
            </TableRow>)}
            {editable && <TableRow><TableCell colSpan={7}>
              <ItemSearchAdd className="md:w-full md:max-w-md md:min-w-0" options={options} placeholder="Tambah parameter: pH, viskositas, ALT… lalu Enter (atau ketik bebas)"
                onAdd={(o) => { const c = COMMON.find((x) => x.id === o.id); if (c) setParams((ps) => [...ps, { param: c.code, ...c.p }]); }}
                onFreeText={(t) => setParams((ps) => [...ps, { param: t, method: '', unit: '', min_value: null, max_value: null, is_critical: false }])} />
            </TableCell></TableRow>}
          </TableBody></Table></div>
        <p className="text-xs text-muted-foreground">Hasil uji berupa angka. Untuk uji kualitatif (warna/bau/penampilan) pakai 1 = sesuai, 0 = tidak sesuai dengan min 1.</p>
        {editable && problem && <p className="text-sm text-destructive">{problem}</p>}
      </div>
    </fieldset>
  </ProductionPageShell>;
}

/* ------------------------------------------------------------------ sampel & hasil */
function InspectionPage({ workspaceId, d, id }: { workspaceId: string; d: Data; id: string | null }) {
  const nav = useNavigate();
  const create = useServerFn(createQcInspection), record = useServerFn(recordQcResults), decide = useServerFn(decideLot), results = useServerFn(getInspectionResults);
  const { busy, run } = useRun(workspaceId);
  const ins = id ? d.inspections.find((i) => i.id === id) : null;
  const [lotId, setLotId] = useState(''), [specId, setSpecId] = useState('');
  const [sample, setSample] = useState(() => `SMP-${new Date().toLocaleDateString('en-CA').replaceAll('-', '')}-${String(Math.floor(Math.random() * 900) + 100)}`);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const resQ = useQuery({ queryKey: ['production-qc-results', workspaceId, id], enabled: !!ins && ins.status !== 'pending', queryFn: () => results({ data: { workspaceId, inspectionId: id as string } }) });
  const lot = (lid: string | null) => d.lots.find((l) => l.id === lid);
  const goto = (iid: string) => void nav({ to: '/app/w/$workspaceId/$moduleId/$submoduleId/$docId', search: { print: undefined }, params: { workspaceId, moduleId: 'manufacturing', submoduleId: 'quality', docId: `insp-${iid}` } });
  const itemCode = (iid: string) => d.items.find((i) => i.id === iid)?.code ?? '—';

  /* langkah 1: pilih lot & spesifikasi (sampel baru) */
  if (!id) {
    const l = lot(lotId);
    const specs = d.specs.filter((s) => s.is_active && s.status === 'approved' && (!l || s.item_id === l.item_id));
    return <ProductionPageShell workspaceId={workspaceId} section="quality" title="Sampel QC baru" subtitle="Langkah 1 dari 3 — pilih lot dan spesifikasi">
      <Stepper step={1} />
      {!d.canWrite && <p className="text-sm text-muted-foreground">Anda tidak punya akses menulis QC.</p>}
      <div className="grid max-w-3xl gap-4 sm:grid-cols-3">
        <AdminField label="Lot"><AdminSelect value={lotId} onChange={(v) => { setLotId(v); setSpecId(''); }}><option value="">Pilih lot</option>{d.lots.map((x) => <option key={x.id} value={x.id}>{x.lot_no} — {itemCode(x.item_id)} ({LOT[x.qc_status] ?? x.qc_status})</option>)}</AdminSelect></AdminField>
        <AdminField label="Spesifikasi (approved)"><AdminSelect value={specId} onChange={setSpecId}><option value="">{l ? 'Pilih spesifikasi' : 'Pilih lot dulu'}</option>{specs.map((s) => <option key={s.id} value={s.id}>{s.code} — {STAGE[s.stage]}</option>)}</AdminSelect></AdminField>
        <AdminField label="ID sampel"><Input value={sample} onChange={(e) => setSample(e.target.value)} /></AdminField>
      </div>
      {l && !specs.length && <p className="text-sm text-destructive">Belum ada spesifikasi approved untuk item {itemCode(l.item_id)}. Buat dan approve di tab Spesifikasi.</p>}
      <Button disabled={busy || !d.canWrite || !lotId || !specId || !sample.trim()} onClick={() => void run(async () => { const r = await create({ data: { workspaceId, specId, lotId, orderId: null, sampleId: sample.trim(), key: crypto.randomUUID(), reason: 'Sampel QC baru' } }); toast.success('Sampel dibuat'); goto(r.id as string); })}>Lanjut: isi hasil</Button>
    </ProductionPageShell>;
  }
  if (!ins) return <p className="py-12 text-muted-foreground">Sampel tidak ditemukan.</p>;
  const l = lot(ins.lot_id);
  const spec = d.specs.find((s) => s.id === ins.spec_id);
  const ps = d.params.filter((p) => p.spec_id === ins.spec_id);
  const pending = ins.status === 'pending';
  const step = pending ? 2 : 3;
  const filled = ps.every((p) => (vals[p.id] ?? '') !== '');

  return <ProductionPageShell workspaceId={workspaceId} section="quality" title={`Sampel ${ins.sample_id}`} subtitle={`Lot ${l?.lot_no ?? '—'} · spesifikasi ${spec?.code ?? '—'} (${STAGE[ins.stage] ?? ins.stage})`}>
    <Stepper step={step} />
    <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">✓ Langkah 1 — lot {l?.lot_no ?? '—'}, spesifikasi {spec?.code ?? '—'}{!pending && <> · ✓ Langkah 2 — hasil uji <Badge variant={ins.status === 'passed' ? 'default' : 'destructive'}>{ins.status === 'passed' ? 'Lulus' : 'Gagal'}</Badge></>}</div>

    {pending && <div className="space-y-3">
      <h2 className="font-medium">Langkah 2 — isi hasil uji</h2>
      <div className="max-w-3xl space-y-2">
        {ps.map((p) => { const raw = vals[p.id] ?? ''; const ok = raw === '' ? null : evaluateQcValue(Number(raw), p.min_value, p.max_value);
          return <div key={p.id} className="grid grid-cols-[1fr_9rem_5rem] items-center gap-2"><span className="text-sm">{p.param} <span className="text-muted-foreground">({p.min_value ?? '…'}–{p.max_value ?? '…'} {p.unit}){p.is_critical ? ' · kritis' : ''}</span></span><Input aria-label={p.param} type="number" step="any" disabled={!d.canWrite} value={raw} onChange={(e) => setVals({ ...vals, [p.id]: e.target.value })} /><span className={`text-sm ${ok === false ? 'text-destructive' : ''}`}>{ok === null ? '' : ok ? 'OK' : 'Di luar'}</span></div>; })}
      </div>
      <p className="text-sm text-muted-foreground">Server menilai hasil. Nilai di luar batas otomatis menggagalkan sampel dan membuka deviasi.</p>
      <Button disabled={busy || !d.canWrite || !filled} onClick={() => void run(async () => { const r = await record({ data: { workspaceId, inspectionId: ins.id, reason: 'Input hasil uji', results: ps.map((p) => ({ param_id: p.id, value: Number(vals[p.id]), method_note: '', instrument_id: '' })) } }); toast[r.status === 'passed' ? 'success' : 'error'](r.status === 'passed' ? 'Sampel lulus' : 'Sampel gagal — deviasi dibuka'); })}>Simpan hasil</Button>
    </div>}

    {!pending && <div className="space-y-5">
      <div className="max-w-3xl overflow-hidden rounded-2xl border border-border bg-card"><Table><TableBody>
        {resQ.isPending ? <TableRow><TableCell><Loader2 className="animate-spin" /></TableCell></TableRow> : (resQ.data ?? []).map((r) => <TableRow key={r.id}><TableCell>{d.params.find((p) => p.id === r.param_id)?.param}</TableCell><TableCell>{r.value} {r.unit}</TableCell><TableCell><Badge variant={r.pass ? 'default' : 'destructive'}>{r.pass ? 'OK' : 'Di luar'}</Badge></TableCell></TableRow>)}
      </TableBody></Table></div>
      <div className="max-w-3xl space-y-3">
        <h2 className="font-medium">Langkah 3 — keputusan rilis lot</h2>
        {!l ? <p className="text-sm text-muted-foreground">Sampel ini tidak terkait lot.</p> : <>
          <p className="text-sm">Status lot {l.lot_no} saat ini: <Badge variant={l.qc_status === 'released' ? 'default' : 'secondary'}>{LOT[l.qc_status] ?? l.qc_status}</Badge></p>
          {ins.status === 'failed' && <p className="text-sm text-destructive">Sampel gagal — lot tidak dapat dirilis sebelum ada sampel lulus dan deviasi ditutup.</p>}
          {!d.isQaManager ? <p className="text-sm text-muted-foreground">Keputusan rilis hanya untuk peran QA manager.</p> : <>
            <AdminField label="Catatan keputusan"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. sesuai spesifikasi" /></AdminField>
            <div className="flex flex-wrap gap-2">{(['released', 'hold', 'rejected'] as const).filter((s) => s !== l.qc_status).map((s) => {
              const label = s === 'released' ? 'Rilis lot' : s === 'hold' ? 'Tahan lot' : 'Tolak lot'; const Icon = s === 'released' ? CheckCircle2 : s === 'hold' ? PauseCircle : XCircle;
              return <Button key={s} variant={s === 'released' ? 'default' : 'outline'} disabled={busy || !note.trim()} onClick={() => void run(async () => { await decide({ data: { workspaceId, lotId: l.id, status: s, reason: note.trim() } }); toast.success(`Lot ${LOT[s].toLowerCase()}`); setNote(''); })}><Icon className="size-4" />{label}</Button>; })}</div>
          </>}
        </>}
      </div>
    </div>}
  </ProductionPageShell>;
}

function Stepper({ step }: { step: number }) {
  return <ol className="flex flex-wrap gap-3 text-sm">{['Pilih lot & spesifikasi', 'Isi hasil', 'Keputusan rilis'].map((t, i) => <li key={t} className={`flex items-center gap-2 ${i + 1 === step ? 'font-semibold' : 'text-muted-foreground'}`}><span className={`flex size-6 items-center justify-center rounded-full text-xs ${i + 1 <= step ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{i + 1}</span>{t}</li>)}</ol>;
}

/* ------------------------------------------------------------------ deviasi */
function DeviationPage({ workspaceId, d, id }: { workspaceId: string; d: Data; id: string | null }) {
  const nav = useNavigate();
  const save = useServerFn(saveDeviation), close = useServerFn(closeDeviation);
  const { busy, run } = useRun(workspaceId);
  const dev = id ? d.deviations.find((v) => v.id === id) : null;
  const [f, setF] = useState({ lot_id: '', description: '', impact: '', root_cause: '', capa: '' });
  const [note, setNote] = useState('');
  useEffect(() => { if (dev) setF({ lot_id: dev.lot_id ?? '', description: dev.description, impact: dev.impact ?? '', root_cause: dev.root_cause ?? '', capa: dev.capa ?? '' }); }, [dev?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (id && !dev) return <p className="py-12 text-muted-foreground">Deviasi tidak ditemukan.</p>;
  const closed = dev?.status === 'closed';
  const values = { lot_id: f.lot_id, order_id: dev?.order_id ?? '', description: f.description, impact: f.impact, root_cause: f.root_cause, capa: f.capa };
  return <ProductionPageShell workspaceId={workspaceId} section="quality" title={dev ? `Deviasi ${dev.deviation_no}` : 'Deviasi baru'} status={closed ? 'approved' : 'draft'} subtitle={closed ? 'Selesai' : 'Terbuka'}
    actions={!closed && <Button disabled={busy || !d.canWrite || (!id && !f.description.trim())} onClick={() => void run(async () => { const r = await save({ data: { workspaceId, id, values, reason: id ? 'Investigasi deviasi' : 'Deviasi baru' } }); toast.success('Tersimpan'); if (!id) void nav({ to: '/app/w/$workspaceId/$moduleId/$submoduleId/$docId', search: { print: undefined }, params: { workspaceId, moduleId: 'manufacturing', submoduleId: 'quality', docId: `dev-${r.id}` } }); })}><Save className="size-4" />Simpan</Button>}>
    <fieldset disabled={closed || busy} className="max-w-3xl space-y-4">
      <AdminField label="Lot (opsional)"><AdminSelect value={f.lot_id} onChange={(v) => !id && setF({ ...f, lot_id: v })}><option value="">—</option>{d.lots.map((l) => <option key={l.id} value={l.id}>{l.lot_no}</option>)}</AdminSelect></AdminField>
      <AdminField label="Deskripsi"><Input disabled={!!id} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></AdminField>
      <AdminField label="Dampak"><Input value={f.impact} onChange={(e) => setF({ ...f, impact: e.target.value })} /></AdminField>
      {id && <><AdminField label="Akar masalah"><Input value={f.root_cause} onChange={(e) => setF({ ...f, root_cause: e.target.value })} /></AdminField><AdminField label="CAPA (tindakan korektif/preventif)"><Input value={f.capa} onChange={(e) => setF({ ...f, capa: e.target.value })} /></AdminField></>}
    </fieldset>
    {dev && !closed && <div className="max-w-3xl space-y-2 border-t border-border pt-4">
      <h2 className="font-medium">Tutup deviasi</h2>
      {!d.isQaManager ? <p className="text-sm text-muted-foreground">Penutupan hanya untuk QA manager.</p> : <>
        <p className="text-sm text-muted-foreground">Simpan akar masalah dan CAPA terlebih dahulu, lalu isi catatan penutupan.</p>
        <div className="flex gap-2"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan penutupan" /><Button disabled={busy || !note.trim() || !dev.root_cause || !dev.capa} onClick={() => void run(async () => { await close({ data: { workspaceId, id: dev.id, reason: note.trim() } }); toast.success('Deviasi ditutup'); })}>Tutup deviasi</Button></div>
      </>}
    </div>}
  </ProductionPageShell>;
}
