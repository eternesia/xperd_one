import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileInput,
  Loader2,
  Plus,
  Printer,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ItemPicker } from "@/components/app/ItemPicker";
import { CashBankPicker, PartyPicker, WarehousePicker } from "@/components/app/Pickers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteWorkspaceRow, listWorkspaceRows, saveWorkspaceRow, upsertWorkspaceRows } from "@/lib/data.functions";
import { useI18n } from "@/lib/i18n";
import {
  postArInvoiceJournal,
  postDeliveryJournal,
  assertFundsMapping,
  postReceiptJournal,
  postSalesReturnJournal,
} from "@/lib/journal";
import { postSalesMovements } from "@/lib/inventory";
import { cn } from "@/lib/utils";
import { useLineTaxOptions } from "@/lib/tax";
import {
  computeLine,
  formatMoney,
  nextDocNumber,
  remainingQty,
  STATUS_LABEL,
  STATUS_TONE,
  type PrcStatus,
} from "@/lib/procurement";
import type { SlsDoc, SlsEntity, SlsLine } from "@/lib/sales";

const PAGE_SIZES = [10, 25, 50, 100];

interface DraftLine {
  item_code: string;
  description: string;
  qty: string;
  uom_code: string;
  unit_price: string;
  discount: string;
  tax_rate: string;
  source_line_id?: string;
  max_qty?: number;
}

const emptyLine = (): DraftLine => ({
  item_code: "",
  description: "",
  qty: "1",
  uom_code: "",
  unit_price: "0",
  discount: "0",
  tax_rate: "0",
});

