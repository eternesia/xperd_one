import {
  deleteJournalEntry,
  fetchCashAccountCodes as fetchCashAccountCodesFn,
  fetchJournalEntries,
  fetchJournalLines,
  fetchMdAccounts,
  fetchOpeningBalances as fetchOpeningBalancesFn,
  postJournalEntry,
} from "@/lib/ledger.functions";

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
  | "cash-flow"
  | "equity-changes"
  // #45 (BS New 3): subledger piutang/hutang.
  | "ar-card"
  | "ap-card"
  | "ar-aging"
  | "ap-aging"
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
  { submoduleId: "cash-flow", en: "Cash Flow Statement", id_: "Laporan Arus Kas" },
  { submoduleId: "equity-changes", en: "Changes in Equity", id_: "Perubahan Ekuitas" },
  // #45 (BS New 3): kartu & umur piutang/hutang per partner.
  { submoduleId: "ar-card", en: "AR Card", id_: "Kartu Piutang" },
  { submoduleId: "ap-card", en: "AP Card", id_: "Kartu Hutang" },
  { submoduleId: "ar-aging", en: "AR Aging", id_: "Umur Piutang" },
  { submoduleId: "ap-aging", en: "AP Aging", id_: "Umur Hutang" },
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
  const data = await fetchMdAccounts({ data: { workspaceId } });
  return (data ?? []) as unknown as AccAccount[];
}

export async function fetchEntries(workspaceId: string, from: string, to: string) {
  const data = await fetchJournalEntries({
    data: { workspaceId, from: from || undefined, to: to || undefined },
  });
  return (data ?? []) as unknown as AccEntry[];
}

export async function fetchLines(workspaceId: string, entryIds: string[]) {
  const data = await fetchJournalLines({ data: { workspaceId, entryIds } });
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

  const data = await postJournalEntry({
    data: {
      workspaceId,
      entry: {
        entry_no: input.entry_no,
        entry_date: input.entry_date,
        memo: input.memo || null,
        source_type: input.source_type ?? "manual",
        total_debit: totalDebit,
        total_credit: totalCredit,
        is_auto: input.source_type ? true : false,
      },
      lines: clean.map((l) => ({
        account_code: l.account_code,
        account_name: l.account_name || null,
        description: l.description || null,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      })),
    },
  });
  return data.entryId;
}

export const OPENING_BALANCE_SOURCE = "opening_balance";

/** existing opening balance entries for the workspace */
export async function fetchOpeningBalances(workspaceId: string) {
  const data = await fetchOpeningBalancesFn({ data: { workspaceId } });
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
  const entries = (await fetchEntries(workspaceId, "", "")) as AccEntry[];
  const entry = entries.find((e) => e.id === entryId) ?? null;
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
  const entries = (await fetchEntries(workspaceId, "", "")) as AccEntry[];
  const row = entries.find((e) => e.id === entryId);
  if (!row) throw new Error("Opening balance entry not found.");
  if (row.source_type !== OPENING_BALANCE_SOURCE) {
    throw new Error("Only opening balance entries can be rolled back here.");
  }
  await deleteJournalEntry({ data: { workspaceId, entryId } });
}

/* ------------------------------- cash flow -------------------------------- */

export type CashFlowGroup = "operating" | "investing" | "financing";

export const CASH_FLOW_GROUP_LABEL: Record<CashFlowGroup, { en: string; id_: string }> = {
  operating: { en: "Operating activities", id_: "Aktivitas operasi" },
  investing: { en: "Investing activities", id_: "Aktivitas investasi" },
  financing: { en: "Financing activities", id_: "Aktivitas pendanaan" },
};

