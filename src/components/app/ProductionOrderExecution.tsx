import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { ArrowRight, Loader2, Plus, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminField, AdminSelect } from './admin-ui';
import { getProductionOrderDetail, getProductionOrderDocument, getProductionOrders, issueAllProductionMaterials, issueProductionMaterial, getMaterialBatches, logProductionLabor, overrideProductionMaterial, performProductionStep, recordProductionOutput, saveProductionStep, transitionProductionOrder, verifyProductionStep } from '@/lib/production-orders.functions';
import { nextOrderStatus, type OrderStatus } from '@/lib/production-orders';
import { saveProductionPdf } from '@/lib/production-pdf';

const LABEL: Record<string, string> = { draft: 'Draf', planned: 'Direncanakan', released: 'Dirilis', in_progress: 'Berjalan', qc_pending: 'Menunggu QC', completed: 'Selesai', closed: 'Ditutup', cancelled: 'Dibatalkan' };
const fmt = (n: number | null | undefined) => Number(n ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 4 });
const rp = (n: number | null | undefined) => `Rp${Math.round(n ?? 0).toLocaleString('id-ID')}`;
type Batch = { id: string; lot_no: string; expiry_date: string | null; balance: number; eligible: boolean; days_left: number | null };
type Prompt = { title: string; withQty?: boolean; qty?: string; batches?: Batch[]; onSubmit: (reason: string, qty: number | null, lotId?: string | null) => Promise<void> };

