// Production M3 — aturan murni BOM (skema, perbandingan versi, impor CSV). Dipakai klien & server.
import { z } from "zod";
import { zId } from "./production";

const qty = z.number().positive().refine((v) => Math.abs(v * 10000 - Math.round(v * 10000)) < 0.00001, "Maksimal 4 desimal");
const pct = z.number().min(0).max(100).refine((v) => Math.abs(v * 1e6 - Math.round(v * 1e6)) < 0.00001, "Maksimal 6 desimal");
export const bomLineSchema = z.object({
  item_id: zId,
  line_type: z.enum(["ingredient", "packaging", "co_product", "by_product"]),
  /** Phase proses skincare (A, B, C …); kosong untuk BoM tanpa phase. */
  phase: z.string().trim().max(20),
  qty_per_base: qty,
  uom: z.string().min(1),
  basis: z.enum(["gross", "active_equivalent"]),
  ai_target_pct: pct.nullable(),
  potency_compensate: z.boolean(),
  tolerance_pct: pct,
  is_critical: z.boolean(),
  sequence: z.number().int().positive(),
  add_step_note: z.string().max(2000),
});
export const bomValuesSchema = z.object({
  item_id: zId,
  code: z.string().trim().min(1).max(80),
  formulation_code: z.string().nullable(),
  target_content: z.number().nonnegative().nullable(),
  target_unit: z.enum(["%w/w", "g/L"]).nullable(),
  base_batch_qty: qty,
  base_uom: z.string().min(1),
  std_yield_pct: pct.refine((v) => v > 0),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effective_to: z.string().nullable(),
  registration_id: zId.nullable(),
  dosage_form: z.string().trim().max(80).nullable(),
  source_document: z.string().trim().max(200).nullable(),
});
export const saveBomSchema = z.object({
  workspaceId: zId,
  versionId: zId.nullable(),
  bomId: zId.nullable(),
  values: bomValuesSchema,
  lines: z.array(bomLineSchema).min(1).max(500),
  reason: z.string().trim().min(1).max(2000),
});
export type BomLine = z.infer<typeof bomLineSchema>;
export function compareBomLines(a: BomLine[], b: BomLine[]) {
  const key = (l: BomLine) => `${l.item_id}|${l.phase ?? ""}`;
  return [...new Set([...a, ...b].map(key))].map((k) => {
    const before = a.find((l) => key(l) === k);
    const after = b.find((l) => key(l) === k);
    return { item_id: (before ?? after)!.item_id, phase: (before ?? after)!.phase ?? "", before, after };
  });
}
export function parseBomCsv(text: string, items: { id: string; code: string }[], units: string[]): BomLine[] {
  // XLSX supplies standards-compliant quoted CSV parsing before this normalized conversion.
  const rows = text.trim().split(/\r?\n/);
  const header = rows.shift()?.split(",");
  const base = "item_code,qty,uom,basis,line_type";
  if (!header || ![base, `${base},phase`].includes(header.join(",")))
    throw Error(`Kolom CSV: ${base}[,phase]`);
  return rows.map((row, i) => {
    const [code, amount, uom, basis, line_type, phase = ""] = row.split(",");
    const item = items.find((it) => it.code === code);
    if (!item || !units.includes(uom)) throw Error(`Baris ${i + 2}: item/satuan tidak ditemukan`);
    return bomLineSchema.parse({
      item_id: item.id,
      qty_per_base: Number(amount),
      uom,
      basis,
      line_type,
      phase: phase.trim(),
      ai_target_pct: null,
      potency_compensate: basis === "active_equivalent",
      tolerance_pct: 0,
      is_critical: false,
      sequence: i + 1,
      add_step_note: "",
    });
  });
}

/** Komposisi bahan aktif BOM vs `ai_declared` registrasi (padanan `mfg_bom_composition_issues`, tanpa DB). */
export interface CompositionInput {
  base_uom: string;
  base_batch_qty: number;
  effective_from: string;
  registration_id: string | null;
  bomItemId: string;
  bomFormulationCode: string | null;
  today: string;
  tolerance: number;
  requiresRegistration: boolean; // item punya profil finished_good
  registration: null | {
    item_id: string;
    formulation_code: string | null;
    is_active: boolean;
    status: string;
    valid_from: string;
    valid_until: string;
    ai_declared: { item_id: string; name: string; content: number; unit: string }[];
  };
  lines: { item_id: string; line_type: string; basis: string; uom: string; qty_per_base: number }[];
  activeIngredientItemIds: Set<string>; // item bahan baku berprofil active_ingredient
}
export function bomCompositionIssues(i: CompositionInput): string[] {
  const r = i.registration;
  if (!i.registration_id || !r) return i.requiresRegistration ? ["Registrasi barang jadi wajib"] : [];
  const gte = (a: string, b: string) => (a >= b ? a : b);
  if (
    r.item_id !== i.bomItemId ||
    (r.formulation_code ?? null) !== (i.bomFormulationCode ?? null) ||
    !r.is_active ||
    r.status !== "active" ||
    r.valid_until < gte(i.today, i.effective_from) ||
    r.valid_from > i.effective_from
  )
    return ["Registrasi tidak sesuai produk, formulasi atau masa berlaku"];
  const issues: string[] = [];
  for (const a of r.ai_declared) {
    const l = i.lines.find((x) => x.item_id === a.item_id && x.line_type === "ingredient");
    if (!l) {
      issues.push(`Bahan aktif tidak ditemukan: ${a.name}`);
      continue;
    }
    let val: number | null = null;
    if (l.basis === "active_equivalent") {
      if (a.unit === "%w/w" && i.base_uom === "kg" && l.uom === "kg") val = (l.qty_per_base / i.base_batch_qty) * 100;
      else if (a.unit === "g/L" && i.base_uom === "L" && l.uom === "kg") val = (l.qty_per_base / i.base_batch_qty) * 1000;
      else if (a.unit === "g/L" && i.base_uom === "L" && l.uom === "g") val = l.qty_per_base / i.base_batch_qty;
    }
    if (val === null || Math.abs(val - Number(a.content)) > i.tolerance) issues.push(`Kadar/basis tidak sesuai: ${a.name}`);
  }
  if (i.lines.some((l) => i.activeIngredientItemIds.has(l.item_id) && !r.ai_declared.some((a) => a.item_id === l.item_id)))
    issues.push("Bahan aktif tambahan di luar registrasi");
  return issues;
}