export interface CashFlowRow {
  group: CashFlowGroup;
  code: string;
  name: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface CashFlowResult {
  rows: CashFlowRow[];
  totals: Record<CashFlowGroup, number>;
  opening: number;
  netChange: number;
  closing: number;
}

/** Classify the counterpart account of a cash movement into a cash-flow activity. */
export function classifyCashFlow(code: string, type: AccAccountType): CashFlowGroup {
  const c = code.trim();
  if (c.startsWith("17") || c.startsWith("18")) return "investing";
  if (type === "equity") return "financing";
  // long-term / loan liabilities (23xx–26xx) are financing; payables and taxes stay operating
  if (type === "liability" && /^2[3-6]/.test(c)) return "financing";
  return "operating";
}

/** Fetch the GL account codes that represent cash & bank for this workspace. */
export async function fetchCashAccountCodes(workspaceId: string) {
  const data = await fetchCashAccountCodesFn({ data: { workspaceId } });
  return (data ?? []) as string[];
}

/** Direct-method cash flow built from journal postings that touch a cash account. */
export function buildCashFlow(
  entries: AccEntry[],
  lines: AccLine[],
  accounts: AccAccount[],
  cashCodes: string[],
  openingCash: number,
): CashFlowResult {
  const cash = new Set(cashCodes);
  const meta = new Map(accounts.map((a) => [a.code, a]));
  const byEntry = new Map<string, AccLine[]>();
  for (const l of lines) {
    const list = byEntry.get(l.entry_id) ?? [];
    list.push(l);
    byEntry.set(l.entry_id, list);
  }

  const map = new Map<string, CashFlowRow>();
  const totals: Record<CashFlowGroup, number> = { operating: 0, investing: 0, financing: 0 };

  for (const entry of entries) {
    const group = byEntry.get(entry.id) ?? [];
    const cashLines = group.filter((l) => cash.has(l.account_code));
    if (!cashLines.length) continue;
    const cashDelta = cashLines.reduce((s, l) => s + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0);
    if (Math.abs(cashDelta) < 0.005) continue;

    const others = group.filter((l) => !cash.has(l.account_code));
    const weights = others.map((l) => Math.abs((Number(l.debit) || 0) - (Number(l.credit) || 0)));
    const weightSum = weights.reduce((s, w) => s + w, 0);
    const targets = others.length && weightSum > 0
      ? others.map((l, i) => ({ line: l, share: (weights[i] / weightSum) * cashDelta }))
      : [{ line: { account_code: "—", account_name: entry.memo ?? "Unclassified" } as AccLine, share: cashDelta }];

    for (const { line, share } of targets) {
      const account = meta.get(line.account_code);
      const type = (account?.account_type ?? guessType(line.account_code)) as AccAccountType;
      const g = classifyCashFlow(line.account_code, type);
      const key = `${g}:${line.account_code}`;
      const row =
        map.get(key) ??
        ({
          group: g,
          code: line.account_code,
          name: account?.name ?? line.account_name ?? line.account_code,
          inflow: 0,
          outflow: 0,
          net: 0,
        } satisfies CashFlowRow);
      if (share >= 0) row.inflow += share;
      else row.outflow += -share;
      row.net += share;
      map.set(key, row);
      totals[g] += share;
    }
  }

  const rows = [...map.values()].sort((a, b) => (a.group === b.group ? a.code.localeCompare(b.code) : a.group.localeCompare(b.group)));
  const netChange = totals.operating + totals.investing + totals.financing;
  return { rows, totals, opening: openingCash, netChange, closing: openingCash + netChange };
}

export function cashBalanceOf(lines: AccLine[], cashCodes: string[]) {
  const cash = new Set(cashCodes);
  return lines
    .filter((l) => cash.has(l.account_code))
    .reduce((s, l) => s + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0);
}

/* --------------------------- changes in equity ---------------------------- */

export interface EquityMovementRow {
  code: string;
  name: string;
  opening: number;
  movement: number;
  closing: number;
}

export interface EquityStatement {
  rows: EquityMovementRow[];
  openingTotal: number;
  netIncome: number;
  movementTotal: number;
  closingTotal: number;
}

/** Statement of changes in equity: opening equity + period result + equity movements. */
export function buildEquityStatement(
  openingLines: AccLine[],
  periodLines: AccLine[],
  accounts: AccAccount[],
): EquityStatement {
  const opening = buildTrialBalance(openingLines, accounts);
  const period = buildTrialBalance(periodLines, accounts);

  const openingEquity = opening.filter((r) => r.type === "equity");
  const periodEquity = period.filter((r) => r.type === "equity");
  const openingResult =
    opening.filter((r) => r.type === "revenue").reduce((s, r) => s + r.balance, 0) -
    opening.filter((r) => r.type === "expense").reduce((s, r) => s + r.balance, 0);
  const netIncome =
    period.filter((r) => r.type === "revenue").reduce((s, r) => s + r.balance, 0) -
    period.filter((r) => r.type === "expense").reduce((s, r) => s + r.balance, 0);

  const codes = [...new Set([...openingEquity.map((r) => r.code), ...periodEquity.map((r) => r.code)])].sort();
  const rows: EquityMovementRow[] = codes.map((code) => {
    const o = openingEquity.find((r) => r.code === code);
    const p = periodEquity.find((r) => r.code === code);
    const openingValue = o?.balance ?? 0;
    const movement = p?.balance ?? 0;
    return {
      code,
      name: o?.name ?? p?.name ?? code,
      opening: openingValue,
      movement,
      closing: openingValue + movement,
    };
  });

  const openingTotal = openingEquity.reduce((s, r) => s + r.balance, 0) + openingResult;
  const movementTotal = periodEquity.reduce((s, r) => s + r.balance, 0);
  return {
    rows,
    openingTotal,
    netIncome,
    movementTotal,
    closingTotal: openingTotal + movementTotal + netIncome,
  };
}
