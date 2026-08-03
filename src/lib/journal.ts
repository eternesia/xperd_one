import { supabase } from "@/integrations/supabase/client";
import type { PrcDoc } from "@/lib/procurement";

export const JOURNAL_ACCOUNTS = {
  inventory: { account_code: "1300", account_name: "Persediaan Barang" },
  vatIn: { account_code: "1400", account_name: "PPN Masukan" },
  payable: { account_code: "2000", account_name: "Hutang Usaha" },
  bank: { account_code: "1010", account_name: "Bank BCA" },
  receivable: { account_code: "1200", account_name: "Piutang Usaha" },
  sales: { account_code: "4000", account_name: "Pendapatan Penjualan" },
  salesReturn: { account_code: "4100", account_name: "Retur Penjualan" },
  vatOut: { account_code: "2100", account_name: "PPN Keluaran" },
  cogs: { account_code: "5000", account_name: "Harga Pokok Penjualan" },
};

interface JLine {
  account_code: string;
  account_name: string;
  description: string;
  debit: number;
  credit: number;
}

async function postJournal(
  workspaceId: string,
  doc: { id: string; doc_number: string; doc_date: string; doc_type: string; supplier_name?: string | null },
  memo: string,
  lines: JLine[],
) {
  const clean = lines.filter((l) => l.debit > 0.0001 || l.credit > 0.0001);
  if (!clean.length) return;
  const totalDebit = clean.reduce((s, l) => s + l.debit, 0);
  const totalCredit = clean.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.5) {
    throw new Error(
      `Journal for ${doc.doc_number} is not balanced (debit ${totalDebit.toFixed(2)} vs credit ${totalCredit.toFixed(2)}).`,
    );
  }
  if (clean.some((l) => !l.account_code)) {
    throw new Error(`Journal for ${doc.doc_number} has a line without a GL account mapping.`);
  }

  const { data: entry, error } = await supabase
    .from("acc_journal_entries")
    .insert({
      workspace_id: workspaceId,
      entry_no: `JV/${doc.doc_number}`,
      entry_date: doc.doc_date,
      source_type: doc.doc_type,
      source_id: doc.id,
      source_doc_number: doc.doc_number,
      memo,
      total_debit: totalDebit,
      total_credit: totalCredit,
      is_auto: true,
    } as never)
    .select("id")
    .single();
  if (error) throw error;

  const entryId = (entry as { id: string }).id;
  const { error: lineError } = await supabase.from("acc_journal_lines").insert(
    clean.map((l, i) => ({
      entry_id: entryId,
      workspace_id: workspaceId,
      line_no: i + 1,
      ...l,
    })) as never,
  );
  if (lineError) throw lineError;
}

/** Goods receipt: Dr Inventory + Dr Input VAT / Cr Accounts Payable */
export async function postGoodsReceiptJournal(
  workspaceId: string,
  doc: Pick<PrcDoc, "id" | "doc_number" | "doc_date" | "doc_type" | "supplier_name"> & {
    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    total: number;
  },
) {
  const net = Number(doc.subtotal) - Number(doc.discount_amount);
  const memo = `Goods receipt ${doc.doc_number}${doc.supplier_name ? ` · ${doc.supplier_name}` : ""}`;
  await postJournal(workspaceId, doc, memo, [
    { ...JOURNAL_ACCOUNTS.inventory, description: memo, debit: net, credit: 0 },
    { ...JOURNAL_ACCOUNTS.vatIn, description: memo, debit: Number(doc.tax_amount), credit: 0 },
    { ...JOURNAL_ACCOUNTS.payable, description: memo, debit: 0, credit: Number(doc.total) },
  ]);
}

/** Cash/bank account selected on the document, falling back to the default bank account. */
export interface FundsAccount {
  account_code?: string | null;
  account_name?: string | null;
}

export function resolveFunds(funds?: FundsAccount) {
  return {
    account_code: funds?.account_code || JOURNAL_ACCOUNTS.bank.account_code,
    account_name: funds?.account_name || JOURNAL_ACCOUNTS.bank.account_name,
  };
}

