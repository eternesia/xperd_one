import {
  fetchCbAccounts as fetchCbAccountsFn,
  fetchCbTransactions as fetchCbTransactionsFn,
  insertCbTransaction,
  postJournalEntry,
} from "@/lib/ledger.functions";

export type CbAccountKind = "cash" | "bank";
export type CbTrxType = "in" | "out" | "transfer";

export interface CbAccount {
  id: string;
  workspace_id: string;
  code: string;
  name: string;
  account_kind: CbAccountKind;
  gl_account_code: string | null;
  bank_name: string | null;
  account_number: string | null;
  currency: string;
  opening_balance: number;
  is_active: boolean;
  created_at: string;
}

export interface CbTransaction {
  id: string;
  workspace_id: string;
  trx_no: string;
  trx_date: string;
  trx_type: CbTrxType;
  account_code: string;
  account_name: string | null;
  counterpart_account_code: string | null;
  counterpart_account_name: string | null;
  category_account_code: string | null;
  category_account_name: string | null;
  contact_name: string | null;
  method: string;
  reference: string | null;
  memo: string | null;
  /** #12/#13 (BS New): gambar bukti transaksi (data URL di Old). */
  attachment_url?: string | null;
  amount: number;
  is_reconciled: boolean;
  reconciled_at: string | null;
  journal_entry_id: string | null;
  created_at: string;
}

export type CbViewKind = "accounts" | "ledger" | "reconciliation";

export interface CbEntity {
  submoduleId: string;
  kind: CbViewKind;
  en: string;
  id_: string;
  trxType?: CbTrxType;
}

export const CB_ENTITIES: CbEntity[] = [
  { submoduleId: "accounts", kind: "accounts", en: "Cash & Bank Accounts", id_: "Akun Kas & Bank" },
  { submoduleId: "cash-in", kind: "ledger", en: "Cash In", id_: "Kas Masuk", trxType: "in" },
  { submoduleId: "cash-out", kind: "ledger", en: "Cash Out", id_: "Kas Keluar", trxType: "out" },
  { submoduleId: "transfers", kind: "ledger", en: "Fund Transfers", id_: "Transfer Dana", trxType: "transfer" },
  { submoduleId: "reconciliation", kind: "reconciliation", en: "Reconciliation", id_: "Rekonsiliasi Bank" },
];

export function findCbEntity(submoduleId?: string) {
  return CB_ENTITIES.find((e) => e.submoduleId === submoduleId);
}

export const TRX_LABEL: Record<CbTrxType, { en: string; id_: string }> = {
  in: { en: "Cash In", id_: "Kas Masuk" },
  out: { en: "Cash Out", id_: "Kas Keluar" },
  transfer: { en: "Transfer", id_: "Transfer" },
};

export const TRX_TONE: Record<CbTrxType, string> = {
  in: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  out: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  transfer: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
};

export const PAYMENT_METHODS = ["cash", "transfer", "card", "qris", "cheque"] as const;

