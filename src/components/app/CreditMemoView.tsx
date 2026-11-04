import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  cancelCreditMemo,
  listCreditMemos,
  postCreditMemo,
  type CreditMemoRow,
  type CreditableInvoice,
} from "@/lib/credit-memo.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/procurement";
import { PaginationBar, usePagination } from "@/components/app/ui-states";

type Side = "ar" | "ap";
type Memo = CreditMemoRow;
type Invoice = CreditableInvoice;

const today = () => new Date().toISOString().slice(0, 10);

export function CreditMemoView({ side, workspaceId }: { side: Side; workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const money = (v: number) => formatMoney(v, lang);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Memo | null>(null);
  const [cancel, setCancel] = useState<Memo | null>(null);

  const data = useQuery({
    queryKey: ["credit-memos", workspaceId, side],
    queryFn: () => listCreditMemos({ data: { workspaceId, side } }),
  });
  const memos = { data: data.data?.memos, isLoading: data.isLoading };
  const invoices = { data: data.data?.invoices };

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (memos.data ?? []).filter(
      (m) =>
        !s ||
        [m.memo_no, m.invoice_no, m.partner_name, m.reason].some((v) =>
          (v ?? "").toLowerCase().includes(s),
        ),
    );
  }, [memos.data, q]);
  const p = usePagination(rows);
  const refresh = () => {
    for (const k of ["credit-memos", "acc", "acc-ledger", "rpt-financial"])
      qc.invalidateQueries({ queryKey: [k] });
  };

  const title =
    side === "ar"
      ? t("AR Credit Memo", "Nota Kredit Piutang")
      : t("AP Credit Memo", "Nota Kredit Hutang");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            {side === "ar"
              ? t(
                  "Reduce a customer invoice without returning goods (discount, price correction).",
                  "Kurangi tagihan pelanggan tanpa retur barang (potongan, koreksi harga).",
                )
              : t(
                  "Reduce a supplier invoice without returning goods (discount, price correction).",
                  "Kurangi tagihan pemasok tanpa retur barang (potongan, koreksi harga).",
                )}
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus /> {t("New credit memo", "Nota kredit baru")}
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="relative mb-3 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("Search…", "Cari…")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">No</TableHead>
                <TableHead>{t("Number", "Nomor")}</TableHead>
                <TableHead>{t("Date", "Tanggal")}</TableHead>
                <TableHead>{t("Invoice", "Faktur")}</TableHead>
                <TableHead>
                  {side === "ar" ? t("Customer", "Pelanggan") : t("Supplier", "Pemasok")}
                </TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">{t("Action", "Aksi")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {memos.isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    <Loader2 className="mx-auto animate-spin" />
                  </TableCell>
                </TableRow>
              )}
              {!memos.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    {t("No credit memos yet.", "Belum ada nota kredit.")}
                  </TableCell>
                </TableRow>
              )}
              {p.items.map((m, i) => (
                <TableRow key={m.id}>
                  <TableCell>{p.start + i + 1}</TableCell>
                  <TableCell className="font-medium">{m.memo_no}</TableCell>
                  <TableCell>{m.memo_date}</TableCell>
                  <TableCell>{m.invoice_no}</TableCell>
                  <TableCell>{m.partner_name ?? "—"}</TableCell>
                  <TableCell className="text-right">{money(Number(m.total))}</TableCell>
                  <TableCell>
                    <Badge variant={m.status === "posted" ? "default" : "secondary"}>
                      {m.status === "posted"
                        ? t("Posted", "Diposting")
                        : t("Cancelled", "Dibatalkan")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("View", "Lihat")}
                      onClick={() => setView(m)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {m.status === "posted" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t("Cancel", "Batalkan")}
                        onClick={() => setCancel(m)}
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <PaginationBar p={p as never} />
      </div>

      {open && (
        <CreateDialog
          side={side}
          workspaceId={workspaceId}
          invoices={invoices.data ?? []}
          memos={memos.data ?? []}
          onClose={() => setOpen(false)}
          onDone={refresh}
        />
      )}
      {cancel && (
        <CancelDialog
          memo={cancel}
          workspaceId={workspaceId}
          onClose={() => setCancel(null)}
          onDone={refresh}
        />
      )}
      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{view?.memo_no}</DialogTitle>
          </DialogHeader>
          {view && (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">{t("Invoice", "Faktur")}</dt>
              <dd>{view.invoice_no}</dd>
              <dt className="text-muted-foreground">{t("Reason", "Alasan")}</dt>
              <dd>{view.reason}</dd>
              <dt className="text-muted-foreground">DPP</dt>
              <dd>{money(Number(view.net))}</dd>
              <dt className="text-muted-foreground">{t("VAT", "PPN")}</dt>
              <dd>{money(Number(view.vat))}</dd>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="font-semibold">{money(Number(view.total))}</dd>
              <dt className="text-muted-foreground">{t("Journal", "Jurnal")}</dt>
              <dd>
                {side === "ar"
                  ? t(
                      "Dr Sales returns & VAT out / Cr AR",
                      "D Retur penjualan & PPN keluaran / K Piutang",
                    )
                  : t(
                      "Dr AP / Cr Purchase adjustment & VAT in",
                      "D Hutang / K Selisih pembelian & PPN masukan",
                    )}
              </dd>
              {view.cancellation_reason && (
                <>
                  <dt className="text-muted-foreground">{t("Cancel reason", "Alasan batal")}</dt>
                  <dd>{view.cancellation_reason}</dd>
                </>
              )}
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateDialog({
  side,
  workspaceId,
  invoices,
  memos,
  onClose,
  onDone,
}: {
  side: Side;
  workspaceId: string;
  invoices: Invoice[];
  memos: Memo[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const [key] = useState(() => crypto.randomUUID());
  const [invoiceId, setInvoiceId] = useState("");
  const [memoNo, setMemoNo] = useState(
    `${side === "ar" ? "CN" : "DN"}-${Date.now().toString().slice(-6)}`,
  );
  const [date, setDate] = useState(today());
  const [net, setNet] = useState("");
  const [vat, setVat] = useState("0");
  const [reason, setReason] = useState("");
  const inv = invoices.find((i) => i.id === invoiceId);
  const used = memos
    .filter((m) => m.invoice_id === invoiceId && m.status === "posted")
    .reduce((s, m) => s + Number(m.total), 0);
  const remaining = inv ? inv.amount - used : 0;

  const save = useMutation({
    mutationFn: async () => {
      await postCreditMemo({
        data: {
          workspaceId,
          side,
          invoiceId,
          memoNo,
          date,
          net: Number(net),
          vat: Number(vat || 0),
          reason,
          key,
        },
      });
    },
    onSuccess: () => {
      toast.success(t("Credit memo posted.", "Nota kredit diposting."));
      onDone();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("New credit memo", "Nota kredit baru")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>{t("Invoice", "Faktur")}</Label>
            <Select value={invoiceId} onValueChange={setInvoiceId}>
              <SelectTrigger>
                <SelectValue placeholder={t("Choose invoice", "Pilih faktur")} />
              </SelectTrigger>
              <SelectContent>
                {invoices.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.doc_number} — {i.partner ?? ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {inv && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Remaining creditable", "Sisa yang bisa dikreditkan")}:{" "}
                {formatMoney(remaining, lang)}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("Number", "Nomor")}</Label>
              <Input value={memoNo} onChange={(e) => setMemoNo(e.target.value)} />
            </div>
            <div>
              <Label>{t("Date", "Tanggal")}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>DPP</Label>
              <Input type="number" min={0} value={net} onChange={(e) => setNet(e.target.value)} />
            </div>
            <div>
              <Label>{t("VAT", "PPN")}</Label>
              <Input type="number" min={0} value={vat} onChange={(e) => setVat(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>{t("Reason", "Alasan")}</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("Close", "Tutup")}
          </Button>
          <Button
            disabled={save.isPending || !invoiceId || !(Number(net) > 0) || !reason.trim()}
            onClick={() => save.mutate()}
          >
            {save.isPending && <Loader2 className="animate-spin" />}
            {t("Post", "Posting")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  memo,
  workspaceId,
  onClose,
  onDone,
}: {
  memo: Memo;
  workspaceId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const run = useMutation({
    mutationFn: async () => {
      await cancelCreditMemo({ data: { workspaceId, id: memo.id, date, reason } });
    },
    onSuccess: () => {
      toast.success(t("Credit memo cancelled.", "Nota kredit dibatalkan."));
      onDone();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("Cancel", "Batalkan")} {memo.memo_no}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>{t("Cancellation date", "Tanggal batal")}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>{t("Reason", "Alasan")}</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("Close", "Tutup")}
          </Button>
          <Button
            variant="destructive"
            disabled={run.isPending || !reason.trim()}
            onClick={() => run.mutate()}
          >
            {run.isPending && <Loader2 className="animate-spin" />}
            {t("Cancel memo", "Batalkan nota")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
