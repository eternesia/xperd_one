import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Boxes, ClipboardCheck, Factory, FlaskConical, Gauge, Loader2, Lock, PackageCheck, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmtIDR } from './admin-ui';
import { useI18n } from '@/lib/i18n';
import { getProductionDashboard } from '@/lib/production-dashboard.functions';

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--muted-foreground)', 'var(--destructive)'];
const ORDER: Record<string, [string, string]> = { draft: ['Draft', 'Draf'], planned: ['Planned', 'Direncanakan'], released: ['Released', 'Dirilis'], in_progress: ['In progress', 'Berjalan'], qc_pending: ['Awaiting QC', 'Menunggu QC'], completed: ['Completed', 'Selesai'], closed: ['Closed', 'Ditutup'], cancelled: ['Cancelled', 'Dibatalkan'] };
const LOT: Record<string, [string, string]> = { quarantine: ['Quarantine', 'Karantina'], hold: ['On hold', 'Ditahan'], released: ['Released', 'Dirilis'], rejected: ['Rejected', 'Ditolak'], expired: ['Expired', 'Kedaluwarsa'] };
const BOM: Record<string, [string, string]> = { draft: ['Draft', 'Draf'], in_review: ['In review', 'Ditinjau'], approved: ['Approved', 'Disetujui'], obsolete: ['Obsolete', 'Usang'] };

export function ProductionDashboard({ workspaceId }: { workspaceId: string }) {
  const get = useServerFn(getProductionDashboard);
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === 'id' ? id : en);
  const q = useQuery({ queryKey: ['production-dashboard', workspaceId], queryFn: () => get({ data: { workspaceId } }) });
  if (q.isPending) return <div className="grid min-h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (q.isError) return <div className="mx-auto max-w-lg py-16 text-center"><Lock className="mx-auto h-8 w-8 text-muted-foreground" /><h1 className="mt-4 text-xl font-semibold">{t('Production access restricted', 'Akses Production dibatasi')}</h1><p className="mt-2 text-sm text-muted-foreground">{q.error.message}</p></div>;
  const d = q.data;
  const label = (map: Record<string, [string, string]>, k: string) => (map[k] ? t(map[k][0], map[k][1]) : k);
  const toRows = (obj: Record<string, number>, map: Record<string, [string, string]>) => Object.entries(obj).map(([k, v]) => ({ name: label(map, k), value: v }));
  const active = (d.orderStatus.released ?? 0) + (d.orderStatus.in_progress ?? 0) + (d.orderStatus.qc_pending ?? 0);
  const kpis = [
    { icon: FlaskConical, label: t('Formulations / BOM', 'Formulasi / BOM'), value: d.bomCount, sub: `${d.bomStatus.approved ?? 0} ${t('approved versions', 'versi disetujui')}`, to: 'boms' },
    { icon: Factory, label: t('Production orders', 'Perintah produksi'), value: d.orderTotal, sub: `${active} ${t('active', 'aktif')}`, to: 'orders' },
    { icon: PackageCheck, label: t('Finished goods (6 months)', 'Barang jadi (6 bulan)'), value: d.finishedQty.toLocaleString('id-ID'), sub: d.avgYield != null ? `${t('Average yield', 'Rata-rata yield')} ${d.avgYield}%` : t('No yield yet', 'Belum ada yield'), to: 'orders' },
    { icon: Boxes, label: t('Lots in quarantine', 'Lot karantina'), value: d.lotStatus.quarantine ?? 0, sub: `${d.expiringLots} ${t('expire within 30 days', 'kedaluwarsa ≤ 30 hari')}`, to: 'lots' },
    { icon: ClipboardCheck, label: t('Pending inspections', 'Inspeksi tertunda'), value: d.inspectionStatus.pending ?? 0, sub: `${d.inspectionStatus.passed ?? 0} ${t('passed', 'lulus')}`, to: 'quality' },
    { icon: AlertTriangle, label: t('Open deviations', 'Deviasi terbuka'), value: d.openDeviations, sub: t('Need investigation / CAPA', 'Perlu investigasi / CAPA'), to: 'quality' },
    { icon: Gauge, label: t('Work centers', 'Pusat kerja'), value: d.workCenters, sub: t('Active', 'Aktif'), to: 'work-centers' },
    { icon: Wallet, label: t('Production cost', 'Biaya produksi'), value: fmtIDR(d.totalCost), sub: `${t('Variance', 'Selisih')} ${fmtIDR(d.totalVariance)}`, to: 'accounting' },
  ];
  const trend = d.outputByMonth.map((m) => ({ name: new Date(`${m.month}-01`).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', { month: 'short' }), [t('Finished goods', 'Barang jadi')]: m.finished, [t('By-product', 'Produk samping')]: m.by_product, Scrap: m.scrap }));
  const Empty = () => <div className="grid h-full place-items-center text-sm text-muted-foreground">{t('No data yet', 'Belum ada data')}</div>;
  const PieCard = ({ title, rows }: { title: string; rows: { name: string; value: number }[] }) => <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="h-64">{rows.some((r) => r.value) ? <ResponsiveContainer><PieChart><Pie data={rows} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>{rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer> : <Empty />}</CardContent></Card>;
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3"><Factory className="h-7 w-7 text-primary" /><div><p className="text-xs text-muted-foreground">Production</p><h1 className="text-2xl font-semibold">{t('Production Dashboard', 'Dasbor Production')}</h1></div></header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.label} to="/app/w/$workspaceId/$moduleId/$submoduleId" params={{ workspaceId, moduleId: 'manufacturing', submoduleId: k.to }}>
            <Card className="h-full transition-colors hover:border-primary/50"><CardContent className="flex items-start gap-3 p-4"><div className="rounded-lg bg-primary/10 p-2 text-primary"><k.icon className="h-5 w-5" /></div><div className="min-w-0"><p className="text-xs text-muted-foreground">{k.label}</p><p className="truncate text-xl font-semibold">{k.value}</p><p className="text-xs text-muted-foreground">{k.sub}</p></div></CardContent></Card>
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-base">{t('Production output (6 months)', 'Output produksi (6 bulan)')}</CardTitle></CardHeader><CardContent className="h-72">{d.outputByMonth.some((m) => m.finished || m.by_product || m.scrap) ? <ResponsiveContainer><BarChart data={trend}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend /><Bar dataKey={t('Finished goods', 'Barang jadi')} stackId="a" fill={COLORS[0]} /><Bar dataKey={t('By-product', 'Produk samping')} stackId="a" fill={COLORS[1]} /><Bar dataKey="Scrap" stackId="a" fill={COLORS[6]} /></BarChart></ResponsiveContainer> : <Empty />}</CardContent></Card>
        <PieCard title={t('Orders by status', 'Order per status')} rows={toRows(d.orderStatus, ORDER)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <PieCard title={t('Lots by QC status', 'Lot per status QC')} rows={toRows(d.lotStatus, LOT)} />
        <PieCard title={t('BOM versions by status', 'Versi BOM per status')} rows={toRows(d.bomStatus, BOM)} />
      </div>
    </div>
  );
}
