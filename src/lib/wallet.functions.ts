/**
 * Wallet tenant bersama (BS New 11): saldo, top-up (transfer manual + bukti, Midtrans), review Super Admin,
 * ekspor CSV, rekonsiliasi gateway. Otorisasi: anggota tenant (baca), owner/admin (ajukan), Super Admin (review).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";
import { requestTopupSchema, reviewTopupSchema, validateTopupAmount } from "./wallet/rules";

const scope = z.object({
  tenantId: z.string().uuid(),
  page: z.number().int().min(0).max(100000).default(0),
});
const iso = (v: unknown): string => {
  const d = new Date(String(v ?? "").replace(" ", "T") + "Z");
  return Number.isFinite(d.getTime()) ? d.toISOString() : "";
};
/** Setelah saldo masuk: coba perpanjangan otomatis yang tertunda (best-effort; gagal tidak membatalkan top-up). */
async function renewAfterTopup(tenantId: string) {
  try {
    const { renewTenant } = await import("@/lib/billing-wallet.server");
    await renewTenant(tenantId);
  } catch {
    /* dicoba lagi oleh cron */
  }
}
const keyOf = (g: { server_key?: string | null; server_key_secret_name: string | null }) =>
  g.server_key || process.env[g.server_key_secret_name || "MIDTRANS_SERVER_KEY"];
const dokuKeyOf = (g: { server_key?: string | null; server_key_secret_name: string | null }) =>
  g.server_key || process.env[g.server_key_secret_name || "DOKU_SECRET_KEY"];

async function assertMember(tenantId: string, userId: string) {
  const { isTenantMember } = await import("@/lib/wallet.server");
  const { hasRole } = await import("@/lib/auth-context.server");
  if (!(await isTenantMember(tenantId, userId)) && !(await hasRole(userId, "admin")))
    throw new Error("Anda tidak memiliki akses ke saldo ini.");
}
async function assertSuperAdmin(userId: string) {
  const { hasRole } = await import("@/lib/auth-context.server");
  if (!(await hasRole(userId, "admin"))) throw new Error("Forbidden");
}

const ledgerSql =
  "id, created_at, entry_type, product_code, amount_idr, balance_after, description, idempotency_key, invoice_id";
const mapLedger = (r: Record<string, unknown>) => ({
  id: String(r.id),
  created_at: iso(r.created_at),
  entry_type: String(r.entry_type),
  product_code: String(r.product_code),
  amount_idr: Number(r.amount_idr),
  balance_after: Number(r.balance_after),
  description: String(r.description ?? ""),
  idempotency_key: String(r.idempotency_key),
  invoice_id: (r.invoice_id as string | null) ?? null,
});

/** Saldo saja (widget topbar Qalling) — ringan dibanding `getWallet` yang memuat mutasi & top-up. */
export const getWalletBalance = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ tenantId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertMember(data.tenantId, context.userId);
    const { executeOne } = await import("@/integrations/mysql/pool");
    const row = await executeOne<{ balance_idr: number }>(
      "SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?",
      [data.tenantId],
    );
    return { balance: Number(row?.balance_idr ?? 0) };
  });

