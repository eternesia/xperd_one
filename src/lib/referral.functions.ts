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

export type ReferralSettings = {
  enabled: boolean;
  percent: number;
  max_idr: number;
  min_topup_idr: number;
};

/** Pengaturan program referral (hanya Super Admin). */
export const getReferralSettings = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }): Promise<ReferralSettings> => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { executeOne } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    const r = await executeOne<Record<string, unknown>>(
      "SELECT enabled, percent, max_idr, min_topup_idr FROM referral_settings WHERE singleton = 1",
    );
    return {
      enabled: Boolean(Number(r?.enabled ?? 1)),
      percent: Number(r?.percent ?? 10),
      max_idr: Number(r?.max_idr ?? 100000),
      min_topup_idr: Number(r?.min_topup_idr ?? 50000),
    };
  });

export const saveReferralSettings = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: ReferralSettings) => d)
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    const percent = Number(data.percent);
    const max = Number(data.max_idr);
    const min = Number(data.min_topup_idr);
    if (!(percent >= 0 && percent <= 100)) throw new Error("Persentase harus 0–100");
    if (!(max >= 0) || !(min >= 0) || !Number.isFinite(max) || !Number.isFinite(min))
      throw new Error("Nominal tidak boleh negatif");
    await execute(
      "UPDATE referral_settings SET enabled = ?, percent = ?, max_idr = ?, min_topup_idr = ? WHERE singleton = 1",
      [data.enabled ? 1 : 0, percent, Math.round(max), Math.round(min)],
    );
    return { ok: true };
  });
