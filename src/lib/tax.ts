import { useQuery } from "@tanstack/react-query";

import { listWorkspaceRows, saveWorkspaceRow, upsertWorkspaceRows } from "@/lib/data.functions";
import { fetchTaxableDocuments as fetchTaxableDocumentsFn } from "@/lib/ledger.functions";

export type TaxType = "vat_in" | "vat_out" | "withholding";
export type TaxStatus = "draft" | "reported" | "paid";

export interface TaxRecord {
  id: string;
  workspace_id: string;
  tax_no: string;
  tax_type: TaxType;
  tax_date: string;
  period: string | null;
  partner_name: string | null;
  partner_tax_id: string | null;
  doc_number: string | null;
  faktur_number: string | null;
  description: string | null;
  base_amount: number;
  rate: number;
  tax_amount: number;
  status: TaxStatus;
  ref_type: string | null;
  ref_id: string | null;
  notes: string | null;
  created_at: string;
}

export type TaxViewKind = "ledger" | "efaktur";

export interface TaxEntity {
  submoduleId: string;
  kind: TaxViewKind;
  en: string;
  id_: string;
  taxType?: TaxType;
}

export const TAX_ENTITIES: TaxEntity[] = [
  { submoduleId: "vat-in", kind: "ledger", en: "Input VAT", id_: "PPN Masukan", taxType: "vat_in" },
  { submoduleId: "vat-out", kind: "ledger", en: "Output VAT", id_: "PPN Keluaran", taxType: "vat_out" },
  {
    submoduleId: "withholding",
    kind: "ledger",
    en: "Withholding Tax",
    id_: "PPh Potong Pungut",
    taxType: "withholding",
  },
  { submoduleId: "efaktur", kind: "efaktur", en: "e-Faktur & e-Bupot", id_: "e-Faktur & e-Bupot" },
];

export function findTaxEntity(submoduleId?: string) {
  return TAX_ENTITIES.find((e) => e.submoduleId === submoduleId);
}

export const TAX_TYPE_LABEL: Record<TaxType, { en: string; id_: string }> = {
  vat_in: { en: "Input VAT", id_: "PPN Masukan" },
  vat_out: { en: "Output VAT", id_: "PPN Keluaran" },
  withholding: { en: "Withholding", id_: "PPh" },
};

export const TAX_STATUS_LABEL: Record<TaxStatus, { en: string; id_: string }> = {
  draft: { en: "Draft", id_: "Draf" },
  reported: { en: "Reported", id_: "Dilaporkan" },
  paid: { en: "Paid", id_: "Disetor" },
};

export const TAX_STATUS_TONE: Record<TaxStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  reported: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

export const WITHHOLDING_RATES = [
  { code: "pph21", label: "PPh 21", rate: 5 },
  { code: "pph22", label: "PPh 22", rate: 1.5 },
  { code: "pph23", label: "PPh 23", rate: 2 },
  { code: "pph4-2", label: "PPh 4(2)", rate: 10 },
];

export const VAT_RATE = 11;

/** Selectable VAT rates for document lines — no manual typing in purchase/sales forms. */
export const LINE_TAX_RATES: { value: number; en: string; id_: string }[] = [
  { value: 0, en: "Non-taxable (0%)", id_: "Tanpa PPN (0%)" },
  { value: 1.1, en: "VAT final 1.1%", id_: "PPN final 1,1%" },
  { value: 11, en: "VAT 11%", id_: "PPN 11%" },
  { value: 12, en: "VAT 12%", id_: "PPN 12%" },
];

/**
 * #36 (BS New 3): definisi pajak LENGKAP untuk satu baris dokumen. Tarif saja
 * tidak cukup — posting jurnal harus tahu apakah baris itu PPN (menambah nilai)
 * atau PPh/withholding (mengurangi nilai yang dibayar/diterima).
 * `code` = kode master `md_taxes`, disimpan di baris dokumen sebagai `tax_code`.
 */
export interface LineTaxOption {
  code: string;
  name: string;
  label: string;
  rate: number;
  /** "none" bila baris master tidak punya jenis pajak (non-taxable). */
  taxType: TaxType | "none";
  accountCode: string | null;
}

export const NO_TAX_OPTION: LineTaxOption = {
  code: "",
  name: "Non-taxable",
  label: "Non-taxable (0%)",
  rate: 0,
  taxType: "none",
  accountCode: null,
};