export const getWallet = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => scope.parse(v))
  .handler(async ({ data, context }) => {
    await assertMember(data.tenantId, context.userId);
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const { walletGetSettings, canManageTenantWallet } = await import("@/lib/wallet.server");
    const settings = await walletGetSettings();
    const off = data.page * 20;
    const [account, ledger, lc, topups, tc, gateways, manage] = await Promise.all([
      executeOne<{ balance_idr: number }>(
        "SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ?",
        [data.tenantId],
      ),
      execute<Record<string, unknown>>(
        `SELECT ${ledgerSql} FROM wallet_ledger WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET ${off}`,
        [data.tenantId],
      ),
      executeOne<{ n: number }>("SELECT COUNT(*) AS n FROM wallet_ledger WHERE tenant_id = ?", [
        data.tenantId,
      ]),
      execute<Record<string, unknown>>(
        `SELECT id, amount_idr, gateway, status, note, review_note, created_at, payment_url, proof_path, invoice_id
           FROM topups WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET ${off}`,
        [data.tenantId],
      ),
      executeOne<{ n: number }>("SELECT COUNT(*) AS n FROM topups WHERE tenant_id = ?", [
        data.tenantId,
      ]),
      execute<{
        id: string;
        provider: string;
        display_name: string;
        instructions: string | null;
        mode: string;
        merchant_id: string | null;
        server_key_secret_name: string | null;
        server_key: string | null;
      }>(
        "SELECT id, provider, display_name, instructions, mode, merchant_id, server_key_secret_name, server_key FROM payment_gateways WHERE is_active = 1 AND provider IN ('manual_transfer','midtrans','doku') ORDER BY sort_order",
      ),
      canManageTenantWallet(data.tenantId, context.userId),
    ]);
    return {
      balance: Number(account?.balance_idr ?? 0),
      settings,
      ledger: ledger.map(mapLedger),
      ledgerCount: Number(lc?.n ?? 0),
      topups: topups.map((r) => ({
        id: String(r.id),
        amount_idr: Number(r.amount_idr),
        gateway: String(r.gateway),
        status: String(r.status),
        note: String(r.note ?? ""),
        review_note: (r.review_note as string | null) ?? null,
        created_at: iso(r.created_at),
        payment_url: (r.payment_url as string | null) ?? null,
        proof_path: (r.proof_path as string | null) ?? null,
        invoice_id: (r.invoice_id as string | null) ?? null,
      })),
      topupCount: Number(tc?.n ?? 0),
      canManage: manage,
      methods: gateways.map((g) => ({
        id: g.id,
        provider: g.provider,
        display_name: g.display_name,
        instructions: g.instructions,
        available:
          g.provider === "manual_transfer" ||
          (g.provider === "doku" ? !!g.merchant_id && !!dokuKeyOf(g) : !!keyOf(g)),
      })),
    };
  });

