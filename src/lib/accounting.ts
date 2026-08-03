import { supabase } from "@/integrations/supabase/client";

export type AccAccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface AccEntry {
  id: string;
  workspace_id: string;
  entry_no: string;
  entry_date: string;
  source_type: string | null;
  source_id: string | null;
  source_doc_number: string | null;
  memo: string | null;
  total_debit: number;
  total_credit: number;
  is_auto: boolean;
  created_at: string;
}

export interface AccLine {
  id: string;
  entry_id: string;
  line_no: number;
  account_code: string;
  account_name: string | null;
  description: string | null;
  debit: number;
  credit: number;
}

export interface AccAccount {
  code: string;
  name: string;
  account_type: AccAccountType;
  parent_code: string | null;
}

export type AccViewKind =
  | "journals"
  | "opening-balance"
  | "ledger"
  | "trial-balance"
  | "balance-sheet"
  | "profit-loss"
  | "period-closing";

export interface AccEntity {
  submoduleId: AccViewKind;
  en: string;
  id_: string;
}

export const ACC_ENTITIES: AccEntity[] = [
  { submoduleId: "opening-balance", en: "Opening Balance", id_: "Saldo Awal" },
  { submoduleId: "journals", en: "Journal Entries", id_: "Jurnal Umum" },
  { submoduleId: "ledger", en: "General Ledger", id_: "Buku Besar" },
  { submoduleId: "trial-balance", en: "Trial Balance", id_: "Neraca Saldo" },
  { submoduleId: "balance-sheet", en: "Balance Sheet", id_: "Neraca" },
  { submoduleId: "profit-loss", en: "Profit & Loss", id_: "Laba Rugi" },
  { submoduleId: "period-closing", en: "Period Closing", id_: "Tutup Periode" },
];

export function findAccEntity(submoduleId?: string) {
  return ACC_ENTITIES.find((e) => e.submoduleId === submoduleId);
}

export const ACCOUNT_TYPE_LABEL: Record<AccAccountType, { en: string; id_: string }> = {
  asset: { en: "Assets", id_: "Aset" },
  liability: { en: "Liabilities", id_: "Kewajiban" },
  equity: { en: "Equity", id_: "Ekuitas" },
  revenue: { en: "Revenue", id_: "Pendapatan" },
  expense: { en: "Expenses", id_: "Beban" },
};

/** debit-normal account types */
export function isDebitNormal(type: AccAccountType) {
  return type === "asset" || type === "expense";
}

export interface AccountBalance {
  code: string;
  name: string;
  type: AccAccountType;
  debit: number;
  credit: number;
  /** signed balance in the account's normal direction */
  balance: number;
}

export function buildTrialBalance(
  lines: (AccLine & { account_type?: AccAccountType })[],
  accounts: AccAccount[],
): AccountBalance[] {
  const meta = new Map(accounts.map((a) => [a.code, a]));
  const map = new Map<string, AccountBalance>();
  for (const l of lines) {
    const a = meta.get(l.account_code);
    const key = l.account_code;
    const current =
      map.get(key) ??
      ({
        code: key,
        name: a?.name ?? l.account_name ?? key,
        type: (a?.account_type ?? guessType(key)) as AccAccountType,
        debit: 0,
        credit: 0,
        balance: 0,
      } satisfies AccountBalance);
    current.debit += Number(l.debit) || 0;
    current.credit += Number(l.credit) || 0;
    map.set(key, current);
  }
  const rows = [...map.values()].map((r) => ({
    ...r,
    balance: isDebitNormal(r.type) ? r.debit - r.credit : r.credit - r.debit,
  }));
  return rows.sort((a, b) => a.code.localeCompare(b.code));
}

/** fall back on the standard Indonesian COA numbering when the account is not in master data */
export function guessType(code: string): AccAccountType {
  switch (code.trim().charAt(0)) {
    case "1":
      return "asset";
    case "2":
      return "liability";
    case "3":
      return "equity";
    case "4":
      return "revenue";
    default:
      return "expense";
  }
}

