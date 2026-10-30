/**
 * Katalog tier/opsi add-on, entitlement workspace, dan checkout paket Qalling (BS New 11).
 * Baca katalog boleh semua pengguna masuk; ubah katalog hanya admin platform; beli hanya pemilik tenant.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import type { BillingQuote, Entitlements } from "@/lib/entitlements";

export type { BillingQuote };

type Limits = Record<string, number | null>;
export interface AddonTier {
  id: string;
  addon_id: string;
  code: string;
  name: string;
  monthly_price: number;
  limits: Limits;
  features: Record<string, boolean>;
  is_active: boolean;
  sort_order: number;
}
export interface AddonOption {
  id: string;
  addon_id: string;
  code: string;
  name: string;
  monthly_price: number;
  max_quantity: number;
  grants: { features?: Record<string, boolean>; limits?: Limits };
  requires_features: string[];
  is_active: boolean;
}

const parse = <T>(v: unknown, fallback: T): T =>
  v == null ? fallback : typeof v === "string" ? (JSON.parse(v) as T) : (v as T);

const toTier = (r: Record<string, unknown>): AddonTier => ({
  id: String(r.id),
  addon_id: String(r.addon_id),
  code: String(r.code),
  name: String(r.name),
  monthly_price: Number(r.monthly_price),
  limits: parse(r.limits, {}),
  features: parse(r.features, {}),
  is_active: Boolean(r.is_active),
  sort_order: Number(r.sort_order),
});
const toOption = (r: Record<string, unknown>): AddonOption => ({
  id: String(r.id),
  addon_id: String(r.addon_id),
  code: String(r.code),
  name: String(r.name),
  monthly_price: Number(r.monthly_price),
  max_quantity: Number(r.max_quantity),
  grants: parse(r.grants, {}),
  requires_features: parse(r.requires_features, []),
  is_active: Boolean(r.is_active),
});

export const listAddonTiers = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { execute } = await import("@/integrations/mysql/pool");
    const rows = await execute<Record<string, unknown>>(
      "SELECT * FROM addon_tiers ORDER BY sort_order, name",
    );
    return rows.map(toTier);
  });

export const listAddonOptions = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ activeOnly: z.boolean().optional() }).parse(v ?? {}))
  .handler(async ({ data }) => {
    const { execute } = await import("@/integrations/mysql/pool");
    const rows = await execute<Record<string, unknown>>(
      `SELECT * FROM addon_options ${data.activeOnly ? "WHERE is_active = 1" : ""} ORDER BY code`,
    );
    return rows.map(toOption);
  });

/* ------------------------------- admin: katalog ------------------------------- */

const tierSchema = z.object({
  id: z.string().uuid().optional(),
  addon_id: z.string().uuid(),
  code: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(255),
  monthly_price: z.number(),
  limits: z.record(z.string(), z.number().nullable()),
  features: z.record(z.string(), z.boolean()),
  is_active: z.boolean(),
  sort_order: z.number().int(),
});

