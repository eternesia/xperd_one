import {
  fetchFaAssets,
  fetchFaDepreciations,
  postDepreciationRows,
  postJournalEntry,
  updateFaAsset,
} from "@/lib/ledger.functions";

export type FaMethod = "straight_line" | "declining";
export type FaStatus = "active" | "disposed" | "written_off";

export interface FaAsset {
  id: string;
  workspace_id: string;
  code: string;
  name: string;
  category: string | null;
  acquisition_date: string;
  acquisition_cost: number;
  salvage_value: number;
  useful_life_months: number;
  method: FaMethod;
  asset_account_code: string | null;
  accum_account_code: string | null;
  expense_account_code: string | null;
  location: string | null;
  status: FaStatus;
  accumulated_depreciation: number;
  disposal_date: string | null;
  disposal_amount: number | null;
  notes: string | null;
  created_at: string;
}

export interface FaDepreciation {
  id: string;
  workspace_id: string;
  asset_id: string;
  asset_code: string | null;
  asset_name: string | null;
  period_date: string;
  amount: number;
  book_value_after: number;
  journal_entry_id: string | null;
  created_at: string;
}

export type FaViewKind = "assets" | "depreciation" | "disposal";

export interface FaEntity {
  submoduleId: FaViewKind;
  en: string;
  id_: string;
}

export const FA_ENTITIES: FaEntity[] = [
  { submoduleId: "assets", en: "Asset Register", id_: "Daftar Aset" },
  { submoduleId: "depreciation", en: "Depreciation", id_: "Penyusutan" },
  { submoduleId: "disposal", en: "Disposal", id_: "Pelepasan Aset" },
];

export function findFaEntity(submoduleId?: string) {
  return FA_ENTITIES.find((e) => e.submoduleId === submoduleId);
}

export const FA_METHOD_LABEL: Record<FaMethod, { en: string; id_: string }> = {
  straight_line: { en: "Straight line", id_: "Garis lurus" },
  declining: { en: "Declining balance", id_: "Saldo menurun" },
};

export const FA_STATUS_LABEL: Record<FaStatus, { en: string; id_: string }> = {
  active: { en: "Active", id_: "Aktif" },
  disposed: { en: "Disposed", id_: "Dilepas" },
  written_off: { en: "Written off", id_: "Dihapusbukukan" },
};

export const FA_STATUS_TONE: Record<FaStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  disposed: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  written_off: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

/** Default ledger accounts used when the asset has no explicit mapping. */
export const FA_DEFAULTS = {
  asset: { code: "1500", name: "Aset Tetap" },
  accum: { code: "1590", name: "Akumulasi Penyusutan" },
  expense: { code: "6300", name: "Beban Penyusutan" },
  cash: { code: "1010", name: "Kas" },
  gain: { code: "4900", name: "Laba Pelepasan Aset" },
  loss: { code: "6900", name: "Rugi Pelepasan Aset" },
};

export function nextAssetCode(seq: number) {
  return `FA-${String(seq).padStart(4, "0")}`;
}

export function monthEnd(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m, 0).toISOString().slice(0, 10);
}

export function bookValue(asset: FaAsset) {
  return Number(asset.acquisition_cost || 0) - Number(asset.accumulated_depreciation || 0);
}

/** Depreciation charge for one month, capped at the remaining depreciable value. */
export function monthlyCharge(asset: FaAsset) {
  const cost = Number(asset.acquisition_cost || 0);
  const salvage = Number(asset.salvage_value || 0);
  const accum = Number(asset.accumulated_depreciation || 0);
  const life = Math.max(1, Number(asset.useful_life_months || 1));
  const remaining = Math.max(0, cost - salvage - accum);
  if (remaining <= 0) return 0;
  const raw = asset.method === "declining" ? ((cost - accum) * 2) / life : (cost - salvage) / life;
  return Math.round(Math.min(raw, remaining));
}

export async function fetchAssets(workspaceId: string) {
  const data = await fetchFaAssets({ data: { workspaceId } });
  return (data ?? []) as unknown as FaAsset[];
}

export async function fetchDepreciations(workspaceId: string, filters: { from?: string; to?: string } = {}) {
  const data = await fetchFaDepreciations({
    data: { workspaceId, from: filters.from || undefined, to: filters.to || undefined },
  });
  return (data ?? []) as unknown as FaDepreciation[];
}

interface JournalLine {
  account_code: string;
  account_name: string | null;
  description: string;
  debit: number;
  credit: number;
}

