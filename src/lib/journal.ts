import {
  fetchMdAccounts as fetchMdAccountsFn,
  fetchJournalSourceCredits,
  fetchMdItems,
  postJournalEntry,
} from "@/lib/ledger.functions";
import { listWorkspaceRows, saveWorkspaceRow } from "@/lib/data.functions";
import { movingAverageCosts } from "@/lib/inventory";
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
  /**
   * #36 (BS New 3): PPh yang dipotong pelanggan atas invoice kita. Ini bukan
   * beban dan bukan pengurang pendapatan, melainkan kredit pajak (aset) yang
   * bisa diperhitungkan saat PPh badan. Sisi pembelian (Hutang Pajak 2200)
   * menyusul bersama auto-jurnal AP Invoice (#38).
   */
  prepaidWht: { account_code: "1450", account_name: "PPh Dibayar Dimuka" },
  /** #37: uang muka yang diterima dari pelanggan (kewajiban kontrak) */
  advanceSales: { account_code: "2400", account_name: "Uang Muka Penjualan" },
  /** #37: uang muka yang kita bayarkan ke supplier (aset) */
  advancePurchase: { account_code: "1500", account_name: "Uang Muka Pembelian" },
  /** #38: barang sudah diterima tapi belum ditagih supplier (GR/IR clearing) */
  grir: { account_code: "2050", account_name: "Hutang Belum Ditagih (GR/IR)" },
  /** #38: beban default untuk pembelian jasa / non-persediaan */
  serviceExpense: { account_code: "5200", account_name: "Beban Jasa & Profesional" },
  /** #38: PPh yang kita potong dari tagihan supplier dan wajib disetor */
  whtPayable: { account_code: "2200", account_name: "Hutang Pajak" },
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

  await postJournalEntry({
    data: {
      workspaceId,
      entry: {
        entry_no: `JV/${doc.doc_number}`,
        entry_date: doc.doc_date,
        source_type: doc.doc_type,
        source_id: doc.id,
        source_doc_number: doc.doc_number,
        memo,
        total_debit: totalDebit,
        total_credit: totalCredit,
        is_auto: true,
      },
      lines: clean.map((l) => ({
        account_code: l.account_code,
        account_name: l.account_name,
        description: l.description,
        debit: l.debit,
        credit: l.credit,
      })),
    },
  });
}

/**
 * Goods receipt: Dr Persediaan / Cr Hutang Belum Ditagih (GR/IR).
 * #38 (parity New 3): PPN Masukan TIDAK lagi diakui di sini — PPN diakui di AP
 * Invoice dan hutang ke supplier baru timbul saat invoice dicatat. Karena itu
 * penerimaan barang LAMA (yang mengkredit Hutang Usaha 2000 dan mengakui PPN di
 * muka) dideteksi lewat `isLegacyGoodsReceipt` agar AP Invoice melewati barisnya.
 */
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
    { ...JOURNAL_ACCOUNTS.grir, description: `${memo} · GR/IR`, debit: 0, credit: net },
  ]);
}

/**
 * Goods Receipt yang diposting SEBELUM GR/IR dipakai mengkredit Hutang Usaha
 * (2000) dan mengakui PPN di muka. GR seperti itu sudah mencatat hutang penuh,
 * jadi AP Invoice tidak boleh menjurnal barangnya lagi.
 */
export async function isLegacyGoodsReceipt(workspaceId: string, goodsReceiptId: string) {
  const rows = (await fetchJournalSourceCredits({
    data: { workspaceId, sourceId: goodsReceiptId },
  })) as { account_code: string; credit: number }[] | null;
  return (rows ?? []).some(
    (l) => l.account_code === JOURNAL_ACCOUNTS.payable.account_code && Number(l.credit) > 0,
  );
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
  const accounts = ((await fetchMdAccountsFn({ data: { workspaceId } })) ?? []) as unknown as {
    code: string;
    name: string;
    account_type: string;
    is_active: boolean;
  }[];
  const row = accounts.find((a) => a.code === code) ?? null;
  if (!row) throw new Error(`GL account ${code} is not found in the chart of accounts.`);
  if (!row.is_active) throw new Error(`GL account ${code} — ${row.name} is inactive.`);
  if (row.account_type !== "asset") {
    throw new Error(`GL account ${code} — ${row.name} is not an asset account and cannot be used for settlement.`);
  }
  return { account_code: row.code, account_name: row.name };
}