/**
 * Validate the cash/bank account selected on a payment/receipt before anything is saved:
 * the account must be mapped to a GL account that exists in the chart of accounts and is an asset.
 */
export async function assertFundsMapping(workspaceId: string, funds: FundsAccount | undefined, total: number) {
  if (!(Number(total) > 0.0001)) {
    throw new Error("Document total must be greater than zero before it can be posted.");
  }
  const code = (funds?.account_code || "").trim();
  if (!code) {
    throw new Error(
      "Select a cash/bank account with a GL mapping first — the settlement account cannot be determined.",
    );
  }
  const { data, error } = await supabase
    .from("md_accounts")
    .select("code,name,account_type,is_active")
    .eq("workspace_id", workspaceId)
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  const row = data as unknown as { code: string; name: string; account_type: string; is_active: boolean } | null;
  if (!row) throw new Error(`GL account ${code} is not found in the chart of accounts.`);
  if (!row.is_active) throw new Error(`GL account ${code} — ${row.name} is inactive.`);
  if (row.account_type !== "asset") {
    throw new Error(`GL account ${code} — ${row.name} is not an asset account and cannot be used for settlement.`);
  }
  return { account_code: row.code, account_name: row.name };
}

/** Payment: Dr Accounts Payable / Cr selected cash or bank account */
export async function postPaymentJournal(
  workspaceId: string,
  doc: Pick<PrcDoc, "id" | "doc_number" | "doc_date" | "doc_type" | "supplier_name"> & { total: number },
  funds?: FundsAccount,
) {
  const memo = `Payment ${doc.doc_number}${doc.supplier_name ? ` · ${doc.supplier_name}` : ""}`;
  const cash = resolveFunds(funds);
  await postJournal(workspaceId, doc, memo, [
    { ...JOURNAL_ACCOUNTS.payable, description: memo, debit: Number(doc.total), credit: 0 },
    { ...cash, description: memo, debit: 0, credit: Number(doc.total) },
  ]);
}

/** Purchase return: Dr Accounts Payable / Cr Inventory + Cr Input VAT */
export async function postPurchaseReturnJournal(
  workspaceId: string,
  doc: Pick<PrcDoc, "id" | "doc_number" | "doc_date" | "doc_type" | "supplier_name"> & {
    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    total: number;
  },
) {
  const net = Number(doc.subtotal) - Number(doc.discount_amount);
  const memo = `Purchase return ${doc.doc_number}${doc.supplier_name ? ` · ${doc.supplier_name}` : ""}`;
  await postJournal(workspaceId, doc, memo, [
    { ...JOURNAL_ACCOUNTS.payable, description: memo, debit: Number(doc.total), credit: 0 },
    { ...JOURNAL_ACCOUNTS.inventory, description: memo, debit: 0, credit: net },
    { ...JOURNAL_ACCOUNTS.vatIn, description: memo, debit: 0, credit: Number(doc.tax_amount) },
  ]);
}

/* ---------------------------------- SALES --------------------------------- */

interface SalesDocRef {
  id: string;
  doc_number: string;
  doc_date: string;
  doc_type: string;
  customer_name?: string | null;
  subtotal?: number;
  discount_amount?: number;
  tax_amount?: number;
  total?: number;
}

export interface SalesJournalLineInput {
  item_code: string | null;
  qty: number;
}

/** total inventory cost of the delivered/returned lines, from master item cost price */
export async function costOfLines(workspaceId: string, lines: SalesJournalLineInput[]) {
  const codes = [...new Set(lines.map((l) => l.item_code).filter(Boolean))] as string[];
  if (!codes.length) return 0;
  const { data, error } = await supabase
    .from("md_items")
    .select("code,cost_price")
    .eq("workspace_id", workspaceId)
    .in("code", codes);
  if (error) throw error;
  const map = new Map((data ?? []).map((r) => [(r as { code: string }).code, Number((r as { cost_price: number }).cost_price) || 0]));
  return lines.reduce((s, l) => s + (l.item_code ? (map.get(l.item_code) ?? 0) * (Number(l.qty) || 0) : 0), 0);
}

