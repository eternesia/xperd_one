import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

const KINDS = [
  "trial_reminder",
  "invoice_receipt",
  "post_summary",
  "followup_digest",
  "xpro_task_digest",
] as const;
const scope = z.object({ tenantId: z.string().uuid() });

export const getNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => scope.parse(v))
  .handler(async ({ data, context }) => {
    const { isTenantMember } = await import("@/lib/wallet.server");
    if (!(await isTenantMember(data.tenantId, context.userId))) throw new Error("Forbidden");
    const { execute } = await import("@/integrations/mysql/pool");
    const rows = await execute<{ kind: string; enabled: number }>(
      "SELECT kind, enabled FROM notification_prefs WHERE tenant_id = ?",
      [data.tenantId],
    );
    const map = new Map(rows.map((r) => [r.kind, Number(r.enabled) === 1]));
    return Object.fromEntries(KINDS.map((k) => [k, map.get(k) ?? true])) as Record<
      (typeof KINDS)[number],
      boolean
    >;
  });

export const setNotificationPref = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => scope.extend({ kind: z.enum(KINDS), enabled: z.boolean() }).parse(v))
  .handler(async ({ data, context }) => {
    const { canManageTenantWallet } = await import("@/lib/wallet.server");
    if (!(await canManageTenantWallet(data.tenantId, context.userId)))
      throw new Error("Hanya pemilik/pengelola akun yang dapat mengubah notifikasi.");
    const { execute } = await import("@/integrations/mysql/pool");
    await execute(
      `INSERT INTO notification_prefs (tenant_id, kind, enabled) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)`,
      [data.tenantId, data.kind, data.enabled ? 1 : 0],
    );
    return { ok: true as const };
  });