export const RETAINED_EARNINGS = { code: "3900", name: "Laba Ditahan" };
export const INCOME_SUMMARY_MEMO = "Period closing";

export async function fetchAccounts(workspaceId: string) {
  const { data, error } = await supabase
    .from("md_accounts")
    .select("code,name,account_type,parent_code")
    .eq("workspace_id", workspaceId)
    .order("code");
  if (error) throw error;
  return (data ?? []) as unknown as AccAccount[];
}

export async function fetchEntries(workspaceId: string, from: string, to: string) {
  let q = supabase
    .from("acc_journal_entries")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(2000);
  if (from) q = q.gte("entry_date", from);
  if (to) q = q.lte("entry_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as AccEntry[];
}

export async function fetchLines(workspaceId: string, entryIds: string[]) {
  if (!entryIds.length) return [] as AccLine[];
  const { data, error } = await supabase
    .from("acc_journal_lines")
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("entry_id", entryIds)
    .order("line_no");
  if (error) throw error;
  return (data ?? []) as unknown as AccLine[];
}

export interface ManualLineInput {
  account_code: string;
  account_name: string;
  description: string;
  debit: number;
  credit: number;
}

export async function postManualEntry(
  workspaceId: string,
  input: { entry_no: string; entry_date: string; memo: string; lines: ManualLineInput[]; source_type?: string },
) {
  const clean = input.lines.filter((l) => l.account_code && (l.debit > 0.0001 || l.credit > 0.0001));
  if (!clean.length) throw new Error("At least one journal line is required.");
  const totalDebit = clean.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = clean.reduce((s, l) => s + Number(l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.5) throw new Error("Debit and credit must balance.");

  const { data: entry, error } = await supabase
    .from("acc_journal_entries")
    .insert({
      workspace_id: workspaceId,
      entry_no: input.entry_no,
      entry_date: input.entry_date,
      memo: input.memo || null,
      source_type: input.source_type ?? "manual",
      total_debit: totalDebit,
      total_credit: totalCredit,
      is_auto: input.source_type ? true : false,
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
      account_code: l.account_code,
      account_name: l.account_name || null,
      description: l.description || null,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
    })) as never,
  );
  if (lineError) throw lineError;
  return entryId;
}

export const OPENING_BALANCE_SOURCE = "opening_balance";