/** PPh (withholding) mengurangi nilai tagihan, bukan menambah PPN. */
export function isWithholdingTax(option?: LineTaxOption | null) {
  return option?.taxType === "withholding";
}

/** Line-level tax options sourced from Master Data → Tax Rates (md_taxes). */
export function useLineTaxOptions(workspaceId: string, lang: "en" | "id") {
  return useQuery({
    queryKey: ["md_taxes", workspaceId, lang],
    queryFn: async (): Promise<LineTaxOption[]> => {
      const data = await listWorkspaceRows({
        data: {
          table: "md_taxes",
          workspaceId,
          orderBy: "rate",
          orderDir: "asc",
          limit: 200,
          filters: { is_active: 1 },
        },
      });
      const rows = (data?.rows ?? []) as {
        code: string;
        name: string;
        rate: number | null;
        tax_type: string | null;
        account_code: string | null;
      }[];
      const mapped: LineTaxOption[] = rows.map((r) => {
        const rate = Number(r.rate) || 0;
        const taxType = (["vat_in", "vat_out", "withholding"].includes(r.tax_type ?? "")
          ? r.tax_type
          : "none") as TaxType | "none";
        return {
          code: r.code,
          name: r.name,
          label: `${r.name} (${rate}%)`,
          rate,
          taxType,
          accountCode: r.account_code ?? null,
        };
      });
      if (mapped.length) {
        // selalu sediakan opsi "tanpa pajak" di paling atas bila master belum punya
        const hasNone = mapped.some((m) => m.rate === 0 && m.taxType === "none");
        if (hasNone) return mapped;
        return [
          { ...NO_TAX_OPTION, label: lang === "id" ? "Tanpa pajak (0%)" : "Non-taxable (0%)" },
          ...mapped,
        ];
      }
      // Fallback: tarif bawaan bila master pajak workspace belum diisi.
      return LINE_TAX_RATES.map((r) => ({
        code: r.value === 0 ? "" : `RATE${r.value}`,
        name: lang === "id" ? r.id_ : r.en,
        label: lang === "id" ? r.id_ : r.en,
        rate: r.value,
        taxType: (r.value === 0 ? "none" : "vat_out") as TaxType | "none",
        accountCode: r.value === 0 ? null : "2100",
      }));
    },
  });
}

export function taxPrefix(type: TaxType) {
  return type === "vat_in" ? "PM" : type === "vat_out" ? "PK" : "PPH";
}

