/**
 * #63 (BS New 3): server fn Omnix — SALDO, TOP UP, PAKET, dan BIAYA TRANSAKSI.
 *
 * Semua operasi uang dijalankan di level aplikasi dalam SATU transaksi MySQL
 * (`transaction()` dengan `SELECT ... FOR UPDATE`). Tidak ada trigger/stored
 * function di database: ketika status pesanan menjadi `completed`, UI memanggil
 * `omnixSetOrderStatus` yang melakukan update status + pemotongan saldo +
 * penulisan ledger sekaligus.
 *
 * Wallet & ledger bersifat **per tenant** (bukan per workspace); kolom rahasia
 * (`omnix_channel_secrets`) tidak pernah dikirim ke browser.
 */
import { createServerFn } from "@tanstack/react-start";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

import { OMNIX_BUNDLE, OMNIX_CHANNELS, OMNIX_FEE_PER_ORDER, OMNIX_ORDER_STATUS } from "@/lib/omnix";

/** Koneksi transaksi (khusus dipakai di dalam `transaction()`). */
type Tx = PoolConnection;

async function workspaceTenant(workspaceId: string): Promise<string> {
  const { executeOne } = await import("@/integrations/mysql/pool");
  const row = await executeOne<{ tenant_id: string }>(
    "SELECT tenant_id FROM workspaces WHERE id = ? LIMIT 1",
    [workspaceId],
  );
  if (!row?.tenant_id) throw new Error("Workspace tidak ditemukan");
  return row.tenant_id;
}

async function assertWriter(workspaceId: string, userId: string) {
  const { canWriteWorkspace } = await import("@/lib/auth-context.server");
  if (!(await canWriteWorkspace(workspaceId, userId))) throw new Error("Forbidden");
}

async function assertReader(workspaceId: string, userId: string) {
  const { canWriteWorkspace, isWorkspaceMember } = await import("@/lib/auth-context.server");
  if (
    !(await isWorkspaceMember(workspaceId, userId)) &&
    !(await canWriteWorkspace(workspaceId, userId))
  ) {
    throw new Error("Forbidden");
  }
}

/** Kunci saldo bersama lebih dulu (urutan kunci sama dengan `walletPostEntryOn`). */
async function lockAccount(tx: Tx, tenantId: string): Promise<number> {
  await tx.execute("INSERT IGNORE INTO wallet_accounts (tenant_id, balance_idr) VALUES (?, 0)", [
    tenantId,
  ]);
  const [rows] = await tx.execute<RowDataPacket[]>(
    "SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ? FOR UPDATE",
    [tenantId],
  );
  return Number(rows?.[0]?.balance_idr ?? 0);
}

/** Memastikan baris wallet ada, lalu mengunci barisnya untuk update. */
async function lockWallet(tx: Tx, tenantId: string) {
  await tx.execute(
    "INSERT INTO omnix_wallets (tenant_id) VALUES (?) ON DUPLICATE KEY UPDATE tenant_id = tenant_id",
    [tenantId],
  );
  const [rows] = await tx.execute<WalletRow[]>(
    "SELECT tenant_id, balance, bundle_quota, bundle_used, bundle_ends_at FROM omnix_wallets WHERE tenant_id = ? FOR UPDATE",
    [tenantId],
  );
  const wallet = rows?.[0];
  if (!wallet) {
    await tx.execute("INSERT INTO omnix_wallets (tenant_id) VALUES (?)", [tenantId]);
    return {
      tenant_id: tenantId,
      balance: 0,
      bundle_quota: 0,
      bundle_used: 0,
      bundle_ends_at: null,
    };
  }
  return { ...wallet, balance: Number(wallet.balance) };
}

interface WalletRow extends RowDataPacket {
  tenant_id: string;
  balance: number;
  bundle_quota: number;
  bundle_used: number;
  bundle_ends_at: string | null;
}

interface OrderLockRow extends RowDataPacket {
  id: string;
  order_no: string;
  status: string;
  fee_charged: number;
}

interface ChannelSettingLookupRow extends RowDataPacket {
  id: string;
  secret_hint: string | null;
}

