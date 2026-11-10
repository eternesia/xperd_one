import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n";
import { formatMoney as fmtMoney } from "@/lib/procurement";
import {
  ACCOUNT_TYPE_LABEL,
  buildTrialBalance,
  fetchAccounts,
  fetchEntries,
  fetchLines,
  type AccAccountType,
} from "@/lib/accounting";
import {
  buildCsv,
  byMonth,
  downloadCsv,
  fetchCashFlow,
  fetchMovements,
  fetchPurchaseDocs,
  fetchPurchaseLines,
  fetchSalesDocs,
  fetchSalesLines,
  payableOf,
  rank,
  receivableOf,
  revenueOf,
  spendOf,
  startOfYear,
  today,
  type RptEntity,
} from "@/lib/reporting";

const COLORS = ["#0A1A35", "#C9A227", "#0ea5e9", "#10b981", "#8b5cf6", "#f43f5e", "#f59e0b", "#64748b"];

function Header({ title, kicker, action }: { title: string; kicker: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold tracking-[0.28em] text-gold">{kicker.toUpperCase()}</p>
        <h1 className="text-xl font-semibold text-navy sm:text-2xl dark:text-primary-foreground">{title}</h1>
      </div>
      {action}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-3.5 sm:p-5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground sm:text-xs">{label}</p>
      <p className="mt-2 break-words text-lg font-semibold leading-tight text-navy sm:text-2xl dark:text-primary-foreground">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5 ${className ?? ""}`}>
      <p className="text-sm font-semibold text-navy dark:text-primary-foreground">{title}</p>
      <div className="mt-4 h-60 sm:h-72">{children}</div>
    </div>
  );
}

function RangeBar({
  from,
  to,
  setFrom,
  setTo,
  onExport,
  extra,
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  onExport?: () => void;
  extra?: React.ReactNode;
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  return (
    <div className="q-filters flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-3 sm:p-4">
      <div className="space-y-1">
        <Label className="text-xs">{t("From", "Dari")}</Label>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t("To", "Sampai")}</Label>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
      </div>
      {extra}
      <div className="ml-auto empty:hidden">
        {onExport && (
          <Button variant="outline" onClick={onExport}>
            <Download /> {t("Export CSV", "Ekspor CSV")}
          </Button>
        )}
      </div>
    </div>
  );
}

function Loading() {
  const { lang } = useI18n();
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {lang === "id" ? "Memuat…" : "Loading…"}
    </p>
  );
}

export function ReportingView({ entity, workspaceId }: { entity: RptEntity; workspaceId: string }) {
  switch (entity.submoduleId) {
    case "sales":
      return <SalesAnalytics workspaceId={workspaceId} />;
    case "purchasing":
      return <PurchasingAnalytics workspaceId={workspaceId} />;
    case "inventory":
      return <InventoryAnalytics workspaceId={workspaceId} />;
    case "financial":
      return <FinancialReports workspaceId={workspaceId} />;
    case "exports":
      return <DataExports workspaceId={workspaceId} />;
    default:
      return <ExecutiveDashboard workspaceId={workspaceId} />;
  }
}

/* ------------------------------- executive -------------------------------- */

export function ExecutiveDashboard({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const money = (v: number) => fmtMoney(v, lang);
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());

  const sales = useQuery({
    queryKey: ["rpt-sales", workspaceId, from, to],
    queryFn: () => fetchSalesDocs(workspaceId, from, to),
  });
  const purchases = useQuery({
    queryKey: ["rpt-purchase", workspaceId, from, to],
    queryFn: () => fetchPurchaseDocs(workspaceId, from, to),
  });
  const cash = useQuery({
    queryKey: ["rpt-cash", workspaceId, from, to],
    queryFn: () => fetchCashFlow(workspaceId, from, to),
  });

  const s = sales.data ?? [];
  const p = purchases.data ?? [];
  const c = cash.data ?? [];

  const revenue = revenueOf(s);
  const spend = spendOf(p);
  const inflow = c.filter((x) => x.trx_type === "in").reduce((a, b) => a + Number(b.amount || 0), 0);
  const outflow = c.filter((x) => x.trx_type === "out").reduce((a, b) => a + Number(b.amount || 0), 0);

  const trend = useMemo(() => {
    const rev = byMonth(
      s.filter((d) => d.doc_type === "ar_invoice" && d.status !== "cancelled"),
      (d) => d.doc_date,
      (d) => Number(d.total || 0),
    );
    const cost = byMonth(
      p.filter((d) => d.doc_type === "ap_invoice" && d.status !== "cancelled"),
      (d) => d.doc_date,
      (d) => Number(d.total || 0),
    );
    const months = [...new Set([...rev.map((r) => r.month), ...cost.map((r) => r.month)])].sort();
    return months.map((month) => ({
      month,
      revenue: rev.find((r) => r.month === month)?.value ?? 0,
      spend: cost.find((r) => r.month === month)?.value ?? 0,
    }));
  }, [s, p]);

  const topCustomers = rank(
    s.filter((d) => d.doc_type === "ar_invoice" && d.status !== "cancelled"),
    (d) => d.customer_name || d.customer_code || "—",
    (d) => Number(d.total || 0),
    6,
  );

  const loading = sales.isLoading || purchases.isLoading || cash.isLoading;

  return (
    <div className="space-y-6">
      <Header kicker={t("Reporting & BI", "Laporan & BI")} title={t("Executive Dashboard", "Dasbor Eksekutif")} />
      <RangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} />

      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat label={t("Revenue", "Pendapatan")} value={money(revenue)} hint={t("AR invoices", "Faktur piutang")} />
            <Stat label={t("Purchases", "Pembelian")} value={money(spend)} hint={t("AP invoices", "Faktur hutang")} />
            <Stat
              label={t("Gross margin", "Marjin kotor")}
              value={money(revenue - spend)}
              hint={revenue > 0 ? `${(((revenue - spend) / revenue) * 100).toFixed(1)}%` : "—"}
            />
            <Stat label={t("Net cash flow", "Arus kas bersih")} value={money(inflow - outflow)} hint={`${money(inflow)} / ${money(outflow)}`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title={t("Revenue vs purchases", "Pendapatan vs pembelian")} className="lg:col-span-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Legend />
                  <Area type="monotone" dataKey="revenue" name={t("Revenue", "Pendapatan")} stroke="#C9A227" fill="#C9A227" fillOpacity={0.2} />
                  <Area type="monotone" dataKey="spend" name={t("Purchases", "Pembelian")} stroke="#0A1A35" fill="#0A1A35" fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title={t("Top customers", "Pelanggan teratas")}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={topCustomers} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                    {topCustomers.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat label={t("Receivables", "Piutang")} value={money(receivableOf(s))} />
            <Stat label={t("Payables", "Hutang")} value={money(payableOf(p))} />
            <Stat label={t("Sales documents", "Dokumen penjualan")} value={String(s.length)} />
            <Stat label={t("Purchase documents", "Dokumen pembelian")} value={String(p.length)} />
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------------- sales ---------------------------------- */

function SalesAnalytics({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const money = (v: number) => fmtMoney(v, lang);
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const [dim, setDim] = useState<"customer" | "item" | "month">("customer");

  const docsQ = useQuery({
    queryKey: ["rpt-sales", workspaceId, from, to],
    queryFn: () => fetchSalesDocs(workspaceId, from, to),
  });
  const docs = (docsQ.data ?? []).filter((d) => d.doc_type === "ar_invoice" && d.status !== "cancelled");
  const linesQ = useQuery({
    queryKey: ["rpt-sales-lines", workspaceId, docs.map((d) => d.id).join(",")],
    queryFn: () => fetchSalesLines(workspaceId, docs.map((d) => d.id)),
    enabled: dim === "item" && docs.length > 0,
  });

  const rows = useMemo(() => {
    if (dim === "item") {
      return rank(linesQ.data ?? [], (l) => l.item_code || l.description || "—", (l) => Number(l.line_total || 0), 50);
    }
    if (dim === "month") {
      return byMonth(docs, (d) => d.doc_date, (d) => Number(d.total || 0), 24).map((m) => ({
        name: m.month,
        value: m.value,
        count: docs.filter((d) => d.doc_date.slice(0, 7) === m.month).length,
      }));
    }
    return rank(docs, (d) => d.customer_name || d.customer_code || "—", (d) => Number(d.total || 0), 50);
  }, [dim, docs, linesQ.data]);

  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <div className="space-y-6">
      <Header kicker={t("Reporting & BI", "Laporan & BI")} title={t("Sales Analytics", "Analitik Penjualan")} />
      <RangeBar
        from={from}
        to={to}
        setFrom={setFrom}
        setTo={setTo}
        onExport={() =>
          downloadCsv(
            `sales-analytics-${from}-${to}.csv`,
            buildCsv([dim, "documents", "amount"], rows.map((r) => [r.name, r.count, r.value])),
          )
        }
        extra={
          <div className="space-y-1">
            <Label className="text-xs">{t("Group by", "Kelompokkan")}</Label>
            <Select value={dim} onValueChange={(v) => setDim(v as typeof dim)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">{t("Customer", "Pelanggan")}</SelectItem>
                <SelectItem value="item">{t("Item", "Item")}</SelectItem>
                <SelectItem value="month">{t("Month", "Bulan")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {docsQ.isLoading ? (
        <Loading />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label={t("Revenue", "Pendapatan")} value={money(total)} />
            <Stat label={t("Invoices", "Faktur")} value={String(docs.length)} />
            <Stat
              label={t("Average invoice", "Rata-rata faktur")}
              value={money(docs.length ? total / docs.length : 0)}
            />
          </div>

          <Panel title={t("Distribution", "Distribusi")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="name" fontSize={11} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis fontSize={11} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Bar dataKey="value" name={t("Revenue", "Pendapatan")} fill="#C9A227" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <RankTable rows={rows} label={t("Group", "Kelompok")} money={money} />
        </>
      )}
    </div>
  );
}

function RankTable({
  rows,
  label,
  money,
}: {
  rows: { name: string; value: number; count: number }[];
  label: string;
  money: (v: number) => string;
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card max-md:border-0 max-md:bg-transparent">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{label}</TableHead>
            <TableHead className="text-right">{t("Documents", "Dokumen")}</TableHead>
            <TableHead className="text-right">{t("Amount", "Nilai")}</TableHead>
            <TableHead className="text-right">%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                {t("No data for this period.", "Tidak ada data pada periode ini.")}
              </TableCell>
            </TableRow>
          )}
          {rows.map((r, i) => (
            <TableRow key={r.name}>
              <TableCell className="font-medium">
                <span className="mr-2 tabular-nums text-muted-foreground">{i + 1}.</span>
                {r.name}
              </TableCell>
              <TableCell className="text-right">{r.count}</TableCell>
              <TableCell className="text-right">{money(r.value)}</TableCell>
              <TableCell className="text-right text-muted-foreground">
                {total ? ((r.value / total) * 100).toFixed(1) : "0.0"}%
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ------------------------------- purchasing ------------------------------- */

function PurchasingAnalytics({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const money = (v: number) => fmtMoney(v, lang);
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const [dim, setDim] = useState<"supplier" | "item" | "month">("supplier");

  const docsQ = useQuery({
    queryKey: ["rpt-purchase", workspaceId, from, to],
    queryFn: () => fetchPurchaseDocs(workspaceId, from, to),
  });
  const docs = (docsQ.data ?? []).filter((d) => d.doc_type === "ap_invoice" && d.status !== "cancelled");
  const linesQ = useQuery({
    queryKey: ["rpt-purchase-lines", workspaceId, docs.map((d) => d.id).join(",")],
    queryFn: () => fetchPurchaseLines(workspaceId, docs.map((d) => d.id)),
    enabled: dim === "item" && docs.length > 0,
  });

  const rows = useMemo(() => {
    if (dim === "item") {
      return rank(linesQ.data ?? [], (l) => l.item_code || l.description || "—", (l) => Number(l.line_total || 0), 50);
    }
    if (dim === "month") {
      return byMonth(docs, (d) => d.doc_date, (d) => Number(d.total || 0), 24).map((m) => ({
        name: m.month,
        value: m.value,
        count: docs.filter((d) => d.doc_date.slice(0, 7) === m.month).length,
      }));
    }
    return rank(docs, (d) => d.supplier_name || d.supplier_code || "—", (d) => Number(d.total || 0), 50);
  }, [dim, docs, linesQ.data]);

  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <div className="space-y-6">
      <Header kicker={t("Reporting & BI", "Laporan & BI")} title={t("Purchasing Analytics", "Analitik Pembelian")} />
      <RangeBar
        from={from}
        to={to}
        setFrom={setFrom}
        setTo={setTo}
        onExport={() =>
          downloadCsv(
            `purchasing-analytics-${from}-${to}.csv`,
            buildCsv([dim, "documents", "amount"], rows.map((r) => [r.name, r.count, r.value])),
          )
        }
        extra={
          <div className="space-y-1">
            <Label className="text-xs">{t("Group by", "Kelompokkan")}</Label>
            <Select value={dim} onValueChange={(v) => setDim(v as typeof dim)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="supplier">{t("Supplier", "Pemasok")}</SelectItem>
                <SelectItem value="item">{t("Item", "Item")}</SelectItem>
                <SelectItem value="month">{t("Month", "Bulan")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {docsQ.isLoading ? (
        <Loading />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label={t("Spend", "Pembelian")} value={money(total)} />
            <Stat label={t("Bills", "Faktur")} value={String(docs.length)} />
            <Stat label={t("Average bill", "Rata-rata faktur")} value={money(docs.length ? total / docs.length : 0)} />
          </div>

          <Panel title={t("Distribution", "Distribusi")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="name" fontSize={11} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis fontSize={11} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Bar dataKey="value" name={t("Spend", "Pembelian")} fill="#0A1A35" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <RankTable rows={rows} label={t("Group", "Kelompok")} money={money} />
        </>
      )}
    </div>
  );
}

/* -------------------------------- inventory ------------------------------- */

function InventoryAnalytics({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const money = (v: number) => fmtMoney(v, lang);
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());

  const movesQ = useQuery({
    queryKey: ["rpt-moves", workspaceId, from, to],
    queryFn: () => fetchMovements(workspaceId, from, to),
  });
  const moves = movesQ.data ?? [];

  const summary = useMemo(() => {
    const inValue = moves.filter((m) => m.movement_type === "in").reduce((s, m) => s + Number(m.value || 0), 0);
    const outValue = moves.filter((m) => m.movement_type === "out").reduce((s, m) => s + Number(m.value || 0), 0);
    const perItem = new Map<string, { name: string; inQty: number; outQty: number; net: number; value: number }>();
    for (const m of moves) {
      const key = m.item_code;
      const row = perItem.get(key) ?? { name: m.item_name || m.item_code, inQty: 0, outQty: 0, net: 0, value: 0 };
      const qty = Number(m.qty || 0);
      if (m.movement_type === "out") {
        row.outQty += qty;
        row.net -= qty;
      } else {
        row.inQty += qty;
        row.net += qty;
      }
      row.value += (m.movement_type === "out" ? -1 : 1) * Number(m.value || 0);
      perItem.set(key, row);
    }
    const items = [...perItem.entries()].map(([code, r]) => ({ code, ...r }));
    const trend = byMonth(moves, (m) => m.movement_date, (m) => Number(m.value || 0), 12);
    const fastMoving = [...items].sort((a, b) => b.outQty - a.outQty).slice(0, 10);
    return { inValue, outValue, items: items.sort((a, b) => b.value - a.value), trend, fastMoving };
  }, [moves]);

  return (
    <div className="space-y-6">
      <Header kicker={t("Reporting & BI", "Laporan & BI")} title={t("Inventory Analytics", "Analitik Persediaan")} />
      <RangeBar
        from={from}
        to={to}
        setFrom={setFrom}
        setTo={setTo}
        onExport={() =>
          downloadCsv(
            `inventory-analytics-${from}-${to}.csv`,
            buildCsv(
              ["item_code", "item_name", "qty_in", "qty_out", "net_qty", "net_value"],
              summary.items.map((i) => [i.code, i.name, i.inQty, i.outQty, i.net, i.value]),
            ),
          )
        }
      />

      {movesQ.isLoading ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat label={t("Stock in value", "Nilai masuk")} value={money(summary.inValue)} />
            <Stat label={t("Stock out value", "Nilai keluar")} value={money(summary.outValue)} />
            <Stat label={t("Net movement", "Mutasi bersih")} value={money(summary.inValue - summary.outValue)} />
            <Stat label={t("Movements", "Transaksi mutasi")} value={String(moves.length)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={t("Movement value per month", "Nilai mutasi per bulan")}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={summary.trend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Line type="monotone" dataKey="value" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title={t("Fast moving items", "Item paling laku")}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.fastMoving} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis type="number" fontSize={11} />
                  <YAxis dataKey="name" type="category" fontSize={11} width={110} />
                  <Tooltip />
                  <Bar dataKey="outQty" name={t("Qty out", "Qty keluar")} fill="#C9A227" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>{t("Item", "Item")}</TableHead>
                  <TableHead className="text-right">{t("Qty in", "Qty masuk")}</TableHead>
                  <TableHead className="text-right">{t("Qty out", "Qty keluar")}</TableHead>
                  <TableHead className="text-right">{t("Net qty", "Qty bersih")}</TableHead>
                  <TableHead className="text-right">{t("Net value", "Nilai bersih")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      {t("No movements for this period.", "Tidak ada mutasi pada periode ini.")}
                    </TableCell>
                  </TableRow>
                )}
                {summary.items.slice(0, 100).map((i, idx) => (
                  <TableRow key={i.code}>
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <span className="font-medium">{i.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{i.code}</span>
                    </TableCell>
                    <TableCell className="text-right">{i.inQty}</TableCell>
                    <TableCell className="text-right">{i.outQty}</TableCell>
                    <TableCell className="text-right">{i.net}</TableCell>
                    <TableCell className="text-right">{money(i.value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------- financial ------------------------------- */

function FinancialReports({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const money = (v: number) => fmtMoney(v, lang);
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());

  const { data, isLoading } = useQuery({
    queryKey: ["rpt-financial", workspaceId, from, to],
    queryFn: async () => {
      const [accounts, entries] = await Promise.all([
        fetchAccounts(workspaceId),
        fetchEntries(workspaceId, from, to),
      ]);
      const lines = await fetchLines(workspaceId, entries.map((e) => e.id));
      return { balances: buildTrialBalance(lines, accounts), entries: entries.length };
    },
  });

  const balances = data?.balances ?? [];
  const groups = useMemo(() => {
    const g = new Map<AccAccountType, typeof balances>();
    for (const b of balances) {
      g.set(b.type, [...(g.get(b.type) ?? []), b]);
    }
    return g;
  }, [balances]);

  const sum = (type: AccAccountType) => (groups.get(type) ?? []).reduce((s, r) => s + r.balance, 0);
  const revenue = sum("revenue");
  const expense = sum("expense");

  return (
    <div className="space-y-6">
      <Header kicker={t("Reporting & BI", "Laporan & BI")} title={t("Financial Reports", "Laporan Keuangan")} />
      <RangeBar
        from={from}
        to={to}
        setFrom={setFrom}
        setTo={setTo}
        onExport={() =>
          downloadCsv(
            `financial-summary-${from}-${to}.csv`,
            buildCsv(
              ["code", "name", "type", "debit", "credit", "balance"],
              balances.map((b) => [b.code, b.name, b.type, b.debit, b.credit, b.balance]),
            ),
          )
        }
      />

      {isLoading ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat label={t("Revenue", "Pendapatan")} value={money(revenue)} />
            <Stat label={t("Expenses", "Beban")} value={money(expense)} />
            <Stat label={t("Net profit", "Laba bersih")} value={money(revenue - expense)} />
            <Stat label={t("Journal entries", "Jurnal")} value={String(data?.entries ?? 0)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={t("Assets vs liabilities & equity", "Aset vs kewajiban & ekuitas")}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: t("Assets", "Aset"), value: sum("asset") },
                    { name: t("Liabilities", "Kewajiban"), value: sum("liability") },
                    { name: t("Equity", "Ekuitas"), value: sum("equity") + revenue - expense },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Bar dataKey="value" fill="#0A1A35" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title={t("Expense composition", "Komposisi beban")}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={(groups.get("expense") ?? [])
                      .filter((r) => r.balance > 0)
                      .slice(0, 8)
                      .map((r) => ({ name: r.name, value: r.balance }))}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={90}
                  >
                    {(groups.get("expense") ?? []).slice(0, 8).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Account", "Akun")}</TableHead>
                  <TableHead>{t("Type", "Tipe")}</TableHead>
                  <TableHead className="text-right">{t("Debit", "Debit")}</TableHead>
                  <TableHead className="text-right">{t("Credit", "Kredit")}</TableHead>
                  <TableHead className="text-right">{t("Balance", "Saldo")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      {t("No journal activity for this period.", "Tidak ada aktivitas jurnal pada periode ini.")}
                    </TableCell>
                  </TableRow>
                )}
                {balances.map((b) => (
                  <TableRow key={b.code}>
                    <TableCell>
                      <span className="font-medium">{b.code}</span>
                      <span className="ml-2 text-muted-foreground">{b.name}</span>
                    </TableCell>
                    <TableCell className="text-xs uppercase text-muted-foreground">
                      {lang === "id" ? ACCOUNT_TYPE_LABEL[b.type].id_ : ACCOUNT_TYPE_LABEL[b.type].en}
                    </TableCell>
                    <TableCell className="text-right">{money(b.debit)}</TableCell>
                    <TableCell className="text-right">{money(b.credit)}</TableCell>
                    <TableCell className="text-right font-medium">{money(b.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------------- exports -------------------------------- */

type DatasetId = "sales" | "purchasing" | "inventory" | "cash" | "journal";

function DataExports({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState<DatasetId | null>(null);

  const datasets: { id: DatasetId; en: string; id_: string; descEn: string; descId: string }[] = [
    { id: "sales", en: "Sales documents", id_: "Dokumen penjualan", descEn: "Quotation to receipt", descId: "Penawaran sampai penerimaan" },
    { id: "purchasing", en: "Purchase documents", id_: "Dokumen pembelian", descEn: "PR to payment", descId: "PR sampai pembayaran" },
    { id: "inventory", en: "Stock movements", id_: "Mutasi stok", descEn: "All inventory movements", descId: "Seluruh mutasi persediaan" },
    { id: "cash", en: "Cash & bank", id_: "Kas & bank", descEn: "Cash in, out and transfers", descId: "Kas masuk, keluar, transfer" },
    { id: "journal", en: "Journal lines", id_: "Baris jurnal", descEn: "General ledger detail", descId: "Detail buku besar" },
  ];

  async function run(id: DatasetId) {
    setBusy(id);
    try {
      if (id === "sales") {
        const rows = await fetchSalesDocs(workspaceId, from, to);
        downloadCsv(
          `sales-documents-${from}-${to}.csv`,
          buildCsv(
            ["doc_number", "doc_type", "doc_date", "customer", "warehouse", "status", "subtotal", "tax", "total"],
            rows.map((d) => [d.doc_number, d.doc_type, d.doc_date, d.customer_name, d.warehouse_code, d.status, d.subtotal, d.tax_amount, d.total]),
          ),
        );
      } else if (id === "purchasing") {
        const rows = await fetchPurchaseDocs(workspaceId, from, to);
        downloadCsv(
          `purchase-documents-${from}-${to}.csv`,
          buildCsv(
            ["doc_number", "doc_type", "doc_date", "supplier", "warehouse", "status", "subtotal", "tax", "total"],
            rows.map((d) => [d.doc_number, d.doc_type, d.doc_date, d.supplier_name, d.warehouse_code, d.status, d.subtotal, d.tax_amount, d.total]),
          ),
        );
      } else if (id === "inventory") {
        const rows = await fetchMovements(workspaceId, from, to);
        downloadCsv(
          `stock-movements-${from}-${to}.csv`,
          buildCsv(
            ["date", "type", "item_code", "item_name", "warehouse", "qty", "unit_cost", "value", "reference"],
            rows.map((m) => [m.movement_date, m.movement_type, m.item_code, m.item_name, m.warehouse_code, m.qty, m.unit_cost, m.value, m.ref_number]),
          ),
        );
      } else if (id === "cash") {
        const rows = await fetchCashFlow(workspaceId, from, to);
        downloadCsv(
          `cash-bank-${from}-${to}.csv`,
          buildCsv(
            ["trx_no", "date", "type", "account", "counterpart", "contact", "method", "amount", "reference"],
            rows.map((c) => [c.trx_no, c.trx_date, c.trx_type, c.account_name || c.account_code, c.counterpart_account_name, c.contact_name, c.method, c.amount, c.reference]),
          ),
        );
      } else {
        const entries = await fetchEntries(workspaceId, from, to);
        const lines = await fetchLines(workspaceId, entries.map((e) => e.id));
        const meta = new Map(entries.map((e) => [e.id, e]));
        downloadCsv(
          `journal-lines-${from}-${to}.csv`,
          buildCsv(
            ["entry_no", "date", "memo", "account_code", "account_name", "description", "debit", "credit"],
            lines.map((l) => [
              meta.get(l.entry_id)?.entry_no,
              meta.get(l.entry_id)?.entry_date,
              meta.get(l.entry_id)?.memo,
              l.account_code,
              l.account_name,
              l.description,
              l.debit,
              l.credit,
            ]),
          ),
        );
      }
      toast.success(t("Export ready.", "Ekspor selesai."));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Export failed.", "Ekspor gagal."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <Header kicker={t("Reporting & BI", "Laporan & BI")} title={t("Data Exports", "Ekspor Data")} />
      <RangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {datasets.map((d) => (
          <div key={d.id} className="flex flex-col rounded-2xl border border-border bg-card p-5">
            <p className="font-semibold text-navy dark:text-primary-foreground">{lang === "id" ? d.id_ : d.en}</p>
            <p className="mt-1 text-sm text-muted-foreground">{lang === "id" ? d.descId : d.descEn}</p>
            <Button className="mt-4 w-full sm:w-auto sm:self-start" variant="outline" disabled={busy === d.id} onClick={() => run(d.id)}>
              {busy === d.id ? <Loader2 className="animate-spin" /> : <Download />}
              {t("Download CSV", "Unduh CSV")}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
