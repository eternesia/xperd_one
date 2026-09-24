export type PrcDocType =
  | "purchase_request"
  | "purchase_order"
  | "goods_receipt"
  | "ap_invoice"
  | "purchase_payment"
  | "purchase_return";

export type PrcStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "received"
  | "partial"
  | "invoiced"
  | "paid"
  | "closed"
  | "cancelled";

export interface PrcDoc {
  id: string;
  workspace_id: string;
  doc_type: PrcDocType;
  doc_number: string;
  doc_date: string;
  due_date: string | null;
  supplier_code: string | null;
  supplier_name: string | null;
  warehouse_code: string | null;
  reference: string | null;
  status: PrcStatus;
  currency: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  source_document_id?: string | null;
  source_doc_number?: string | null;
  created_at: string;
}

export interface PrcLine {
  id: string;
  document_id: string;
  line_no: number;
  item_code: string | null;
  description: string | null;
  qty: number;
  uom_code: string | null;
  unit_price: number;
  discount: number;
  tax_rate: number;
  line_total: number;
  source_line_id?: string | null;
  qty_fulfilled?: number;
}

export interface PrcEntity {
  submoduleId: string;
  docType: PrcDocType;
  en: string;
  id_: string;
  prefix: string;
  showWarehouse: boolean;
  showDueDate: boolean;
  /** ask for the cash/bank account used for (or planned for) settlement */
  showBank?: boolean;
  statuses: PrcStatus[];
  /** status applied automatically when the document is submitted (draft unchecked) */
  openStatus: PrcStatus;
  /** pull lines from this upstream document type */
  source?: {
    submoduleId: string;
    docType: PrcDocType;
    en: string;
    id_: string;
    /** upstream statuses that can still be pulled from */
    fromStatuses: PrcStatus[];
  };
  /** partial fulfilment allowed against the source document */
  allowPartial: boolean;
  /** posts an automatic journal entry when submitted */
  autoJournal: boolean;
}

export const PRC_ENTITIES: PrcEntity[] = [
  {
    submoduleId: "purchase-requests",
    docType: "purchase_request",
    en: "Purchase Requests",
    id_: "Permintaan Pembelian",
    prefix: "PR",
    showWarehouse: false,
    showDueDate: true,
    statuses: ["draft", "submitted", "partial", "closed", "cancelled"],
    openStatus: "submitted",
    allowPartial: false,
    autoJournal: false,
  },
  {
    submoduleId: "purchase-orders",
    docType: "purchase_order",
    en: "Purchase Orders",
    id_: "Pesanan Pembelian",
    prefix: "PO",
    showWarehouse: true,
    showDueDate: true,
    statuses: ["draft", "approved", "partial", "closed", "cancelled"],
    openStatus: "approved",
    source: {
      submoduleId: "purchase-requests",
      docType: "purchase_request",
      en: "Purchase Request",
      id_: "Permintaan Pembelian",
      fromStatuses: ["submitted", "approved", "partial"],
    },
    allowPartial: true,
    autoJournal: false,
  },
  {
    submoduleId: "goods-receipts",
    docType: "goods_receipt",
    en: "Goods Receipts",
    id_: "Penerimaan Barang",
    prefix: "GRN",
    showWarehouse: true,
    showDueDate: false,
    statuses: ["draft", "received", "partial", "closed", "cancelled"],
    openStatus: "received",
    source: {
      submoduleId: "purchase-orders",
      docType: "purchase_order",
      en: "Purchase Order",
      id_: "Pesanan Pembelian",
      fromStatuses: ["approved", "submitted", "partial"],
    },
    allowPartial: true,
    autoJournal: true,
  },
  {
    submoduleId: "ap-invoices",
    docType: "ap_invoice",
    en: "AP Invoices",
    id_: "Faktur Hutang",
    prefix: "API",
    showWarehouse: false,
    showDueDate: true,
    showBank: true,
    statuses: ["draft", "invoiced", "partial", "paid", "closed", "cancelled"],
    openStatus: "invoiced",
    source: {
      submoduleId: "goods-receipts",
      docType: "goods_receipt",
      en: "Goods Receipt",
      id_: "Penerimaan Barang",
      fromStatuses: ["received", "partial", "closed"],
    },
    allowPartial: true,
    autoJournal: false,
  },
  {
    submoduleId: "payments",
    docType: "purchase_payment",
    en: "Payments",
    id_: "Pembayaran",
    prefix: "PAY",
    showWarehouse: false,
    showDueDate: false,
    showBank: true,
    statuses: ["draft", "paid", "cancelled"],
    openStatus: "paid",
    source: {
      submoduleId: "ap-invoices",
      docType: "ap_invoice",
      en: "AP Invoice",
      id_: "Faktur Hutang",
      fromStatuses: ["invoiced", "partial", "closed"],
    },
    allowPartial: true,
    autoJournal: true,
  },
  {
    submoduleId: "purchase-returns",
    docType: "purchase_return",
    en: "Purchase Returns",
    id_: "Retur Pembelian",
    prefix: "PRT",
    showWarehouse: true,
    showDueDate: false,
    statuses: ["draft", "submitted", "closed", "cancelled"],
    openStatus: "submitted",
    source: {
      submoduleId: "goods-receipts",
      docType: "goods_receipt",
      en: "Goods Receipt",
      id_: "Penerimaan Barang",
      fromStatuses: ["received", "partial", "closed"],
    },
    allowPartial: true,
    autoJournal: true,
  },
];