/** Delivery order: Dr Cost of Goods Sold / Cr Inventory */
export async function postDeliveryJournal(
  workspaceId: string,
  doc: SalesDocRef,
  lines: SalesJournalLineInput[],
) {
  const cost = await costOfLines(workspaceId, lines);
  if (cost <= 0.0001) return;
  const memo = `Delivery ${doc.doc_number}${doc.customer_name ? ` · ${doc.customer_name}` : ""}`;
  await postJournal(workspaceId, { ...doc, supplier_name: doc.customer_name } as never, memo, [
    { ...JOURNAL_ACCOUNTS.cogs, description: memo, debit: cost, credit: 0 },
    { ...JOURNAL_ACCOUNTS.inventory, description: memo, debit: 0, credit: cost },
  ]);
}

/** AR invoice: Dr Accounts Receivable / Cr Sales revenue + Cr Output VAT */
export async function postArInvoiceJournal(workspaceId: string, doc: SalesDocRef) {
  const net = Number(doc.subtotal ?? 0) - Number(doc.discount_amount ?? 0);
  const memo = `Sales invoice ${doc.doc_number}${doc.customer_name ? ` · ${doc.customer_name}` : ""}`;
  await postJournal(workspaceId, { ...doc, supplier_name: doc.customer_name } as never, memo, [
    { ...JOURNAL_ACCOUNTS.receivable, description: memo, debit: Number(doc.total ?? 0), credit: 0 },
    { ...JOURNAL_ACCOUNTS.sales, description: memo, debit: 0, credit: net },
    { ...JOURNAL_ACCOUNTS.vatOut, description: memo, debit: 0, credit: Number(doc.tax_amount ?? 0) },
  ]);
}

/** Customer receipt: Dr selected cash or bank account / Cr Accounts Receivable */
export async function postReceiptJournal(workspaceId: string, doc: SalesDocRef, funds?: FundsAccount) {
  const memo = `Receipt ${doc.doc_number}${doc.customer_name ? ` · ${doc.customer_name}` : ""}`;
  const cash = resolveFunds(funds);
  await postJournal(workspaceId, { ...doc, supplier_name: doc.customer_name } as never, memo, [
    { ...cash, description: memo, debit: Number(doc.total ?? 0), credit: 0 },
    { ...JOURNAL_ACCOUNTS.receivable, description: memo, debit: 0, credit: Number(doc.total ?? 0) },
  ]);
}

/** Sales return: Dr Sales returns + Dr Output VAT / Cr Receivable, and Dr Inventory / Cr COGS */
export async function postSalesReturnJournal(
  workspaceId: string,
  doc: SalesDocRef,
  lines: SalesJournalLineInput[],
) {
  const net = Number(doc.subtotal ?? 0) - Number(doc.discount_amount ?? 0);
  const cost = await costOfLines(workspaceId, lines);
  const memo = `Sales return ${doc.doc_number}${doc.customer_name ? ` · ${doc.customer_name}` : ""}`;
  await postJournal(workspaceId, { ...doc, supplier_name: doc.customer_name } as never, memo, [
    { ...JOURNAL_ACCOUNTS.salesReturn, description: memo, debit: net, credit: 0 },
    { ...JOURNAL_ACCOUNTS.vatOut, description: memo, debit: Number(doc.tax_amount ?? 0), credit: 0 },
    { ...JOURNAL_ACCOUNTS.receivable, description: memo, debit: 0, credit: Number(doc.total ?? 0) },
    { ...JOURNAL_ACCOUNTS.inventory, description: memo, debit: cost, credit: 0 },
    { ...JOURNAL_ACCOUNTS.cogs, description: memo, debit: 0, credit: cost },
  ]);
}