/** existing opening balance entries for the workspace */
export async function fetchOpeningBalances(workspaceId: string) {
  const { data, error } = await supabase
    .from("acc_journal_entries")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("source_type", OPENING_BALANCE_SOURCE)
    .order("entry_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as AccEntry[];
}

/* ------------------------- opening balance assurance ------------------------ */

export interface OpeningBalanceCheckRow {
  code: string;
  name: string;
  /** what the user typed (debit - credit) */
  expected: number;
  /** what is stored on the posted journal entry */
  posted: number;
  /** net movement of the account in the general ledger as of the entry date, coming from this entry */
  ledgerDelta: number;
  ok: boolean;
}

export interface OpeningBalanceCheck {
  ok: boolean;
  entryId: string;
  entryNo: string;
  entryDate: string;
  totalDebit: number;
  totalCredit: number;
  issues: string[];
  rows: OpeningBalanceCheckRow[];
}

/**
 * Re-read the posted opening balance straight from the ledger and prove it reached
 * the general ledger for the same period: every account must show exactly the
 * amount that was entered, and the entry must be balanced.
 */
export async function verifyOpeningBalance(
  workspaceId: string,
  entryId: string,
  expected: ManualLineInput[] = [],
): Promise<OpeningBalanceCheck> {
  const { data: entryData, error: entryError } = await supabase
    .from("acc_journal_entries")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", entryId)
    .maybeSingle();
  if (entryError) throw entryError;
  const entry = entryData as unknown as AccEntry | null;
  if (!entry) {
    return {
      ok: false,
      entryId,
      entryNo: "-",
      entryDate: "-",
      totalDebit: 0,
      totalCredit: 0,
      issues: ["The opening balance journal entry cannot be found in the ledger."],
      rows: [],
    };
  }

  const issues: string[] = [];

  // ledger as of the opening balance period — exactly what the GL reports read
  const periodEntries = await fetchEntries(workspaceId, "", entry.entry_date);
  const periodLines = await fetchLines(workspaceId, periodEntries.map((e) => e.id));
  const entryLines = periodLines.filter((l) => l.entry_id === entryId);

  if (!periodEntries.some((e) => e.id === entryId)) {
    issues.push("The entry is not returned by the general ledger query for its own period.");
  }
  if (!entryLines.length) issues.push("The entry has no journal lines in the general ledger.");

  const postedDebit = entryLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const postedCredit = entryLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  if (Math.abs(postedDebit - postedCredit) > 0.5) issues.push("Debit and credit of the posted entry do not balance.");
  if (Math.abs(postedDebit - Number(entry.total_debit)) > 0.5 || Math.abs(postedCredit - Number(entry.total_credit)) > 0.5) {
    issues.push("Journal line totals do not match the entry header totals.");
  }

  const codes = new Set<string>([
    ...entryLines.map((l) => l.account_code),
    ...expected.map((l) => l.account_code),
  ]);
  const accounts = await fetchAccounts(workspaceId);
  const meta = new Map(accounts.map((a) => [a.code, a]));

  const rows: OpeningBalanceCheckRow[] = [...codes].sort().map((code) => {
    const exp = expected
      .filter((l) => l.account_code === code)
      .reduce((s, l) => s + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0);
    const posted = entryLines
      .filter((l) => l.account_code === code)
      .reduce((s, l) => s + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0);
    const withEntry = periodLines
      .filter((l) => l.account_code === code)
      .reduce((s, l) => s + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0);
    const withoutEntry = periodLines
      .filter((l) => l.account_code === code && l.entry_id !== entryId)
      .reduce((s, l) => s + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0);
    const ledgerDelta = withEntry - withoutEntry;
    const ok =
      Math.abs(ledgerDelta - posted) < 0.5 && (!expected.length || Math.abs(exp - posted) < 0.5);
    return {
      code,
      name: meta.get(code)?.name ?? entryLines.find((l) => l.account_code === code)?.account_name ?? code,
      expected: exp,
      posted,
      ledgerDelta,
      ok,
    };
  });

  if (rows.some((r) => !r.ok)) issues.push("Some accounts do not reflect the entered opening balance in the ledger.");

  return {
    ok: issues.length === 0,
    entryId,
    entryNo: entry.entry_no,
    entryDate: entry.entry_date,
    totalDebit: postedDebit,
    totalCredit: postedCredit,
    issues,
    rows,
  };
}

/** Undo a posted opening balance: removes its journal lines and the entry itself. */
export async function rollbackOpeningBalance(workspaceId: string, entryId: string) {
  const { data, error } = await supabase
    .from("acc_journal_entries")
    .select("id,source_type")
    .eq("workspace_id", workspaceId)
    .eq("id", entryId)
    .maybeSingle();
  if (error) throw error;
  const row = data as unknown as { id: string; source_type: string | null } | null;
  if (!row) throw new Error("Opening balance entry not found.");
  if (row.source_type !== OPENING_BALANCE_SOURCE) {
    throw new Error("Only opening balance entries can be rolled back here.");
  }

  const { error: lineError } = await supabase
    .from("acc_journal_lines")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("entry_id", entryId);
  if (lineError) throw lineError;

  const { error: entryError } = await supabase
    .from("acc_journal_entries")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", entryId);
  if (entryError) throw entryError;
}