export function findPrcEntity(submoduleId?: string) {
  return PRC_ENTITIES.find((e) => e.submoduleId === submoduleId);
}

export function findPrcEntityByType(docType?: PrcDocType) {
  return PRC_ENTITIES.find((e) => e.docType === docType);
}

export const STATUS_LABEL: Record<PrcStatus, { en: string; id_: string }> = {
  draft: { en: "Draft", id_: "Draf" },
  submitted: { en: "Submitted", id_: "Diajukan" },
  approved: { en: "Approved", id_: "Disetujui" },
  received: { en: "Received", id_: "Diterima" },
  partial: { en: "Partial", id_: "Sebagian" },
  invoiced: { en: "Invoiced", id_: "Difakturkan" },
  paid: { en: "Paid", id_: "Lunas" },
  closed: { en: "Completed", id_: "Selesai" },
  cancelled: { en: "Cancelled", id_: "Dibatalkan" },
};

export const STATUS_TONE: Record<PrcStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  approved: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  received: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  partial: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  invoiced: "bg-gold/20 text-gold-foreground dark:text-gold",
  paid: "bg-emerald-600/20 text-emerald-700 dark:text-emerald-300",
  closed: "bg-navy/10 text-navy dark:bg-navy/40 dark:text-primary-foreground",
  cancelled: "bg-destructive/15 text-destructive",
};

export function formatMoney(value: number, lang: string, currency = "IDR") {
  return new Intl.NumberFormat(lang === "id" ? "id-ID" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

export function nextDocNumber(prefix: string, seq: number, date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${prefix}/${y}${m}/${String(seq).padStart(4, "0")}`;
}

export function computeLine(line: Pick<PrcLine, "qty" | "unit_price" | "discount" | "tax_rate">) {
  const gross = Number(line.qty || 0) * Number(line.unit_price || 0);
  const net = gross - Number(line.discount || 0);
  return { gross, net, tax: (net * Number(line.tax_rate || 0)) / 100 };
}

/** remaining quantity still open on a source line */
export function remainingQty(line: PrcLine) {
  return Math.max(0, Number(line.qty || 0) - Number(line.qty_fulfilled || 0));
}

/**
 * #7 (BS New): dokumen penyelesaian berbasis NILAI. AP Invoice & Purchase
 * Payment mengonsumsi sisa NILAI dokumen sumber, bukan qty per baris (jadi qty
 * item tidak pernah dikonsumsi dan sisa qty tidak relevan).
 */
export function isAmountSettlement(docType: PrcDocType) {
  return docType === "ap_invoice" || docType === "purchase_payment";
}

/** derive the source document status after its children consumed some quantity */
export function deriveSourceStatus(lines: { qty: number; qty_fulfilled?: number }[]): PrcStatus {
  const anyOpen = lines.some((l) => Number(l.qty || 0) - Number(l.qty_fulfilled || 0) > 0.0001);
  const anyDone = lines.some((l) => Number(l.qty_fulfilled || 0) > 0.0001);
  if (!anyOpen) return "closed";
  return anyDone ? "partial" : "submitted";
}
