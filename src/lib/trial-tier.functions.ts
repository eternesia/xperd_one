import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import { isValidTrial } from "@/lib/trial-tier-rules";

const tenantSchema = z.object({ tenantId: z.string().uuid() });
export type TrialTierQuote = {
  tier_id: string;
  previous_tier_id: string | null;
  name: string;
  ends_at: string;
  charge: number;
  status: "trial";
  applied: boolean;
};

/** Apakah pemanggil boleh berganti paket trial (pemilik tenant + trial berlaku). */
export const getTrialTierState = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => tenantSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { executeOne } = await import("@/integrations/mysql/pool");
    const { ownsTenant } = await import("@/lib/auth-context.server");
    const { jakartaToday } = await import("@/lib/billing-wallet.server");
    if (!(await ownsTenant(data.tenantId, context.userId)))
      return { canSwitch: false, tierId: null as string | null, endsAt: null as string | null };
    const addon = await executeOne<{
      tier_id: string | null;
      status: string;
      starts_at: unknown;
      ends_at: unknown;
    }>(
      `SELECT ta.tier_id, ta.status, ta.starts_at, ta.ends_at FROM tenant_addons ta JOIN addons ad ON ad.id = ta.addon_id
        WHERE ta.tenant_id = ? AND ad.code = 'qalling' LIMIT 1`,
      [data.tenantId],
    );
    const d10 = (v: unknown) =>
      v == null ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
    const row = addon
      ? { status: addon.status, starts_at: d10(addon.starts_at) ?? "", ends_at: d10(addon.ends_at) }
      : null;
    return {
      canSwitch: isValidTrial(row, jakartaToday()),
      tierId: addon?.tier_id ?? null,
      endsAt: row?.ends_at ?? null,
    };
  });

export const switchTrialTier = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    tenantSchema
      .extend({
        tierId: z.string().uuid(),
        expectedTierId: z.string().uuid().nullable(),
        apply: z.boolean(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<TrialTierQuote> => {
    const { switchTrialTier: run } = await import("@/lib/qalling-tier-switch.server");
    const r = await run({
      actor: { id: context.userId, email: context.user?.email ?? null },
      tenantId: data.tenantId,
      tierId: data.tierId,
      expectedTierId: data.expectedTierId,
      apply: data.apply,
    });
    return { ...r, status: "trial" };
  });
