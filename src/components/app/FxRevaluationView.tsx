import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { postFxRevaluation, previewFxRevaluation } from "@/lib/fx-revaluation";
import { useI18n } from "@/lib/i18n";

/** Hari terakhir bulan lalu — periode revaluasi yang lazim dipakai. */
function lastDayOfPrevMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 0)).toISOString().slice(0, 10);
}

/** Ronde 29 (BS New 8): revaluasi kurs pos moneter valas pada akhir periode. */
export function FxRevaluationView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const qc = useQueryClient();
  const [asOf, setAsOf] = useState(lastDayOfPrevMonth());
  const fmt = (n: number, d = 2) =>
    new Intl.NumberFormat(lang === "id" ? "id-ID" : "en-US", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(n);

  const { data, isLoading, error } = useQuery({
    queryKey: ["fx-reval", workspaceId, asOf],
    queryFn: () => previewFxRevaluation(workspaceId, asOf),
    enabled: Boolean(asOf),
  });

  const post = useMutation({
    mutationFn: () => postFxRevaluation(workspaceId, asOf),
    onSuccess: () => {
      toast.success(
        t(
          "Revaluation posted with automatic reversal.",
          "Revaluasi diposting beserta jurnal balik otomatis.",
        ),
      );
      qc.invalidateQueries({ queryKey: ["fx-reval", workspaceId] });
      qc.invalidateQueries({ queryKey: ["acc-ledger", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const kindLabel = { ar: t("Receivable", "Piutang"), ap: t("Payable", "Hutang"), bank: t("Cash/Bank", "Kas/Bank") };

  return (
    <div className="space-y-6" data-testid="fx-revaluation-view">
      <div>
        <p className="text-xs font-semibold tracking-[0.28em] text-gold">{t("ACCOUNTING", "AKUNTANSI")}</p>
        <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">
          {t("FX Revaluation", "Revaluasi Kurs")}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {t(
            "Restates open foreign-currency receivables, payables and cash/bank at the closing rate. The unrealized difference (4910/6910) is reversed automatically the next day.",
            "Menilai ulang piutang, hutang, dan kas/bank valas yang masih terbuka dengan kurs penutupan. Selisih belum terealisasi (4910/6910) dibalik otomatis keesokan harinya.",
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="space-y-1.5">
          <Label>{t("Revaluation date", "Tanggal revaluasi")}</Label>
          <Input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="w-48"
            data-testid="fx-reval-date"
          />
        </div>
        {data && (
          <div className="flex flex-wrap gap-6 text-sm" data-testid="fx-reval-summary">
            <div>
              <p className="text-muted-foreground">{t("Unrealized gain", "Laba belum terealisasi")}</p>
              <p className="font-semibold">
                {fmt(data.gain)} {data.base}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("Unrealized loss", "Rugi belum terealisasi")}</p>
              <p className="font-semibold">
                {fmt(data.loss)} {data.base}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("Net", "Bersih")}</p>
              <p className="font-semibold">
                {fmt(data.gain - data.loss)} {data.base}
              </p>
            </div>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {data?.posted && (
            <Badge variant="secondary">
              {t("Posted", "Sudah diposting")} · {data.period}
            </Badge>
          )}
          <Button
            variant="navy"
            data-testid="fx-reval-post"
            disabled={!data || data.posted || post.isPending || !data.items.some((i) => Math.abs(i.diff) >= 0.01)}
            onClick={() => post.mutate()}
          >
            {post.isPending && <Loader2 className="animate-spin" />}
            {data?.posted ? t("Already posted", "Sudah diposting") : t("Post revaluation", "Posting revaluasi")}
          </Button>
        </div>
      </div>

      {data && data.missingRates.length > 0 && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t("No closing/transaction rate found for", "Kurs penutupan/transaksi belum ada untuk")}:{" "}
          {data.missingRates.join(", ")}. {t("Add it in Master Data → Exchange Rates.", "Tambahkan di Master Data → Kurs.")}
        </p>
      )}

      <div className="rounded-2xl border border-border bg-card">
        {isLoading ? (
          <div className="grid h-40 place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="p-6 text-sm text-destructive">{(error as Error).message}</p>
        ) : !data?.items.length ? (
          <p className="p-6 text-sm text-muted-foreground" data-testid="fx-reval-empty">
            {t("No open foreign-currency items on this date.", "Tidak ada saldo valas terbuka pada tanggal ini.")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Type", "Jenis")}</TableHead>
                <TableHead>{t("Item", "Pos")}</TableHead>
                <TableHead>{t("Currency", "Valas")}</TableHead>
                <TableHead className="text-right">{t("Foreign amount", "Nilai valas")}</TableHead>
                <TableHead className="text-right">{t("Book value", "Nilai buku")}</TableHead>
                <TableHead className="text-right">{t("Closing rate", "Kurs penutupan")}</TableHead>
                <TableHead className="text-right">{t("Revalued", "Nilai revaluasi")}</TableHead>
                <TableHead className="text-right">{t("Difference", "Selisih")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((i, idx) => (
                <TableRow key={`${i.kind}-${i.accountCode}-${idx}`}>
                  <TableCell>{kindLabel[i.kind]}</TableCell>
                  <TableCell className="max-w-64 truncate">{i.label}</TableCell>
                  <TableCell>{i.currency}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(i.foreign)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(i.carrying)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(i.closingRate, 4)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(i.revalued)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(i.diff)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