function bundleActive(wallet: {
  bundle_quota: number;
  bundle_used: number;
  bundle_ends_at: string | null;
}) {
  if (!wallet.bundle_ends_at) return false;
  return (
    new Date(wallet.bundle_ends_at).getTime() > Date.now() &&
    Number(wallet.bundle_used) < Number(wallet.bundle_quota)
  );
}

export interface OmnixWalletView {
  tenant_id: string;
  balance: number;
  bundle_quota: number;
  bundle_used: number;
  bundle_ends_at: string | null;
}

/** Saldo + kuota paket untuk ditampilkan di UI. */
export const getOmnixWallet = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { workspaceId: string }) => {
    if (!data?.workspaceId) throw new Error("Workspace is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<OmnixWalletView | null> => {
    await assertReader(data.workspaceId, context.userId);
    const tenantId = await workspaceTenant(data.workspaceId);
    const { executeOne } = await import("@/integrations/mysql/pool");
    const row = await executeOne<OmnixWalletView>(
      `SELECT ? AS tenant_id, COALESCE(a.balance_idr, 0) AS balance, COALESCE(w.bundle_quota, 0) AS bundle_quota,
              COALESCE(w.bundle_used, 0) AS bundle_used, w.bundle_ends_at
         FROM (SELECT 1) x
         LEFT JOIN wallet_accounts a ON a.tenant_id = ?
         LEFT JOIN omnix_wallets w ON w.tenant_id = ?`,
      [tenantId, tenantId, tenantId],
    );
    return row
      ? { ...row, balance: Number(row.balance) }
      : { tenant_id: tenantId, balance: 0, bundle_quota: 0, bundle_used: 0, bundle_ends_at: null };
  });

export interface OmnixLedgerRow {
  id: string;
  kind: string;
  status: string;
  amount: number;
  balance_after: number | null;
  order_id: string | null;
  note: string | null;
  created_at: string;
}

export const listOmnixLedger = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { workspaceId: string; limit?: number }) => {
    if (!data?.workspaceId) throw new Error("Workspace is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<OmnixLedgerRow[]> => {
    await assertReader(data.workspaceId, context.userId);
    const tenantId = await workspaceTenant(data.workspaceId);
    const { execute } = await import("@/integrations/mysql/pool");
    const limit = Math.min(Math.max(Number(data.limit) || 100, 1), 500);
    const rows = await execute<OmnixLedgerRow>(
      `SELECT id, kind, status, amount, balance_after, order_id, note, created_at
         FROM omnix_wallet_ledger WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ${limit}`,
      [tenantId],
    );
    return rows ?? [];
  });

/** Beli paket bulanan dari saldo (Rp350.000 untuk 20.000 transaksi / 30 hari). */
export const omnixBuyBundle = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { workspaceId: string }) => {
    if (!data?.workspaceId) throw new Error("Workspace is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ balance: number }> => {
    await assertWriter(data.workspaceId, context.userId);
    const tenantId = await workspaceTenant(data.workspaceId);
    const { transaction } = await import("@/integrations/mysql/pool");
    const { walletPostEntryOn } = await import("@/lib/wallet.server");

    return transaction(async (conn) => {
      await lockAccount(conn, tenantId);
      const wallet = await lockWallet(conn, tenantId);
      if (bundleActive(wallet)) throw new Error("Paket masih aktif");
      let balance: number;
      try {
        const entry = await walletPostEntryOn(conn, {
          tenantId,
          type: "addon",
          amount: -OMNIX_BUNDLE.price,
          product: "omnix",
          ref: null,
          idem: `omnix-bundle:${tenantId}:${wallet.bundle_ends_at ?? "first"}`,
          description: `Paket Omnix ${OMNIX_BUNDLE.quota.toLocaleString("id-ID")} transaksi`,
          actor: context.userId,
        });
        balance = entry.balance_after;
      } catch (e) {
        if ((e as Error).message === "insufficient_balance") {
          throw new Error(
            `Saldo tidak cukup (butuh Rp${OMNIX_BUNDLE.price.toLocaleString("id-ID")})`,
          );
        }
        throw e;
      }
      await conn.execute(
        `UPDATE omnix_wallets SET bundle_quota = ?, bundle_used = 0,
           bundle_ends_at = DATE_ADD(NOW(), INTERVAL ${OMNIX_BUNDLE.days} DAY) WHERE tenant_id = ?`,
        [OMNIX_BUNDLE.quota, tenantId],
      );
      return { balance };
    });
  });