async function postJournal(
  workspaceId: string,
  meta: { entry_no: string; entry_date: string; source_type: string; source_doc_number: string; memo: string },
  lines: JournalLine[],
) {
  const clean = lines.filter((l) => l.account_code && (l.debit > 0.4 || l.credit > 0.4));
  if (clean.length < 2) return null;
  const totalDebit = clean.reduce((s, l) => s + l.debit, 0);
  const totalCredit = clean.reduce((s, l) => s + l.credit, 0);
  const data = await postJournalEntry({
    data: {
      workspaceId,
      entry: {
        entry_no: meta.entry_no,
        entry_date: meta.entry_date,
        source_type: meta.source_type,
        source_doc_number: meta.source_doc_number,
        memo: meta.memo,
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

/** Posts monthly depreciation for every active asset that still has book value. */
export async function runDepreciation(workspaceId: string, period: string) {
  const periodDate = monthEnd(period);
  const assets = await fetchAssets(workspaceId);
  const existing = ((await fetchFaDepreciations({ data: { workspaceId, from: periodDate, to: periodDate } })) ?? []) as {
    asset_id: string;
  }[];
  const done = new Set(existing.map((r) => r.asset_id));
  const eligible = assets.filter(
    (a) => a.status === "active" && !done.has(a.id) && a.acquisition_date <= periodDate && monthlyCharge(a) > 0,
  );
  if (!eligible.length) return { posted: 0, total: 0 };

  let total = 0;
  const lines: JournalLine[] = [];
  const rows: Record<string, unknown>[] = [];
  for (const asset of eligible) {
    const amount = monthlyCharge(asset);
    total += amount;
    const accum = Number(asset.accumulated_depreciation || 0) + amount;
    rows.push({
      workspace_id: workspaceId,
      asset_id: asset.id,
      asset_code: asset.code,
      asset_name: asset.name,
      period_date: periodDate,
      amount,
      book_value_after: Number(asset.acquisition_cost || 0) - accum,
    });
    lines.push({
      account_code: asset.expense_account_code || FA_DEFAULTS.expense.code,
      account_name: FA_DEFAULTS.expense.name,
      description: `${asset.code} · ${asset.name}`,
      debit: amount,
      credit: 0,
    });
    lines.push({
      account_code: asset.accum_account_code || FA_DEFAULTS.accum.code,
      account_name: FA_DEFAULTS.accum.name,
      description: `${asset.code} · ${asset.name}`,
      debit: 0,
      credit: amount,
    });
  }

  const entryId = await postJournal(
    workspaceId,
    {
      entry_no: `JV/DEP/${period.replace("-", "")}`,
      entry_date: periodDate,
      source_type: "fa_depreciation",
      source_doc_number: `DEP/${period}`,
      memo: `Depreciation ${period}`,
    },
    lines,
  );

  await postDepreciationRows({
    data: {
      workspaceId,
      rows: rows.map((r) => ({ ...r, journal_entry_id: entryId })),
      accumulatedUpdates: eligible.map((a) => ({
        id: a.id,
        accumulated_depreciation: Number(a.accumulated_depreciation || 0) + monthlyCharge(a),
      })),
    },
  });
  return { posted: eligible.length, total };
}

export interface DisposalInput {
  asset: FaAsset;
  disposal_date: string;
  disposal_amount: number;
  cash_account_code?: string | null;
  write_off?: boolean;
  notes?: string | null;
}

/** Removes the asset from the books and posts the gain / loss journal. */
export async function disposeAsset(workspaceId: string, input: DisposalInput) {
  const { asset } = input;
  const cost = Number(asset.acquisition_cost || 0);
  const accum = Number(asset.accumulated_depreciation || 0);
  const net = cost - accum;
  const proceeds = input.write_off ? 0 : Number(input.disposal_amount) || 0;
  const result = proceeds - net;
  const lines: JournalLine[] = [
    {
      account_code: asset.accum_account_code || FA_DEFAULTS.accum.code,
      account_name: FA_DEFAULTS.accum.name,
      description: `Disposal ${asset.code}`,
      debit: accum,
      credit: 0,
    },
  ];
  if (proceeds > 0) {
    lines.push({
      account_code: input.cash_account_code || FA_DEFAULTS.cash.code,
      account_name: FA_DEFAULTS.cash.name,
      description: `Disposal ${asset.code}`,
      debit: proceeds,
      credit: 0,
    });
  }
  if (result < 0) {
    lines.push({
      account_code: FA_DEFAULTS.loss.code,
      account_name: FA_DEFAULTS.loss.name,
      description: `Disposal ${asset.code}`,
      debit: Math.abs(result),
      credit: 0,
    });
  }
  lines.push({
    account_code: asset.asset_account_code || FA_DEFAULTS.asset.code,
    account_name: FA_DEFAULTS.asset.name,
    description: `Disposal ${asset.code}`,
    debit: 0,
    credit: cost,
  });
  if (result > 0) {
    lines.push({
      account_code: FA_DEFAULTS.gain.code,
      account_name: FA_DEFAULTS.gain.name,
      description: `Disposal ${asset.code}`,
      debit: 0,
      credit: result,
    });
  }

  await postJournal(
    workspaceId,
    {
      entry_no: `JV/DSP/${asset.code}`,
      entry_date: input.disposal_date,
      source_type: "fa_disposal",
      source_doc_number: asset.code,
      memo: `Disposal ${asset.code} · ${asset.name}`,
    },
    lines,
  );

  await updateFaAsset({
    data: {
      workspaceId,
      id: asset.id,
      data: {
        status: input.write_off ? "written_off" : "disposed",
        disposal_date: input.disposal_date,
        disposal_amount: proceeds,
        notes: input.notes || asset.notes,
      },
    },
  });
  return { gainLoss: result };
}