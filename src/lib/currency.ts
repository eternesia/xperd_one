import { listWorkspaceRows } from "@/lib/data.functions";

/**
 * Ronde 29 (BS New 8): master mata uang & kurs.
 *
 * `rate` selalu berarti **nilai mata uang dasar untuk 1 unit mata uang
 * tersebut** (mis. USD → 16.000 di workspace ber-basis IDR). Mata uang dasar
 * sendiri selalu bernilai 1. Semua data lewat server fn (`listWorkspaceRows`)
 * supaya tetap di mata uang dasar dan tidak bocor ke bundle klien.
 */

/** Jenis kurs yang disimpan per workspace: transaksi, pajak (KMK), penutupan. */
export type RateType = "transaction" | "tax" | "closing";

export interface CurrencyRow {
  code: string;
  name: string;
  symbol: string | null;
  decimals: number;
  is_base: number | boolean;
}

export interface ExchangeRateRow {
  id: string;
  code: string;
  currency_code: string;
  rate_date: string;
  rate_type: RateType;
  rate: number;
}

/** Mata uang yang boleh dipakai workspace; mata uang dasar di urutan pertama. */
export async function fetchCurrencies(workspaceId: string): Promise<CurrencyRow[]> {
  const res = await listWorkspaceRows({
    data: {
      table: "md_currencies",
      workspaceId,
      filters: { is_active: 1 },
      limit: 200,
    },
  });
  const rows = (res?.rows ?? []) as unknown as CurrencyRow[];
  return [...rows].sort(
    (a, b) => Number(b.is_base) - Number(a.is_base) || String(a.code).localeCompare(String(b.code)),
  );
}

/** Mata uang pelaporan workspace (fallback IDR seperti BS New 8). */
export async function fetchBaseCurrency(workspaceId: string) {
  const rows = await fetchCurrencies(workspaceId);
  return rows.find((c) => Number(c.is_base) === 1)?.code ?? "IDR";
}

/**
 * Kurs terakhir pada atau sebelum `onDate` (mata uang dasar per 1 unit valas).
 * Mata uang dasar selalu 1; 0 berarti kurs belum ada di master.
 */
export async function getExchangeRate(
  workspaceId: string,
  currencyCode: string,
  onDate?: string,
  rateType: RateType = "transaction",
): Promise<number> {
  const base = await fetchBaseCurrency(workspaceId);
  if (!currencyCode || currencyCode === base) return 1;
  const res = await listWorkspaceRows({
    data: {
      table: "md_exchange_rates",
      workspaceId,
      filters: { currency_code: currencyCode, rate_type: rateType, is_active: 1 },
      ranges: onDate ? { rate_date: { lte: onDate } } : undefined,
      orderBy: "rate_date",
      orderDir: "desc",
      limit: 1,
    },
  });
  const rate = Number((res?.rows ?? [])[0]?.rate ?? 0);
  return rate > 0 ? rate : 0;
}

/** Konversi nilai valas ke mata uang dasar dengan kurs eksplisit. */
export function toBaseAmount(foreignAmount: number, rate: number) {
  return Math.round((Number(foreignAmount) || 0) * (Number(rate) || 0) * 100) / 100;
}

export function formatCurrency(value: number, currency: string, lang: string, decimals = 2) {
  const n = new Intl.NumberFormat(lang === "id" ? "id-ID" : "en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(value) || 0);
  return `${currency} ${n}`;
}