export function SalesTable({ entity, workspaceId }: { entity: SlsEntity; workspaceId: string }) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const { data: taxOptions = [] } = useLineTaxOptions(workspaceId, lang);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | PrcStatus>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState(false);
  const [isDraft, setIsDraft] = useState(false);
  const [sourceId, setSourceId] = useState<string>("");
  const [sourceLines, setSourceLines] = useState<SlsLine[]>([]);

  const [header, setHeader] = useState({
    doc_number: "",
    doc_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    customer_code: "",
    customer_name: "",
    warehouse_code: "",
    bank_account_code: "",
    bank_account_name: "",
    bank_gl_code: "",
    reference: "",
    notes: "",
  });
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  const queryKey = ["sls", entity.docType, workspaceId, page, pageSize, search, status, from, to];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const start = (page - 1) * pageSize;
      const data = await listWorkspaceRows({
        data: {
          table: "sls_documents",
          workspaceId,
          search: search.trim() || undefined,
          filters: {
            doc_type: entity.docType,
            ...(status !== "all" ? { status } : {}),
          },
          ranges: { doc_date: { gte: from || undefined, lte: to || undefined } },
          orderBy: "doc_date",
          orderDir: "desc",
          limit: pageSize,
          offset: start,
        },
      });
      return { rows: (data?.rows ?? []) as unknown as SlsDoc[], count: data?.count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /** open upstream documents that can still be pulled from */
  const { data: sourceDocs = [] } = useQuery({
    queryKey: ["sls-source", entity.source?.docType, workspaceId],
    enabled: open && Boolean(entity.source),
    queryFn: async () => {
      const src = entity.source!;
      const data = await listWorkspaceRows({
        data: {
          table: "sls_documents",
          workspaceId,
          filters: { doc_type: src.docType },
          inFilters: { status: src.fromStatuses },
          orderBy: "doc_date",
          orderDir: "desc",
          limit: 50,
        },
      });
      return (data?.rows ?? []) as unknown as SlsDoc[];
    },
  });

  const pullSource = async (id: string) => {
    const doc = sourceDocs.find((d) => d.id === id);
    if (!doc) return;
    const srcLinesData = await listWorkspaceRows({
      data: { table: "sls_document_lines", workspaceId, filters: { document_id: id }, orderBy: "line_no", orderDir: "asc", limit: 500 },
    });
    const srcLines = (srcLinesData?.rows ?? []) as unknown as SlsLine[];
    const list = (srcLines ?? []) as unknown as SlsLine[];
    const openLines = list.filter((l) => remainingQty(l) > 0.0001);
    if (!openLines.length) {
      toast.error(t("Nothing left to pull from this document.", "Tidak ada sisa yang bisa ditarik."));
      return;
    }
    setSourceId(id);
    setSourceLines(list);
    setHeader((h) => ({
      ...h,
      customer_code: doc.customer_code ?? "",
      customer_name: doc.customer_name ?? "",
      warehouse_code: doc.warehouse_code ?? h.warehouse_code,
      reference: doc.doc_number,
    }));
    setLines(
      openLines.map((l) => ({
        item_code: l.item_code ?? "",
        description: l.description ?? "",
        qty: String(remainingQty(l)),
        uom_code: l.uom_code ?? "",
        unit_price: String(l.unit_price ?? 0),
        discount: String(l.discount ?? 0),
        tax_rate: String(l.tax_rate ?? 0),
        source_line_id: l.id,
        max_qty: remainingQty(l),
      })),
    );
    toast.success(t(`Pulled from ${doc.doc_number}`, `Ditarik dari ${doc.doc_number}`));
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    let tax = 0;
    lines.forEach((l) => {
      const c = computeLine({
        qty: Number(l.qty) || 0,
        unit_price: Number(l.unit_price) || 0,
        discount: Number(l.discount) || 0,
        tax_rate: Number(l.tax_rate) || 0,
      });
      subtotal += c.gross;
      discount += Number(l.discount) || 0;
      tax += c.tax;
    });
    return { subtotal, discount, tax, total: subtotal - discount + tax };
  }, [lines]);

  const resetForm = () => {
    setLines([emptyLine()]);
    setSourceId("");
    setSourceLines([]);
    setIsDraft(false);
    setHeader({
      doc_number: "",
      doc_date: new Date().toISOString().slice(0, 10),
      due_date: "",
      customer_code: "",
      customer_name: "",
      warehouse_code: "",
      bank_account_code: "",
      bank_account_name: "",
      bank_gl_code: "",
      reference: "",
      notes: "",
    });
  };

  const create = useMutation({
    mutationFn: async () => {
      const docStatus: PrcStatus = isDraft ? "draft" : entity.openStatus;
      const sourceDoc = sourceDocs.find((d) => d.id === sourceId) ?? null;
      const doc_number = header.doc_number.trim() || nextDocNumber(entity.prefix, total + 1);

      // validate the settlement account mapping before anything is written
      let funds: { account_code: string; account_name: string } | null = null;
      if (!isDraft && entity.docType === "sales_receipt") {
        funds = await assertFundsMapping(
          workspaceId,
          { account_code: header.bank_gl_code || null, account_name: header.bank_account_name || null },
          totals.total,
        );
      }

      const created = await saveWorkspaceRow({
        data: {
          table: "sls_documents",
          workspaceId,
          data: {
            doc_type: entity.docType,
            doc_number,
            doc_date: header.doc_date,
            due_date: entity.showDueDate && header.due_date ? header.due_date : null,
            customer_code: header.customer_code || null,
            customer_name: header.customer_name || null,
            warehouse_code: entity.showWarehouse ? header.warehouse_code || null : null,
            bank_account_code: entity.showBank ? header.bank_account_code || null : null,
            bank_account_name: entity.showBank ? header.bank_account_name || null : null,
            reference: header.reference || null,
            status: docStatus,
            subtotal: totals.subtotal,
            discount_amount: totals.discount,
            tax_amount: totals.tax,
            total: totals.total,
            notes: header.notes || null,
            source_document_id: sourceDoc?.id ?? null,
            source_doc_number: sourceDoc?.doc_number ?? null,
          },
        },
      });
      const docId = created.id;

      const usable = lines.filter((l) => l.item_code || l.description);
      const payload = usable.map((l, i) => {
        const c = computeLine({
          qty: Number(l.qty) || 0,
          unit_price: Number(l.unit_price) || 0,
          discount: Number(l.discount) || 0,
          tax_rate: Number(l.tax_rate) || 0,
        });
        return {
          document_id: docId,
          workspace_id: workspaceId,
          line_no: i + 1,
          item_code: l.item_code || null,
          description: l.description || null,
          qty: Number(l.qty) || 0,
          uom_code: l.uom_code || null,
          unit_price: Number(l.unit_price) || 0,
          discount: Number(l.discount) || 0,
          tax_rate: Number(l.tax_rate) || 0,
          line_total: c.net + c.tax,
          source_line_id: l.source_line_id ?? null,
        };
      });
      if (payload.length) {
        await upsertWorkspaceRows({ data: { table: "sls_document_lines", workspaceId, rows: payload } });
      }

      // consume the source document (supports partial fulfilment)
      if (sourceDoc && !isDraft) {
        const consumed = new Map<string, number>();
        usable.forEach((l) => {
          if (!l.source_line_id) return;
          consumed.set(l.source_line_id, (consumed.get(l.source_line_id) ?? 0) + (Number(l.qty) || 0));
        });
        const nextLines = sourceLines.map((sl) => ({
          ...sl,
          qty_fulfilled: Number(sl.qty_fulfilled ?? 0) + (consumed.get(sl.id) ?? 0),
        }));
        for (const sl of nextLines) {
          if (!consumed.has(sl.id)) continue;
          await saveWorkspaceRow({
            data: {
              table: "sls_document_lines",
              workspaceId,
              id: sl.id,
              data: { qty_fulfilled: Math.min(Number(sl.qty), sl.qty_fulfilled ?? 0) },
            },
          });
        }
        const stillOpen = nextLines.some((l) => Number(l.qty) - Number(l.qty_fulfilled ?? 0) > 0.0001);
        await saveWorkspaceRow({
          data: {
            table: "sls_documents",
            workspaceId,
            id: sourceDoc.id,
            data: { status: (stillOpen ? "partial" : "closed") as PrcStatus },
          },
        });
      }

      // automatic journal entry
      if (entity.autoJournal && !isDraft) {
        const journalDoc = {
          id: docId,
          doc_number,
          doc_date: header.doc_date,
          doc_type: entity.docType,
          customer_name: header.customer_name || null,
          subtotal: totals.subtotal,
          discount_amount: totals.discount,
          tax_amount: totals.tax,
          total: totals.total,
        };
        const journalLines = usable.map((l) => ({
          item_code: l.item_code || null,
          qty: Number(l.qty) || 0,
        }));
        if (entity.docType === "delivery_order") await postDeliveryJournal(workspaceId, journalDoc, journalLines);
        if (entity.docType === "ar_invoice") await postArInvoiceJournal(workspaceId, journalDoc);
        if (entity.docType === "sales_receipt")
          await postReceiptJournal(workspaceId, journalDoc, funds ?? undefined);
        if (entity.docType === "sales_return") await postSalesReturnJournal(workspaceId, journalDoc, journalLines);
      }

      // stock movements (delivery removes stock, sales return adds it back)
      if (!isDraft && (entity.docType === "delivery_order" || entity.docType === "sales_return")) {
        await postSalesMovements(
          workspaceId,
          {
            id: docId,
            doc_number,
            doc_date: header.doc_date,
            doc_type: entity.docType,
            warehouse_code: header.warehouse_code || null,
            customer_name: header.customer_name || null,
          },
          usable.map((l) => ({
            item_code: l.item_code || null,
            description: l.description || null,
            uom_code: l.uom_code || null,
            qty: Number(l.qty) || 0,
            unit_price: Number(l.unit_price) || 0,
          })),
        );
      }
    },
    onSuccess: () => {
      toast.success(
        isDraft ? t("Saved as draft", "Disimpan sebagai draf") : t("Document submitted", "Dokumen terkirim"),
      );
      setOpen(false);
      resetForm();
      void qc.invalidateQueries({ queryKey: ["sls"] });
      void qc.invalidateQueries({ queryKey: ["sls-dashboard"] });
      void qc.invalidateQueries({ queryKey: ["inv-movements"] });
      void qc.invalidateQueries({ queryKey: ["inv-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (doc: SlsDoc) => {
      // #10 (BS New): hanya draft yang boleh dihapus — dijaga lagi di server.
      if (doc.status !== "draft") {
        throw new Error(t("Only draft documents can be deleted.", "Hanya dokumen berstatus Draf yang dapat dihapus."));
      }
      await deleteWorkspaceRow({
        data: { table: "sls_documents", workspaceId, id: doc.id, requireStatus: "draft" },
      });
    },
    onSuccess: () => {
      toast.success(t("Deleted", "Terhapus"));
      void qc.invalidateQueries({ queryKey: ["sls"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasFilter = Boolean(search || from || to || status !== "all");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-gold">{t("SALES & POS", "PENJUALAN & POS")}</p>
          <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">
            {lang === "id" ? entity.id_ : entity.en}
          </h1>
          <p className="text-sm text-muted-foreground">
            {total} {t("documents", "dokumen")}
          </p>
        </div>
        <Button variant="navy" onClick={() => setOpen(true)}>
          <Plus /> {t("Create New", "Buat Baru")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-60 pl-9"
            placeholder={t("Search number or customer…", "Cari nomor atau pelanggan…")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as "all" | PrcStatus);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All statuses", "Semua status")}</SelectItem>
            {entity.statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {lang === "id" ? STATUS_LABEL[s].id_ : STATUS_LABEL[s].en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("From", "Dari")}</span>
          <Input
            type="date"
            className="w-40"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("To", "Sampai")}</span>
          <Input
            type="date"
            className="w-40"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {hasFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setStatus("all");
              setFrom("");
              setTo("");
              setPage(1);
            }}
          >
            <X className="h-4 w-4" /> {t("Reset", "Atur ulang")}
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14 text-center">#</TableHead>
              <TableHead>{t("Number", "Nomor")}</TableHead>
              <TableHead>{t("Date", "Tanggal")}</TableHead>
              <TableHead>{t("Customer", "Pelanggan")}</TableHead>
              <TableHead>{t("Source", "Sumber")}</TableHead>
              <TableHead>{t("Status", "Status")}</TableHead>
              {entity.docType !== "delivery_order" && (
                <TableHead className="text-right">{t("Total", "Total")}</TableHead>
              )}
              <TableHead className="text-right">{t("Actions", "Aksi")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={entity.docType === "delivery_order" ? 7 : 8} className="py-8 text-sm text-muted-foreground">
                  {t("Loading…", "Memuat…")}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={entity.docType === "delivery_order" ? 7 : 8} className="py-10 text-center text-sm text-muted-foreground">
                  {t("No documents match your filters.", "Tidak ada dokumen sesuai filter.")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((row, i) => (
              <TableRow key={row.id}>
                <TableCell className="text-center text-xs text-muted-foreground">
                  {(page - 1) * pageSize + i + 1}
                </TableCell>
                <TableCell className="font-medium text-navy dark:text-primary-foreground">{row.doc_number}</TableCell>
                <TableCell className="text-sm">{row.doc_date}</TableCell>
                <TableCell className="max-w-[200px] truncate text-sm">
                  {row.customer_name || row.customer_code || "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.source_doc_number || row.reference || "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={cn("border-0", STATUS_TONE[row.status])}>
                    {lang === "id" ? STATUS_LABEL[row.status].id_ : STATUS_LABEL[row.status].en}
                  </Badge>
                </TableCell>
                {entity.docType !== "delivery_order" && (
                  <TableCell className="text-right text-sm font-medium">
                    {formatMoney(row.total, lang, row.currency)}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="icon" aria-label={t("Preview", "Pratinjau")}>
                    <Link
                      to="/app/w/$workspaceId/$moduleId/$submoduleId/$docId"
                      params={{
                        workspaceId,
                        moduleId: "sales",
                        submoduleId: entity.submoduleId,
                        docId: row.id,
                      }}
                      search={{ print: undefined }}
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="icon" aria-label={t("Print", "Cetak")}>
                    <Link
                      to="/app/w/$workspaceId/$moduleId/$submoduleId/$docId"
                      params={{
                        workspaceId,
                        moduleId: "sales",
                        submoduleId: entity.submoduleId,
                        docId: row.id,
                      }}
                      search={{ print: 1 }}
                    >
                      <Printer className="h-4 w-4" />
                    </Link>
                  </Button>
                  {row.status === "draft" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("Delete", "Hapus")}
                      onClick={() => {
                        if (confirm(t(`Delete ${row.doc_number}?`, `Hapus ${row.doc_number}?`))) remove.mutate(row);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{t("Rows per page", "Baris per halaman")}</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {t("Page", "Halaman")} {page} / {totalPages}
          </span>
          <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetForm();
        }}
      >
        <DialogContent className="max-h-[94vh] w-[96vw] max-w-7xl overflow-x-hidden overflow-y-auto sm:max-w-7xl">
          <DialogHeader>
            <DialogTitle>
              {t("Create New", "Buat Baru")} · {lang === "id" ? entity.id_ : entity.en}
            </DialogTitle>
            <DialogDescription>
              {t(
                "Leave the number empty to auto-generate it. The status is set automatically.",
                "Kosongkan nomor untuk dibuat otomatis. Status diatur otomatis.",
              )}
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              const over = lines.find((l) => l.max_qty !== undefined && Number(l.qty) > l.max_qty + 0.0001);
              if (over) {
                toast.error(
                  t(
                    `Quantity for ${over.item_code || over.description} exceeds the open quantity (${over.max_qty}).`,
                    `Qty untuk ${over.item_code || over.description} melebihi sisa (${over.max_qty}).`,
                  ),
                );
                return;
              }
              create.mutate();
            }}
          >
            {entity.source && (
              <div className="rounded-xl border border-dashed border-gold/60 bg-gold/5 p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[16rem] flex-1 space-y-2">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t(`Create from ${entity.source.en}`, `Ambil dari ${entity.source.id_}`)}
                    </Label>
                    <Select value={sourceId} onValueChange={(v) => void pullSource(v)}>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t("Select an open document…", "Pilih dokumen terbuka…")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {sourceDocs.length === 0 && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            {t("No open documents.", "Tidak ada dokumen terbuka.")}
                          </div>
                        )}
                        {sourceDocs.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.doc_number} · {d.customer_name || d.customer_code || "—"}
                            {entity.docType !== "delivery_order" && ` · ${formatMoney(d.total, lang, d.currency)}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {sourceId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSourceId("");
                        setSourceLines([]);
                        setLines([emptyLine()]);
                      }}
                    >
                      <X className="h-4 w-4" /> {t("Clear", "Bersihkan")}
                    </Button>
                  )}
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <FileInput className="h-3.5 w-3.5" />
                    {t(
                      "Partial quantities are allowed — the source stays open until fully fulfilled.",
                      "Qty sebagian diperbolehkan — dokumen sumber tetap terbuka sampai terpenuhi.",
                    )}
                  </p>
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("Number", "Nomor")}>
                <Input
                  value={header.doc_number}
                  placeholder={nextDocNumber(entity.prefix, total + 1)}
                  onChange={(e) => setHeader({ ...header, doc_number: e.target.value })}
                />
              </Field>
              <Field label={t("Date", "Tanggal")}>
                <Input
                  type="date"
                  required
                  value={header.doc_date}
                  onChange={(e) => setHeader({ ...header, doc_date: e.target.value })}
                />
              </Field>
              {entity.showDueDate && (
                <Field label={t("Due date", "Jatuh tempo")}>
                  <Input
                    type="date"
                    value={header.due_date}
                    onChange={(e) => setHeader({ ...header, due_date: e.target.value })}
                  />
                </Field>
              )}
              <Field label={t("Customer", "Pelanggan")}>
                <PartyPicker
                  workspaceId={workspaceId}
                  kind="customer"
                  value={header.customer_code}
                  onPick={(p) => setHeader({ ...header, customer_code: p.code, customer_name: p.name })}
                />
              </Field>
              {entity.showWarehouse && (
                <Field label={t("Warehouse", "Gudang")}>
                  <WarehousePicker
                    workspaceId={workspaceId}
                    value={header.warehouse_code}
                    onPick={(w) => setHeader({ ...header, warehouse_code: w.code })}
                  />
                </Field>
              )}
              {entity.showBank && (
                <Field
                  label={
                    entity.docType === "sales_receipt"
                      ? t("Deposit to account", "Diterima di rekening")
                      : t("Payment bank account", "Rekening pembayaran")
                  }
                >
                  <CashBankPicker
                    workspaceId={workspaceId}
                    value={header.bank_account_code}
                    onPick={(a) =>
                      setHeader({
                        ...header,
                        bank_account_code: a.code,
                        bank_account_name: [a.name, a.bank_name, a.account_number].filter(Boolean).join(" · "),
                        bank_gl_code: a.gl_account_code ?? "",
                      })
                    }
                  />
                </Field>
              )}
              <Field label={t("Reference", "Referensi")}>
                <Input
                  value={header.reference}
                  onChange={(e) => setHeader({ ...header, reference: e.target.value })}
                />
              </Field>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-navy dark:text-primary-foreground">{t("Lines", "Rincian")}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, emptyLine()])}>
                  <Plus className="h-4 w-4" /> {t("Add line", "Tambah baris")}
                </Button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left">{t("Item", "Item")}</th>
                      <th className="p-2 text-left">{t("Description", "Deskripsi")}</th>
                      <th className="p-2 text-left">{t("Qty", "Qty")}</th>
                      <th className="p-2 text-left">{t("UoM", "Satuan")}</th>
                      {entity.docType !== "delivery_order" && <th className="p-2 text-left">{t("Price", "Harga")}</th>}
                      {entity.docType !== "delivery_order" && <th className="p-2 text-left">{t("Disc.", "Diskon")}</th>}
                      {entity.docType !== "delivery_order" && <th className="p-2 text-left">{t("Tax %", "Pajak %")}</th>}
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, idx) => {
                      const patch = (p: Partial<DraftLine>) => {
                        const next = [...lines];
                        next[idx] = { ...next[idx], ...p };
                        setLines(next);
                      };
                      return (
                        <tr key={idx} className="border-t border-border align-top">
                          <td className="min-w-[14rem] p-1">
                            <ItemPicker
                              workspaceId={workspaceId}
                              value={l.item_code}
                              onPick={(item) =>
                                patch({
                                  item_code: item.code,
                                  description: item.name,
                                  uom_code: item.uom_code ?? "",
                                  unit_price:
                                    Number(l.unit_price) > 0 ? l.unit_price : String(item.sell_price ?? item.cost_price ?? 0),
                                })
                              }
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              className="h-9 min-w-[10rem]"
                              value={l.description}
                              onChange={(e) => patch({ description: e.target.value })}
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              type="number"
                              step="any"
                              className="h-9 w-24"
                              value={l.qty}
                              onChange={(e) => patch({ qty: e.target.value })}
                            />
                            {l.max_qty !== undefined && (
                              <span className="mt-1 block text-[11px] text-muted-foreground">
                                {t("open", "sisa")}: {l.max_qty}
                              </span>
                            )}
                          </td>
                          <td className="p-1">
                            <Input
                              className="h-9 w-20"
                              value={l.uom_code}
                              onChange={(e) => patch({ uom_code: e.target.value })}
                            />
                          </td>
                          {entity.docType !== "delivery_order" && <td className="p-1">
                            <Input
                              type="number"
                              step="any"
                              className="h-9 w-28"
                              value={l.unit_price}
                              onChange={(e) => patch({ unit_price: e.target.value })}
                            />
                          </td>}
                          {entity.docType !== "delivery_order" && <td className="p-1">
                            <Input
                              type="number"
                              step="any"
                              className="h-9 w-24"
                              value={l.discount}
                              onChange={(e) => patch({ discount: e.target.value })}
                            />
                          </td>}
                          {entity.docType !== "delivery_order" && <td className="p-1">
                            <Select value={String(Number(l.tax_rate) || 0)} onValueChange={(v) => patch({ tax_rate: v })}>
                              <SelectTrigger className="h-9 w-36">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {taxOptions.map((r) => (
                                  <SelectItem key={r.value} value={String(r.value)}>
                                    {r.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>}
                          <td className="p-1 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {entity.docType !== "delivery_order" && <div className="flex justify-end gap-6 text-sm">
                <span className="text-muted-foreground">
                  {t("Subtotal", "Subtotal")}: {formatMoney(totals.subtotal, lang)}
                </span>
                <span className="text-muted-foreground">
                  {t("Tax", "Pajak")}: {formatMoney(totals.tax, lang)}
                </span>
                <span className="font-semibold text-navy dark:text-primary-foreground">
                  {t("Total", "Total")}: {formatMoney(totals.total, lang)}
                </span>
              </div>}
            </div>

            <Field label={t("Notes", "Catatan")}>
              <Textarea
                rows={3}
                value={header.notes}
                onChange={(e) => setHeader({ ...header, notes: e.target.value })}
              />
            </Field>

            <label className="flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-3">
              <Checkbox checked={isDraft} onCheckedChange={(v) => setIsDraft(v === true)} className="mt-0.5" />
              <span className="text-sm">
                <span className="font-medium text-navy dark:text-primary-foreground">
                  {t("Save as draft", "Simpan sebagai draf")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t(
                    `Unchecked, the document is submitted immediately as “${STATUS_LABEL[entity.openStatus].en}”${entity.autoJournal ? " and the journal entry is posted automatically" : ""}.`,
                    `Jika tidak dicentang, dokumen langsung terkirim dengan status “${STATUS_LABEL[entity.openStatus].id_}”${entity.autoJournal ? " dan jurnal otomatis dibuat" : ""}.`,
                  )}
                </span>
              </span>
            </label>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("Cancel", "Batal")}
              </Button>
              <Button type="submit" variant="gold" disabled={create.isPending}>
                {create.isPending && <Loader2 className="animate-spin" />}
                {isDraft ? t("Save draft", "Simpan draf") : t("Submit", "Kirim")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
