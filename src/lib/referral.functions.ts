import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export const getMyReferralCode = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { referralMyCode } = await import("@/lib/referral.server");
    return referralMyCode(context.userId);
  });

export const claimReferral = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { code: string }) => {
    if (!/^[A-Za-z0-9]{4,16}$/.test(d?.code ?? "")) throw new Error("Kode tidak valid");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { referralClaim } = await import("@/lib/referral.server");
    return { claimed: await referralClaim(context.userId, data.code) };
  });

/** Pengaturan komisi + daftar referral tenant (hanya anggota tenant). */
export const getReferralOverview = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { tenantId: string }) => {
    if (!d?.tenantId) throw new Error("Tenant wajib");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { userCanAccessTenant } = await import("@/lib/auth-context.server");
    if (!(await userCanAccessTenant(data.tenantId, context.userId))) throw new Error("Forbidden");
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const s = await executeOne<{
      enabled: number;
      percent: number;
      max_idr: number;
      min_topup_idr: number;
    }>(
      "SELECT enabled, percent, max_idr, min_topup_idr FROM referral_settings WHERE singleton = 1",
    );
    const rows = await execute<{
      referred_tenant_id: string;
      status: string;
      commission_idr: number;
      created_at: string;
    }>(
      `SELECT referred_tenant_id, status, commission_idr, created_at FROM referrals
        WHERE referrer_tenant_id = ? ORDER BY created_at DESC LIMIT 200`,
      [data.tenantId],
    );
    return {
      settings: s
        ? {
            enabled: Boolean(s.enabled),
            percent: Number(s.percent),
            max_idr: Number(s.max_idr),
            min_topup_idr: Number(s.min_topup_idr),
          }
        : null,
      rows: rows.map((r) => ({
        referred_tenant_id: r.referred_tenant_id,
        status: r.status,
        commission_idr: Number(r.commission_idr),
        created_at: new Date(`${String(r.created_at).replace(" ", "T")}Z`).toISOString(),
      })),
    };
  });
