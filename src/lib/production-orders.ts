// Production M6–M10: aturan murni (klien + server) — alur status order, koreksi potensi, yield, skema input.
import { z } from "zod";
import { zId } from "./production";

export const ORDER_FLOW = ["draft", "planned", "released", "in_progress", "qc_pending", "completed", "closed"] as const;
export type OrderStatus = (typeof ORDER_FLOW)[number] | "cancelled";

/** Status maju berikutnya (README 5.4); server menerapkan aturan yang sama. */
export function nextOrderStatus(status: OrderStatus): OrderStatus | null {
  const i = ORDER_FLOW.indexOf(status as (typeof ORDER_FLOW)[number]);
  return i >= 0 && i < ORDER_FLOW.length - 1 ? ORDER_FLOW[i + 1] : null;
}

/** README 5.2 koreksi potensi. Mengembalikan potensi lot yang dipakai dan kuantitas terkoreksi (4 desimal). */
export function potencyCorrected(input: {
  planned: number;
  basis: "gross" | "active_equivalent";
  aiTargetPct: number | null;
  assayPct: number;
  lodPct: number | null;
  potencyBasis: "as_is" | "dry";
}) {
  const potency =
    input.potencyBasis === "dry" && input.lodPct !== null
      ? input.assayPct / (1 - input.lodPct / 100)
      : input.assayPct;
  if (!(potency > 0 && potency <= 100)) throw new Error("Potensi lot tidak valid");
  const raw =
    input.basis === "active_equivalent"
      ? input.planned / (potency / 100)
      : input.aiTargetPct !== null
        ? (input.planned * input.aiTargetPct) / potency
        : input.planned;
  return { potency, corrected: Math.round(raw * 10000) / 10000 };
}

/** README 5.5 yield; true bila di luar toleransi (deviasi dibuka). */
export function yieldOutOfTolerance(actual: number, expected: number, tolerancePct: number) {
  const y = Math.round((actual / expected) * 100 * 10000) / 10000;
  return { yieldPct: y, deviation: Math.abs(y - 100) > tolerancePct };
}

export const orderSchema = z.object({
  item_id: zId,
  bom_version_id: zId,
  planned_qty: z.number().positive(),
  planned_start: z.string(),
  planned_end: z.string(),
  warehouse_from: z.string().min(1),
  warehouse_to: z.string().min(1),
  notes: z.string().max(2000),
  location_from: z.string().max(80).nullable().default(null),
  location_to: z.string().max(80).nullable().default(null),
  source_type: z.enum(["bom", "qc"]).default("bom"),
  qc_spec_id: zId.nullable().default(null),
  equipment: z
    .array(z.object({ center_id: zId.nullable(), name: z.string().trim().min(1).max(120), note: z.string().max(300).default("") }))
    .max(100)
    .default([]),
});

export const MAPPING_KEYS = [
  "rm_inventory",
  "wip_material",
  "wip_conversion",
  "fg_inventory",
  "labor_applied",
  "overhead_applied",
  "other_applied",
  "production_variance",
  "scrap_loss",
] as const;