export function nextTaxNumber(type: TaxType, seq: number) {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${taxPrefix(type)}/${ym}/${String(seq).padStart(4, "0")}`;
}

export function periodOf(date: string) {
  return date.slice(0, 7);
}

export async function fetchTaxRecords(
  workspaceId: string,
  filters: { type?: TaxType; from?: string; to?: string } = {},
) {
  const data = await listWorkspaceRows({
    data: {
      table: "tax_records",
      workspaceId,
      orderBy: "tax_date",
      orderDir: "desc",
      limit: 2000,
      filters: filters.type ? { tax_type: filters.type } : undefined,
      ranges: { tax_date: { gte: filters.from || undefined, lte: filters.to || undefined } },
    },
  });
  return (data?.rows ?? []) as unknown as TaxRecord[];
}

export interface TaxInput {
  tax_no: string;
  tax_type: TaxType;
  tax_date: string;
  partner_name?: string | null;
  partner_tax_id?: string | null;
  doc_number?: string | null;
  faktur_number?: string | null;
  description?: string | null;
  base_amount: number;
  rate: number;
  status: TaxStatus;
  notes?: string | null;
  ref_type?: string | null;
  ref_id?: string | null;
}

export function computeTax(base: number, rate: number) {
  return Math.round(((Number(base) || 0) * (Number(rate) || 0)) / 100);
}

export async function saveTaxRecord(workspaceId: string, input: TaxInput, id?: string | null) {
  const payload = {
    workspace_id: workspaceId,
    tax_no: input.tax_no,
    tax_type: input.tax_type,
    tax_date: input.tax_date,
    period: periodOf(input.tax_date),
    partner_name: input.partner_name || null,
    partner_tax_id: input.partner_tax_id || null,
    doc_number: input.doc_number || null,
    faktur_number: input.faktur_number || null,
    description: input.description || null,
    base_amount: Number(input.base_amount) || 0,
    rate: Number(input.rate) || 0,
    tax_amount: computeTax(input.base_amount, input.rate),
    status: input.status,
    notes: input.notes || null,
    ref_type: input.ref_type || null,
    ref_id: input.ref_id || null,
  };
  if (id) {
    await saveWorkspaceRow({ data: { table: "tax_records", workspaceId, id, data: payload } });
  } else {
    await saveWorkspaceRow({ data: { table: "tax_records", workspaceId, data: payload } });
  }
}

interface SourceDoc {
  id: string;
  doc_number: string;
  doc_date: string;
  partner: string | null;
  subtotal: number;
  tax_amount: number;
}

/** Pulls taxable invoices (AP for input VAT, AR for output VAT) that are not recorded yet. */
export async function fetchTaxableDocuments(workspaceId: string, type: TaxType): Promise<SourceDoc[]> {
  if (type === "withholding") return [];
  const data = await fetchTaxableDocumentsFn({
    data: { workspaceId, type: type as "vat_in" | "vat_out" },
  });
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows.map((d) => ({
    id: String(d.id ?? ""),
    doc_number: String(d.doc_number ?? ""),
    doc_date: String(d.doc_date ?? ""),
    partner: (type === "vat_in" ? d.supplier_name : d.customer_name) as string | null ?? null,
    subtotal: Number(d.subtotal ?? 0),
    tax_amount: Number(d.tax_amount ?? 0),
  }));
}

/** Imports invoice tax lines that have no tax record yet. */
export async function importTaxFromDocuments(workspaceId: string, type: TaxType) {
  const docs = await fetchTaxableDocuments(workspaceId, type);
  if (!docs.length) return 0;
  const existing = await fetchTaxRecords(workspaceId, { type });
  const seen = new Set(existing.map((r) => r.ref_id ?? r.doc_number));
  const fresh = docs.filter((d) => !seen.has(d.id) && !seen.has(d.doc_number));
  if (!fresh.length) return 0;
  let seq = existing.length + 1;
  const rows = fresh.map((d) => {
    const base = d.subtotal || Math.round((d.tax_amount * 100) / VAT_RATE);
    return {
      workspace_id: workspaceId,
      tax_no: nextTaxNumber(type, seq++),
      tax_type: type,
      tax_date: d.doc_date,
      period: periodOf(d.doc_date),
      partner_name: d.partner,
      doc_number: d.doc_number,
      description: `${type === "vat_in" ? "AP" : "AR"} invoice ${d.doc_number}`,
      base_amount: base,
      rate: base > 0 ? Math.round((d.tax_amount / base) * 1000) / 10 : VAT_RATE,
      tax_amount: d.tax_amount,
      status: "draft",
      ref_type: type === "vat_in" ? "prc_document" : "sls_document",
      ref_id: d.id,
    };
  });
  await upsertWorkspaceRows({ data: { table: "tax_records", workspaceId, rows } });
  return rows.length;
}

export interface TaxPeriodSummary {
  period: string;
  vatIn: number;
  vatOut: number;
  withholding: number;
  payable: number;
}

export function buildPeriodSummary(records: TaxRecord[]): TaxPeriodSummary[] {
  const map = new Map<string, TaxPeriodSummary>();
  for (const r of records) {
    const key = r.period ?? periodOf(r.tax_date);
    const row = map.get(key) ?? { period: key, vatIn: 0, vatOut: 0, withholding: 0, payable: 0 };
    const amt = Number(r.tax_amount) || 0;
    if (r.tax_type === "vat_in") row.vatIn += amt;
    else if (r.tax_type === "vat_out") row.vatOut += amt;
    else row.withholding += amt;
    row.payable = row.vatOut - row.vatIn;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.period.localeCompare(a.period));
}

export function toCsv(records: TaxRecord[]) {
  const header = [
    "tax_no",
    "type",
    "date",
    "period",
    "partner",
    "npwp",
    "document",
    "faktur",
    "base",
    "rate",
    "tax",
    "status",
  ];
  const rows = records.map((r) =>
    [
      r.tax_no,
      r.tax_type,
      r.tax_date,
      r.period ?? "",
      r.partner_name ?? "",
      r.partner_tax_id ?? "",
      r.doc_number ?? "",
      r.faktur_number ?? "",
      r.base_amount,
      r.rate,
      r.tax_amount,
      r.status,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}