/**
 * Mengubah status pesanan. Bila status menjadi `completed`, biaya Omnix
 * ditagihkan **dalam transaksi yang sama** (pengganti trigger
 * `omnix_charge_completed_order` di BS New 3):
 * - paket aktif → kuota berkurang, biaya 0;
 * - selain itu → saldo dipotong `OMNIX_FEE_PER_ORDER`, gagal bila saldo kurang.
 * Idempoten lewat kolom `fee_charged`.
 */
export const omnixSetOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { workspaceId: string; orderId: string; status: string }) => {
    if (!data?.workspaceId || !data.orderId) throw new Error("Missing order");
    if (!OMNIX_ORDER_STATUS.includes(data.status as (typeof OMNIX_ORDER_STATUS)[number])) {
      throw new Error("Status pesanan tidak dikenal");
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<{ status: string; fee: number; balance: number }> => {
    await assertWriter(data.workspaceId, context.userId);
    const { transaction } = await import("@/integrations/mysql/pool");
    const { sqlDateTime } = await import("@/lib/datetime");

    return transaction(async (conn) => {
      const orders = (
        await conn.execute<OrderLockRow[]>(
          "SELECT id, order_no, status, fee_charged FROM omnix_orders WHERE id = ? AND workspace_id = ? FOR UPDATE",
          [data.orderId, data.workspaceId],
        )
      )[0];
      const order = orders?.[0];
      if (!order) throw new Error("Pesanan tidak ditemukan");

      // Bukan penyelesaian pesanan (atau sudah ditagih) → cukup ubah status.
      if (data.status !== "completed" || Number(order.fee_charged) === 1) {
        await conn.execute("UPDATE omnix_orders SET status = ? WHERE id = ?", [
          data.status,
          order.id,
        ]);
        return { status: data.status, fee: 0, balance: 0 };
      }

      const tenantId = await workspaceTenant(data.workspaceId);
      const { walletPostEntryOn } = await import("@/lib/wallet.server");
      let balance = await lockAccount(conn, tenantId);
      const wallet = await lockWallet(conn, tenantId);
      let fee = 0;

      if (bundleActive(wallet)) {
        // Paket aktif: kuota berkurang, biaya 0 (tanpa entri saldo, seperti BS New 11).
        await conn.execute(
          "UPDATE omnix_wallets SET bundle_used = bundle_used + 1 WHERE tenant_id = ?",
          [tenantId],
        );
      } else {
        fee = OMNIX_FEE_PER_ORDER;
        try {
          const entry = await walletPostEntryOn(conn, {
            tenantId,
            type: "usage",
            amount: -fee,
            product: "omnix",
            ref: order.id,
            idem: `omnix-order:${order.id}`,
            description: `Transaksi selesai: ${order.order_no}`,
            actor: context.userId,
          });
          balance = entry.balance_after;
        } catch (e) {
          if ((e as Error).message === "insufficient_balance")
            throw new Error("Saldo Omnix tidak cukup. Silakan top up saldo.");
          throw e;
        }
      }

      await conn.execute(
        "UPDATE omnix_orders SET status = 'completed', fee_charged = 1, omnix_fee = ?, completed_at = ? WHERE id = ?",
        [fee, sqlDateTime(), order.id],
      );
      return { status: "completed", fee, balance };
    });
  });

/* ----------------------------- pengaturan API ----------------------------- */

export interface OmnixChannelSettingRow {
  id: string;
  channel: string;
  partner_id: string | null;
  public_key: string | null;
  secret_hint: string | null;
  status: string;
  validated_at: string | null;
}

export const listOmnixChannelSettings = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { workspaceId: string }) => {
    if (!data?.workspaceId) throw new Error("Workspace is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<OmnixChannelSettingRow[]> => {
    await assertReader(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    const rows = await execute<OmnixChannelSettingRow>(
      "SELECT id, channel, partner_id, public_key, secret_hint, status, validated_at FROM omnix_channel_settings WHERE workspace_id = ?",
      [data.workspaceId],
    );
    return rows ?? [];
  });

/**
 * Menyimpan kunci API kanal. Secret hanya ditulis di server (tabel
 * `omnix_channel_secrets`) dan hanya jejaknya (`••••1234`) yang tampil di UI.
 */
export const omnixSaveChannelKeys = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    (data: {
      workspaceId: string;
      channel: string;
      partnerId: string;
      publicKey: string;
      secretKey?: string;
    }) => {
      if (!data?.workspaceId || !data.channel) throw new Error("Missing channel");
      return data;
    },
  )
  .handler(async ({ data, context }): Promise<{ status: string; hint: string | null }> => {
    const { hasWorkspaceRole } = await import("@/lib/auth-context.server");
    const { canWriteWorkspace } = await import("@/lib/auth-context.server");
    const allowed =
      (await hasWorkspaceRole(data.workspaceId, context.userId, ["owner", "admin"])) ||
      (await canWriteWorkspace(data.workspaceId, context.userId));
    if (!allowed) throw new Error("Hanya owner/admin yang dapat mengatur kunci API");

    if (!OMNIX_CHANNELS.some((c) => c.id === data.channel))
      throw new Error("Channel tidak dikenal");
    const partnerId = (data.partnerId ?? "").trim();
    const publicKey = (data.publicKey ?? "").trim();
    const secret = (data.secretKey ?? "").trim();
    if (partnerId.length < 3) throw new Error("Partner/App ID wajib diisi (min. 3 karakter)");
    if (publicKey.length < 8) throw new Error("Public key / Client key minimal 8 karakter");

    const { transaction, uuid } = await import("@/integrations/mysql/pool");
    const { sqlDateTime } = await import("@/lib/datetime");

    return transaction(async (conn) => {
      await conn.execute(
        "INSERT INTO omnix_channel_settings (id, workspace_id, channel) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE channel = channel",
        [uuid(), data.workspaceId, data.channel],
      );
      const rows = (
        await conn.execute<ChannelSettingLookupRow[]>(
          "SELECT id, secret_hint FROM omnix_channel_settings WHERE workspace_id = ? AND channel = ? LIMIT 1",
          [data.workspaceId, data.channel],
        )
      )[0];
      const setting = rows?.[0];
      if (!setting) throw new Error("Gagal menyimpan pengaturan kanal");

      let hint = setting.secret_hint;
      if (secret) {
        if (secret.length < 16) throw new Error("Secret key minimal 16 karakter");
        if (secret === publicKey) throw new Error("Secret key tidak boleh sama dengan public key");
        hint = `••••${secret.slice(-4)}`;
        await conn.execute(
          "INSERT INTO omnix_channel_secrets (setting_id, secret_key, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE secret_key = VALUES(secret_key), updated_at = VALUES(updated_at)",
          [setting.id, secret, sqlDateTime()],
        );
      } else if (!hint) {
        throw new Error("Secret key wajib diisi");
      }

      await conn.execute(
        "UPDATE omnix_channel_settings SET partner_id = ?, public_key = ?, secret_hint = ?, status = 'validated', validated_at = ? WHERE id = ?",
        [partnerId, publicKey, hint, sqlDateTime(), setting.id],
      );
      return { status: "validated", hint };
    });
  });

export const omnixClearChannelKeys = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { workspaceId: string; channel: string }) => {
    if (!data?.workspaceId || !data.channel) throw new Error("Missing channel");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertWriter(data.workspaceId, context.userId);
    const { transaction } = await import("@/integrations/mysql/pool");
    await transaction(async (conn) => {
      const rows = (
        await conn.execute<ChannelSettingLookupRow[]>(
          "SELECT id, secret_hint FROM omnix_channel_settings WHERE workspace_id = ? AND channel = ? LIMIT 1",
          [data.workspaceId, data.channel],
        )
      )[0];
      const setting = rows?.[0];
      if (setting)
        await conn.execute("DELETE FROM omnix_channel_secrets WHERE setting_id = ?", [setting.id]);
      await conn.execute(
        "DELETE FROM omnix_channel_settings WHERE workspace_id = ? AND channel = ?",
        [data.workspaceId, data.channel],
      );
    });
    return { ok: true };
  });
