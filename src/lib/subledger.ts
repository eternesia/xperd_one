/**
 * #45 (BS New 3): subledger piutang/hutang dari dokumen penjualan & pembelian
 * yang sudah diposting. Kartu AR/AP menampilkan setiap mutasi per partner,
 * sedangkan aging mengalokasikan pelunasan ke tagihan tertua lebih dulu (FIFO) —
 * praktik umum di Indonesia.
 *
 * Versi Old: pengambilan data lewat server fn `listWorkspaceRows` (bukan Supabase).
 */
import { listWorkspaceRows } from "@/lib/data.functions";

export type SubledgerSide = "ar" | "ap";

export interface SubledgerEntry {
  id: string;
  date: string;
  partner: string;
  doc_number: string;
  doc_type: string;
  due_date: string | null;
  /** increases the outstanding balance (invoice) */
  debit: number;
  /** decreases the outstanding balance (receipt / payment / return) */
  credit: number;
  balance: number;
  status: string;
}

export interface AgingRow {
  partner: string;
  current: number;
  d1: number;
  d31: number;
  d61: number;
  d90: number;
  total: number;
}

interface RawDoc {
  id: string;
  doc_date: string;
  doc_number: string;
  doc_type: string;
  due_date: string | null;
  status: string;
  total: number | null;
  customer_name?: string | null;
  supplier_name?: string | null;
}

const OPEN = (s: string) => s !== "draft" && s !== "cancelled";

const AR_INCREASE = ["ar_invoice"];
const AR_DECREASE = ["sales_receipt", "sales_return"];
const AP_INCREASE = ["ap_invoice"];
const AP_DECREASE = ["purchase_payment", "purchase_return"];

export async function fetchSubledger(side: SubledgerSide, workspaceId: string, from: string, to: string) {
  const table = side === "ar" ? "sls_documents" : "prc_documents";
  const types = side === "ar" ? [...AR_INCREASE, ...AR_DECREASE] : [...AP_INCREASE, ...AP_DECREASE];
  const data = await listWorkspaceRows({
    data: {
      table,
      workspaceId,
      inFilters: { doc_type: types },
      ranges: { doc_date: { gte: from || undefined, lte: to || undefined } },
      orderBy: "doc_date",
      orderDir: "asc",
      limit: 5000,
    },
  });
  // Down payment disimpan di akun Uang Muka sampai dipakai ke invoice; dokumen
  // "application" (settlement) yang menutupnya, jadi dokumen `advance` disaring.
  return ((data?.rows ?? []) as unknown as (RawDoc & { advance_kind?: string | null })[]).filter(
    (d) => OPEN(d.status) && d.advance_kind !== "advance",
  );
}

export function buildCard(side: SubledgerSide, docs: RawDoc[], partnerFilter?: string): SubledgerEntry[] {
  const increase = side === "ar" ? AR_INCREASE : AP_INCREASE;
  const rows = docs
    .map((d) => ({
      doc: d,
      partner: (side === "ar" ? d.customer_name : d.supplier_name) || "—",
    }))
    .filter((r) => !partnerFilter || r.partner === partnerFilter)
    .sort(
      (a, b) =>
        a.doc.doc_date.localeCompare(b.doc.doc_date) || a.doc.doc_number.localeCompare(b.doc.doc_number),
    );

  const running = new Map<string, number>();
  return rows.map(({ doc, partner }) => {
    const amount = Number(doc.total) || 0;
    const isIncrease = increase.includes(doc.doc_type);
    const next = (running.get(partner) ?? 0) + (isIncrease ? amount : -amount);
    running.set(partner, next);
    return {
      id: doc.id,
      date: doc.doc_date,
      partner,
      doc_number: doc.doc_number,
      doc_type: doc.doc_type,
      due_date: doc.due_date,
      debit: isIncrease ? amount : 0,
      credit: isIncrease ? 0 : amount,
      balance: next,
      status: doc.status,
    };
  });
}

function bucketOf(days: number) {
  if (days <= 0) return "current" as const;
  if (days <= 30) return "d1" as const;
  if (days <= 60) return "d31" as const;
  if (days <= 90) return "d61" as const;
  return "d90" as const;
}

export function buildAging(side: SubledgerSide, docs: RawDoc[], asOf: string): AgingRow[] {
  const increase = side === "ar" ? AR_INCREASE : AP_INCREASE;
  const byPartner = new Map<string, { invoices: { due: string; open: number }[]; settle: number }>();

  for (const d of docs) {
    const partner = (side === "ar" ? d.customer_name : d.supplier_name) || "—";
    if (d.doc_date > asOf) continue;
    const bucket = byPartner.get(partner) ?? { invoices: [], settle: 0 };
    const amount = Number(d.total) || 0;
    if (increase.includes(d.doc_type)) bucket.invoices.push({ due: d.due_date || d.doc_date, open: amount });
    else bucket.settle += amount;
    byPartner.set(partner, bucket);
  }

  const asOfTime = new Date(asOf).getTime();
  const rows: AgingRow[] = [];
  for (const [partner, bucket] of byPartner) {
    // tagihan tertua dilunasi lebih dulu
    bucket.invoices.sort((a, b) => a.due.localeCompare(b.due));
    let left = bucket.settle;
    for (const inv of bucket.invoices) {
      if (left <= 0) break;
      const applied = Math.min(left, inv.open);
      inv.open -= applied;
      left -= applied;
    }
    const row: AgingRow = { partner, current: 0, d1: 0, d31: 0, d61: 0, d90: 0, total: 0 };
    for (const inv of bucket.invoices) {
      if (inv.open <= 0.004) continue;
      const days = Math.floor((asOfTime - new Date(inv.due).getTime()) / 86_400_000);
      row[bucketOf(days)] += inv.open;
      row.total += inv.open;
    }
    if (row.total > 0.004) rows.push(row);
  }
  return rows.sort((a, b) => b.total - a.total);
}

export function partnersOf(side: SubledgerSide, docs: RawDoc[]) {
  const set = new Set<string>();
  for (const d of docs) set.add((side === "ar" ? d.customer_name : d.supplier_name) || "—");
  return [...set].sort((a, b) => a.localeCompare(b));
}
