/** Aksi Super Admin untuk gateway pembayaran. Kunci rahasia disimpan lewat `adminSave` (tulis-saja, kolom `server_key`). */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

/** Uji checkout DOKU (mode test saja): membuat tautan checkout contoh, tidak menambah saldo. */
export const testDokuCheckout = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ gatewayId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    const { executeOne } = await import("@/integrations/mysql/pool");
    await requireAdmin(context.userId);
    const gateway = await executeOne<{
      merchant_id: string | null;
      mode: string;
      server_key: string | null;
      server_key_secret_name: string | null;
    }>(
      "SELECT merchant_id, mode, server_key, server_key_secret_name FROM payment_gateways WHERE id = ? AND provider = 'doku'",
      [data.gatewayId],
    );
    if (!gateway || gateway.mode !== "sandbox")
      throw new Error("Uji checkout hanya tersedia dalam mode test. Tidak menambah saldo.");
    const { getDokuCredentials, createDokuCheckout } = await import("@/lib/wallet/doku.server");
    return {
      url: await createDokuCheckout(
        getDokuCredentials(gateway),
        `TEST-${crypto.randomUUID()}`,
        10000,
      ),
    };
  });
