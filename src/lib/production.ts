// Production (BS New 16) — skema & konstanta bersama (klien + server).
import { z } from "zod";

/** UUID longgar (MySQL `UUID()` menghasilkan v1; `z.string().uuid()` zod 4 menolaknya). */
export const zId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "ID tidak valid");

export const PRODUCTION_FEATURE_LABELS: Record<string, { id: string; en: string }> = {
  mfg_basic: { id: "Production dasar", en: "Production foundation" },
  mfg_qc: { id: "Quality control", en: "Quality control" },
  mfg_trace: { id: "Traceability", en: "Traceability" },
  mfg_mrp: { id: "MRP", en: "MRP" },
  mfg_subcontract: { id: "Maklon", en: "Subcontracting" },
};
export const productionRoles = [
  "production_planner",
  "production_supervisor",
  "operator",
  "warehouse",
  "qc_analyst",
  "qa_manager",
  "cost_accountant",
  "viewer",
] as const;
export const productionSections = ["settings", "roles", "work-centers", "formulation-codes", "audit"] as const;
export const numberingRule = z.object({
  prefix: z.string().regex(/^[A-Z][A-Z0-9]{0,11}$/),
  reset: z.enum(["yearly", "monthly", "daily", "never"]),
  digits: z.number().int().min(1).max(9),
});
export const numberingSchema = z.object({
  order: numberingRule,
  lot: numberingRule,
  inspection: numberingRule,
  deviation: numberingRule,
});
export const defaultNumbering: z.infer<typeof numberingSchema> = {
  order: { prefix: "MO", reset: "yearly", digits: 5 },
  lot: { prefix: "LOT", reset: "daily", digits: 2 },
  inspection: { prefix: "QI", reset: "yearly", digits: 5 },
  deviation: { prefix: "DEV", reset: "yearly", digits: 4 },
};
export const productionSettingsSchema = z
  .object({
    numbering: numberingSchema,
    costing_method: z.enum(["actual", "standard"]),
    fefo: z.boolean(),
    min_remaining_shelf_life_days: z.number().int().nonnegative(),
    yield_tolerance_pct: z.number().min(0).max(100),
  })
  .strict();
export const centerSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  center_type: z.enum(["mixing", "milling", "blending", "granulation", "filling", "packing", "qc_lab"]),
  capacity_per_hour: z.number().nonnegative(),
  uom_code: z.string().nullable(),
  labor_rate_per_hour: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  overhead_rate_per_hour: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  is_active: z.boolean(),
});
export const codeSchema = z
  .object({
    code: z.string().regex(/^[A-Z]{2}$/),
    name_en: z.string().trim().min(1).max(200),
    name_id: z.string().trim().min(1).max(200),
    physical_state: z.enum(["liquid", "solid", "other"]),
    is_active: z.boolean(),
  })
  .strict();
export const roleSchema = z.object({ user_id: zId, role: z.enum(productionRoles), is_active: z.boolean() }).strict();
export const masterSaveSchema = z
  .object({
    workspaceId: zId,
    table: z.enum(["mfg_settings", "mfg_workspace_roles", "mfg_work_centers", "mfg_formulation_codes"]),
    id: zId.nullable(),
    reason: z.string().trim().min(1).max(2000),
    values: z.record(z.string(), z.unknown()),
  })
  .transform((input) => ({
    ...input,
    values: {
      mfg_settings: productionSettingsSchema,
      mfg_workspace_roles: roleSchema,
      mfg_work_centers: centerSchema,
      mfg_formulation_codes: codeSchema,
    }[input.table].parse(input.values) as Record<string, unknown>,
  }));
