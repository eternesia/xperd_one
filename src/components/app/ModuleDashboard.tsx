import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
// #49 (BS New 3): ikon tambahan untuk ringkasan dashboard modul.
import { CircleCheck, FileText, Landmark, PackageCheck, Receipt, Scale, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { countWorkspaceRows, listWorkspaceRows } from "@/lib/data.functions";
import { useI18n } from "@/lib/i18n";
import { MASTER_DATA_ENTITIES } from "@/lib/master-data";
import type { AppModule } from "@/lib/modules";
import { formatMoney, PRC_ENTITIES, STATUS_LABEL, STATUS_TONE, type PrcDoc } from "@/lib/procurement";
import {
  ACCOUNT_TYPE_LABEL,
  buildTrialBalance,
  fetchAccounts,
  fetchEntries,
  fetchLines,
  type AccAccountType,
} from "@/lib/accounting";
import { buildBalances, MOVEMENT_LABEL, MOVEMENT_TONE, type InvMovement } from "@/lib/inventory";
import { buildCbBalances, fetchCbAccounts, fetchCbTransactions } from "@/lib/cashbank";
import { bookValue, fetchAssets, fetchDepreciations, monthlyCharge } from "@/lib/fixedasset";
import { buildPeriodSummary, fetchTaxRecords } from "@/lib/tax";
import { ExecutiveDashboard } from "@/components/app/ReportingViews";
import { cn } from "@/lib/utils";

const LIVE_MODULES = new Set([
  "master-data",
  "procurement",
  "inventory",
  "sales",
  "cash-bank",
  "accounting",
  "fixed-asset",
  "tax",
  "reporting",
]);

const CHART_COLORS = ["#0A1A35", "#C9A227", "#0ea5e9", "#10b981", "#8b5cf6", "#f43f5e"];

export function ModuleDashboard({ mod, workspaceId }: { mod: AppModule; workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-navy dark:text-foreground">
            {lang === "id" ? mod.id_ : mod.en} · {t("Dashboard", "Dasbor")}
          </h1>
          {LIVE_MODULES.has(mod.id) ? (
            <Badge className="bg-gold text-gold-foreground hover:bg-gold">{t("Live", "Aktif")}</Badge>
          ) : (
            <Badge variant="secondary">{t(`Phase ${mod.phase}`, `Fase ${mod.phase}`)}</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{lang === "id" ? mod.descId : mod.descEn}</p>
      </div>

      {mod.id === "procurement" && <ProcurementDashboard workspaceId={workspaceId} />}
      {mod.id === "master-data" && <MasterDataDashboard workspaceId={workspaceId} />}
      {mod.id === "inventory" && <InventoryDashboard workspaceId={workspaceId} />}
      {mod.id === "sales" && <SalesDashboard workspaceId={workspaceId} />}
      {mod.id === "cash-bank" && <CashBankDashboard workspaceId={workspaceId} />}
      {mod.id === "accounting" && <AccountingDashboard workspaceId={workspaceId} />}
      {mod.id === "fixed-asset" && <FixedAssetDashboard workspaceId={workspaceId} />}
      {mod.id === "tax" && <TaxDashboard workspaceId={workspaceId} />}
      {mod.id === "reporting" && <ExecutiveDashboard workspaceId={workspaceId} />}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof FileText;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-gold" />
      </div>
      <p className="mt-2 text-2xl font-semibold text-navy dark:text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-sm font-semibold text-navy dark:text-foreground">{title}</p>
      <div className="mt-4 h-64">{children}</div>
    </div>
  );
}

function ProcurementDashboard({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["prc-dashboard", workspaceId],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: { table: "prc_documents", workspaceId, orderBy: "doc_date", orderDir: "desc", limit: 500 },
      });
      return (data?.rows ?? []) as unknown as PrcDoc[];
    },
  });

  const stats = useMemo(() => {
    const open = docs.filter((d) => !["cancelled", "closed", "paid"].includes(d.status));
    const po = docs.filter((d) => d.doc_type === "purchase_order");
    const gr = docs.filter((d) => d.doc_type === "goods_receipt");
    const ap = docs.filter((d) => d.doc_type === "ap_invoice");
    const payable = ap.reduce((s, d) => s + Number(d.total), 0) -
      docs.filter((d) => d.doc_type === "purchase_payment").reduce((s, d) => s + Number(d.total), 0);

    const byMonth = new Map<string, number>();
    po.forEach((d) => {
      const key = d.doc_date.slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + Number(d.total));
    });
    const monthly = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, value]) => ({ month, value }));

    const statusCount = new Map<string, number>();
    docs.forEach((d) => statusCount.set(d.status, (statusCount.get(d.status) ?? 0) + 1));
    const byStatus = [...statusCount.entries()].map(([name, value]) => ({ name, value }));

    const supplierTotal = new Map<string, number>();
    po.forEach((d) => {
      const key = d.supplier_name || d.supplier_code || "—";
      supplierTotal.set(key, (supplierTotal.get(key) ?? 0) + Number(d.total));
    });
    const topSuppliers = [...supplierTotal.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));

    return {
      openCount: open.length,
      poValue: po.reduce((s, d) => s + Number(d.total), 0),
      grCount: gr.length,
      payable,
      monthly,
      byStatus,
      topSuppliers,
      recent: docs.slice(0, 6),
    };
  }, [docs]);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("Loading…", "Memuat…")}</p>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("Open documents", "Dokumen terbuka")} value={String(stats.openCount)} icon={FileText} />
        <Stat label={t("PO value", "Nilai PO")} value={formatMoney(stats.poValue, lang)} icon={Receipt} />
        <Stat label={t("Goods receipts", "Penerimaan barang")} value={String(stats.grCount)} icon={PackageCheck} />
        <Stat
          label={t("Outstanding payables", "Hutang berjalan")}
          value={formatMoney(Math.max(0, stats.payable), lang)}
          icon={Wallet}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("Purchase orders per month", "Pesanan pembelian per bulan")}>
          {stats.monthly.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} width={70}
                  tickFormatter={(v: number) => new Intl.NumberFormat(lang === "id" ? "id-ID" : "en-US", { notation: "compact" }).format(v)} />
                <Tooltip formatter={(v: number) => formatMoney(v, lang)} />
                <Bar dataKey="value" fill="#C9A227" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title={t("Documents by status", "Dokumen menurut status")}>
          {stats.byStatus.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.byStatus} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85}>
                  {stats.byStatus.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-navy dark:text-primary-foreground">
            {t("Top suppliers", "Pemasok teratas")}
          </p>
          <ul className="mt-4 space-y-3 text-sm">
            {stats.topSuppliers.length === 0 && <li className="text-muted-foreground">{t("No data yet.", "Belum ada data.")}</li>}
            {stats.topSuppliers.map((s) => (
              <li key={s.name} className="flex items-center justify-between gap-4">
                <span className="truncate">{s.name}</span>
                <span className="font-medium text-navy dark:text-primary-foreground">{formatMoney(s.value, lang)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-navy dark:text-primary-foreground">
            {t("Recent documents", "Dokumen terbaru")}
          </p>
          <ul className="mt-4 space-y-3 text-sm">
            {stats.recent.length === 0 && <li className="text-muted-foreground">{t("No data yet.", "Belum ada data.")}</li>}
            {stats.recent.map((d) => {
              const entity = PRC_ENTITIES.find((e) => e.docType === d.doc_type);
              return (
                <li key={d.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-navy dark:text-primary-foreground">{d.doc_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {entity ? (lang === "id" ? entity.id_ : entity.en) : d.doc_type} · {d.doc_date}
                    </p>
                  </div>
                  <Badge variant="secondary" className={cn("border-0", STATUS_TONE[d.status])}>
                    {lang === "id" ? STATUS_LABEL[d.status].id_ : STATUS_LABEL[d.status].en}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function MasterDataDashboard({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);

  const { data: counts = [], isLoading } = useQuery({
    queryKey: ["md-dashboard", workspaceId],
    queryFn: async () => {
      const results = await Promise.all(
        MASTER_DATA_ENTITIES.map(async (e) => {
          const data = await countWorkspaceRows({ data: { table: e.table, workspaceId } });
          return { entity: e, count: data?.count ?? 0 };
        }),
      );
      return results;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("Loading…", "Memuat…")}</p>;

  const chartData = counts.map((c) => ({ name: lang === "id" ? c.entity.id_ : c.entity.en, value: c.count }));
  const totalRecords = counts.reduce((sum, row) => sum + row.count, 0);
  const configured = counts.filter((row) => row.count > 0).length;
  const largest = [...counts].sort((a, b) => b.count - a.count)[0];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("Total master records", "Total data master")} value={String(totalRecords)} icon={FileText} />
        <Stat
          label={t("Configured masters", "Master terisi")}
          value={`${configured} / ${counts.length}`}
          icon={CircleCheck}
        />
        <Stat
          label={t("Largest master", "Master terbesar")}
          value={largest ? String(largest.count) : "0"}
          hint={largest ? (lang === "id" ? largest.entity.id_ : largest.entity.en) : "—"}
          icon={Landmark}
        />
        <Stat
          label={t("Empty masters", "Master belum terisi")}
          value={String(counts.length - configured)}
          icon={PackageCheck}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={t("Records per master table", "Jumlah data per master")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} interval={0} angle={-15} height={50} textAnchor="end" />
              <YAxis fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} width={40} />
              <Tooltip />
              <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title={t("Master data composition", "Komposisi data master")}>
          {totalRecords === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData.filter((row) => row.value > 0)} dataKey="value" nameKey="name" innerRadius={52} outerRadius={88}>
                  {chartData.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Empty() {
  const { lang } = useI18n();
  return (
    <div className="grid h-full place-items-center text-sm text-muted-foreground">
      {lang === "id" ? "Belum ada data." : "No data yet."}
    </div>
  );
}

function InventoryDashboard({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["inv-dashboard", workspaceId],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: { table: "inv_movements", workspaceId, orderBy: "movement_date", orderDir: "desc", limit: 2000 },
      });
      return (data?.rows ?? []) as unknown as InvMovement[];
    },
  });

  const stats = useMemo(() => {
    const balances = buildBalances(movements, false);
    const value = balances.reduce((s, b) => s + b.value, 0);
    const negative = balances.filter((b) => b.qty < 0).length;

    const byWarehouse = new Map<string, number>();
    movements.forEach((m) => {
      const key = m.warehouse_code ?? "—";
      byWarehouse.set(key, (byWarehouse.get(key) ?? 0) + Number(m.qty));
    });

    const byMonth = new Map<string, { month: string; in: number; out: number }>();
    movements.forEach((m) => {
      const key = m.movement_date.slice(0, 7);
      const cur = byMonth.get(key) ?? { month: key, in: 0, out: 0 };
      if (Number(m.qty) >= 0) cur.in += Number(m.qty);
      else cur.out += Math.abs(Number(m.qty));
      byMonth.set(key, cur);
    });

    return {
      itemCount: balances.length,
      totalQty: balances.reduce((s, b) => s + b.qty, 0),
      value,
      negative,
      warehouses: [...byWarehouse.entries()].map(([name, value]) => ({ name, value })),
      monthly: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-6),
      topItems: balances.slice().sort((a, b) => b.value - a.value).slice(0, 5),
      recent: movements.slice(0, 6),
    };
  }, [movements]);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("Loading…", "Memuat…")}</p>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("Items in stock", "Item dalam stok")} value={String(stats.itemCount)} icon={FileText} />
        <Stat label={t("Total quantity", "Total kuantitas")} value={String(stats.totalQty)} icon={PackageCheck} />
        <Stat label={t("Inventory value", "Nilai persediaan")} value={formatMoney(stats.value, lang)} icon={Wallet} />
        <Stat label={t("Negative stock", "Stok minus")} value={String(stats.negative)} icon={Receipt} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("Stock in vs out per month", "Barang masuk vs keluar per bulan")}>
          {stats.monthly.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} width={50} />
                <Tooltip />
                <Legend />
                <Bar dataKey="in" name={t("In", "Masuk")} fill="#10b981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="out" name={t("Out", "Keluar")} fill="#f43f5e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title={t("Quantity per warehouse", "Kuantitas per gudang")}>
          {stats.warehouses.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.warehouses} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85}>
                  {stats.warehouses.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-navy dark:text-primary-foreground">
            {t("Top items by value", "Item bernilai tertinggi")}
          </p>
          <ul className="mt-4 space-y-3 text-sm">
            {stats.topItems.length === 0 && <li className="text-muted-foreground">{t("No data yet.", "Belum ada data.")}</li>}
            {stats.topItems.map((b) => (
              <li key={b.item_code} className="flex items-center justify-between gap-4">
                <span className="truncate">{b.item_name || b.item_code}</span>
                <span className="font-medium text-navy dark:text-primary-foreground">{formatMoney(b.value, lang)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-navy dark:text-primary-foreground">
            {t("Recent movements", "Mutasi terbaru")}
          </p>
          <ul className="mt-4 space-y-3 text-sm">
            {stats.recent.length === 0 && <li className="text-muted-foreground">{t("No data yet.", "Belum ada data.")}</li>}
            {stats.recent.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-navy dark:text-primary-foreground">{m.item_name || m.item_code}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.movement_date} · {m.warehouse_code ?? "—"} · {m.ref_number ?? "—"}
                  </p>
                </div>
                <Badge variant="secondary" className={cn("border-0", MOVEMENT_TONE[m.movement_type])}>
                  {Number(m.qty) > 0 ? "+" : ""}
                  {Number(m.qty)} {lang === "id" ? MOVEMENT_LABEL[m.movement_type].id_ : MOVEMENT_LABEL[m.movement_type].en}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SalesDashboard({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["sls-dashboard", workspaceId],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: { table: "sls_documents", workspaceId, orderBy: "doc_date", orderDir: "desc", limit: 500 },
      });
      return (data?.rows ?? []) as unknown as (Omit<PrcDoc, "doc_type"> & { doc_type: string; customer_name: string | null; customer_code: string | null })[];
    },
  });

  const stats = useMemo(() => {
    const open = docs.filter((d) => !["cancelled", "closed", "paid"].includes(d.status));
    const so = docs.filter((d) => d.doc_type === "sales_order");
    const dono = docs.filter((d) => d.doc_type === "delivery_order");
    const ar = docs.filter((d) => d.doc_type === "ar_invoice");
    const receivable =
      ar.reduce((s, d) => s + Number(d.total), 0) -
      docs.filter((d) => d.doc_type === "sales_receipt").reduce((s, d) => s + Number(d.total), 0);

    const byMonth = new Map<string, number>();
    so.forEach((d) => byMonth.set(d.doc_date.slice(0, 7), (byMonth.get(d.doc_date.slice(0, 7)) ?? 0) + Number(d.total)));
    const monthly = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([month, value]) => ({ month, value }));

    const statusCount = new Map<string, number>();
    docs.forEach((d) => statusCount.set(d.status, (statusCount.get(d.status) ?? 0) + 1));
    const byStatus = [...statusCount.entries()].map(([name, value]) => ({ name, value }));

    const custTotal = new Map<string, number>();
    so.forEach((d) => {
      const key = d.customer_name || d.customer_code || "—";
      custTotal.set(key, (custTotal.get(key) ?? 0) + Number(d.total));
    });
    const topCustomers = [...custTotal.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => ({ name, value }));

    return {
      openCount: open.length,
      soValue: so.reduce((s, d) => s + Number(d.total), 0),
      doCount: dono.length,
      receivable,
      monthly,
      byStatus,
      topCustomers,
    };
  }, [docs]);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("Loading…", "Memuat…")}</p>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("Open documents", "Dokumen terbuka")} value={String(stats.openCount)} icon={FileText} />
        <Stat label={t("Sales order value", "Nilai pesanan")} value={formatMoney(stats.soValue, lang)} icon={Receipt} />
        <Stat label={t("Deliveries", "Surat jalan")} value={String(stats.doCount)} icon={PackageCheck} />
        <Stat
          label={t("Outstanding receivables", "Piutang berjalan")}
          value={formatMoney(Math.max(0, stats.receivable), lang)}
          icon={Wallet}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("Sales orders per month", "Pesanan penjualan per bulan")}>
          {stats.monthly.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} width={70}
                  tickFormatter={(v: number) => new Intl.NumberFormat(lang === "id" ? "id-ID" : "en-US", { notation: "compact" }).format(v)} />
                <Tooltip formatter={(v: number) => formatMoney(v, lang)} />
                <Bar dataKey="value" fill="#0A1A35" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title={t("Documents by status", "Dokumen menurut status")}>
          {stats.byStatus.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.byStatus} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85}>
                  {stats.byStatus.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-navy dark:text-primary-foreground">
          {t("Top customers", "Pelanggan teratas")}
        </p>
        <ul className="mt-4 space-y-3 text-sm">
          {stats.topCustomers.length === 0 && <li className="text-muted-foreground">{t("No data yet.", "Belum ada data.")}</li>}
          {stats.topCustomers.map((c) => (
            <li key={c.name} className="flex items-center justify-between gap-3">
              <span className="truncate">{c.name}</span>
              <span className="font-medium text-navy dark:text-primary-foreground">{formatMoney(c.value, lang)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}


function AccountingDashboard({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const year = new Date().getFullYear();

  const { data } = useQuery({
    queryKey: ["acc-dashboard", workspaceId, year],
    queryFn: async () => {
      const entries = await fetchEntries(workspaceId, `${year}-01-01`, `${year}-12-31`);
      const lines = await fetchLines(workspaceId, entries.map((e) => e.id));
      const accounts = await fetchAccounts(workspaceId);
      return { entries, lines, accounts };
    },
  });

  const balances = useMemo(
    () => buildTrialBalance(data?.lines ?? [], data?.accounts ?? []),
    [data?.lines, data?.accounts],
  );
  const sum = (type: AccAccountType) =>
    balances.filter((b) => b.type === type).reduce((s, b) => s + b.balance, 0);

  const revenue = sum("revenue");
  const expense = sum("expense");
  const net = revenue - expense;
  // #49 (BS New 3): ringkasan neraca, margin, dan kontrol keseimbangan jurnal.
  const assets = sum("asset");
  const liabilities = sum("liability");
  const equity = sum("equity") + net;
  const margin = revenue ? (net / revenue) * 100 : 0;
  const unbalanced = (data?.entries ?? []).filter(
    (entry) => Math.abs(Number(entry.total_debit || 0) - Number(entry.total_credit || 0)) > 0.5,
  ).length;

  const monthly = useMemo(() => {
    const byId = new Map((data?.entries ?? []).map((e) => [e.id, e]));
    const meta = new Map(balances.map((b) => [b.code, b.type]));
    const rows = Array.from({ length: 12 }, (_, i) => ({
      month: new Date(year, i, 1).toLocaleDateString(lang === "id" ? "id-ID" : "en-US", { month: "short" }),
      revenue: 0,
      expense: 0,
    }));
    for (const l of data?.lines ?? []) {
      const e = byId.get(l.entry_id);
      if (!e) continue;
      const idx = new Date(e.entry_date).getMonth();
      const type = meta.get(l.account_code);
      if (type === "revenue") rows[idx].revenue += Number(l.credit || 0) - Number(l.debit || 0);
      if (type === "expense") rows[idx].expense += Number(l.debit || 0) - Number(l.credit || 0);
    }
    return rows;
  }, [data, balances, lang, year]);

  const mix = (["asset", "liability", "equity"] as AccAccountType[]).map((type) => ({
    name: lang === "id" ? ACCOUNT_TYPE_LABEL[type].id_ : ACCOUNT_TYPE_LABEL[type].en,
    value: Math.abs(type === "equity" ? equity : sum(type)),
  }));

  const topExpenses = balances
    .filter((balance) => balance.type === "expense" && balance.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);
  const recentEntries = (data?.entries ?? []).slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-navy dark:text-foreground">
            {t("Accounting summary", "Ringkasan akuntansi")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              `Year to date through ${new Date().toLocaleDateString("en-US")}`,
              `Tahun berjalan sampai ${new Date().toLocaleDateString("id-ID")}`,
            )}
          </p>
        </div>
        <Badge variant={unbalanced === 0 ? "secondary" : "destructive"} className="gap-1.5">
          {unbalanced === 0 && <CircleCheck className="h-3.5 w-3.5" />}
          {unbalanced === 0
            ? t("All journals balanced", "Semua jurnal seimbang")
            : t(`${unbalanced} unbalanced journals`, `${unbalanced} jurnal tidak seimbang`)}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label={t("Revenue", "Pendapatan")} value={formatMoney(revenue, lang)} icon={Receipt} />
        <Stat label={t("Expenses", "Beban")} value={formatMoney(expense, lang)} icon={Wallet} />
        <Stat
          label={t("Net profit / loss", "Laba / rugi bersih")}
          value={formatMoney(net, lang)}
          icon={PackageCheck}
          hint={t(`Net margin ${margin.toFixed(1)}%`, `Margin bersih ${margin.toFixed(1)}%`)}
        />
        <Stat label={t("Total assets", "Total aset")} value={formatMoney(assets, lang)} icon={Landmark} />
        <Stat label={t("Total liabilities", "Total kewajiban")} value={formatMoney(liabilities, lang)} icon={Scale} />
        <Stat
          label={t("Journal entries", "Jurnal tercatat")}
          value={String(data?.entries.length ?? 0)}
          icon={FileText}
          hint={String(year)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("Revenue vs expenses", "Pendapatan vs beban")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} width={70} />
              <Tooltip formatter={(v: number) => formatMoney(v, lang)} />
              <Legend />
              <Bar dataKey="revenue" name={t("Revenue", "Pendapatan")} fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name={t("Expenses", "Beban")} fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title={t("Balance composition", "Komposisi neraca")}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={mix} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                {mix.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => formatMoney(v, lang)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* #49 (BS New 3): akun beban terbesar + aktivitas jurnal terbaru. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-navy dark:text-foreground">
            {t("Largest expense accounts", "Akun beban terbesar")}
          </p>
          <div className="mt-4 space-y-3">
            {topExpenses.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("No expense posted yet.", "Belum ada beban yang diposting.")}</p>
            )}
            {topExpenses.map((account) => {
              const share = expense > 0 ? Math.min(100, (account.balance / expense) * 100) : 0;
              return (
                <div key={account.code}>
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="text-muted-foreground">{account.code}</span> · {account.name}
                    </span>
                    <span className="shrink-0 font-medium text-navy dark:text-foreground">
                      {formatMoney(account.balance, lang)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gold" style={{ width: `${share}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-navy dark:text-foreground">
            {t("Recent journal activity", "Aktivitas jurnal terbaru")}
          </p>
          <div className="mt-4 divide-y divide-border">
            {recentEntries.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("No journal posted yet.", "Belum ada jurnal yang diposting.")}</p>
            )}
            {recentEntries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-navy dark:text-foreground">{entry.entry_no}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {entry.entry_date} · {entry.memo || entry.source_doc_number || t("Journal entry", "Jurnal")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium text-navy dark:text-foreground">
                    {formatMoney(Number(entry.total_debit || 0), lang)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.is_auto ? t("Automatic", "Otomatis") : t("Manual", "Manual")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-2 text-xl font-semibold text-navy dark:text-primary-foreground",
          highlight && "text-gold dark:text-gold",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function FixedAssetDashboard({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const money = (v: number) => formatMoney(v, lang);

  const { data: assets = [] } = useQuery({
    queryKey: ["fa-assets", workspaceId],
    queryFn: () => fetchAssets(workspaceId),
  });
  const { data: deps = [] } = useQuery({
    queryKey: ["fa-dep", workspaceId],
    queryFn: () => fetchDepreciations(workspaceId),
  });

  const active = assets.filter((a) => a.status === "active");
  const cost = assets.reduce((s, a) => s + Number(a.acquisition_cost || 0), 0);
  const net = assets.reduce((s, a) => s + bookValue(a), 0);
  const monthly = active.reduce((s, a) => s + monthlyCharge(a), 0);

  // #49 (BS New 3): akumulasi penyusutan + nilai buku per kategori.
  const accumulated = assets.reduce((s, a) => s + Number(a.accumulated_depreciation || 0), 0);

  const byPeriod = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of deps) {
      const key = String(d.period_date).slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + Number(d.amount || 0));
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([period, amount]) => ({ period, amount }));
  }, [deps]);

  const byCategory = useMemo(() => {
    const rows = new Map<string, number>();
    assets.forEach((asset) => {
      const category = asset.category || t("Uncategorized", "Tanpa kategori");
      rows.set(category, (rows.get(category) ?? 0) + bookValue(asset));
    });
    return [...rows.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [assets, lang]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MiniCard label={t("Active assets", "Aset aktif")} value={String(active.length)} />
        <MiniCard label={t("Acquisition cost", "Harga perolehan")} value={money(cost)} />
        <MiniCard label={t("Net book value", "Nilai buku")} value={money(net)} highlight />
        <MiniCard label={t("Accumulated depreciation", "Akumulasi penyusutan")} value={money(accumulated)} />
        <MiniCard label={t("Monthly depreciation", "Penyusutan bulanan")} value={money(monthly)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("Depreciation trend", "Tren penyusutan")}>
          {byPeriod.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byPeriod}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v: number) => money(Number(v))} />
                <Bar dataKey="amount" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title={t("Book value by category", "Nilai buku per kategori")}>
          {byCategory.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={50} outerRadius={88}>
                  {byCategory.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => money(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>
    </div>
  );
}

function TaxDashboard({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const money = (v: number) => formatMoney(v, lang);

  const { data: records = [] } = useQuery({
    queryKey: ["tax", workspaceId, "all"],
    queryFn: () => fetchTaxRecords(workspaceId),
  });

  const summary = useMemo(() => buildPeriodSummary(records).slice(0, 6).reverse(), [records]);
  const vatIn = records.filter((r) => r.tax_type === "vat_in").reduce((s, r) => s + Number(r.tax_amount || 0), 0);
  const vatOut = records.filter((r) => r.tax_type === "vat_out").reduce((s, r) => s + Number(r.tax_amount || 0), 0);
  const wht = records.filter((r) => r.tax_type === "withholding").reduce((s, r) => s + Number(r.tax_amount || 0), 0);
  // #49 (BS New 3): status dokumen pajak + dokumen periode berjalan.
  const statuses = (["draft", "reported", "paid"] as const).map((status) => ({
    name:
      status === "draft"
        ? t("Draft", "Draf")
        : status === "reported"
          ? t("Reported", "Dilaporkan")
          : t("Paid", "Disetor"),
    value: records.filter((record) => record.status === status).length,
  }));
  const currentPeriod = new Date().toISOString().slice(0, 7);
  const currentRecords = records.filter((record) => record.period === currentPeriod);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MiniCard label={t("Input VAT", "PPN Masukan")} value={money(vatIn)} />
        <MiniCard label={t("Output VAT", "PPN Keluaran")} value={money(vatOut)} />
        <MiniCard label={t("Withholding", "PPh")} value={money(wht)} />
        <MiniCard label={t("Net VAT payable", "PPN kurang bayar")} value={money(vatOut - vatIn)} highlight />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <MiniCard label={t("Records this period", "Dokumen periode ini")} value={String(currentRecords.length)} />
        <MiniCard label={t("Draft records", "Dokumen draf")} value={String(statuses[0].value)} />
        <MiniCard
          label={t("Reported / paid", "Dilaporkan / disetor")}
          value={String(statuses[1].value + statuses[2].value)}
          highlight
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("VAT by period", "PPN per periode")}>
          {summary.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v: number) => money(Number(v))} />
                <Legend />
                <Bar dataKey="vatIn" name={t("Input VAT", "PPN Masukan")} fill={CHART_COLORS[2]} radius={[6, 6, 0, 0]} />
                <Bar dataKey="vatOut" name={t("Output VAT", "PPN Keluaran")} fill={CHART_COLORS[1]} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title={t("Tax record status", "Status dokumen pajak")}>
          {records.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statuses} dataKey="value" nameKey="name" innerRadius={50} outerRadius={88}>
                  {statuses.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index + 1]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>
    </div>
  );
}

function CashBankDashboard({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const year = new Date().getFullYear();

  const { data } = useQuery({
    queryKey: ["cb-dashboard", workspaceId, year],
    queryFn: async () => {
      const [accounts, trx] = await Promise.all([
        fetchCbAccounts(workspaceId),
        fetchCbTransactions(workspaceId, { from: `${year}-01-01`, to: `${year}-12-31` }),
      ]);
      return { accounts, trx };
    },
  });

  const accounts = data?.accounts ?? [];
  const trx = data?.trx ?? [];
  const balances = useMemo(() => buildCbBalances(accounts, trx), [accounts, trx]);
  const totalBalance = balances.reduce((s, b) => s + b.balance, 0);
  const inflow = trx.filter((x) => x.trx_type === "in").reduce((s, x) => s + Number(x.amount || 0), 0);
  const outflow = trx.filter((x) => x.trx_type === "out").reduce((s, x) => s + Number(x.amount || 0), 0);
  const openItems = trx.filter((x) => !x.is_reconciled).length;
  // #49 (BS New 3): ringkasan bulan berjalan + daftar saldo & mutasi terbaru.
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const monthTrx = trx.filter((x) => x.trx_date.startsWith(monthPrefix));
  const monthIn = monthTrx.filter((x) => x.trx_type === "in").reduce((s, x) => s + Number(x.amount || 0), 0);
  const monthOut = monthTrx.filter((x) => x.trx_type === "out").reduce((s, x) => s + Number(x.amount || 0), 0);

  const monthly = useMemo(() => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      month: new Date(year, i, 1).toLocaleDateString(lang === "id" ? "id-ID" : "en-US", { month: "short" }),
      in: 0,
      out: 0,
    }));
    for (const x of trx) {
      const idx = new Date(x.trx_date).getMonth();
      const row = rows[idx];
      if (!row) continue;
      if (x.trx_type === "in") row.in += Number(x.amount || 0);
      if (x.trx_type === "out") row.out += Number(x.amount || 0);
    }
    return rows;
  }, [trx, lang, year]);

  const mix = balances.map((b) => ({ name: b.account.name, value: Math.max(0, b.balance) }));
  const recent = [...trx].sort((a, b) => b.trx_date.localeCompare(a.trx_date)).slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("Cash & bank balance", "Saldo kas & bank")} value={formatMoney(totalBalance, lang)} icon={Wallet} />
        <Stat label={t("Cash in", "Kas masuk")} value={formatMoney(inflow, lang)} icon={Receipt} hint={String(year)} />
        <Stat label={t("Cash out", "Kas keluar")} value={formatMoney(outflow, lang)} icon={FileText} hint={String(year)} />
        <Stat label={t("Net cash flow", "Arus kas bersih")} value={formatMoney(inflow - outflow, lang)} icon={Wallet} hint={String(year)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("Cash in this month", "Kas masuk bulan ini")}
          value={formatMoney(monthIn, lang)}
          icon={Receipt}
          hint={monthPrefix}
        />
        <Stat
          label={t("Cash out this month", "Kas keluar bulan ini")}
          value={formatMoney(monthOut, lang)}
          icon={FileText}
          hint={monthPrefix}
        />
        <Stat
          label={t("Transactions this month", "Transaksi bulan ini")}
          value={String(monthTrx.length)}
          icon={PackageCheck}
        />
        <Stat label={t("Unreconciled", "Belum rekonsiliasi")} value={String(openItems)} icon={PackageCheck} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("Cash flow by month", "Arus kas per bulan")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} width={70} />
              <Tooltip formatter={(v: number) => formatMoney(v, lang)} />
              <Legend />
              <Bar dataKey="in" name={t("Cash in", "Kas masuk")} fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="out" name={t("Cash out", "Kas keluar")} fill={CHART_COLORS[5]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title={t("Balance per account", "Saldo per akun")}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={mix} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                {mix.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => formatMoney(v, lang)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* #49 (BS New 3): saldo kas/bank per rekening + mutasi terbaru. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-navy dark:text-foreground">
            {t("Account balances", "Saldo kas & bank")}
          </p>
          <div className="mt-4 divide-y divide-border">
            {balances.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("No account yet.", "Belum ada rekening.")}</p>
            )}
            {balances.map((account) => (
              <div key={account.account.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-navy dark:text-foreground">
                    {account.account.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{account.account.code}</p>
                </div>
                <p className="shrink-0 text-sm font-medium text-navy dark:text-foreground">
                  {formatMoney(account.balance, lang)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-navy dark:text-foreground">
            {t("Recent movements", "Mutasi terbaru")}
          </p>
          <div className="mt-4 divide-y divide-border">
            {recent.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("No transaction yet.", "Belum ada transaksi.")}</p>
            )}
            {recent.map((item) => {
              const amount = Number(item.amount || 0);
              const signed = item.trx_type === "out" ? -amount : amount;
              return (
                <div key={item.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-navy dark:text-foreground">
                      {item.memo || item.reference || item.trx_no || t("Cash transaction", "Transaksi kas")}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.trx_date}
                      {item.is_reconciled ? ` · ${t("Reconciled", "Terekonsiliasi")}` : ` · ${t("Unreconciled", "Belum rekonsiliasi")}`}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "shrink-0 text-sm font-medium",
                      signed < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {signed < 0 ? "-" : "+"}
                    {formatMoney(Math.abs(signed), lang)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