export const createWalletTopup = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => requestTopupSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { canManageTenantWallet, walletCreateTopup, walletGetSettings } =
      await import("@/lib/wallet.server");
    if (!(await canManageTenantWallet(data.tenantId, context.userId)))
      throw new Error("Hanya owner/admin yang dapat mengajukan top-up.");
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const gateway = await executeOne<{
      id: string;
      provider: string;
      mode: string;
      instructions: string | null;
      merchant_id: string | null;
      server_key_secret_name: string | null;
      server_key: string | null;
    }>(
      "SELECT id, provider, mode, instructions, merchant_id, server_key_secret_name, server_key FROM payment_gateways WHERE id = ? AND is_active = 1",
      [data.gatewayId],
    );
    if (!gateway || !["manual_transfer", "midtrans", "doku"].includes(gateway.provider))
      throw new Error("Metode pembayaran tidak tersedia.");
    // DOKU: tujuan kembali browser hanya halaman billing; tidak pernah menyelesaikan saldo.
    let returnUrl: string | undefined;
    if (gateway.provider === "doku" && data.returnPath) {
      const { getRequest } = await import("@tanstack/react-start/server");
      const { requestOrigin } = await import("@/lib/google-oauth.server");
      const { walletReturnUrl } = await import("@/lib/wallet/return-url");
      // Domain yang sedang dipakai (qalling.id/xperd.id), https di balik proxy; bukan APP_PUBLIC_URL yang bisa salah (http).
      returnUrl = walletReturnUrl(requestOrigin(getRequest()), data.returnPath);
    }
    const dokuModule = gateway.provider === "doku" ? await import("@/lib/wallet/doku.server") : null;
    const dokuCredentials = dokuModule ? dokuModule.getDokuCredentials(gateway) : null;
    const key = gateway.provider === "midtrans" ? keyOf(gateway) : undefined;
    if (gateway.provider === "midtrans" && !key)
      throw new Error("Pembayaran otomatis belum dikonfigurasi admin.");
    const s = await walletGetSettings();
    validateTopupAmount(data.amount, s.min_topup_idr, s.max_topup_idr);
    let topup;
    try {
      topup = await walletCreateTopup({
        tenantId: data.tenantId,
        amount: data.amount,
        gatewayId: data.gatewayId,
        idem: data.idempotencyKey,
        actor: context.userId,
        note: data.note,
      });
    } catch (e) {
      throw new Error(
        (e as Error).message === "idempotency_conflict"
          ? "Pengajuan ini sudah dipakai untuk transaksi lain."
          : "Pengajuan top-up gagal. Coba lagi.",
      );
    }
    if (dokuModule && dokuCredentials && !topup.payment_url && topup.status === "pending") {
      const reference = `WAL-${topup.id}`;
      // Klaim sekali: kegagalan ambigu tidak diulang buta (pakai "Cek"), supaya tidak ada pembayaran ganda.
      const { result } = await import("@/integrations/mysql/pool");
      const claimed = await result(
        "UPDATE topups SET gateway_ref = ?, checkout_started_at = NOW(6) WHERE id = ? AND status = 'pending' AND checkout_started_at IS NULL",
        [reference, topup.id],
      );
      if (!claimed.affectedRows)
        throw new Error(
          "Checkout sudah diproses. Muat ulang riwayat, lalu cek pembayaran; jangan membuat pengajuan ulang.",
        );
      let url: string;
      try {
        url = await dokuModule.createDokuCheckout(
          dokuCredentials,
          reference,
          Number(topup.amount_idr),
          returnUrl,
        );
      } catch {
        throw new Error(
          "Checkout DOKU belum terkonfirmasi. Pengajuan tersimpan; cek status atau hubungi admin. Jangan membuat pembayaran ganda.",
        );
      }
      await execute("UPDATE topups SET payment_url = ? WHERE id = ?", [url, topup.id]).catch(() => {
        throw new Error("Tautan belum tersimpan. Cek status pembayaran sebelum mengulang.");
      });
      return { id: topup.id, url, instructions: gateway.instructions ?? "", status: topup.status };
    }
    if (
      gateway.provider === "midtrans" &&
      key &&
      !topup.payment_url &&
      topup.status === "pending"
    ) {
      const reference = `WAL-${topup.id}`;
      await execute("UPDATE topups SET gateway_ref = ? WHERE id = ?", [reference, topup.id]).catch(
        () => {
          throw new Error("Referensi pembayaran gagal dibuat.");
        },
      );
      const { createMidtransSnap } = await import("@/lib/billing.server");
      let url: string;
      try {
        url = await createMidtransSnap({
          serverKey: key,
          mode: gateway.mode,
          orderId: reference,
          grossAmount: data.amount,
        });
      } catch {
        throw new Error(
          "Pembayaran belum dapat dibuat. Pengajuan tersimpan; coba lagi atau hubungi admin.",
        );
      }
      await execute("UPDATE topups SET payment_url = ? WHERE id = ?", [url, topup.id]);
      return { id: topup.id, url, instructions: gateway.instructions ?? "", status: topup.status };
    }
    return {
      id: topup.id,
      url: topup.payment_url,
      instructions: gateway.instructions ?? "",
      status: topup.status,
    };
  });

