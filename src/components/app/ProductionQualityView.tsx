import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import { Loader2, Plus } from 'lucide-react';
import { ProductionPagedTable, RowNo } from './ProductionPagedTable';
import { StatusPill } from './ProductionPageShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import { getProductionQuality } from '@/lib/production-quality.functions';

const STAGE: Record<string, string> = { incoming: 'Bahan masuk', in_process: 'In-process', final: 'Rilis akhir' };
const LOT: Record<string, string> = { quarantine: 'Karantina', released: 'Rilis', hold: 'Tahan', rejected: 'Ditolak', expired: 'Kedaluwarsa' };
const lotTone = (s: string) => (s === 'released' ? 'default' : s === 'rejected' || s === 'expired' ? 'destructive' : 'secondary') as 'default' | 'destructive' | 'secondary';

function DocLink({ workspaceId, docId, children }: { workspaceId: string; docId: string; children: React.ReactNode }) {
  return <Link to="/app/w/$workspaceId/$moduleId/$submoduleId/$docId" search={{ print: undefined }} params={{ workspaceId, moduleId: 'manufacturing', submoduleId: 'quality', docId }} className="font-medium text-primary hover:underline">{children}</Link>;
}
function NewButton({ workspaceId, docId, disabled, children }: { workspaceId: string; docId: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) return <Button disabled><Plus className="size-4" />{children}</Button>;
  return <Button asChild><Link to="/app/w/$workspaceId/$moduleId/$submoduleId/$docId" search={{ print: undefined }} params={{ workspaceId, moduleId: 'manufacturing', submoduleId: 'quality', docId }}><Plus className="size-4" />{children}</Link></Button>;
}

export function ProductionQualityView({ workspaceId }: { workspaceId: string }) {
  const get = useServerFn(getProductionQuality);
  const q = useQuery({ queryKey: ['production-quality', workspaceId], queryFn: () => get({ data: { workspaceId } }) });
  const [tab, setTab] = useState<'specs' | 'inspections' | 'deviations'>('inspections');
  if (q.isPending) return <Loader2 className="m-8 animate-spin text-muted-foreground" />;
  if (q.isError) return <p className="py-12 text-muted-foreground">{q.error.message}</p>;
  const d = q.data;
  const item = (id: string) => d.items.find((i) => i.id === id)?.code ?? '—';
  const lot = (id: string | null) => d.lots.find((l) => l.id === id);
  const specOf = (id: string) => d.specs.find((s) => s.id === id);
  const specRows = d.specs.map((s) => ({ ...s, item_code: item(s.item_id), stage_label: STAGE[s.stage] ?? s.stage, n_params: d.params.filter((p) => p.spec_id === s.id).length }));
  const insRows = d.inspections.map((x) => ({ ...x, lot_no: lot(x.lot_id)?.lot_no ?? '—', lot_status: lot(x.lot_id)?.qc_status ?? '', spec_code: specOf(x.spec_id)?.code ?? '' }));
  const devRows = d.deviations.map((v) => ({ ...v, lot_no: lot(v.lot_id)?.lot_no ?? '—' }));
  const tabs = [['specs', 'Spesifikasi'], ['inspections', 'Sampel & Hasil'], ['deviations', 'Deviasi']] as const;
  const newBtn = tab === 'specs' ? <NewButton workspaceId={workspaceId} docId="spec-new" disabled={!d.canWrite}>Spesifikasi baru</NewButton>
    : tab === 'inspections' ? <NewButton workspaceId={workspaceId} docId="insp-new" disabled={!d.canWrite}>Sampel baru</NewButton>
    : <NewButton workspaceId={workspaceId} docId="dev-new" disabled={!d.canWrite}>Deviasi baru</NewButton>;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">Quality Control</h1>{newBtn}
    </div>
    <div className="flex flex-wrap gap-2">{tabs.map(([k, l]) => <Button key={k} variant={tab === k ? 'default' : 'outline'} onClick={() => setTab(k)}>{l}</Button>)}</div>

    {tab === 'specs' && <ProductionPagedTable rows={specRows} headers={['Kode', 'Nama', 'Item', 'Tahap', 'Parameter', 'Status']} empty="Belum ada spesifikasi." row={(s, no) => <TableRow key={s.id}><RowNo no={no} /><TableCell><DocLink workspaceId={workspaceId} docId={`spec-${s.id}`}>{s.code}</DocLink></TableCell><TableCell>{s.name}</TableCell><TableCell>{s.item_code}</TableCell><TableCell>{s.stage_label}</TableCell><TableCell>{s.n_params}</TableCell><TableCell><StatusPill status={s.status} /></TableCell></TableRow>} />}

    {tab === 'inspections' && <ProductionPagedTable rows={insRows} headers={['Sampel', 'Lot', 'Spesifikasi', 'Tahap', 'Hasil uji', 'Status lot']} empty="Belum ada sampel." row={(x, no) => <TableRow key={x.id}><RowNo no={no} /><TableCell><DocLink workspaceId={workspaceId} docId={`insp-${x.id}`}>{x.sample_id}</DocLink></TableCell><TableCell>{x.lot_no}</TableCell><TableCell>{x.spec_code}</TableCell><TableCell>{STAGE[x.stage] ?? x.stage}</TableCell><TableCell><Badge variant={x.status === 'passed' ? 'default' : x.status === 'failed' ? 'destructive' : 'secondary'}>{x.status === 'passed' ? 'Lulus' : x.status === 'failed' ? 'Gagal' : 'Menunggu hasil'}</Badge></TableCell><TableCell>{x.lot_status ? <Badge variant={lotTone(x.lot_status)}>{LOT[x.lot_status] ?? x.lot_status}</Badge> : '—'}</TableCell></TableRow>} />}

    {tab === 'deviations' && <ProductionPagedTable rows={devRows} headers={['Nomor', 'Sumber', 'Lot', 'Deskripsi', 'Status']} empty="Tidak ada deviasi." row={(v, no) => <TableRow key={v.id}><RowNo no={no} /><TableCell><DocLink workspaceId={workspaceId} docId={`dev-${v.id}`}>{v.deviation_no}</DocLink></TableCell><TableCell>{v.source}</TableCell><TableCell>{v.lot_no}</TableCell><TableCell className="max-w-xs truncate">{v.description}</TableCell><TableCell><Badge variant={v.status === 'closed' ? 'default' : 'secondary'}>{v.status === 'closed' ? 'Selesai' : 'Terbuka'}</Badge></TableCell></TableRow>} />}
  </div>;
}
