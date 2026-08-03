import type { PrcStatus } from "@/lib/procurement";

export type SlsDocType =
  | "quotation"
  | "sales_order"
  | "delivery_order"
  | "ar_invoice"
  | "sales_receipt"
  | "sales_return";

export interface SlsDoc {
  id: string;
  workspace_id: string;
  doc_type: SlsDocType;
  doc_number: string;
  doc_date: string;
  due_date: string | null;
  customer_code: string | null;
  customer_name: string | null;
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

export interface SlsLine {
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

export interface SlsEntity {
  submoduleId: string;
  docType: SlsDocType;
  en: string;
  id_: string;
  prefix: string;
  showWarehouse: boolean;
  showDueDate: boolean;
  /** ask for the cash/bank account used for (or planned for) settlement */
  showBank?: boolean;
  statuses: PrcStatus[];
  openStatus: PrcStatus;
  source?: {
    submoduleId: string;
    docType: SlsDocType;
    en: string;
    id_: string;
    fromStatuses: PrcStatus[];
  };
  allowPartial: boolean;
  autoJournal: boolean;
}

export const SLS_ENTITIES: SlsEntity[] = [
  {
    submoduleId: "quotations",
    docType: "quotation",
    en: "Quotations",
    id_: "Penawaran",
    prefix: "QUO",
    showWarehouse: false,
    showDueDate: true,
    statuses: ["draft", "submitted", "partial", "closed", "cancelled"],
    openStatus: "submitted",
    allowPartial: false,
    autoJournal: false,
  },
  {
    submoduleId: "sales-orders",
    docType: "sales_order",
    en: "Sales Orders",
    id_: "Pesanan Penjualan",
    prefix: "SO",
    showWarehouse: true,
    showDueDate: true,
    statuses: ["draft", "approved", "partial", "closed", "cancelled"],
    openStatus: "approved",
    source: {
      submoduleId: "quotations",
      docType: "quotation",
      en: "Quotation",
      id_: "Penawaran",
      fromStatuses: ["submitted", "approved", "partial"],
    },
    allowPartial: true,
    autoJournal: false,
  },
  {
    submoduleId: "delivery-orders",
    docType: "delivery_order",
    en: "Delivery Orders",
    id_: "Surat Jalan",
    prefix: "DO",
    showWarehouse: true,
    showDueDate: false,
    statuses: ["draft", "received", "partial", "closed", "cancelled"],
    openStatus: "received",
    source: {
      submoduleId: "sales-orders",
      docType: "sales_order",
      en: "Sales Order",
      id_: "Pesanan Penjualan",
      fromStatuses: ["approved", "submitted", "partial"],
    },
    allowPartial: true,
    autoJournal: true,
  },
  {
    submoduleId: "ar-invoices",
    docType: "ar_invoice",
    en: "AR Invoices",
    id_: "Faktur Piutang",
    prefix: "ARI",
    showWarehouse: false,
    showDueDate: true,
    showBank: true,
    statuses: ["draft", "invoiced", "partial", "paid", "closed", "cancelled"],
    openStatus: "invoiced",
    source: {
      submoduleId: "delivery-orders",
      docType: "delivery_order",
      en: "Delivery Order",
      id_: "Surat Jalan",
      fromStatuses: ["received", "partial"],
    },
    allowPartial: true,
    autoJournal: true,
  },
  {
    submoduleId: "receipts",
    docType: "sales_receipt",
    en: "Receipts",
    id_: "Penerimaan Pembayaran",
    prefix: "RCP",
    showWarehouse: false,
    showDueDate: false,
    showBank: true,
    statuses: ["draft", "paid", "cancelled"],
    openStatus: "paid",
    source: {
      submoduleId: "ar-invoices",
      docType: "ar_invoice",
      en: "AR Invoice",
      id_: "Faktur Piutang",
      fromStatuses: ["invoiced", "partial"],
    },
    allowPartial: true,
    autoJournal: true,
  },
  {
    submoduleId: "sales-returns",
    docType: "sales_return",
    en: "Sales Returns",
    id_: "Retur Penjualan",
    prefix: "SRT",
    showWarehouse: true,
    showDueDate: false,
    statuses: ["draft", "submitted", "closed", "cancelled"],
    openStatus: "submitted",
    source: {
      submoduleId: "delivery-orders",
      docType: "delivery_order",
      en: "Delivery Order",
      id_: "Surat Jalan",
      fromStatuses: ["received", "partial", "closed"],
    },
    allowPartial: true,
    autoJournal: true,
  },
];

export function findSlsEntity(submoduleId?: string) {
  return SLS_ENTITIES.find((e) => e.submoduleId === submoduleId);
}