export const uploadTopupProof = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        base64: z.string().max(7000000),
        mime: z.enum(["image/jpeg", "image/png", "application/pdf"]),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { executeOne, result, uuid } = await import("@/integrations/mysql/pool");
    const row = await executeOne<{
      id: string;
      tenant_id: string;
      status: string;
      gateway: string;
      created_by: string | null;
    }>("SELECT id, tenant_id, status, gateway, created_by FROM topups WHERE id = ?", [data.id]);
    if (
      !row ||
      row.created_by !== context.userId ||
      row.status !== "pending" ||
      row.gateway !== "manual_transfer"
    ) {
      throw new Error("Bukti hanya dapat diunggah untuk pengajuan Anda yang menunggu verifikasi.");
    }
    const bytes = Buffer.from(data.base64, "base64");
    if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024)
      throw new Error("Ukuran bukti maksimal 5 MB.");
    const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const pdf = bytes.subarray(0, 5).toString("latin1") === "%PDF-";
    if (!(
      (data.mime === "image/png" && png) ||
      (data.mime === "image/jpeg" && jpeg) ||
      (data.mime === "application/pdf" && pdf)
    ))
      throw new Error("Format bukti tidak valid.");
    const { saveWorkspaceFile, deleteWorkspaceFile } = await import("@/lib/files.server");
    const path = `wallet-proofs/${row.tenant_id}/${row.id}/${uuid()}.${png ? "png" : jpeg ? "jpg" : "pdf"}`;
    try {
      await saveWorkspaceFile(path, bytes);
    } catch {
      throw new Error("Bukti transfer gagal diunggah.");
    }
    const upd = await result(
      "UPDATE topups SET proof_path = ? WHERE id = ? AND status = 'pending'",
      [path, row.id],
    );
    if (!upd.affectedRows) {
      await deleteWorkspaceFile(path);
      throw new Error("Pengajuan sudah ditinjau atau bukti gagal tersimpan.");
    }
    return { ok: true };
  });

export const getTopupProof = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { executeOne } = await import("@/integrations/mysql/pool");
    const row = await executeOne<{ tenant_id: string; proof_path: string | null }>(
      "SELECT tenant_id, proof_path FROM topups WHERE id = ?",
      [data.id],
    );
    if (!row) throw new Error("Bukti belum tersedia.");
    await assertMember(row.tenant_id, context.userId);
    if (!row.proof_path) throw new Error("Bukti belum tersedia.");
    return { url: `/api/workspace-files?path=${encodeURIComponent(row.proof_path)}` };
  });