export const adminSaveAddonTier = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => tierSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    const { validateTierPrice } = await import("@/lib/entitlements");
    await requireAdmin(context.userId);
    if (Object.values(data.limits).some((x) => x !== null && (!Number.isSafeInteger(x) || x < 0)))
      throw new Error("Limits must be nonnegative integers or null");
    // Padanan trigger `validate_addon_tier`: harga naik seiring kapasitas akun (hanya tier aktif sejenis).
    if (data.is_active) {
      const peers = (
        await execute<Record<string, unknown>>(
          "SELECT * FROM addon_tiers WHERE addon_id = ? AND is_active = 1 AND id <> ?",
          [data.addon_id, data.id ?? ""],
        )
      ).map(toTier);
      validateTierPrice(data.monthly_price, data.limits.max_accounts ?? null, peers);
    }
    const args = [
      data.addon_id,
      data.code,
      data.name,
      data.monthly_price,
      JSON.stringify(data.limits),
      JSON.stringify(data.features),
      data.is_active ? 1 : 0,
      data.sort_order,
    ];
    if (data.id) {
      await execute(
        `UPDATE addon_tiers SET addon_id = ?, code = ?, name = ?, monthly_price = ?, limits = ?, features = ?,
                is_active = ?, sort_order = ? WHERE id = ?`,
        [...args, data.id],
      );
      return { id: data.id };
    }
    const id = uuid();
    await execute(
      `INSERT INTO addon_tiers (addon_id, code, name, monthly_price, limits, features, is_active, sort_order, id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...args, id],
    );
    return { id };
  });

export const adminSaveAddonOption = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(255),
        monthly_price: z.number().int().min(0),
        max_quantity: z.number().int().min(1),
        is_active: z.boolean(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { execute } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    await execute(
      "UPDATE addon_options SET name = ?, monthly_price = ?, max_quantity = ?, is_active = ? WHERE id = ?",
      [data.name, data.monthly_price, data.max_quantity, data.is_active ? 1 : 0, data.id],
    );
    return { ok: true };
  });

/* ----------------------------- entitlement & pemakaian ----------------------------- */

export const getWorkspaceEntitlements = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<Entitlements> => {
    const { isWorkspaceMember, hasRole } = await import("@/lib/auth-context.server");
    if (!(await isWorkspaceMember(data.workspaceId, context.userId))) {
      if (!(await hasRole(context.userId, "admin"))) return {};
    }
    const { workspaceEntitlements } = await import("@/lib/entitlements.server");
    return workspaceEntitlements(data.workspaceId);
  });

export const getWorkspaceQuotaUsage = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("@/lib/auth-context.server");
    if (!(await isWorkspaceMember(data.workspaceId, context.userId))) throw new Error("Forbidden");
    const { workspaceUsage, workspaceLimits } = await import("@/lib/entitlements.server");
    return {
      usage: await workspaceUsage(data.workspaceId),
      limits: await workspaceLimits(data.workspaceId),
    };
  });

/* ----------------------------- beli paket / opsi (wallet) ----------------------------- */

const billingErrors: Record<string, string> = {
  insufficient_balance: "Saldo tidak cukup. Isi saldo terlebih dahulu.",
  base_subscription_required: "Aktifkan atau perpanjang paket ERP terlebih dahulu.",
  quote_changed: "Harga atau periode berubah. Buka kembali rincian pembelian.",
  usage_exceeds_target_tier: "Pemakaian akun, pengguna, atau penyimpanan melebihi paket tujuan.",
  option_requires_feature: "Paket saat ini tidak memenuhi syarat opsi ini.",
  addon_required: "Aktifkan paket add-on terlebih dahulu.",
  owner_required: "Hanya pemilik tenant yang dapat membeli.",
  option_quantity_invalid: "Jumlah opsi tidak valid.",
};
const billingError = (m: string) =>
  billingErrors[m] ?? "Transaksi belum berhasil. Muat ulang lalu coba kembali.";

const itemSchema = z.object({
  tenantId: z.string().uuid(),
  kind: z.enum(["tier", "option"]),
  itemId: z.string().uuid(),
  quantity: z.number().int().min(0).max(1000).default(1),
});

export const quoteSubscriptionItem = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => itemSchema.parse(v))
  .handler(async ({ data, context }): Promise<BillingQuote> => {
    const { isTenantOwner } = await import("@/lib/billing-wallet.server");
    if (!(await isTenantOwner(data.tenantId, context.userId)))
      throw new Error("Hanya pemilik tenant yang dapat membeli langganan.");
    const { billingQuote } = await import("@/lib/addon-billing.server");
    try {
      return await billingQuote(data.tenantId, data.kind, data.itemId, data.quantity);
    } catch (e) {
      throw new Error(billingError((e as Error).message));
    }
  });

export const checkoutSubscriptionItem = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    itemSchema
      .extend({ idempotencyKey: z.string().uuid(), quote: z.record(z.string(), z.unknown()) })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { isTenantOwner } = await import("@/lib/billing-wallet.server");
    if (!(await isTenantOwner(data.tenantId, context.userId)))
      throw new Error("Hanya pemilik tenant yang dapat membeli langganan.");
    const { billingCheckout } = await import("@/lib/addon-billing.server");
    try {
      return await billingCheckout({
        tenantId: data.tenantId,
        kind: data.kind,
        itemId: data.itemId,
        quantity: data.quantity,
        idem: data.idempotencyKey,
        actor: context.userId,
        expected: data.quote as unknown as BillingQuote,
      });
    } catch (e) {
      throw new Error(billingError((e as Error).message));
    }
  });
