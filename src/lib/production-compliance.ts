// Production M2 — aturan murni kepatuhan (profil item, registrasi produk, dokumen). Dipakai klien & server.
import { z } from "zod";
import { zId } from "./production";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid");
export const itemClasses = [
  "active_ingredient",
  "solvent",
  "surfactant",
  "filler",
  "additive",
  "packaging_primary",
  "packaging_secondary",
  "label",
  "intermediate",
  "finished_good",
  "technical",
] as const;
export const profileSchema = z
  .object({
    item_class: z.enum(itemClasses),
    cas_no: z.string().nullable(),
    is_b3: z.boolean(),
    shelf_life_days: z.number().int().nonnegative().nullable(),
    density_g_ml: z.number().positive().multipleOf(0.0001).nullable(),
    potency_basis: z.enum(["as_is", "dry"]),
    requires_qc_incoming: z.boolean(),
    fefo: z.boolean(),
    storage_condition: z.string().nullable(),
    ghs_classes: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
    incompatible_classes: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
    un_number: z.string().max(50).nullable().default(null),
    conv_labor_per_unit: z.number().int().nonnegative().default(0),
    conv_other_per_unit: z.number().int().nonnegative().default(0),
    is_active: z.boolean().default(true),
  })
  .strict();
export const registrationSchema = z
  .object({
    item_id: zId,
    registration_no: z.string().trim().min(1).max(200),
    permit_type: z.enum(["tetap", "percobaan", "sementara"]),
    formulation_code: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    valid_from: dateStr,
    valid_until: dateStr,
    status: z.enum(["active", "expired", "suspended"]),
    ai_declared: z
      .array(
        z
          .object({
            item_id: zId,
            name: z.string().min(1),
            content: z.number().positive().multipleOf(0.000001),
            unit: z.enum(["g/L", "%w/w"]),
          })
          .refine((a) => a.unit !== "%w/w" || a.content <= 100),
      )
      .min(1)
      .max(100),
    holder_supplier_id: zId.nullable().default(null),
    holder_customer_id: zId.nullable().default(null),
    is_active: z.boolean(),
  })
  .strict()
  .refine((r) => r.valid_until >= r.valid_from, { message: "Masa berlaku tidak valid" })
  .refine((r) => !(r.holder_supplier_id && r.holder_customer_id), { message: "Pilih satu prinsipal" })
  .refine(
    (r) => r.ai_declared.filter((a) => a.unit === "%w/w").reduce((sum, a) => sum + a.content, 0) <= 100,
    { message: "Total kadar melebihi 100%" },
  );
export function registrationDaysRemaining(validUntil: string, today: string) {
  return Math.round((Date.parse(`${validUntil}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}
export function registrationAlert(validUntil: string, today: string) {
  const days = registrationDaysRemaining(validUntil, today);
  return days < 0 ? "expired" : days <= 30 ? "30" : days <= 60 ? "60" : days <= 90 ? "90" : null;
}
export const documentKinds = ["sds", "permit", "label"] as const;
export const documentMimeSchema = z.enum(["application/pdf", "image/png", "image/jpeg"]);
export function validateProductionDocument(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error("Dokumen maksimal 5 MB.");
  const valid =
    mime === "application/pdf"
      ? String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-"
      : mime === "image/png"
        ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
        : mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!valid) throw new Error("Format dokumen tidak valid.");
}