export const listAdminTopups = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z
      .object({
        page: z.number().int().min(0).max(100000).default(0),
        status: z
          .enum(["all", "pending", "paid", "rejected", "expired", "failed"])
          .default("pending"),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const where = data.status === "all" ? "" : "WHERE t.status = ?";
    const params = data.status === "all" ? [] : [data.status];
    const rows = await execute<Record<string, unknown>>(
      `SELECT t.*, n.name AS tenant_name FROM topups t LEFT JOIN tenants n ON n.id = t.tenant_id ${where}
        ORDER BY t.created_at DESC, t.id DESC LIMIT 20 OFFSET ${data.page * 20}`,
      params,
    );
    const c = await executeOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM topups t ${where}`,
      params,
    );
    return {
      rows: rows.map((r) => ({
        id: String(r.id),
        tenant_id: String(r.tenant_id),
        amount_idr: Number(r.amount_idr),
        gateway: String(r.gateway),
        status: String(r.status),
        note: String(r.note ?? ""),
        review_note: (r.review_note as string | null) ?? null,
        proof_path: (r.proof_path as string | null) ?? null,
        late_payment: r.late_payment === 1 || r.late_payment === true,
        created_at: iso(r.created_at),
        tenants: { name: String(r.tenant_name ?? "") },
      })),
      count: Number(c?.n ?? 0),
    };
  });

export const reviewWalletTopup = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => reviewTopupSchema.parse(v))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { walletSettleTopup } = await import("@/lib/wallet.server");
    let row;
    try {
      row = await walletSettleTopup({
        id: data.id,
        approve: data.approve,
        actor: context.userId,
        note: data.note,
        isAdmin: true,
      });
    } catch {
      throw new Error("Pengajuan tidak dapat diproses. Muat ulang dan periksa statusnya.");
    }
    if (row.status === "paid") await renewAfterTopup(row.tenant_id);
    return { status: row.status };
  });

export const exportWalletLedger = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => scope.parse(v))
  .handler(async ({ data, context }) => {
    await assertMember(data.tenantId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    const rows = await execute<Record<string, unknown>>(
      `SELECT ${ledgerSql} FROM wallet_ledger WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 1000 OFFSET ${data.page * 1000}`,
      [data.tenantId],
    );
    return rows.map(mapLedger);
  });

export const reconcileWalletTopup = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const row = await executeOne<{
      id: string;
      tenant_id: string;
      gateway: string;
      gateway_ref: string | null;
      gateway_id: string | null;
      status: string;
      amount_idr: number;
    }>(
      "SELECT id, tenant_id, gateway, gateway_ref, gateway_id, status, amount_idr FROM topups WHERE id = ?",
      [data.id],
    );
    if (!row) throw new Error("Pembayaran otomatis tidak tersedia.");
    await assertMember(row.tenant_id, context.userId);
    if (!["midtrans", "doku"].includes(row.gateway) || !row.gateway_ref || !row.gateway_id)
      throw new Error("Pembayaran otomatis tidak tersedia.");
    if (row.status === "paid") return { status: "paid" };
    const gateway = await executeOne<{
      provider: string;
      mode: string;
      merchant_id: string | null;
      server_key_secret_name: string | null;
      server_key: string | null;
    }>(
      "SELECT provider, mode, merchant_id, server_key_secret_name, server_key FROM payment_gateways WHERE id = ?",
      [row.gateway_id],
    );
    if (!gateway) throw new Error("Gateway tidak tersedia.");
    if (row.gateway === "doku") {
      if (gateway.provider !== "doku") throw new Error("Gateway tidak cocok.");
      const { getDokuCredentials, readDokuStatus, validateDokuPayment } =
        await import("@/lib/wallet/doku.server");
      const { walletSettleTopup } = await import("@/lib/wallet.server");
      const notice = await readDokuStatus(getDokuCredentials(gateway), row.gateway_ref);
      if (validateDokuPayment(notice, row.gateway_ref, Number(row.amount_idr))) {
        try {
          await walletSettleTopup({
            id: row.id,
            approve: true,
            note: "Konfirmasi status DOKU",
            gatewayVerified: true,
          });
        } catch {
          throw new Error("Saldo belum dapat diperbarui.");
        }
        await renewAfterTopup(row.tenant_id);
        return { status: "paid" };
      }
      return {
        status:
          notice.transaction.status === "PENDING" ? "pending" : notice.transaction.status.toLowerCase(),
      };
    }
    const key = keyOf(gateway);
    if (!key) throw new Error("Gateway belum dikonfigurasi.");
    const { readMidtransStatus, isSettledPayment } = await import("@/lib/wallet/gateway.server");
    const { walletSettleTopup } = await import("@/lib/wallet.server");
    const notice = await readMidtransStatus(row.gateway_ref, key, gateway.mode);
    if (
      notice.order_id !== row.gateway_ref ||
      Number(notice.gross_amount) !== Number(row.amount_idr)
    )
      throw new Error("Nominal pembayaran tidak cocok.");
    if (isSettledPayment(notice.transaction_status, notice.fraud_status)) {
      try {
        await walletSettleTopup({
          id: row.id,
          approve: true,
          note: "Konfirmasi status gateway",
          gatewayVerified: true,
        });
      } catch {
        throw new Error("Saldo belum dapat diperbarui.");
      }
      await renewAfterTopup(row.tenant_id);
      return { status: "paid" };
    }
    if (["expire", "cancel", "deny"].includes(notice.transaction_status)) {
      await execute("UPDATE topups SET status = ? WHERE id = ? AND status <> 'paid'", [
        notice.transaction_status === "expire" ? "expired" : "failed",
        row.id,
      ]);
    }
    return { status: notice.transaction_status };
  });