export function ProductionOrderExecution({ workspaceId, orderId }: { workspaceId: string; orderId: string }) {
  const list = useServerFn(getProductionOrders), detail = useServerFn(getProductionOrderDetail), transition = useServerFn(transitionProductionOrder), issue = useServerFn(issueProductionMaterial), getBatches = useServerFn(getMaterialBatches), issueAll = useServerFn(issueAllProductionMaterials), override = useServerFn(overrideProductionMaterial), saveStep = useServerFn(saveProductionStep), perform = useServerFn(performProductionStep), verify = useServerFn(verifyProductionStep), output = useServerFn(recordProductionOutput), labor = useServerFn(logProductionLabor);
  const qc = useQueryClient();
  const getDocument = useServerFn(getProductionOrderDocument);
  async function exportDocument(orderId: string) {
    await run(async () => {
      const document = await getDocument({ data: { workspaceId, orderId } });
      if (!document.order || !document.tenant) throw Error('Dokumen tidak ditemukan');
      const o = document.order;
      const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-');
      const who = (n: unknown, at: unknown) => (n ? `${n}${at ? ` · ${dt(at)}` : ''}` : '-');
      const matTot = document.materials.reduce((a, m) => a + Number(m.issued_qty ?? 0), 0);
      const OUT: Record<string, string> = { finished: 'Barang jadi', co_product: 'Ko-produk', by_product: 'Produk samping', scrap: 'Scrap', rework: 'Rework' };
      await saveProductionPdf(o.order_no, 'Perintah Produksi & Batch Record', document.tenant, [
        { title: 'Identitas batch', headers: ['Order', 'Produk', 'Lot', 'Status', 'Rencana'], rows: [[o.order_no, o.item_name, o.batch_lot_no, LABEL[o.status] ?? o.status, `${fmt(Number(o.planned_qty))} ${o.uom}`]], right: [] },
        { title: 'Material & daftar timbang', headers: ['Item', 'Rencana', 'Terkoreksi', 'Aktual', 'Satuan', 'Potensi %', 'Override'], right: [1, 2, 3, 5],
          rows: document.materials.map((m) => [m.item_code, fmt(Number(m.planned_qty)), fmt(Number(m.corrected_qty)), fmt(Number(m.issued_qty)), m.uom ?? '', m.potency_used_pct != null ? `${Number(m.potency_used_pct).toFixed(2)}%` : '-', m.override_reason ?? '-']),
          foot: ['Total', '', '', fmt(matTot), '', '', ''] },
        { title: 'Batch record & verifikasi', headers: ['#', 'Instruksi', 'Nilai', 'Satuan', 'Pelaksana', 'Verifikator'], right: [0, 2],
          rows: document.steps.map((s) => [s.sequence, s.instruction, s.value != null ? fmt(Number(s.value)) : '-', s.measure_unit ?? '-', who(s.performed_by, s.performed_at), who(s.verified_by, s.verified_at)]) },
        { title: 'Hasil produksi', headers: ['Jenis', 'Batch', 'Qty', 'Satuan', 'QC'], right: [2],
          rows: document.outputs.map((x) => [OUT[x.output_type] ?? x.output_type, x.lot_no, fmt(Number(x.qty)), x.uom, x.qc_status]) },
        { title: 'Biaya aktual', headers: ['Material', 'Tenaga kerja', 'Overhead', 'Total', 'Per unit', 'Selisih standar'], right: [0, 1, 2, 3, 4, 5],
          rows: document.costs.map((c) => [rp(Number(c.material_cost)), rp(Number(c.labor_cost)), rp(Number(c.overhead_cost)), rp(Number(c.total_cost)), rp(Number(c.unit_cost)), rp(Number(c.variance))]) },
      ]);
    });
  }
  const selected = orderId; const [busy, setBusy] = useState(false); const [sub, setSub] = useState('bahan');
  const [prompt, setPrompt] = useState<Prompt | null>(null), [pReason, setPReason] = useState(''), [pQty, setPQty] = useState('');
  const [out, setOut] = useState<{ type: 'finished' | 'co_product' | 'by_product' | 'scrap' | 'rework'; itemId: string; qty: string; reason: string } | null>(null);
  const [lab, setLab] = useState<{ centerId: string; hours: string; reason: string } | null>(null);
  const [step, setStep] = useState<{ instruction: string; measure_label: string; measure_unit: string; min_value: string; max_value: string; reason: string } | null>(null);
  const q = useQuery({ queryKey: ['production-orders', workspaceId, ''], queryFn: () => list({ data: { workspaceId, status: '' } }) });
  const dq = useQuery({ queryKey: ['production-order', workspaceId, selected], enabled: !!selected, queryFn: () => detail({ data: { workspaceId, orderId: selected as string } }) });

  async function run(fn: () => Promise<void>) { setBusy(true); try { await fn(); await qc.invalidateQueries({ queryKey: ['production-orders', workspaceId] }); await qc.invalidateQueries({ queryKey: ['production-order', workspaceId] }); } catch (e) { toast.error(e instanceof Error ? e.message : 'Ditolak'); } finally { setBusy(false); } }
  function ask(p: Prompt) { setPReason(''); setPQty(p.qty ?? ''); setPBatch(p.batches?.find((b) => b.eligible)?.id ?? ''); setPrompt(p); }
  const [pBatch, setPBatch] = useState('');
  if (q.isPending) return <Loader2 className="m-8 animate-spin text-muted-foreground" />;
  if (q.isError) return <p className="py-12 text-muted-foreground">{q.error.message}</p>;
  const d = q.data;
  const item = (id: string) => d.items.find((i) => i.id === id);
  const order = dq.data?.order ?? null;
  const det = dq.data;
  const lotNo = (id: string | null) => det?.lots.find((l) => l.id === id)?.lot_no ?? '—';

  if (!order) return dq.isPending ? <Loader2 className="m-8 animate-spin text-muted-foreground" /> : <p className="py-8 text-muted-foreground">Order tidak ditemukan.</p>;
  return <div className="space-y-6">
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void exportDocument(order.id)}><Download className="size-4" />PDF batch record</Button>
        {(() => { const nxt = nextOrderStatus(order.status as OrderStatus); const NEXT: Record<string, string> = { qc_pending: 'Selesai produksi → kirim ke QC', completed: 'Tandai selesai (lot sudah rilis QC)', closed: 'Tutup order & hitung biaya' }; return nxt && NEXT[nxt] ? <Button disabled={busy || !d.canWrite} onClick={() => ask({ title: NEXT[nxt], onSubmit: async (reason) => { await transition({ data: { workspaceId, orderId: order.id, status: nxt as 'qc_pending', key: crypto.randomUUID(), reason } }); toast.success(NEXT[nxt]); } })}><ArrowRight className="size-4" />{NEXT[nxt]}</Button> : null; })()}
        {['released', 'in_progress'].includes(order.status) && (det?.materials ?? []).some((m) => Number(m.issued_qty) < Number(m.corrected_qty)) && <Button disabled={busy || !d.canWrite} onClick={() => run(async () => { const r = await issueAll({ data: { workspaceId, orderId: order.id, reason: 'Issue semua bahan sesuai BOM' } }); toast.success(`${r.count} bahan diissue`); })}>Issue semua bahan</Button>}
        {['draft', 'planned', 'released'].includes(order.status) && <Button variant="outline" disabled={busy || !d.canWrite} onClick={() => ask({ title: 'Batalkan order', onSubmit: async (reason) => { await transition({ data: { workspaceId, orderId: order.id, status: 'cancelled', key: crypto.randomUUID(), reason } }); } })}>Batalkan</Button>}
      </div>
      {dq.isPending ? <Loader2 className="animate-spin" /> : det && <div className="space-y-4">
        {(() => {
          const mats = det.materials, issuedN = mats.filter((m) => Number(m.issued_qty) >= Number(m.corrected_qty) && Number(m.corrected_qty) > 0).length;
          const stepsDone = det.steps.filter((s) => ['done', 'verified'].includes(s.status)).length, stepsVer = det.steps.filter((s) => s.status === 'verified').length;
          const outQty = det.outputs.filter((x) => x.output_type === 'finished').reduce((s, x) => s + Number(x.qty), 0);
          const hours = det.labor.reduce((s, l) => s + Number(l.hours), 0);
          const laborCost = det.labor.reduce((s, l) => s + Number(l.hours) * (Number(l.labor_rate) + Number(l.overhead_rate)), 0);
          const cards: { label: string; value: string; hint?: string }[] = [
            { label: 'Status', value: LABEL[order.status] ?? order.status, hint: order.batch_lot_no },
            { label: 'Bahan di-issue', value: `${issuedN} / ${mats.length}`, hint: mats.length ? `${Math.round((issuedN / mats.length) * 100)}% baris` : undefined },
            { label: 'Batch record', value: `${stepsDone} / ${det.steps.length}`, hint: `${stepsVer} terverifikasi` },
            { label: 'Output barang jadi', value: `${fmt(outQty)} ${order.uom ?? ''}`, hint: `Rencana ${fmt(Number(order.planned_qty))} ${order.uom ?? ''}` },
            { label: 'Jam kerja', value: `${fmt(hours)} jam`, hint: hours ? `Konversi ${rp(laborCost)}` : undefined },
            { label: 'Total biaya', value: det.costs ? rp(det.costs.total_cost) : 'Belum dihitung', hint: det.costs ? `${rp(det.costs.unit_cost)} / unit` : 'Dihitung saat order ditutup' },
          ];
          return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{cards.map((c) => <div key={c.label} className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{c.label}</p><p className="mt-1 text-base font-semibold">{c.value}</p>{c.hint && <p className="text-xs text-muted-foreground">{c.hint}</p>}</div>)}</div>;
        })()}
        <Tabs value={sub} onValueChange={setSub}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="bahan">Bahan ({det.materials.length})</TabsTrigger>
            <TabsTrigger value="batch">Batch record ({det.steps.length})</TabsTrigger>
            <TabsTrigger value="output">Output & jam kerja</TabsTrigger>
            <TabsTrigger value="biaya">Biaya & jurnal</TabsTrigger>
          </TabsList>

        <TabsContent value="bahan" className="rounded-2xl border border-border bg-card p-4"><section><h3 className="mb-2 font-medium">Material & daftar timbang</h3><div className="overflow-x-auto"><Table><TableHeader><TableRow>{['Item', 'Rencana', 'Terkoreksi', 'Diissue', 'Batch', 'Potensi', ''].map((h, i) => <TableHead key={i}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>
          {det.materials.map((m) => <TableRow key={m.id}><TableCell>{item(m.item_id)?.code}{m.is_balancing ? ' · penyeimbang' : ''}{m.override_reason ? ' · override' : ''}</TableCell><TableCell>{m.planned_qty} {m.uom}</TableCell><TableCell className="font-medium">{m.corrected_qty}</TableCell><TableCell>{m.issued_qty}</TableCell><TableCell>{lotNo(m.lot_id)}</TableCell><TableCell>{m.potency_used_pct != null ? `${Number(m.potency_used_pct).toFixed(2)}%` : '—'}</TableCell><TableCell><div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={busy || !['released', 'in_progress'].includes(order.status) || m.issued_qty >= m.corrected_qty} onClick={() => run(async () => { const { batches } = await getBatches({ data: { workspaceId, materialId: m.id } }); ask({ title: `Issue ${item(m.item_id)?.code}`, withQty: true, qty: String(Math.max(0, m.corrected_qty - m.issued_qty)), batches, onSubmit: async (reason, qty, lotId) => { await issue({ data: { workspaceId, materialId: m.id, qty: qty ?? 0, lotId: lotId ?? null, key: crypto.randomUUID(), reason } }); toast.success('Material diissue'); } }); })}>Issue</Button>
            <Button size="sm" variant="ghost" disabled={busy || m.issued_qty > 0 || !['released', 'in_progress'].includes(order.status)} onClick={() => ask({ title: 'Override kuantitas (supervisor)', withQty: true, qty: String(m.corrected_qty), onSubmit: async (reason, qty) => { await override({ data: { workspaceId, materialId: m.id, qty: qty ?? 0, reason } }); } })}>Override</Button>
          </div></TableCell></TableRow>)}
          {!det.materials.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Material dihitung saat order dirilis.</TableCell></TableRow>}
        </TableBody></Table></div></section></TabsContent>

        <TabsContent value="batch" className="rounded-2xl border border-border bg-card p-4"><section><div className="mb-2 flex items-center justify-between"><h3 className="font-medium">Batch record (eBMR)</h3><Button size="sm" variant="outline" disabled={busy || !['released', 'in_progress'].includes(order.status)} onClick={() => setStep({ instruction: '', measure_label: '', measure_unit: '', min_value: '', max_value: '', reason: '' })}><Plus className="size-4" />Langkah</Button></div><div className="space-y-2">
          {(() => {
            const canDo = !busy && order.status === 'in_progress';
            const quick = det.steps.filter((s) => s.status === 'pending' && !s.measure_label);
            return quick.length > 1 ? <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"><span>{quick.length} langkah tanpa nilai ukur belum dikerjakan</span><Button size="sm" variant="outline" disabled={!canDo} onClick={() => void run(async () => { for (const s of quick) await perform({ data: { workspaceId, stepId: s.id, value: null, reason: 'Ceklis batch record' } }); toast.success(`${quick.length} langkah dicentang`); })}>Centang semua</Button></div> : null;
          })()}
          {det.steps.map((s) => {
            const done = s.status !== 'pending';
            const canDo = !busy && order.status === 'in_progress';
            return <div key={s.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-start gap-3">
                <Checkbox className="mt-0.5" checked={done} disabled={done || !canDo} aria-label={`Kerjakan langkah ${s.sequence}`}
                  onCheckedChange={(v) => {
                    if (v !== true || done) return;
                    if (s.measure_label) ask({ title: `Nilai ukur langkah ${s.sequence}`, withQty: true, onSubmit: async (reason, qty) => { await perform({ data: { workspaceId, stepId: s.id, value: qty, reason: reason || 'Ceklis batch record' } }); } });
                    else void run(async () => { await perform({ data: { workspaceId, stepId: s.id, value: null, reason: 'Ceklis batch record' } }); });
                  }} />
                <span><span className={`block text-sm font-medium ${done ? 'text-muted-foreground line-through' : ''}`}>{s.sequence}. {s.instruction}</span><span className="block text-xs text-muted-foreground">{s.measure_label ? `${s.measure_label} ${s.min_value ?? '…'}–${s.max_value ?? '…'} ${s.measure_unit ?? ''}` : 'Tanpa nilai ukur'}{s.value != null ? ` · tercatat ${s.value}${s.within_limits === false ? ' (di luar batas)' : ''}` : ''}</span></span>
              </label>
              <div className="flex items-center gap-3">
                <Badge variant={s.status === 'verified' ? 'default' : 'secondary'}>{s.status}</Badge>
                {done && <label className="flex items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={s.status === 'verified'} disabled={s.status === 'verified' || busy} aria-label={`Verifikasi langkah ${s.sequence}`}
                  onCheckedChange={(v) => { if (v === true) void run(async () => { await verify({ data: { workspaceId, stepId: s.id, reason: 'Verifikasi batch record' } }); toast.success('Langkah diverifikasi'); }); }} />Verifikasi</label>}
              </div>
            </div>;
          })}
          {!det.steps.length && <p className="text-sm text-muted-foreground">Langkah dibuat dari BOM saat rilis.</p>}
        </div></section>
        {det.deviations.length > 0 && <section className="mt-6"><h3 className="mb-2 font-medium">Deviasi</h3>{det.deviations.map((v) => <p key={v.id} className="text-sm">{v.deviation_no} · {v.source} · <Badge variant={v.status === 'closed' ? 'default' : 'destructive'}>{v.status}</Badge> {v.description}</p>)}</section>}
        </TabsContent>

        <TabsContent value="output" className="rounded-2xl border border-border bg-card p-4"><section><div className="mb-2 flex items-center justify-between"><h3 className="font-medium">Output & jam kerja</h3><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy || order.status !== 'in_progress'} onClick={() => setOut({ type: 'finished', itemId: order.item_id, qty: String(order.expected_output_qty ?? ''), reason: '' })}><Plus className="size-4" />Output</Button><Button size="sm" variant="outline" disabled={busy || !['in_progress', 'qc_pending'].includes(order.status) || !d.centers.length} onClick={() => setLab({ centerId: d.centers[0]?.id ?? '', hours: '', reason: '' })}><Plus className="size-4" />Jam kerja</Button></div></div>
          <Table><TableBody>{det.outputs.map((x) => <TableRow key={x.id}><TableCell>{x.output_type}</TableCell><TableCell>{item(x.item_id)?.code}</TableCell><TableCell>{fmt(Number(x.qty))} {x.uom}</TableCell><TableCell>{lotNo(x.lot_id)} {det.lots.find((l) => l.id === x.lot_id)?.qc_status ? `(${det.lots.find((l) => l.id === x.lot_id)?.qc_status})` : ''}</TableCell></TableRow>)}
          {det.labor.map((l) => <TableRow key={l.id}><TableCell>jam kerja</TableCell><TableCell>{d.centers.find((c) => c.id === l.work_center_id)?.code}</TableCell><TableCell>{l.hours} jam</TableCell><TableCell className="text-right">{rp(l.hours * (Number(l.labor_rate) + Number(l.overhead_rate)))}</TableCell></TableRow>)}</TableBody></Table>
          {order.status === 'qc_pending' && <p className="mt-2 text-sm text-muted-foreground">Batch hasil berstatus karantina. Lakukan inspeksi rilis akhir di menu Quality, lalu tandai order Selesai.</p>}
        </section>

        </TabsContent>

        <TabsContent value="biaya" className="space-y-4 rounded-2xl border border-border bg-card p-4">
          {det.costs ? <section><h3 className="mb-2 font-medium">Biaya produksi (COGM)</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[['Material', det.costs.material_cost], ['Tenaga kerja', det.costs.labor_cost], ['Overhead', det.costs.overhead_cost], ['Total', det.costs.total_cost], ['Per unit', det.costs.unit_cost], ['Standar', det.costs.std_total_cost]].map(([l, v]) => <div key={String(l)} className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">{l}</p><p className={`mt-1 text-base font-semibold ${l === 'Total' ? 'text-gold' : ''}`}>{rp(Number(v))}</p></div>)}
          </div><p className={`mt-2 text-sm ${det.costs.variance > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>Selisih terhadap standar: {rp(det.costs.variance)}{!det.costs.std_total_cost ? ' (biaya standar belum diisi)' : ''}</p></section> : <p className="text-sm text-muted-foreground">Biaya dihitung saat order ditutup.</p>}
          {det.journals.length > 0 && <section><h3 className="mb-2 font-medium">Jurnal</h3><Table><TableHeader><TableRow><TableHead>Kode</TableHead><TableHead className="text-right">Jumlah</TableHead><TableHead>Status</TableHead><TableHead>Catatan</TableHead></TableRow></TableHeader><TableBody>{det.journals.map((j) => <TableRow key={j.id}><TableCell>{j.event_code}</TableCell><TableCell className="text-right">{rp(j.amount)}</TableCell><TableCell><Badge variant={j.status === 'posted' ? 'default' : j.status.startsWith('blocked') ? 'destructive' : 'secondary'}>{j.status}</Badge></TableCell><TableCell className="text-xs text-muted-foreground">{j.message}</TableCell></TableRow>)}</TableBody></Table></section>}
        </TabsContent>
        </Tabs>
      </div>}
    </>

    <Dialog open={!!prompt} onOpenChange={(o) => { if (!o) setPrompt(null); }}><DialogContent>{prompt && <><DialogHeader><DialogTitle>{prompt.title}</DialogTitle></DialogHeader><div className="space-y-3">
      {prompt.batches && <AdminField label="Batch (rekomendasi FEFO di atas)">{prompt.batches.length === 0 ? <p className="text-sm text-destructive">Tidak ada batch bersaldo di gudang order.</p> : <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={pBatch} onChange={(e) => setPBatch(e.target.value)}>{prompt.batches.map((b, i) => <option key={b.id} value={b.id} disabled={!b.eligible}>{b.lot_no} · sisa {fmt(b.balance)} · {b.expiry_date ? `ED ${b.expiry_date}${b.days_left != null ? ` (${b.days_left} hari)` : ''}` : 'tanpa ED'}{!b.eligible ? ' · tidak layak (QC/kedaluwarsa)' : i === prompt.batches!.findIndex((x) => x.eligible) ? ' · ★ rekomendasi FEFO' : ''}</option>)}</select>}{pBatch && prompt.batches.find((b) => b.id === pBatch) && Number(pQty) > prompt.batches.find((b) => b.id === pBatch)!.balance && <p className="mt-1 text-xs text-destructive">Kuantitas melebihi sisa batch ini; issue sebagian lalu ulangi dengan batch lain.</p>}</AdminField>}
      {prompt.withQty && <AdminField label="Nilai / kuantitas"><Input type="number" step="any" value={pQty} onChange={(e) => setPQty(e.target.value)} /></AdminField>}
      <AdminField label="Catatan (opsional)"><Input value={pReason} onChange={(e) => setPReason(e.target.value)} /></AdminField>
      <div className="flex justify-end"><Button disabled={busy || (prompt.withQty && pQty.trim() === '') || (!!prompt.batches && !pBatch)} onClick={() => run(async () => { const rec = prompt.batches?.find((b) => b.eligible)?.id; if (prompt.batches && pBatch !== rec && !pReason.trim()) throw new Error('Batch bukan rekomendasi FEFO: isi catatan alasan.'); await prompt.onSubmit(pReason.trim() || prompt.title, prompt.withQty ? Number(pQty) : null, prompt.batches ? pBatch : undefined); setPrompt(null); })}>Simpan</Button></div>
    </div></>}</DialogContent></Dialog>

    <Dialog open={!!out} onOpenChange={(o) => { if (!o) setOut(null); }}><DialogContent>{out && order && <><DialogHeader><DialogTitle>Catat output</DialogTitle></DialogHeader><div className="space-y-3">
      <AdminField label="Jenis"><AdminSelect value={out.type} onChange={(v) => setOut({ ...out, type: v as 'finished', itemId: v === 'finished' ? order.item_id : out.itemId })}><option value="finished">Barang jadi</option><option value="co_product">Ko-produk</option><option value="by_product">Produk samping</option><option value="scrap">Scrap</option><option value="rework">Rework</option></AdminSelect></AdminField>
      {out.type !== 'finished' && <AdminField label="Item"><AdminSelect value={out.itemId} onChange={(v) => setOut({ ...out, itemId: v })}>{d.items.map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}</AdminSelect></AdminField>}
      <AdminField label="Kuantitas"><Input type="number" step="any" value={out.qty} onChange={(e) => setOut({ ...out, qty: e.target.value })} /></AdminField>
      <AdminField label="Catatan (opsional)"><Input value={out.reason} onChange={(e) => setOut({ ...out, reason: e.target.value })} /></AdminField>
      <div className="flex justify-end"><Button disabled={busy || !(Number(out.qty) > 0)} onClick={() => run(async () => { await output({ data: { workspaceId, orderId: order.id, type: out.type, itemId: out.itemId, qty: Number(out.qty), key: crypto.randomUUID(), reason: out.reason.trim() || 'Catat output' } }); toast.success('Output tercatat (karantina)'); setOut(null); })}>Simpan</Button></div>
    </div></>}</DialogContent></Dialog>

    <Dialog open={!!lab} onOpenChange={(o) => { if (!o) setLab(null); }}><DialogContent>{lab && order && <><DialogHeader><DialogTitle>Catat jam kerja</DialogTitle></DialogHeader><div className="space-y-3">
      <AdminField label="Work center"><AdminSelect value={lab.centerId} onChange={(v) => setLab({ ...lab, centerId: v })}>{d.centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</AdminSelect></AdminField>
      <AdminField label="Jam"><Input type="number" step="0.25" value={lab.hours} onChange={(e) => setLab({ ...lab, hours: e.target.value })} /></AdminField>
      <AdminField label="Catatan (opsional)"><Input value={lab.reason} onChange={(e) => setLab({ ...lab, reason: e.target.value })} /></AdminField>
      <div className="flex justify-end"><Button disabled={busy || !(Number(lab.hours) > 0)} onClick={() => run(async () => { await labor({ data: { workspaceId, orderId: order.id, centerId: lab.centerId, hours: Number(lab.hours), key: crypto.randomUUID(), reason: lab.reason.trim() || 'Catat jam kerja' } }); setLab(null); })}>Simpan</Button></div>
    </div></>}</DialogContent></Dialog>

    <Dialog open={!!step} onOpenChange={(o) => { if (!o) setStep(null); }}><DialogContent>{step && order && <><DialogHeader><DialogTitle>Langkah batch record</DialogTitle></DialogHeader><div className="space-y-3">
      <AdminField label="Instruksi"><Input value={step.instruction} onChange={(e) => setStep({ ...step, instruction: e.target.value })} /></AdminField>
      <div className="grid gap-3 sm:grid-cols-4"><AdminField label="Nilai ukur"><Input placeholder="Suhu" value={step.measure_label} onChange={(e) => setStep({ ...step, measure_label: e.target.value })} /></AdminField><AdminField label="Satuan"><Input value={step.measure_unit} onChange={(e) => setStep({ ...step, measure_unit: e.target.value })} /></AdminField><AdminField label="Min"><Input type="number" step="any" value={step.min_value} onChange={(e) => setStep({ ...step, min_value: e.target.value })} /></AdminField><AdminField label="Maks"><Input type="number" step="any" value={step.max_value} onChange={(e) => setStep({ ...step, max_value: e.target.value })} /></AdminField></div>
      <AdminField label="Catatan (opsional)"><Input value={step.reason} onChange={(e) => setStep({ ...step, reason: e.target.value })} /></AdminField>
      <div className="flex justify-end"><Button disabled={busy || !step.instruction.trim()} onClick={() => run(async () => { const { reason, ...values } = step; await saveStep({ data: { workspaceId, orderId: order.id, id: null, values, reason: reason.trim() || 'Tambah langkah batch' } }); setStep(null); })}>Simpan</Button></div>
    </div></>}</DialogContent></Dialog>

  </div>;
}