export function nextTrxNumber(prefix: string, seq: number) {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${prefix}/${ym}/${String(seq).padStart(4, "0")}`;
}

export async function fetchCbAccounts(workspaceId: string) {
  const data = await fetchCbAccountsFn({ data: { workspaceId } });
  return (data ?? []) as unknown as CbAccount[];
}

export async function fetchCbTransactions(
  workspaceId: string,
  filters: { from?: string; to?: string; type?: CbTrxType } = {},
) {
  const data = await fetchCbTransactionsFn({
    data: {
      workspaceId,
      from: filters.from || undefined,
      to: filters.to || undefined,
      type: filters.type || undefined,
    },
  });
  return (data ?? []) as unknown as CbTransaction[];
}

export interface CbBalance {
  account: CbAccount;
  inflow: number;
  outflow: number;
  balance: number;
  unreconciled: number;
}

export function buildCbBalances(accounts: CbAccount[], trx: CbTransaction[]): CbBalance[] {
  return accounts.map((account) => {
    let inflow = 0;
    let outflow = 0;
    let unreconciled = 0;
    for (const t of trx) {
      const amt = Number(t.amount) || 0;
      const isSource = t.account_code === account.code;
      const isTarget = t.counterpart_account_code === account.code;
      if (!isSource && !isTarget) continue;
      if (t.trx_type === "in" && isSource) inflow += amt;
      else if (t.trx_type === "out" && isSource) outflow += amt;
      else if (t.trx_type === "transfer") {
        if (isSource) outflow += amt;
        if (isTarget) inflow += amt;
      }
      if (!t.is_reconciled && isSource) unreconciled += t.trx_type === "in" ? amt : -amt;
    }
    return {
      account,
      inflow,
      outflow,
      unreconciled,
      balance: Number(account.opening_balance || 0) + inflow - outflow,
    };
  });
}

interface JournalLine {
  account_code: string;
  account_name: string | null;
  description: string;
  debit: number;
  credit: number;
}

async function postCbJournal(
  workspaceId: string,
  trx: { trx_no: string; trx_date: string; trx_type: CbTrxType },
  memo: string,
  lines: JournalLine[],
) {
  const clean = lines.filter((l) => l.account_code && (l.debit > 0.0001 || l.credit > 0.0001));
  if (clean.length < 2) return null;
  const totalDebit = clean.reduce((s, l) => s + l.debit, 0);
  const totalCredit = clean.reduce((s, l) => s + l.credit, 0);

  const data = await postJournalEntry({
    data: {
      workspaceId,
      entry: {
        entry_no: `JV/${trx.trx_no}`,
        entry_date: trx.trx_date,
        source_type: `cash_${trx.trx_type}`,
        source_doc_number: trx.trx_no,
        memo,
        total_debit: totalDebit,
        total_credit: totalCredit,
        is_auto: true,
      },
      lines: clean.map((l) => ({
        account_code: l.account_code,
        account_name: l.account_name ?? null,
        description: l.description,
        debit: l.debit,
        credit: l.credit,
      })),
    },
  });
  return data.entryId;
}

export interface CbTrxInput {
  trx_no: string;
  trx_date: string;
  trx_type: CbTrxType;
  account: CbAccount;
  counterpart?: CbAccount | null;
  category_account_code?: string | null;
  category_account_name?: string | null;
  contact_name?: string | null;
  method: string;
  reference?: string | null;
  memo?: string | null;
  attachment_url?: string | null;
  amount: number;
}

/** Creates a cash/bank transaction and its automatic journal entry. */
export async function createCbTransaction(workspaceId: string, input: CbTrxInput) {
  const amount = Number(input.amount) || 0;
  if (amount <= 0) throw new Error("Amount must be greater than zero.");

  const cashGl = input.account.gl_account_code || "1010";
  const memo =
    input.memo ||
    `${TRX_LABEL[input.trx_type].en} ${input.trx_no}${input.contact_name ? ` · ${input.contact_name}` : ""}`;

  let lines: JournalLine[] = [];
  if (input.trx_type === "in") {
    if (!input.category_account_code) throw new Error("Select a source (revenue/receivable) account.");
    lines = [
      { account_code: cashGl, account_name: input.account.name, description: memo, debit: amount, credit: 0 },
      {
        account_code: input.category_account_code,
        account_name: input.category_account_name ?? null,
        description: memo,
        debit: 0,
        credit: amount,
      },
    ];
  } else if (input.trx_type === "out") {
    if (!input.category_account_code) throw new Error("Select an expense/payable account.");
    lines = [
      {
        account_code: input.category_account_code,
        account_name: input.category_account_name ?? null,
        description: memo,
        debit: amount,
        credit: 0,
      },
      { account_code: cashGl, account_name: input.account.name, description: memo, debit: 0, credit: amount },
    ];
  } else {
    if (!input.counterpart) throw new Error("Select a destination account.");
    const destGl = input.counterpart.gl_account_code || "1010";
    lines = [
      { account_code: destGl, account_name: input.counterpart.name, description: memo, debit: amount, credit: 0 },
      { account_code: cashGl, account_name: input.account.name, description: memo, debit: 0, credit: amount },
    ];
  }

  const journalEntryId = await postCbJournal(
    workspaceId,
    { trx_no: input.trx_no, trx_date: input.trx_date, trx_type: input.trx_type },
    memo,
    lines,
  );

  await insertCbTransaction({
    data: {
      workspaceId,
      trx: {
        trx_no: input.trx_no,
        trx_date: input.trx_date,
        trx_type: input.trx_type,
        account_code: input.account.code,
        account_name: input.account.name,
        counterpart_account_code: input.counterpart?.code ?? null,
        counterpart_account_name: input.counterpart?.name ?? null,
        category_account_code: input.category_account_code ?? null,
        category_account_name: input.category_account_name ?? null,
        contact_name: input.contact_name || null,
        method: input.method,
        reference: input.reference || null,
        memo,
        attachment_url: input.attachment_url ?? null,
        amount,
        journal_entry_id: journalEntryId,
      },
    },
  });
}
