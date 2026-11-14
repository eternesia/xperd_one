// Production · MRP — server function. Logika ada di `production-mrp.server.ts` (diimpor dinamis di handler).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import { zId } from "@/lib/production";
import {
  mrpItemParamsSchema,
  mrpMoSchema,
  mrpPrSchema,
  mrpSettingsSchema,
} from "@/lib/production-mrp";

const ws = z.object({ workspaceId: zId });

/** Pengaturan MRP + status izin (dibaca dulu oleh halaman; hitungan baru jalan bila saklar aktif). */
export const getMrpSettings = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws)
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/production-mrp.server");
    const p = await import("@/lib/production.server");
    await s.mrpGate(data.workspaceId, context.userId);
    const [settings, canConfigure, canPlan] = await Promise.all([
      s.loadMrpSettings(data.workspaceId),
      p.mfgCanAccess(data.workspaceId, context.userId, "settings", true),
      p.mfgCanAccess(data.workspaceId, context.userId, "mrp", true),
    ]);
    return { settings, canConfigure, canPlan };
  });

export const saveMrpSettings = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ values: mrpSettingsSchema, reason: z.string().trim().min(1).max(2000) }))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/production-mrp.server");
    await s.mrpGate(data.workspaceId, context.userId);
    return s.saveMrpSettings(data.workspaceId, context.userId, data.values, data.reason);
  });

export const runMrp = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ warehouse: z.string().trim().max(100).nullable().default(null) }))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/production-mrp.server");
    await s.mrpGate(data.workspaceId, context.userId);
    const settings = await s.loadMrpSettings(data.workspaceId);
    if (!settings.enabled) throw new Error("MRP belum diaktifkan di workspace ini.");
    const t0 = Date.now();
    const r = await s.computeMrp(data.workspaceId, { warehouse: data.warehouse });
    return { ...r, ms: Date.now() - t0 };
  });

export const saveMrpItemParams = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(ws.extend({ itemId: zId, values: mrpItemParamsSchema }))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/production-mrp.server");
    return s.saveMrpItemParams(data.workspaceId, context.userId, data.itemId, data.values);
  });

export const createMrpPurchaseRequest = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(mrpPrSchema)
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/production-mrp.server");
    return s.createMrpPurchaseRequest(data.workspaceId, context.userId, data);
  });

export const createMrpProductionOrders = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(mrpMoSchema)
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/production-mrp.server");
    return s.createMrpProductionOrders(data.workspaceId, context.userId, data);
  });
