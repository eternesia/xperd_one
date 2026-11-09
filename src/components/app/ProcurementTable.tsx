import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileInput,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Ban,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ItemSearchAdd } from "@/components/app/ItemSearchAdd";
import { LineImportButton } from "@/components/app/LineImportButton";
// Ronde 29 (BS New 8): mata uang dokumen + kurs.
import { CurrencyFields } from "@/components/app/CurrencyFields";
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
import { useNewDocTrigger } from "@/lib/new-doc-event";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCardLabels } from "@/lib/card-labels";
import { deleteWorkspaceRow, listWorkspaceRows, replaceChildRows, saveWorkspaceRow, sumDocumentTotalsBySource, upsertWorkspaceRows } from "@/lib/data.functions";
import { useI18n } from "@/lib/i18n";
import { erpSaveDocument } from "@/lib/erp-document.functions";
import { CancelDocumentDialog } from "@/components/app/CancelDocumentDialog";
import { cn } from "@/lib/utils";
import { isWithholdingTax, useLineTaxOptions } from "@/lib/tax";
import {
  computeLine,
  formatMoney,
  nextDocNumber,
  remainingQty,
  STATUS_LABEL,
  STATUS_TONE,
  type PrcDoc,
  type PrcEntity,
  type PrcLine,
  type PrcStatus,
  isAmountSettlement,
} from "@/lib/procurement";

const PAGE_SIZES = [10, 25, 50, 100];

interface DraftLine {
  item_code: string;
  description: string;
  qty: string;
  uom_code: string;
  unit_price: string;
  discount: string;
  tax_rate: string;
  /** #36: kode master `md_taxes`. `tax_rate` ikut terisi agar perhitungan tetap sama. */
  tax_code: string;
  source_line_id?: string;
  max_qty?: number;
  /** Diskon nominal per unit dari dokumen sumber; dipakai memprorata diskon saat qty diubah (retur/penagihan parsial). */
  disc_per_unit?: number;
}

const emptyLine = (): DraftLine => ({
  item_code: "",
  description: "",
  qty: "1",
  uom_code: "",
  unit_price: "0",
  discount: "0",
  tax_rate: "0",
  tax_code: "",
});

