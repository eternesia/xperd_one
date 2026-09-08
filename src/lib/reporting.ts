import { listRowsByIds, listWorkspaceRows } from "@/lib/data.functions";
import type { PrcDoc } from "@/lib/procurement";
import type { SlsDoc } from "@/lib/sales";
import type { InvMovement } from "@/lib/inventory";
import type { CbTransaction } from "@/lib/cashbank";

export type RptViewKind = "executive" | "sales" | "purchasing" | "inventory" | "financial" | "exports";

export interface RptEntity {
  submoduleId: RptViewKind;
  en: string;
  id_: string;
}

export const RPT_ENTITIES: RptEntity[] = [
  { submoduleId: "executive", en: "Executive Dashboard", id_: "Dasbor Eksekutif" },
  { submoduleId: "sales", en: "Sales Analytics", id_: "Analitik Penjualan" },
  { submoduleId: "purchasing", en: "Purchasing Analytics", id_: "Analitik Pembelian" },
  { submoduleId: "inventory", en: "Inventory Analytics", id_: "Analitik Persediaan" },
  { submoduleId: "financial", en: "Financial Reports", id_: "Laporan Keuangan" },
  { submoduleId: "exports", en: "Data Exports", id_: "Ekspor Data" },
];

export function findRptEntity(submoduleId?: string) {
  return RPT_ENTITIES.find((e) => e.submoduleId === submoduleId);
}

export function monthKey(date: string) {
  return (date || "").slice(0, 7);
}

export function startOfYear() {
  return `${new Date().getFullYear()}-01-01`;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function csvEscape(value: unknown) {
  const s = value === null || value === undefined ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]) {
  return [headers.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
}

export function downloadCsv(name: string, content: string) {
  const blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** aggregate a numeric field per key, sorted descending */
export function rank<T>(rows: T[], key: (r: T) => string, value: (r: T) => number, limit = 8) {
  const map = new Map<string, { value: number; count: number }>();
  for (const r of rows) {
    const k = key(r) || "—";
    const current = map.get(k) ?? { value: 0, count: 0 };
    current.value += value(r) || 0;
    current.count += 1;
    map.set(k, current);
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, value: v.value, count: v.count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function byMonth<T>(rows: T[], date: (r: T) => string, value: (r: T) => number, months = 12) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = monthKey(date(r));
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + (value(r) || 0));
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-months)
    .map(([month, value]) => ({ month, value }));
}

export async function fetchSalesDocs(workspaceId: string, from: string, to: string) {
  const data = await listWorkspaceRows({
    data: {
      table: "sls_documents",
      workspaceId,
      orderBy: "doc_date",
      orderDir: "desc",
      limit: 5000,
      ranges: { doc_date: { gte: from || undefined, lte: to || undefined } },
    },
  });
  return (data?.rows ?? []) as unknown as SlsDoc[];
}

export async function fetchPurchaseDocs(workspaceId: string, from: string, to: string) {
  const data = await listWorkspaceRows({
    data: {
      table: "prc_documents",
      workspaceId,
      orderBy: "doc_date",
      orderDir: "desc",
      limit: 5000,
      ranges: { doc_date: { gte: from || undefined, lte: to || undefined } },
    },
  });
  return (data?.rows ?? []) as unknown as PrcDoc[];
}

export interface RptDocLine {
  document_id: string;
  item_code: string | null;
  description: string | null;
  qty: number;
  line_total: number;
}

export async function fetchSalesLines(workspaceId: string, documentIds: string[]) {
  if (!documentIds.length) return [] as RptDocLine[];
  const data = await listRowsByIds({
    data: { table: "sls_document_lines", workspaceId, ids: documentIds.slice(0, 800), idColumn: "document_id" },
  });
  return (data ?? []) as unknown as RptDocLine[];
}

export async function fetchPurchaseLines(workspaceId: string, documentIds: string[]) {
  if (!documentIds.length) return [] as RptDocLine[];
  const data = await listRowsByIds({
    data: { table: "prc_document_lines", workspaceId, ids: documentIds.slice(0, 800), idColumn: "document_id" },
  });
  return (data ?? []) as unknown as RptDocLine[];
}

export async function fetchMovements(workspaceId: string, from: string, to: string) {
  const data = await listWorkspaceRows({
    data: {
      table: "inv_movements",
      workspaceId,
      orderBy: "movement_date",
      orderDir: "desc",
      limit: 5000,
      ranges: { movement_date: { gte: from || undefined, lte: to || undefined } },
    },
  });
  return (data?.rows ?? []) as unknown as InvMovement[];
}

export async function fetchCashFlow(workspaceId: string, from: string, to: string) {
  const data = await listWorkspaceRows({
    data: {
      table: "cb_transactions",
      workspaceId,
      orderBy: "trx_date",
      orderDir: "desc",
      limit: 5000,
      ranges: { trx_date: { gte: from || undefined, lte: to || undefined } },
    },
  });
  return (data?.rows ?? []) as unknown as CbTransaction[];
}

const POSTED = (status: string) => !["cancelled", "draft"].includes(status);

/** revenue recognised from AR invoices */
export function revenueOf(docs: SlsDoc[]) {
  return docs
    .filter((d) => d.doc_type === "ar_invoice" && POSTED(d.status))
    .reduce((s, d) => s + Number(d.total || 0), 0);
}

export function spendOf(docs: PrcDoc[]) {
  return docs
    .filter((d) => d.doc_type === "ap_invoice" && POSTED(d.status))
    .reduce((s, d) => s + Number(d.total || 0), 0);
}

export function receivableOf(docs: SlsDoc[]) {
  const invoiced = revenueOf(docs);
  const received = docs
    .filter((d) => d.doc_type === "sales_receipt" && POSTED(d.status))
    .reduce((s, d) => s + Number(d.total || 0), 0);
  return invoiced - received;
}

export function payableOf(docs: PrcDoc[]) {
  const billed = spendOf(docs);
  const paid = docs
    .filter((d) => d.doc_type === "purchase_payment" && POSTED(d.status))
    .reduce((s, d) => s + Number(d.total || 0), 0);
  return billed - paid;
}