/**
 * Payment: Dr Accounts Payable / Cr selected cash or bank account.
 * #37: kalau pembayaran ini UANG MUKA (tanpa dokumen sumber), sisi debit masuk
 * ke Uang Muka Pembelian (1500) sebagai aset, bukan pelunasan hutang usaha.
 */
export async function postPaymentJournal(
  workspaceId: string,
  doc: Pick<PrcDoc, "id" | "doc_number" | "doc_date" | "doc_type" | "supplier_name"> & { total: number },
  funds?: FundsAccount,
  options: { advance?: boolean } = {},
) {
  const memo = `${options.advance ? "Down payment" : "Payment"} ${doc.doc_number}${doc.supplier_name ? ` · ${doc.supplier_name}` : ""}`;
  const cash = resolveFunds(funds);
  const debitAcc = options.advance ? JOURNAL_ACCOUNTS.advancePurchase : JOURNAL_ACCOUNTS.payable;
  await postJournal(workspaceId, doc, memo, [
    { ...debitAcc, description: memo, debit: Number(doc.total), credit: 0 },
    { ...cash, description: memo, debit: 0, credit: Number(doc.total) },
  ]);
}

export interface ApJournalLineInput {
  item_code: string | null;
  description?: string | null;
  /** nilai baris setelah diskon, TANPA pajak */
  net: number;
  /** PPN baris (0 bila baris ini withholding) */
  vat: number;
  /** PPh baris (0 bila baris ini PPN) */
  wht: number;
}

/**
 * AP Invoice (#38, parity New 3):
 *   Dr Persediaan / GR-IR / Beban jasa (+ Dr PPN Masukan)
 *   Cr Hutang Usaha (nilai setelah potongan PPh) + Cr Hutang Pajak (PPh)
 * Baris barang yang bersumber dari Goods Receipt "baru" dibebankan ke GR/IR 2050
 * (menutup akrual penerimaan), tanpa sumber GR ke Persediaan, dan baris jasa/
 * non-persediaan ke akun beban item (atau 5200).
 */
