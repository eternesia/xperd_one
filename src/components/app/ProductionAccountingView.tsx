import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PaginationBar, usePagination, searchRows } from './ui-states';
import { TableSearch } from './ProductionPagedTable';
import { AdminField, AdminSelect } from './admin-ui';
import { getProductionAccounting, retryProductionJournals, reverseProductionJournals, saveProductionMapping } from '@/lib/production-orders.functions';

const KEYS = [['rm_inventory', 'Persediaan bahan baku'], ['wip_material', 'WIP material'], ['wip_conversion', 'WIP konversi'], ['fg_inventory', 'Persediaan barang jadi'], ['labor_applied', 'Tenaga kerja dibebankan'], ['overhead_applied', 'Overhead dibebankan'], ['other_applied', 'Biaya lain dibebankan'], ['production_variance', 'Selisih produksi'], ['scrap_loss', 'Rugi scrap/kedaluwarsa']] as const;
const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;

export function ProductionAccountingView({ workspaceId }: { workspaceId: string }) {
  const get = useServerFn(getProductionAccounting), save = useServerFn(saveProductionMapping), retry = useServerFn(retryProductionJournals), reverse = useServerFn(reverseProductionJournals);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['production-accounting', workspaceId], queryFn: () => get({ data: { workspaceId } }) });
  const [draft, setDraft] = useState<Record<string, string>>({}), [reason, setReason] = useState(''), [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<void>) { if (!reason.trim()) { toast.error('Isi alasan terlebih dahulu'); return; } setBusy(true); try { await fn(); await qc.invalidateQueries({ queryKey: ['production-accounting', workspaceId] }); toast.success('Tersimpan'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Ditolak'); } finally { setBusy(false); } }
  const [sc, setSc] = useState(''), [se, setSe] = useState('');
  const pc = usePagination(searchRows(q.data?.costs ?? [], sc), 10), pe = usePagination(searchRows(q.data?.events ?? [], se), 25);
  if (q.isPending) return <Loader2 className="m-8 animate-spin text-muted-foreground" />;
  if (q.isError) return <p className="py-12 text-muted-foreground">{q.error.message}</p>;
  const d = q.data;
  const orderNo = (id: string) => d.orders.find((o) => o.id === id)?.order_no ?? id.slice(0, 8);
  const blockedOrders = [...new Set(d.events.filter((e) => e.status.startsWith('blocked')).map((e) => e.order_id))];
  const postedOrders = [...new Set(d.events.filter((e) => e.status === 'posted' && !e.event_code.startsWith('R-')).map((e) => e.order_id))];
  return <div className="space-y-8">
    <h1 className="text-2xl font-semibold">Biaya & Jurnal Production</h1>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['WIP buku besar', d.reconciliation.wip_ledger], ['WIP transaksi produksi', d.reconciliation.wip_events], ['Nilai stok lot', d.reconciliation.lot_inventory_value], ['Persediaan buku besar', d.reconciliation.inventory_ledger]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{rp(Number(value))}</p></div>)}</div>
    {!d.reconciliation.mapped ? <p className="text-destructive">Pemetaan akun persediaan belum lengkap.</p> : <div className={Math.abs(d.reconciliation.wip_difference) > 0.5 || Math.abs(d.reconciliation.inventory_difference) > 0.5 ? 'rounded-md border border-destructive p-3 text-destructive' : 'rounded-md border border-border p-3 text-foreground'}>Selisih WIP: {rp(d.reconciliation.wip_difference)} · Selisih persediaan: {rp(d.reconciliation.inventory_difference)}</div>}
    <AdminField label="Alasan perubahan (wajib untuk setiap aksi)"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></AdminField>
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4"><h2 className="text-lg font-medium">Pemetaan akun</h2><div className="grid gap-3 sm:grid-cols-2">{KEYS.map(([k, label]) => { const current = d.mappings.find((m) => m.mapping_key === k)?.account_code ?? ''; return <div key={k} className="flex items-end gap-2"><AdminField label={label}><AdminSelect value={draft[k] ?? current} onChange={(v) => setDraft({ ...draft, [k]: v })}><option value="">Pilih akun</option>{d.accounts.map((a) => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}</AdminSelect></AdminField><Button variant="outline" disabled={!d.canWrite || busy || !(draft[k] && draft[k] !== current)} onClick={() => run(async () => { await save({ data: { workspaceId, mappingKey: k, account: draft[k] as string, reason } }); })}>Simpan</Button></div>; })}</div></section>
    <section className="space-y-3"><h2 className="text-lg font-medium">Biaya per order</h2><TableSearch value={sc} onChange={setSc} /><div className="overflow-hidden rounded-2xl border border-border bg-card"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-14 text-center">#</TableHead>{['Order', 'Material', 'Tenaga kerja', 'Overhead', 'Total', 'Per unit', 'Standar', 'Selisih'].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{pc.items.map((c, i) => <TableRow key={c.id}><TableCell className="text-center text-xs text-muted-foreground">{pc.start + i + 1}</TableCell><TableCell>{orderNo(c.order_id)}</TableCell><TableCell>{rp(c.material_cost)}</TableCell><TableCell>{rp(c.labor_cost)}</TableCell><TableCell>{rp(c.overhead_cost)}</TableCell><TableCell>{rp(c.total_cost)}</TableCell><TableCell>{rp(c.unit_cost)}</TableCell><TableCell>{rp(c.std_total_cost)}</TableCell><TableCell className={c.variance > 0 ? 'text-destructive' : ''}>{rp(c.variance)}</TableCell></TableRow>)}{!d.costs.length && <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Biaya dihitung saat order ditutup.</TableCell></TableRow>}</TableBody></Table></div><PaginationBar p={pc} /></div></section>
    <section className="space-y-3"><h2 className="text-lg font-medium">Rekonsiliasi jurnal</h2>
      <div className="flex flex-wrap gap-2">{blockedOrders.map((o) => <Button key={o} size="sm" variant="outline" disabled={!d.canWrite || busy} onClick={() => run(async () => { await retry({ data: { workspaceId, orderId: o, reason } }); })}>Posting ulang {orderNo(o)}</Button>)}{postedOrders.map((o) => <Button key={`r${o}`} size="sm" variant="ghost" disabled={!d.canWrite || busy} onClick={() => run(async () => { await reverse({ data: { workspaceId, orderId: o, reason } }); })}>Balik jurnal {orderNo(o)}</Button>)}</div>
      <TableSearch value={se} onChange={setSe} /><div className="overflow-hidden rounded-2xl border border-border bg-card"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-14 text-center">#</TableHead>{['Order', 'Event', 'Jumlah', 'Status', 'Catatan'].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{pe.items.map((e, i) => <TableRow key={e.id}><TableCell className="text-center text-xs text-muted-foreground">{pe.start + i + 1}</TableCell><TableCell>{orderNo(e.order_id)}</TableCell><TableCell>{e.event_code}</TableCell><TableCell>{rp(e.amount)}</TableCell><TableCell><Badge variant={e.status === 'posted' ? 'default' : e.status.startsWith('blocked') ? 'destructive' : 'secondary'}>{e.status}</Badge></TableCell><TableCell className="text-xs text-muted-foreground">{e.message}</TableCell></TableRow>)}{!d.events.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Belum ada jurnal Production.</TableCell></TableRow>}</TableBody></Table></div><PaginationBar p={pe} /></div>
    </section>
  </div>;
}
