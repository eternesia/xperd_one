import {
  postFxRevaluation as postFxRevaluationFn,
  previewFxRevaluation as previewFxRevaluationFn,
  type FxItem,
  type FxItemKind,
  type FxPreview,
} from "@/lib/ledger.functions";

/**
 * Ronde 29 (BS New 8): revaluasi kurs akhir periode (PSAK 10 / IAS 21).
 *
 * Piutang & hutang valas yang masih terbuka, plus kas/bank valas, dinilai ulang
 * dengan kurs penutupan. Selisih belum terealisasi masuk 4910 (laba) / 6910
 * (rugi) dan **dibalik otomatis keesokan harinya**, sehingga selisih kurs
 * realisasi saat pelunasan tetap memakai kurs invoice (lihat `journal.ts`).
 *
 * Perhitungan & postingnya ada di server (`ledger.functions.ts`) dalam satu
 * transaksi MySQL — tanpa trigger/stored function.
 */
export type { FxItem, FxItemKind, FxPreview };

export const periodOf = (asOf: string) => asOf.slice(0, 7).replace("-", "");

export async function previewFxRevaluation(workspaceId: string, asOf: string): Promise<FxPreview> {
  return previewFxRevaluationFn({ data: { workspaceId, asOf } });
}

export async function postFxRevaluation(workspaceId: string, asOf: string): Promise<FxPreview> {
  return postFxRevaluationFn({ data: { workspaceId, asOf } });
}