export async function postApInvoiceJournal(
  workspaceId: string,
  doc: Pick<PrcDoc, "id" | "doc_number" | "doc_date" | "doc_type" | "supplier_name">,
  lines: ApJournalLineInput[],
  options: { hasGoodsReceiptSource: boolean; goodsReceiptId?: string | null },
) {
  const legacyReceipt =
    options.hasGoodsReceiptSource && options.goodsReceiptId
      ? await isLegacyGoodsReceipt(workspaceId, options.goodsReceiptId)
      : false;

  const codes = [...new Set(lines.map((l) => l.item_code).filter(Boolean))] as string[];
  const meta = new Map<string, { is_stocked: boolean; expense_account_code: string | null; name: string }>();
  if (codes.length) {
    const items = (await fetchMdItems({ data: { workspaceId, codes } })) as {
      code: string;
      name: string;
      item_type: string | null;
      is_stocked: number | boolean | null;
      expense_account_code: string | null;
    }[] | null;
    for (const r of items ?? []) {
      meta.set(r.code, {
        // Item jasa tidak boleh masuk Persediaan. Sampai #41 (UI `is_stocked`)
        // diporting, `item_type` yang sudah ada dipakai sebagai penentu kedua.
        is_stocked: r.is_stocked !== 0 && r.is_stocked !== false && (r.item_type ?? "goods") === "goods",
        expense_account_code: r.expense_account_code ?? null,
        name: r.name,
      });
    }
  }

  const memo = `AP invoice ${doc.doc_number}${doc.supplier_name ? ` · ${doc.supplier_name}` : ""}`;
  const debits = new Map<string, { account_code: string; account_name: string; amount: number }>();
  let vat = 0;
  let wht = 0;
  let booked = 0;

  for (const l of lines) {
    const info = l.item_code ? meta.get(l.item_code) : undefined;
    const isGoods = info ? info.is_stocked : false;
    // GR lama sudah mencatat hutang + PPN — jangan dijurnal dua kali
    if (isGoods && options.hasGoodsReceiptSource && legacyReceipt) continue;
    const target = isGoods
      ? options.hasGoodsReceiptSource
        ? JOURNAL_ACCOUNTS.grir
        : JOURNAL_ACCOUNTS.inventory
      : info?.expense_account_code
        ? { account_code: info.expense_account_code, account_name: info.name }
        : JOURNAL_ACCOUNTS.serviceExpense;
    const key = target.account_code;
    const cur = debits.get(key) ?? { ...target, amount: 0 };
    cur.amount += Number(l.net) || 0;
    debits.set(key, cur);
    vat += Number(l.vat) || 0;
    wht += Number(l.wht) || 0;
    booked += (Number(l.net) || 0) + (Number(l.vat) || 0) - (Number(l.wht) || 0);
  }

  if (!debits.size) return;

  await postJournal(workspaceId, doc, memo, [
    ...[...debits.values()].map((d) => ({
      account_code: d.account_code,
      account_name: d.account_name,
      description: memo,
      debit: d.amount,
      credit: 0,
    })),
    { ...JOURNAL_ACCOUNTS.vatIn, description: memo, debit: vat, credit: 0 },
    { ...JOURNAL_ACCOUNTS.whtPayable, description: `${memo} · PPh`, debit: 0, credit: wht },
    { ...JOURNAL_ACCOUNTS.payable, description: memo, debit: 0, credit: booked },
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
  options: { goodsReceiptId?: string | null } = {},
) {
  const net = Number(doc.subtotal) - Number(doc.discount_amount);
  const memo = `Purchase return ${doc.doc_number}${doc.supplier_name ? ` · ${doc.supplier_name}` : ""}`;
  // #38: retur atas GR "baru" (belum ditagih) membalik akrual GR/IR, bukan hutang usaha
  if (options.goodsReceiptId && !(await isLegacyGoodsReceipt(workspaceId, options.goodsReceiptId))) {
    await postJournal(workspaceId, doc, memo, [
      { ...JOURNAL_ACCOUNTS.grir, description: `${memo} · GR/IR`, debit: net, credit: 0 },
      { ...JOURNAL_ACCOUNTS.inventory, description: memo, debit: 0, credit: net },
    ]);
    return;
  }
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
  withholding_amount?: number;
}

export interface SalesJournalLineInput {
  item_code: string | null;
  qty: number;
}

/**
 * #40 (BS New 3): total HPP baris yang keluar (atau masuk kembali lewat retur),
 * memakai biaya rata-rata bergerak sampai tanggal dokumen — bukan harga jual
 * dan bukan lagi harga pokok master yang statis.
 */
export async function costOfLines(
  workspaceId: string,
  lines: SalesJournalLineInput[],
  upToDate?: string,
) {
  const codes = [...new Set(lines.map((l) => l.item_code).filter(Boolean))] as string[];
  if (!codes.length) return 0;
  const costs = await movingAverageCosts(workspaceId, codes, upToDate);
  return lines.reduce(
    (s, l) => s + (l.item_code ? (costs.get(l.item_code) ?? 0) * (Number(l.qty) || 0) : 0),
    0,
  );
}

/** Delivery order: Dr Cost of Goods Sold / Cr Inventory */
export async function postDeliveryJournal(
  workspaceId: string,
  doc: SalesDocRef,
  lines: SalesJournalLineInput[],
) {
  const cost = await costOfLines(workspaceId, lines, doc.doc_date);
  if (cost <= 0.0001) return;
  const memo = `Delivery ${doc.doc_number}${doc.customer_name ? ` · ${doc.customer_name}` : ""}`;
  await postJournal(workspaceId, { ...doc, supplier_name: doc.customer_name } as never, memo, [
    { ...JOURNAL_ACCOUNTS.cogs, description: memo, debit: cost, credit: 0 },
    { ...JOURNAL_ACCOUNTS.inventory, description: memo, debit: 0, credit: cost },
  ]);
}

/**
 * AR invoice: Dr Accounts Receivable + Dr Prepaid PPh / Cr Sales revenue +
 * Cr Output VAT.
 * #36: `total` sudah dikurangi PPh yang dipotong pelanggan, jadi sisi debit
 * piutang tetap sebesar yang benar-benar akan ditagih, dan bagian PPh masuk ke
 * akun kredit pajak 1450 supaya jurnal tetap seimbang.
 */
export async function postArInvoiceJournal(workspaceId: string, doc: SalesDocRef) {
  const net = Number(doc.subtotal ?? 0) - Number(doc.discount_amount ?? 0);
  const wht = Number(doc.withholding_amount ?? 0);
  const memo = `Sales invoice ${doc.doc_number}${doc.customer_name ? ` · ${doc.customer_name}` : ""}`;
  await postJournal(workspaceId, { ...doc, supplier_name: doc.customer_name } as never, memo, [
    { ...JOURNAL_ACCOUNTS.receivable, description: memo, debit: Number(doc.total ?? 0), credit: 0 },
    { ...JOURNAL_ACCOUNTS.prepaidWht, description: `${memo} · PPh`, debit: wht, credit: 0 },
    { ...JOURNAL_ACCOUNTS.sales, description: memo, debit: 0, credit: net },
    { ...JOURNAL_ACCOUNTS.vatOut, description: memo, debit: 0, credit: Number(doc.tax_amount ?? 0) },
  ]);
}

/**
 * Customer receipt: Dr selected cash or bank account / Cr Accounts Receivable.
 * #37: kalau receipt ini UANG MUKA (tanpa dokumen sumber), sisi kredit masuk ke
 * Uang Muka Penjualan (2400) — kewajiban kontrak, bukan pelunasan piutang.
 */
export async function postReceiptJournal(
  workspaceId: string,
  doc: SalesDocRef,
  funds?: FundsAccount,
  options: { advance?: boolean } = {},
) {
  const memo = `${options.advance ? "Down payment" : "Receipt"} ${doc.doc_number}${doc.customer_name ? ` · ${doc.customer_name}` : ""}`;
  const cash = resolveFunds(funds);
  const creditAcc = options.advance ? JOURNAL_ACCOUNTS.advanceSales : JOURNAL_ACCOUNTS.receivable;
  await postJournal(workspaceId, { ...doc, supplier_name: doc.customer_name } as never, memo, [
    { ...cash, description: memo, debit: Number(doc.total ?? 0), credit: 0 },
    { ...creditAcc, description: memo, debit: 0, credit: Number(doc.total ?? 0) },
  ]);
}

/* ------------------------------- Uang muka (#37) --------------------------- */

export type AdvanceSide = "ar" | "ap";

function advanceCfg(side: AdvanceSide) {
  return side === "ar"
    ? { table: "sls_documents", partner: "customer_name", docType: "sales_receipt" }
    : { table: "prc_documents", partner: "supplier_name", docType: "purchase_payment" };
}

/**
 * Saldo uang muka yang BELUM dipakai untuk satu partner. Dokumen ber-
 * `advance_kind = 'advance'` menambah saldo, `'application'` (dokumen settlement
 * otomatis saat uang muka dipotongkan ke invoice) mengurangi saldo itu.
 */
export async function availableAdvance(side: AdvanceSide, workspaceId: string, partner: string) {
  if (!partner) return 0;
  const cfg = advanceCfg(side);
  const data = await listWorkspaceRows({
    data: {
      table: cfg.table,
      workspaceId,
      orderBy: "doc_date",
      orderDir: "desc",
      limit: 500,
      filters: { doc_type: cfg.docType, [cfg.partner]: partner },
      inFilters: { advance_kind: ["advance", "application"] },
    },
  });
  const rows = (data?.rows ?? []) as unknown as {
    total: number;
    advance_kind: string | null;
    status: string;
  }[];
  return rows
    .filter((r) => r.status !== "draft" && r.status !== "cancelled")
    .reduce((s, r) => s + (r.advance_kind === "advance" ? 1 : -1) * (Number(r.total) || 0), 0);
}

/**
 * Potongkan uang muka yang masih terbuka ke invoice yang baru diposting.
 * Dibuat dokumen settlement (`<invoice>-UM`, `advance_kind = 'application'`) agar
 * sisa tagihan, kartu AR/AP, dan aging tetap konsisten:
 *   AR: Dr Uang Muka Penjualan / Cr Piutang Usaha
 *   AP: Dr Hutang Usaha / Cr Uang Muka Pembelian
 * Mengembalikan nilai yang berhasil dipotongkan.
 */
export async function applyAdvanceToInvoice(
  side: AdvanceSide,
  workspaceId: string,
  invoice: { id: string; doc_number: string; doc_date: string; partner: string; total: number },
) {
  const available = await availableAdvance(side, workspaceId, invoice.partner);
  const amount = Math.round(Math.min(available, Number(invoice.total) || 0) * 100) / 100;
  if (amount <= 0.009) return 0;
  const cfg = advanceCfg(side);
  const doc_number = `${invoice.doc_number}-UM`;
  const created = await saveWorkspaceRow({
    data: {
      table: cfg.table,
      workspaceId,
      data: {
        doc_type: cfg.docType,
        doc_number,
        doc_date: invoice.doc_date,
        status: "paid",
        [cfg.partner]: invoice.partner,
        source_document_id: invoice.id,
        source_doc_number: invoice.doc_number,
        subtotal: amount,
        discount_amount: 0,
        tax_amount: 0,
        withholding_amount: 0,
        total: amount,
        advance_kind: "application",
        reference: invoice.doc_number,
        notes: "Auto-applied down payment",
      },
    },
  });
  const id = created.id;
  const memo = `Down payment applied to ${invoice.doc_number} · ${invoice.partner}`;
  await postJournal(
    workspaceId,
    { id, doc_number, doc_date: invoice.doc_date, doc_type: cfg.docType, supplier_name: invoice.partner },
    memo,
    side === "ar"
      ? [
          { ...JOURNAL_ACCOUNTS.advanceSales, description: memo, debit: amount, credit: 0 },
          { ...JOURNAL_ACCOUNTS.receivable, description: memo, debit: 0, credit: amount },
        ]
      : [
          { ...JOURNAL_ACCOUNTS.payable, description: memo, debit: amount, credit: 0 },
          { ...JOURNAL_ACCOUNTS.advancePurchase, description: memo, debit: 0, credit: amount },
        ],
  );
  const fully = amount + 0.01 >= Number(invoice.total);
  await saveWorkspaceRow({
    data: {
      table: cfg.table,
      workspaceId,
      id: invoice.id,
      data: { status: fully ? "closed" : "partial" },
    },
  });
  return amount;
}

/** Sales return: Dr Sales returns + Dr Output VAT / Cr Receivable, and Dr Inventory / Cr COGS */
export async function postSalesReturnJournal(
  workspaceId: string,
  doc: SalesDocRef,
  lines: SalesJournalLineInput[],
) {
  const net = Number(doc.subtotal ?? 0) - Number(doc.discount_amount ?? 0);
  const cost = await costOfLines(workspaceId, lines, doc.doc_date);
  const wht = Number(doc.withholding_amount ?? 0);
  const memo = `Sales return ${doc.doc_number}${doc.customer_name ? ` · ${doc.customer_name}` : ""}`;
  await postJournal(workspaceId, { ...doc, supplier_name: doc.customer_name } as never, memo, [
    { ...JOURNAL_ACCOUNTS.salesReturn, description: memo, debit: net, credit: 0 },
    { ...JOURNAL_ACCOUNTS.vatOut, description: memo, debit: Number(doc.tax_amount ?? 0), credit: 0 },
    // #36: retur membalik kredit pajak yang tadinya diakui di invoice
    { ...JOURNAL_ACCOUNTS.prepaidWht, description: `${memo} · PPh`, debit: 0, credit: wht },
    { ...JOURNAL_ACCOUNTS.receivable, description: memo, debit: 0, credit: Number(doc.total ?? 0) },
    { ...JOURNAL_ACCOUNTS.inventory, description: memo, debit: cost, credit: 0 },
    { ...JOURNAL_ACCOUNTS.cogs, description: memo, debit: 0, credit: cost },
  ]);
}