export function ProcurementTable({ entity, workspaceId }: { entity: PrcEntity; workspaceId: string }) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const { data: taxOptions = [] } = useLineTaxOptions(workspaceId, lang);
  const taxByCode = useMemo(() => new Map(taxOptions.map((o) => [o.code, o])), [taxOptions]);
  const { data: itemRows = [] } = useQuery({
    queryKey: ["line-items", workspaceId],
    staleTime: 60_000,
    queryFn: async () => {
      const res = await listWorkspaceRows({
        data: { table: "md_items", workspaceId, orderBy: "code", orderDir: "asc", limit: 5000, filters: { is_active: 1 } },
      });
      return (res?.rows ?? []) as unknown as { code: string; name: string; uom_code: string | null; cost_price: number | null; sell_price: number | null }[];
    },
  });
  const itemByCode = useMemo(() => new Map(itemRows.map((r) => [r.code, r])), [itemRows]);
  const itemOptions = useMemo(() => itemRows.map((r) => ({ id: r.code, code: r.code, name: r.name, hint: r.uom_code })), [itemRows]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | PrcStatus>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState(false);
  const [isDraft, setIsDraft] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cancelDoc, setCancelDoc] = useState<PrcDoc | null>(null);
  const [sourceId, setSourceId] = useState<string>("");
  const [sourceLines, setSourceLines] = useState<PrcLine[]>([]);
  const [sourceOpenTotal, setSourceOpenTotal] = useState(0);

  const [header, setHeader] = useState({
    doc_number: "",
    doc_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    supplier_code: "",
    supplier_name: "",
    warehouse_code: "",
    bank_account_code: "",
    bank_account_name: "",
    bank_gl_code: "",
    reference: "",
    notes: "",
    // Ronde 29 (BS New 8): mata uang dokumen + kurs ke mata uang dasar.
    currency: "IDR",
    exchange_rate: 1,
  });
  const [lines, setLines] = useState<DraftLine[]>([]);

  const queryKey = ["prc", entity.docType, workspaceId, page, pageSize, search, status, from, to];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const start = (page - 1) * pageSize;
      const data = await listWorkspaceRows({
        data: {
          table: "prc_documents",
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
      return { rows: (data?.rows ?? []) as unknown as PrcDoc[], count: data?.count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /** open upstream documents that can still be pulled from */
  const { data: sourceDocs = [] } = useQuery({
    queryKey: ["prc-source", entity.source?.docType, workspaceId],
    enabled: open && Boolean(entity.source),
    queryFn: async () => {
      const src = entity.source!;
      const data = await listWorkspaceRows({
        data: {
          table: "prc_documents",
          workspaceId,
          filters: { doc_type: src.docType },
          inFilters: { status: src.fromStatuses },
          orderBy: "doc_date",
          orderDir: "desc",
          limit: 50,
        },
      });
      const list = (data?.rows ?? []) as unknown as PrcDoc[];
      if (!isAmountSettlement(entity.docType) || !list.length) return list;
      // #7 (BS New): dokumen penyelesaian hanya menarik sumber yang MASIH punya
      // sisa nilai, supaya sumber yang sudah lunas tidak ditagih dua kali.
      const settled = await sumDocumentTotalsBySource({
        data: { table: "prc_documents", workspaceId, sourceIds: list.map((d) => d.id) },
      });
      const used = new Map<string, number>((settled ?? []).map((r) => [r.source_document_id, r.total]));
      return list.filter((d) => Number(d.total) - (used.get(d.id) ?? 0) > 0.01);
    },
  });

  const pullSource = async (id: string) => {
    const doc = sourceDocs.find((d) => d.id === id);
    if (!doc) return;
    const srcLinesData = await listWorkspaceRows({
      data: { table: "prc_document_lines", workspaceId, filters: { document_id: id }, orderBy: "line_no", orderDir: "asc", limit: 500 },
    });
    const list = (srcLinesData?.rows ?? []) as unknown as PrcLine[];
    // #7 tahap 2b (BS New): dokumen penyelesaian (AP Invoice / Purchase Payment)
    // memakai SISA NILAI dokumen sumber, bukan sisa qty per baris.
    let openTotal = Number(doc.total);
    if (isAmountSettlement(entity.docType)) {
      const settledRows = await sumDocumentTotalsBySource({
        data: { table: "prc_documents", workspaceId, sourceIds: [id] },
      });
      const settled = (settledRows ?? []).reduce((sum, r) => sum + Number(r.total || 0), 0);
      openTotal = Math.max(0, Number(doc.total) - settled);
      if (openTotal <= 0.01) {
        toast.error(t("This document has no remaining balance.", "Dokumen ini tidak memiliki sisa nilai."));
        return;
      }
    }
    const openLines = isAmountSettlement(entity.docType) ? list : list.filter((l) => remainingQty(l) > 0.0001);
    if (!openLines.length) {
      toast.error(t("Nothing left to pull from this document.", "Tidak ada sisa yang bisa ditarik."));
      return;
    }
    setSourceId(id);
    setSourceLines(list);
    setSourceOpenTotal(openTotal);
    setHeader((h) => ({
      ...h,
      supplier_code: doc.supplier_code ?? "",
      supplier_name: doc.supplier_name ?? "",
      warehouse_code: doc.warehouse_code ?? h.warehouse_code,
      reference: doc.doc_number,
    }));
    const openRatio = isAmountSettlement(entity.docType) && Number(doc.total) > 0 ? openTotal / Number(doc.total) : 1;
    setLines(
      openLines.map((l) => ({
        item_code: l.item_code ?? "",
        description: l.description ?? "",
        qty: String(isAmountSettlement(entity.docType) ? Number(l.qty) || 1 : remainingQty(l)),
        uom_code: l.uom_code ?? "",
        unit_price: String(Number(l.unit_price ?? 0) * openRatio),
        discount: String(
          isAmountSettlement(entity.docType)
            ? Number(l.discount ?? 0) * openRatio
            : Math.round(((Number(l.discount ?? 0) * remainingQty(l)) / (Number(l.qty) || 1)) * 100) / 100,
        ),
        tax_rate: String(l.tax_rate ?? 0),
        tax_code: l.tax_code ?? "",
        source_line_id: l.id,
        disc_per_unit: isAmountSettlement(entity.docType) ? undefined : Number(l.discount ?? 0) / (Number(l.qty) || 1),
        max_qty: isAmountSettlement(entity.docType) ? undefined : remainingQty(l),
      })),
    );
    toast.success(t(`Pulled from ${doc.doc_number}`, `Ditarik dari ${doc.doc_number}`));
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    let tax = 0;
    let withholding = 0;
    lines.forEach((l) => {
      const c = computeLine({
        qty: Number(l.qty) || 0,
        unit_price: Number(l.unit_price) || 0,
        discount: Number(l.discount) || 0,
        tax_rate: Number(l.tax_rate) || 0,
      });
      subtotal += c.gross;
      discount += Number(l.discount) || 0;
      // #36: PPh (withholding) dipotong dari tagihan supplier, bukan PPN.
      if (isWithholdingTax(taxByCode.get(l.tax_code))) withholding += c.tax;
      else tax += c.tax;
    });
    return { subtotal, discount, tax, withholding, total: subtotal - discount + tax - withholding };
  }, [lines, taxByCode]);

  const resetForm = () => {
    setLines([]);
    setSourceId("");
    setSourceLines([]);
    setSourceOpenTotal(0);
    setIsDraft(false);
    setEditingId(null);
    setHeader({
      doc_number: "",
      doc_date: new Date().toISOString().slice(0, 10),
      due_date: "",
      supplier_code: "",
      supplier_name: "",
      warehouse_code: "",
      bank_account_code: "",
      bank_account_name: "",
      bank_gl_code: "",
      reference: "",
      notes: "",
      currency: "IDR",
      exchange_rate: 1,
    });
  };

  // Kunci posting: dipertahankan selama satu percobaan simpan agar kirim ulang (klik ganda / jaringan putus) tidak memposting dua kali.
  const postingKey = useRef<string | null>(null);
  useEffect(() => {
    postingKey.current = null;
  }, [open, editingId, sourceId]);
  // Tombol "+" di navigasi bawah HP membuka form dokumen baru.
  useNewDocTrigger(() => {
    resetForm();
    setOpen(true);
  });
  const lineTableRef = useCardLabels();
  const create = useMutation({
    mutationFn: async () => {
      const sourceDoc = sourceDocs.find((d) => d.id === sourceId) ?? null;
      const doc_number = header.doc_number.trim() || nextDocNumber(entity.prefix, total + 1);
      postingKey.current ??= crypto.randomUUID();
      const usable = lines.filter((l) => l.item_code || l.description);
      if (!usable.length) throw new Error(t("Add at least one line.", "Tambahkan minimal satu baris."));
      // Satu transaksi di server: dokumen, baris, saldo sumber, stok, jurnal, kas/bank, uang muka (BS New 16).
      const res = await erpSaveDocument({
        data: {
          workspaceId,
          side: "purchase",
          key: postingKey.current,
          id: editingId,
          draft: isDraft,
          document: {
            doc_type: entity.docType,
            doc_number,
            doc_date: header.doc_date,
            due_date: entity.showDueDate && header.due_date ? header.due_date : null,
            partner_code: header.supplier_code || null,
            partner_name: header.supplier_name || null,
            warehouse_code: entity.showWarehouse ? header.warehouse_code || null : null,
            bank_account_code: entity.showBank ? header.bank_account_code || null : null,
            bank_account_name: entity.showBank ? header.bank_account_name || null : null,
            reference: header.reference || null,
            notes: header.notes || null,
            currency: header.currency || "IDR",
            exchange_rate: Number(header.exchange_rate) || 1,
            source_document_id: sourceDoc?.id ?? null,
          },
          lines: usable.map((l) => ({
            item_code: l.item_code || null,
            description: l.description || null,
            qty: Number(l.qty) || 0,
            uom_code: l.uom_code || null,
            unit_price: Number(l.unit_price) || 0,
            discount: Number(l.discount) || 0,
            tax_rate: Number(l.tax_rate) || 0,
            tax_code: l.tax_code || null,
            source_line_id: l.source_line_id ?? null,
          })),
        },
      });
      if (res.advanceApplied > 0) {
        toast.success(
          t(
            `${formatMoney(res.advanceApplied, lang)} down payment applied to ${doc_number}`,
            `Uang muka ${formatMoney(res.advanceApplied, lang)} dipotongkan ke ${doc_number}`,
          ),
        );
      }
    },
    onSuccess: () => {
      postingKey.current = null;
      toast.success(
        isDraft
          ? t(editingId ? "Draft updated" : "Saved as draft", editingId ? "Draf diperbarui" : "Disimpan sebagai draf")
          : t("Document submitted", "Dokumen terkirim"),
      );
      setOpen(false);
      resetForm();
      void qc.invalidateQueries({ queryKey: ["prc"] });
      void qc.invalidateQueries({ queryKey: ["prc-dashboard"] });
      void qc.invalidateQueries({ queryKey: ["inv-movements"] });
      void qc.invalidateQueries({ queryKey: ["inv-dashboard"] });
      // settlement kas/bank (pembayaran) turut menyegarkan buku kas
      void qc.invalidateQueries({ queryKey: ["cb-trx"] });
      void qc.invalidateQueries({ queryKey: ["cb-accounts"] });
      void qc.invalidateQueries({ queryKey: ["cb-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** #9 (BS New): muat draft yang ada kembali ke form untuk diedit. */
  const editDraft = async (doc: PrcDoc) => {
    try {
      const linesData = await listWorkspaceRows({
        data: {
          table: "prc_document_lines",
          workspaceId,
          filters: { document_id: doc.id },
          orderBy: "line_no",
          orderDir: "asc",
          limit: 500,
        },
      });
      const draftLines = (linesData?.rows ?? []) as unknown as PrcLine[];
      // PrcDoc tidak membawa kolom bank, jadi ambil baris mentahnya sekali lagi
      // supaya draft pembayaran bisa diedit tanpa kehilangan rekening.
      const rawData = await listWorkspaceRows({
        data: {
          table: "prc_documents",
          workspaceId,
          filters: { id: doc.id },
          orderBy: "created_at",
          orderDir: "desc",
          limit: 1,
        },
      });
      const raw = ((rawData?.rows ?? [])[0] ?? {}) as Record<string, unknown>;
      const txt = (key: string) => (raw[key] == null ? "" : String(raw[key]));

      // #7 tahap 2b (BS New): sisa yang boleh ditagih milik DOKUMEN SUMBER,
      // bukan draft ini.
      let sourceOpen = 0;
      let upstreamLines: PrcLine[] = [];
      if (doc.source_document_id) {
        const srcDocData = await listWorkspaceRows({
          data: {
            table: "prc_documents",
            workspaceId,
            filters: { id: doc.source_document_id },
            orderBy: "created_at",
            orderDir: "desc",
            limit: 1,
          },
        });
        const srcDoc = ((srcDocData?.rows ?? [])[0] ?? null) as Record<string, unknown> | null;
        const srcLinesData = await listWorkspaceRows({
          data: {
            table: "prc_document_lines",
            workspaceId,
            filters: { document_id: doc.source_document_id },
            orderBy: "line_no",
            orderDir: "asc",
            limit: 500,
          },
        });
        upstreamLines = (srcLinesData?.rows ?? []) as unknown as PrcLine[];
        const srcTotal = srcDoc?.total == null ? Number(doc.total) : Number(srcDoc.total);
        if (isAmountSettlement(entity.docType)) {
          const settledRows = await sumDocumentTotalsBySource({
            data: { table: "prc_documents", workspaceId, sourceIds: [doc.source_document_id] },
          });
          const settled = (settledRows ?? []).reduce((sum, r) => sum + Number(r.total || 0), 0);
          sourceOpen = Math.max(0, srcTotal - settled);
        } else {
          sourceOpen = srcTotal;
        }
      }

      setEditingId(doc.id);
      setIsDraft(true);
      setSourceId(doc.source_document_id ?? "");
      setSourceLines(upstreamLines);
      setSourceOpenTotal(sourceOpen);
      setHeader({
        doc_number: doc.doc_number ?? "",
        doc_date: doc.doc_date ?? "",
        due_date: doc.due_date ?? "",
        supplier_code: doc.supplier_code ?? "",
        supplier_name: doc.supplier_name ?? "",
        warehouse_code: doc.warehouse_code ?? "",
        bank_account_code: txt("bank_account_code"),
        bank_account_name: txt("bank_account_name"),
        bank_gl_code: txt("bank_gl_code"),
        reference: doc.reference ?? "",
        notes: doc.notes ?? "",
        currency: doc.currency ?? "IDR",
        exchange_rate: Number(doc.exchange_rate ?? 1) || 1,
      });
      setLines(
        draftLines.length
          ? draftLines.map((l) => ({
              item_code: l.item_code ?? "",
              description: l.description ?? "",
              qty: String(l.qty ?? 0),
              uom_code: l.uom_code ?? "",
              unit_price: String(l.unit_price ?? 0),
              discount: String(l.discount ?? 0),
              tax_rate: String(l.tax_rate ?? 0),
              tax_code: l.tax_code ?? "",
              source_line_id: l.source_line_id ?? undefined,
            }))
          : [],
      );
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the draft");
    }
  };

  const remove = useMutation({
    mutationFn: async (doc: PrcDoc) => {
      // #10 (BS New): hanya draft yang boleh dihapus — dijaga lagi di server.
      if (doc.status !== "draft") {
        throw new Error(t("Only draft documents can be deleted.", "Hanya dokumen berstatus Draf yang dapat dihapus."));
      }
      await deleteWorkspaceRow({
        data: { table: "prc_documents", workspaceId, id: doc.id, requireStatus: "draft" },
      });
    },
    onSuccess: () => {
      toast.success(t("Deleted", "Terhapus"));
      void qc.invalidateQueries({ queryKey: ["prc"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasFilter = Boolean(search || from || to || status !== "all");

  return (
    <div className="space-y-4">
      {!open && (
      <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-gold">{t("PROCUREMENT", "PEMBELIAN")}</p>
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

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-3 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 sm:col-span-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-full pl-9 sm:w-60"
            placeholder={t("Search number or supplier…", "Cari nomor atau pemasok…")}
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
          <SelectTrigger className="col-span-2 w-full sm:w-44">
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
        <div className="col-span-2 grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2 sm:flex">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("From", "Dari")}</span>
          <Input
            type="date"
            className="min-w-0 sm:w-40"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("To", "Sampai")}</span>
          <Input
            type="date"
            className="min-w-0 sm:w-40"
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

      <div className="overflow-x-auto rounded-2xl border border-border bg-card max-md:border-0 max-md:bg-transparent">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14 text-center">#</TableHead>
              <TableHead>{t("Number", "Nomor")}</TableHead>
              <TableHead>{t("Date", "Tanggal")}</TableHead>
              <TableHead>{t("Supplier", "Pemasok")}</TableHead>
              <TableHead>{t("Source", "Sumber")}</TableHead>
              <TableHead>{t("Status", "Status")}</TableHead>
              <TableHead className="text-right">{t("Total", "Total")}</TableHead>
              <TableHead className="text-right">{t("Actions", "Aksi")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-sm text-muted-foreground">
                  {t("Loading…", "Memuat…")}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
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
                  {row.supplier_name || row.supplier_code || "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.source_doc_number || row.reference || "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={cn("border-0", STATUS_TONE[row.status])}>
                    {lang === "id" ? STATUS_LABEL[row.status].id_ : STATUS_LABEL[row.status].en}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-sm font-medium">
                  {formatMoney(row.total, lang, row.currency)}
                </TableCell>
                <TableCell className="text-right">
                  {row.status === "draft" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("Edit draft", "Edit draf")}
                      onClick={() => void editDraft(row)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  <Button asChild variant="ghost" size="icon" aria-label={t("Preview", "Pratinjau")}>
                    <Link
                      to="/app/w/$workspaceId/$moduleId/$submoduleId/$docId"
                      params={{
                        workspaceId,
                        moduleId: "procurement",
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
                        moduleId: "procurement",
                        submoduleId: entity.submoduleId,
                        docId: row.id,
                      }}
                      search={{ print: 1 }}
                    >
                      <Printer className="h-4 w-4" />
                    </Link>
                  </Button>
                  {row.status !== "draft" && row.status !== "cancelled" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("Cancel document", "Batalkan dokumen")}
                      onClick={() => setCancelDoc(row)}
                    >
                      <Ban className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
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

      </>
      )}
      {open && (
        <div className="w-full space-y-4">
          <Button type="button" variant="ghost" size="sm" onClick={() => { setOpen(false); resetForm(); }}>
            <ChevronLeft className="h-4 w-4" /> {t("Back to list", "Kembali ke daftar")}
          </Button>
          <div>
            <h1 className="text-xl font-semibold text-navy sm:text-2xl dark:text-primary-foreground">
              {editingId ? t("Edit Draft", "Edit Draf") : t("Create New", "Buat Baru")} ·{" "}
              {lang === "id" ? entity.id_ : entity.en}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "Leave the number empty to auto-generate it. The status is set automatically.",
                "Kosongkan nomor untuk dibuat otomatis. Status diatur otomatis.",
              )}
            </p>
          </div>

          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (sourceId && isAmountSettlement(entity.docType) && totals.total > sourceOpenTotal + 0.01) {
                toast.error(t("The amount exceeds the remaining balance.", "Nominal melebihi sisa yang belum diproses."));
                return;
              }
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
                            {d.doc_number} · {d.supplier_name || d.supplier_code || "—"} ·{" "}
                            {formatMoney(d.total, lang, d.currency)}
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
                        setSourceOpenTotal(0);
                        setLines([]);
                      }}
                    >
                      <X className="h-4 w-4" /> {t("Clear", "Bersihkan")}
                    </Button>
                  )}
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <FileInput className="h-3.5 w-3.5" />
                    {isAmountSettlement(entity.docType)
                      ? t(
                          "Partial amounts are allowed without changing item quantities.",
                          "Nominal termin dapat diubah tanpa mengubah qty item.",
                        )
                      : t(
                          "Partial quantities are allowed — the source stays open until fully fulfilled.",
                          "Qty sebagian diperbolehkan — dokumen sumber tetap terbuka sampai terpenuhi.",
                        )}
                  </p>
                </div>
                {sourceId && isAmountSettlement(entity.docType) && (
                  <PartialAmount
                    lang={lang}
                    t={t}
                    openTotal={sourceOpenTotal}
                    currentTotal={totals.total}
                    label={
                      entity.docType === "ap_invoice"
                        ? t("Amount to invoice", "Nilai yang ditagih")
                        : t("Amount paid", "Nilai yang dibayar")
                    }
                    onApply={(amount: number) =>
                      setLines((ls) =>
                        ls.map((l) => {
                          const ratio = totals.total > 0 ? amount / totals.total : 0;
                          return {
                            ...l,
                            qty: String(Number(l.qty) || 1),
                            unit_price: String((Number(l.unit_price) || 0) * ratio),
                            discount: String((Number(l.discount) || 0) * ratio),
                          };
                        }),
                      )
                    }
                  />
                )}
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
              <Field label={t("Supplier", "Pemasok")}>
                <PartyPicker
                  workspaceId={workspaceId}
                  kind="supplier"
                  value={header.supplier_code}
                  onPick={(p) => setHeader({ ...header, supplier_code: p.code, supplier_name: p.name })}
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
                    entity.docType === "purchase_payment"
                      ? t("Pay from account", "Bayar dari rekening")
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
              <CurrencyFields
                workspaceId={workspaceId}
                currency={header.currency}
                rate={Number(header.exchange_rate) || 1}
                date={header.doc_date}
                lang={lang}
                onChange={(c) => setHeader((h) => ({ ...h, ...c }))}
              />
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
              </div>
              <div className="overflow-x-auto rounded-xl border border-border max-md:border-0">
                <table ref={lineTableRef} className="w-full text-sm">
                  <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left">{t("Item", "Item")}</th>
                      <th className="p-2 text-left">{t("Description", "Deskripsi")}</th>
                      <th className="p-2 text-left">{t("Qty", "Qty")}</th>
                      <th className="p-2 text-left">{t("UoM", "Satuan")}</th>
                      <th className="p-2 text-left">{t("Price", "Harga")}</th>
                      <th className="p-2 text-left">{t("Disc.", "Diskon")}</th>
                      <th className="p-2 text-left">{t("Tax %", "Pajak %")}</th>
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
                          <td className="p-1 md:min-w-[14rem]">
                            <div className="px-2 py-2 text-sm font-medium">{l.item_code || <span className="text-muted-foreground">{t("(free text)", "(teks bebas)")}</span>}</div>
                          </td>
                          <td className="p-1">
                            <Input
                              className="h-9 md:min-w-[10rem]"
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
                              onChange={(e) =>
                                patch({
                                  qty: e.target.value,
                                  ...(l.disc_per_unit !== undefined
                                    ? { discount: String(Math.round(l.disc_per_unit * (Number(e.target.value) || 0) * 100) / 100) }
                                    : {}),
                                })
                              }
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
                          <td className="p-1">
                            <Input
                              type="number"
                              step="any"
                              className="h-9 w-28"
                              value={l.unit_price}
                              onChange={(e) => patch({ unit_price: e.target.value })}
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              type="number"
                              step="any"
                              className="h-9 w-24"
                              value={l.discount}
                              onChange={(e) => patch({ discount: e.target.value })}
                            />
                          </td>
                          <td className="p-1">
                            <Select
                              value={l.tax_code || "__none"}
                              onValueChange={(v) => {
                                const opt = taxOptions.find((o) => o.code === v);
                                patch({ tax_code: v === "__none" ? "" : v, tax_rate: String(opt?.rate ?? 0) });
                              }}
                            >
                              <SelectTrigger className="h-9 w-36">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none">{t("Non-taxable (0%)", "Tanpa pajak (0%)")}</SelectItem>
                                {taxOptions
                                  // Pembelian: sembunyikan PPN Keluaran (vat_out) agar tidak salah pilih; opsi yang sudah terpilih tetap tampil.
                                  .filter((r) => r.code && (r.taxType !== "vat_out" || r.code === l.tax_code))
                                  .map((r) => (
                                    <SelectItem key={r.code} value={r.code}>
                                      {r.label}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </td>
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
                                      <tr className="border-t border-border">
                      <td className="p-1" colSpan={8}>
                        <div className="flex flex-wrap items-center gap-2">
                        <ItemSearchAdd
                          className="md:w-full md:max-w-md md:min-w-0"
                          options={itemOptions}
                          placeholder={t("Add item: type code / name then Enter", "Tambah item: ketik kode / nama lalu Enter")}
                          onAdd={(o) => {
                            const it = itemByCode.get(o.id);
                            setLines((ls) => [
                              ...ls,
                              {
                                ...emptyLine(),
                                item_code: o.id,
                                description: it?.name ?? o.name ?? "",
                                uom_code: it?.uom_code ?? "",
                                unit_price: String(it?.cost_price ?? 0),
                              },
                            ]);
                          }}
                          onFreeText={(text) => setLines((ls) => [...ls, { ...emptyLine(), description: text }])}
                        />
                        <LineImportButton
                          templateName={entity.submoduleId}
                          knownCodes={new Set(itemByCode.keys())}
                          onImport={(rows) =>
                            setLines((ls) => [
                              ...ls.filter((l) => l.item_code || l.description),
                              ...rows.map((r) => {
                                const it = itemByCode.get(r.code);
                                return {
                                  ...emptyLine(),
                                  item_code: r.code,
                                  description: it?.name ?? "",
                                  uom_code: it?.uom_code ?? "",
                                  qty: String(r.qty),
                                  unit_price: String(r.price ?? (it?.cost_price ?? 0)),
                                  discount: String(r.discount),
                                };
                              }),
                            ])
                          }
                        />
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col items-end gap-1 text-sm sm:flex-row sm:justify-end sm:gap-6">
                <span className="text-muted-foreground">
                  {t("Subtotal", "Subtotal")}: {formatMoney(totals.subtotal, lang)}
                </span>
                <span className="text-muted-foreground">
                  {t("VAT", "PPN")}: {formatMoney(totals.tax, lang)}
                </span>
                {totals.withholding > 0 && (
                  <span className="text-muted-foreground">
                    {t("Withholding (PPh)", "Potongan PPh")}: -{formatMoney(totals.withholding, lang)}
                  </span>
                )}
                <span className="font-semibold text-navy dark:text-primary-foreground">
                  {t("Total", "Total")}: {formatMoney(totals.total, lang)}
                </span>
              </div>
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

            {/* Di HP tombol aksi menempel di atas navigasi bawah agar selalu terjangkau. */}
            <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 -mx-1 flex gap-2 rounded-2xl border border-border bg-background/95 p-2 shadow-lg backdrop-blur max-lg:[&>button]:flex-1 lg:static lg:mx-0 lg:justify-end lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
              <Button type="button" variant="outline" onClick={() => { setOpen(false); resetForm(); }}>
                {t("Cancel", "Batal")}
              </Button>
              <Button type="submit" variant="gold" disabled={create.isPending}>
                {create.isPending && <Loader2 className="animate-spin" />}
                {isDraft ? t("Save draft", "Simpan draf") : t("Submit", "Kirim")}
              </Button>
            </div>
          </form>
        </div>
      )}
      <CancelDocumentDialog
        workspaceId={workspaceId}
        side="purchase"
        document={cancelDoc}
        onClose={() => setCancelDoc(null)}
        onCancelled={() => {
          void qc.invalidateQueries({ queryKey: ["prc"] });
          void qc.invalidateQueries({ queryKey: ["inv-movements"] });
          void qc.invalidateQueries({ queryKey: ["cb-trx"] });
        }}
      />
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

/**
 * #7 (BS New): widget Partial / Full untuk dokumen penyelesaian berbasis NILAI
 * (AP Invoice & Purchase Payment).
 */
function PartialAmount({
  lang,
  t,
  openTotal,
  currentTotal,
  label,
  onApply,
}: {
  lang: string;
  t: (en: string, id: string) => string;
  openTotal: number;
  currentTotal: number;
  label: string;
  onApply: (amount: number) => void;
}) {
  const [amount, setAmount] = useState("");
  const apply = () => {
    const v = Number(amount);
    if (!v || v <= 0 || openTotal <= 0) return;
    onApply(Math.min(openTotal, v));
  };
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-dashed border-gold/50 bg-gold/5 p-3">
      <div className="grid gap-1">
        <span className="text-xs font-medium">{label}</span>
        <Input
          type="number"
          min={0}
          className="w-48"
          value={amount}
          placeholder={String(Math.round(openTotal))}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <Button type="button" size="sm" variant="outline" onClick={apply}>
        {t("Apply partial", "Terapkan sebagian")}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => onApply(openTotal)}>
        {t("Full", "Penuh")}
      </Button>
      <p className="w-full text-xs text-muted-foreground">
        {t("Open balance", "Sisa")}: {formatMoney(openTotal, lang)} · {t("This document", "Dokumen ini")}:{" "}
        {formatMoney(currentTotal, lang)}
      </p>
    </div>
  );
}
