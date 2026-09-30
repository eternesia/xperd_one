/**
 * #45 (BS New 3): Kartu AR/AP dan Aging piutang/hutang.
 * Murni presentasional — datanya dari `@/lib/subledger` (server fn MySQL).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, Loader2, Sheet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/procurement";
import { exportTablePdf, exportTableXlsx, type TableExport } from "@/lib/report-export";
import { buildAging, buildCard, fetchSubledger, partnersOf, type SubledgerSide } from "@/lib/subledger";

const ALL = "__all__";

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

function Head({ kicker, title, right }: { kicker: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{kicker}</p>
        <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">{title}</h1>
      </div>
      {right}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone ?? "text-navy dark:text-primary-foreground"}`}>{value}</p>
    </div>
  );
}

function ExportButtons({ build }: { build: () => TableExport }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const run = async (kind: "xlsx" | "pdf") => {
    try {
      const payload = build();
      if (!payload.rows.length) {
        toast.error(t("Nothing to export.", "Tidak ada data untuk diekspor."));
        return;
      }
      if (kind === "xlsx") await exportTableXlsx(payload);
      else await exportTablePdf(payload);
    } catch {
      toast.error(t("Export failed.", "Ekspor gagal."));
    }
  };
  return (
    <div className="no-print flex gap-2">
      <Button variant="outline" size="sm" onClick={() => run("xlsx")}>
        <Sheet className="mr-2 h-4 w-4" /> Excel
      </Button>
      <Button variant="outline" size="sm" onClick={() => run("pdf")}>
        <FileDown className="mr-2 h-4 w-4" /> PDF
      </Button>
    </div>
  );
}

function Range({
  from,
  to,
  setFrom,
  setTo,
  labelFrom,
  labelTo,
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  labelFrom: string;
  labelTo: string;
}) {
  return (
    <>
      <div className="grid gap-1">
        <Label className="text-xs">{labelFrom}</Label>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">{labelTo}</Label>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" />
      </div>
    </>
  );
}

const DOC_LABEL: Record<string, { en: string; id_: string }> = {
  ar_invoice: { en: "AR Invoice", id_: "Faktur Piutang" },
  sales_receipt: { en: "Receipt", id_: "Penerimaan" },
  sales_return: { en: "Sales Return", id_: "Retur Penjualan" },
  ap_invoice: { en: "AP Invoice", id_: "Faktur Hutang" },
  purchase_payment: { en: "Payment", id_: "Pembayaran" },
  purchase_return: { en: "Purchase Return", id_: "Retur Pembelian" },
};

export function SubledgerCardView({ side, workspaceId }: { side: SubledgerSide; workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [partner, setPartner] = useState(ALL);

  const { data = [], isLoading } = useQuery({
    queryKey: ["subledger", side, workspaceId, from, to],
    queryFn: () => fetchSubledger(side, workspaceId, from, to),
  });

  const partners = useMemo(() => partnersOf(side, data), [side, data]);
  const rows = useMemo(
    () => buildCard(side, data, partner === ALL ? undefined : partner),
    [side, data, partner],
  );
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

  const title = side === "ar" ? t("AR Card", "Kartu Piutang") : t("AP Card", "Kartu Hutang");
  const partnerLabel = side === "ar" ? t("Customer", "Pelanggan") : t("Supplier", "Pemasok");

  const build = (): TableExport => ({
    filename: `${side}-card-${from}-${to}`,
    title,
    subtitle: `${from} — ${to}`,
    summary: [
      [t("Total invoiced", "Total tagihan"), formatMoney(totalDebit, lang)],
      [t("Total settled", "Total pelunasan"), formatMoney(totalCredit, lang)],
      [t("Outstanding", "Saldo akhir"), formatMoney(totalDebit - totalCredit, lang)],
    ],
    headers: [
      t("Date", "Tanggal"),
      partnerLabel,
      t("Document", "Dokumen"),
      t("Type", "Jenis"),
      t("Due", "Jatuh tempo"),
      t("Debit", "Debit"),
      t("Credit", "Kredit"),
      t("Balance", "Saldo"),
    ],
    numericColumns: [5, 6, 7],
    orientation: "landscape",
    rows: rows.map((r) => [
      r.date,
      r.partner,
      r.doc_number,
      lang === "id" ? (DOC_LABEL[r.doc_type]?.id_ ?? r.doc_type) : (DOC_LABEL[r.doc_type]?.en ?? r.doc_type),
      r.due_date ?? "",
      r.debit || "",
      r.credit || "",
      r.balance,
    ]),
  });

  return (
    <div className="space-y-5">
      <Head kicker={t("Accounting", "Akuntansi")} title={title} right={<ExportButtons build={build} />} />

      <div className="no-print flex flex-wrap items-end gap-2">
        <Range
          from={from}
          to={to}
          setFrom={setFrom}
          setTo={setTo}
          labelFrom={t("From", "Dari")}
          labelTo={t("To", "Sampai")}
        />
        <div className="grid gap-1">
          <Label className="text-xs">{partnerLabel}</Label>
          <Select value={partner} onValueChange={setPartner}>
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("All", "Semua")}</SelectItem>
              {partners.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("Total invoiced", "Total tagihan")} value={formatMoney(totalDebit, lang)} />
        <Stat label={t("Total settled", "Total pelunasan")} value={formatMoney(totalCredit, lang)} />
        <Stat label={t("Outstanding", "Saldo akhir")} value={formatMoney(totalDebit - totalCredit, lang)} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{t("Date", "Tanggal")}</TableHead>
              <TableHead>{partnerLabel}</TableHead>
              <TableHead>{t("Document", "Dokumen")}</TableHead>
              <TableHead>{t("Type", "Jenis")}</TableHead>
              <TableHead>{t("Due", "Jatuh tempo")}</TableHead>
              <TableHead className="text-right">{t("Debit", "Debit")}</TableHead>
              <TableHead className="text-right">{t("Credit", "Kredit")}</TableHead>
              <TableHead className="text-right">{t("Balance", "Saldo")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !rows.length && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  {t("No movements in this period.", "Belum ada mutasi pada periode ini.")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow key={r.id}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell>{r.date}</TableCell>
                <TableCell>{r.partner}</TableCell>
                <TableCell className="font-medium text-navy dark:text-primary-foreground">{r.doc_number}</TableCell>
                <TableCell className="text-muted-foreground">
                  {lang === "id"
                    ? (DOC_LABEL[r.doc_type]?.id_ ?? r.doc_type)
                    : (DOC_LABEL[r.doc_type]?.en ?? r.doc_type)}
                </TableCell>
                <TableCell className="text-muted-foreground">{r.due_date ?? "—"}</TableCell>
                <TableCell className="text-right">{r.debit ? formatMoney(r.debit, lang) : "—"}</TableCell>
                <TableCell className="text-right">{r.credit ? formatMoney(r.credit, lang) : "—"}</TableCell>
                <TableCell className="text-right font-medium">{formatMoney(r.balance, lang)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function AgingView({ side, workspaceId }: { side: SubledgerSide; workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const [asOf, setAsOf] = useState(today());

  const { data = [], isLoading } = useQuery({
    queryKey: ["subledger-aging", side, workspaceId, asOf],
    queryFn: () => fetchSubledger(side, workspaceId, "", asOf),
  });

  const rows = useMemo(() => buildAging(side, data, asOf), [side, data, asOf]);
  const sum = (k: "current" | "d1" | "d31" | "d61" | "d90" | "total") => rows.reduce((s, r) => s + r[k], 0);

  const title = side === "ar" ? t("AR Aging", "Umur Piutang") : t("AP Aging", "Umur Hutang");
  const partnerLabel = side === "ar" ? t("Customer", "Pelanggan") : t("Supplier", "Pemasok");
  const buckets = [t("Not due", "Belum jatuh tempo"), "1–30", "31–60", "61–90", t("> 90 days", "> 90 hari")];

  const build = (): TableExport => ({
    filename: `${side}-aging-${asOf}`,
    title,
    subtitle: `${t("As of", "Per tanggal")} ${asOf}`,
    summary: [[t("Total outstanding", "Total belum lunas"), formatMoney(sum("total"), lang)]],
    headers: [partnerLabel, ...buckets, t("Total", "Total")],
    numericColumns: [1, 2, 3, 4, 5, 6],
    orientation: "landscape",
    rows: rows.map((r) => [r.partner, r.current, r.d1, r.d31, r.d61, r.d90, r.total]),
  });

  return (
    <div className="space-y-5">
      <Head kicker={t("Accounting", "Akuntansi")} title={title} right={<ExportButtons build={build} />} />

      <div className="no-print flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label className="text-xs">{t("As of", "Per tanggal")}</Label>
          <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-9 w-[150px]" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {buckets.map((b, i) => (
          <Stat
            key={b}
            label={b}
            value={formatMoney(sum((["current", "d1", "d31", "d61", "d90"] as const)[i]!), lang)}
          />
        ))}
        <Stat label={t("Total", "Total")} value={formatMoney(sum("total"), lang)} tone="text-gold" />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{partnerLabel}</TableHead>
              {buckets.map((b) => (
                <TableHead key={b} className="text-right">
                  {b}
                </TableHead>
              ))}
              <TableHead className="text-right">{t("Total", "Total")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !rows.length && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  {t("Nothing outstanding.", "Tidak ada saldo belum lunas.")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow key={r.partner}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-medium text-navy dark:text-primary-foreground">{r.partner}</TableCell>
                <TableCell className="text-right">{r.current ? formatMoney(r.current, lang) : "—"}</TableCell>
                <TableCell className="text-right">{r.d1 ? formatMoney(r.d1, lang) : "—"}</TableCell>
                <TableCell className="text-right">{r.d31 ? formatMoney(r.d31, lang) : "—"}</TableCell>
                <TableCell className="text-right">{r.d61 ? formatMoney(r.d61, lang) : "—"}</TableCell>
                <TableCell className="text-right">{r.d90 ? formatMoney(r.d90, lang) : "—"}</TableCell>
                <TableCell className="text-right font-semibold">{formatMoney(r.total, lang)}</TableCell>
              </TableRow>
            ))}
            {!!rows.length && (
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={2}>{t("Total", "Total")}</TableCell>
                <TableCell className="text-right">{formatMoney(sum("current"), lang)}</TableCell>
                <TableCell className="text-right">{formatMoney(sum("d1"), lang)}</TableCell>
                <TableCell className="text-right">{formatMoney(sum("d31"), lang)}</TableCell>
                <TableCell className="text-right">{formatMoney(sum("d61"), lang)}</TableCell>
                <TableCell className="text-right">{formatMoney(sum("d90"), lang)}</TableCell>
                <TableCell className="text-right">{formatMoney(sum("total"), lang)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
