import { z } from 'zod';
import { zId } from './production';

export const qcParamSchema = z.object({
  param: z.string().trim().min(1).max(120),
  method: z.string().max(200),
  unit: z.string().max(40),
  min_value: z.number().finite().nullable(),
  max_value: z.number().finite().nullable(),
  is_critical: z.boolean(),
}).refine((p) => p.min_value !== null || p.max_value !== null, { message: 'Isi batas minimum atau maksimum' })
  .refine((p) => p.min_value === null || p.max_value === null || p.max_value >= p.min_value, { message: 'Maksimum harus ≥ minimum' });

export const qcSpecSchema = z.object({
  values: z.object({
    item_id: zId,
    bom_version_id: z.string(),
    stage: z.enum(['incoming', 'in_process', 'final']),
    code: z.string().trim().min(1).max(60),
    name: z.string().trim().min(1).max(200),
    is_active: z.boolean(),
  }),
  params: z.array(qcParamSchema).min(1).max(60),
});

/** Mirrors the server evaluation; the database result is authoritative. */
export function evaluateQcValue(value: number, min: number | null, max: number | null) {
  return (min === null || value >= min) && (max === null || value <= max);
}
