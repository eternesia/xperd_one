/**
 * Langganan ERP lewat saldo wallet (BS New 11): bayar invoice dari saldo, perpanjangan otomatis opt-in,
 * ganti paket instan dengan prorata. Hanya pemilik tenant. Operasi checkout idempoten (`idempotencyKey`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import type { PackageQuote } from "@/lib/billing-wallet.server";

export type { PackageQuote };

const billingError = (m: string) =>
  ({
    insufficient_balance: "Saldo tidak cukup. Isi saldo terlebih dahulu.",
    base_invoice_required: "Hanya tagihan paket ERP yang dapat dibayar dari saldo.",
    owner_required: "Hanya pemilik tenant yang dapat membayar.",
    invoice_not_found: "Tagihan tidak ditemukan.",
    subscription_not_found: "Langganan belum tersedia.",
    invalid_invoice_amount: "Nominal tagihan tidak valid.",
  })[m] ?? "Transaksi belum berhasil. Muat ulang lalu coba kembali.";

const pkgErrors: Record<string, string> = {
  package_unchanged: "Anda sudah memakai paket ini.",
  downgrade_at_period_end: "Turun paket hanya bisa di akhir periode. Hubungi tim kami.",
  package_unavailable: "Paket tidak tersedia.",
  quote_changed: "Harga berubah, silakan cek ringkasan lagi.",
  owner_required: "Hanya pemilik tenant yang dapat mengganti paket.",
};
const pkgError = (m: string) => {
  const k = Object.keys(pkgErrors).find((x) => m.includes(x));
  if (k) return pkgErrors[k];
  if (/insufficient|balance/i.test(m)) return "Saldo tidak cukup. Silakan top-up dulu.";
  return m;
};

export const payInvoiceFromWallet = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { payInvoiceFromWallet: pay } = await import("@/lib/billing-wallet.server");
    try {
      await pay(data.invoiceId, context.userId);
    } catch (e) {
      throw new Error(billingError((e as Error).message));
    }
    return { ok: true };
  });

export const setWalletRenewal = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z.object({ tenantId: z.string().uuid(), enabled: z.boolean() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { isTenantOwner, setWalletRenewal: set } = await import("@/lib/billing-wallet.server");
    if (!(await isTenantOwner(data.tenantId, context.userId)))
      throw new Error("Hanya pemilik tenant yang dapat mengatur perpanjangan.");
    try {
      await set(data.tenantId, data.enabled);
    } catch {
      throw new Error("Langganan belum tersedia.");
    }
    return { ok: true };
  });

const pkgSchema = z.object({ tenantId: z.string().uuid(), packageId: z.string().uuid() });

export const quotePackageUpgrade = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => pkgSchema.parse(v))
  .handler(async ({ data, context }): Promise<PackageQuote> => {
    const { isTenantOwner, packageQuote } = await import("@/lib/billing-wallet.server");
    if (!(await isTenantOwner(data.tenantId, context.userId)))
      throw new Error(pkgErrors.owner_required);
    try {
      return await packageQuote(data.tenantId, data.packageId);
    } catch (e) {
      throw new Error(pkgError((e as Error).message));
    }
  });

export const checkoutPackageUpgrade = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    pkgSchema
      .extend({ idempotencyKey: z.string().uuid(), expectedCharge: z.number().int().min(0) })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<PackageQuote> => {
    const { packageCheckout } = await import("@/lib/billing-wallet.server");
    try {
      return await packageCheckout({
        tenantId: data.tenantId,
        packageId: data.packageId,
        idem: data.idempotencyKey,
        actor: context.userId,
        expectedCharge: data.expectedCharge,
      });
    } catch (e) {
      throw new Error(pkgError((e as Error).message));
    }
  });
