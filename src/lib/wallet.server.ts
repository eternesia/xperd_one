/**
 * Wallet tenant bersama (BS New 11) — inti server.
 * Padanan fungsi SQL `wallet_post_entry` / `wallet_create_topup` / `wallet_settle_topup`:
 * transaksi aplikasi + `SELECT … FOR UPDATE` + kunci idempotensi unik. `wallet_ledger` hanya
 * ditambah (tidak ada UPDATE/DELETE di mana pun); saldo tidak pernah negatif.
 */
import type { PoolConnection } from "mysql2/promise";
import { execute, executeOne, transaction, uuid } from "@/integrations/mysql/pool";

export type WalletEntryType =
  "topup" | "subscription" | "addon" | "usage" | "refund" | "adjustment" | "voucher";

export interface PostEntryInput {
  tenantId: string;
  type: WalletEntryType;
  amount: number;
  product: string;
  ref: string | null;
  idem: string;
  description: string;
  actor?: string | null;
  invoice?: string | null;
}
export interface LedgerRow {
  id: string;
  tenant_id: string;
  entry_type: string;
  amount_idr: number;
  balance_after: number;
  product_code: string;
  ref_id: string | null;
  invoice_id: string | null;
  idempotency_key: string;
  description: string;
}

/** Entri wallet di dalam transaksi pemanggil (saldo dikunci); idempoten dengan pemeriksaan kesesuaian. */
export async function walletPostEntryOn(
  conn: PoolConnection,
  p: PostEntryInput,
): Promise<LedgerRow> {
  if (!Number.isInteger(p.amount) || p.amount === 0 || (p.idem ?? "").length < 3)
    throw new Error("invalid_wallet_entry");
  await conn.execute("INSERT IGNORE INTO wallet_accounts (tenant_id, balance_idr) VALUES (?, 0)", [
    p.tenantId,
  ]);
  const [accs] = await conn.execute(
    "SELECT balance_idr FROM wallet_accounts WHERE tenant_id = ? FOR UPDATE",
    [p.tenantId],
  );
  const balance = Number((accs as { balance_idr: number }[])[0].balance_idr);
  const [prior] = await conn.execute("SELECT * FROM wallet_ledger WHERE idempotency_key = ?", [
    p.idem,
  ]);
  const v = (prior as LedgerRow[])[0];
  if (v) {
    const same =
      v.tenant_id === p.tenantId &&
      Number(v.amount_idr) === p.amount &&
      v.entry_type === p.type &&
      v.product_code === p.product &&
      (v.ref_id ?? null) === (p.ref ?? null) &&
      (v.invoice_id ?? null) === (p.invoice ?? null);
    if (!same) throw new Error("idempotency_conflict");
    return { ...v, amount_idr: Number(v.amount_idr), balance_after: Number(v.balance_after) };
  }
  if (balance + p.amount < 0) throw new Error("insufficient_balance");
  const after = balance + p.amount;
  const id = uuid();
  await conn.execute(
    `INSERT INTO wallet_ledger (id, tenant_id, entry_type, amount_idr, balance_after, product_code, ref_id, idempotency_key, description, created_by, invoice_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      p.tenantId,
      p.type,
      p.amount,
      after,
      p.product,
      p.ref,
      p.idem,
      p.description,
      p.actor ?? null,
      p.invoice ?? null,
    ],
  );
  await conn.execute("UPDATE wallet_accounts SET balance_idr = ? WHERE tenant_id = ?", [
    after,
    p.tenantId,
  ]);
  // Cermin kompatibilitas Omnix: saldo bersama adalah sumber kebenaran.
  await conn.execute(
    "INSERT INTO omnix_wallets (tenant_id, balance) VALUES (?, ?) ON DUPLICATE KEY UPDATE balance = VALUES(balance)",
    [p.tenantId, after],
  );
  return {
    id,
    tenant_id: p.tenantId,
    entry_type: p.type,
    amount_idr: p.amount,
    balance_after: after,
    product_code: p.product,
    ref_id: p.ref,
    invoice_id: p.invoice ?? null,
    idempotency_key: p.idem,
    description: p.description,
  };
}
export const walletPostEntry = (p: PostEntryInput) =>
  transaction((conn) => walletPostEntryOn(conn, p));

export interface WalletSettings {
  min_topup_idr: number;
  max_topup_idr: number;
  presets: number[];
}
export async function walletGetSettings(): Promise<WalletSettings> {
  await execute(
    "INSERT IGNORE INTO wallet_settings (singleton, presets) VALUES (1, JSON_ARRAY(50000, 100000, 250000, 500000, 1000000))",
  );
  const s = await executeOne<{ min_topup_idr: number; max_topup_idr: number; presets: unknown }>(
    "SELECT * FROM wallet_settings WHERE singleton = 1",
  );
  if (!s) throw new Error("wallet_settings_unavailable");
  const presets = typeof s.presets === "string" ? JSON.parse(s.presets) : (s.presets as number[]);
  return {
    min_topup_idr: Number(s.min_topup_idr),
    max_topup_idr: Number(s.max_topup_idr),
    presets: presets.map(Number),
  };
}

/** Pemilik tenant atau owner/admin salah satu workspace-nya. */
export async function canManageTenantWallet(tenantId: string, userId: string): Promise<boolean> {
  const row = await executeOne(
    `SELECT 1 AS ok FROM tenants t WHERE t.id = ? AND t.owner_id = ?
     UNION ALL
     SELECT 1 FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
      WHERE w.tenant_id = ? AND m.user_id = ? AND m.role IN ('owner','admin') LIMIT 1`,
    [tenantId, userId, tenantId, userId],
  );
  return Boolean(row);
}
/** Anggota tenant (pemilik atau anggota workspace mana pun). */
export async function isTenantMember(tenantId: string, userId: string): Promise<boolean> {
  const row = await executeOne(
    `SELECT 1 AS ok FROM tenants t WHERE t.id = ? AND t.owner_id = ?
     UNION ALL
     SELECT 1 FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id WHERE w.tenant_id = ? AND m.user_id = ? LIMIT 1`,
    [tenantId, userId, tenantId, userId],
  );
  return Boolean(row);
}

export interface TopupRow {
  id: string;
  tenant_id: string;
  amount_idr: number;
  gateway_id: string | null;
  gateway: string;
  status: string;
  idempotency_key: string;
  gateway_ref: string | null;
  payment_url: string | null;
  proof_path: string | null;
  note: string;
  review_note: string | null;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  late_payment: number;
  invoice_id: string | null;
}

export async function walletCreateTopup(p: {
  tenantId: string;
  amount: number;
  gatewayId: string;
  idem: string;
  actor: string;
  note: string;
}): Promise<TopupRow> {
  if (!(await canManageTenantWallet(p.tenantId, p.actor))) throw new Error("Forbidden");
  const same = (r: TopupRow) =>
    r.tenant_id === p.tenantId &&
    Number(r.amount_idr) === p.amount &&
    r.gateway_id === p.gatewayId &&
    r.created_by === p.actor;
  const prior = await executeOne<TopupRow>("SELECT * FROM topups WHERE idempotency_key = ?", [
    p.idem,
  ]);
  if (prior) {
    if (!same(prior)) throw new Error("idempotency_conflict");
    return prior;
  }
  const s = await walletGetSettings();
  if (!Number.isInteger(p.amount) || p.amount < s.min_topup_idr || p.amount > s.max_topup_idr)
    throw new Error("invalid_topup_amount");
  const g = await executeOne<{ id: string; provider: string }>(
    "SELECT id, provider FROM payment_gateways WHERE id = ? AND is_active = 1",
    [p.gatewayId],
  );
  if (!g || !["manual_transfer", "midtrans", "doku"].includes(g.provider))
    throw new Error("gateway_unavailable");
  const id = uuid();
  try {
    await execute(
      `INSERT INTO topups (id, tenant_id, amount_idr, gateway_id, gateway, idempotency_key, created_by, note, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${g.provider === "midtrans" || g.provider === "doku" ? "DATE_ADD(NOW(6), INTERVAL 24 HOUR)" : "NULL"})`,
      [id, p.tenantId, p.amount, g.id, g.provider, p.idem, p.actor, p.note.slice(0, 1000)],
    );
  } catch (e) {
    if ((e as { code?: string }).code !== "ER_DUP_ENTRY") throw e;
    const again = await executeOne<TopupRow>("SELECT * FROM topups WHERE idempotency_key = ?", [
      p.idem,
    ]);
    if (!again || !same(again)) throw new Error("idempotency_conflict");
    return again;
  }
  return (await executeOne<TopupRow>("SELECT * FROM topups WHERE id = ?", [id])) as TopupRow;
}

/** Setujui/tolak top-up. Manual = wajib Super Admin; gateway = hanya setelah verifikasi gateway. */
export async function walletSettleTopup(p: {
  id: string;
  approve: boolean;
  actor?: string | null;
  note?: string;
  gatewayVerified?: boolean;
  isAdmin?: boolean;
}): Promise<TopupRow> {
  if (!p.gatewayVerified && !p.isAdmin) throw new Error("Forbidden");
  const settled = await transaction(async (conn) => {
    const [rows] = await conn.execute("SELECT * FROM topups WHERE id = ? FOR UPDATE", [p.id]);
    const r = (rows as TopupRow[])[0];
    if (!r) throw new Error("topup_not_found");
    if (p.gatewayVerified && r.gateway === "manual_transfer") throw new Error("invalid_gateway");
    if (!p.gatewayVerified && r.gateway !== "manual_transfer")
      throw new Error("gateway_verification_required");
    if (r.status === "paid") {
      if (!p.approve) throw new Error("topup_already_paid");
      return r;
    }
    if (r.status === "rejected") {
      if (!p.approve) return r;
      throw new Error("topup_already_rejected");
    }
    if (!p.gatewayVerified && r.status !== "pending") throw new Error("topup_not_pending");
    const note = p.note ?? "";
    if (!p.approve) {
      if (!note.trim()) throw new Error("review_reason_required");
      await conn.execute(
        "UPDATE topups SET status = 'rejected', approved_by = ?, review_note = ?, reviewed_at = NOW(6) WHERE id = ?",
        [p.actor ?? null, note, p.id],
      );
      const [after] = await conn.execute("SELECT * FROM topups WHERE id = ?", [p.id]);
      return (after as TopupRow[])[0];
    }
    const invoiceId = uuid();
    await conn.execute(
      `INSERT INTO invoices (id, invoice_number, tenant_id, status, subtotal, total, paid_at, payment_method, gateway_reference, notes, product)
       VALUES (?, ?, ?, 'paid', ?, ?, NOW(6), ?, ?, 'Tanda terima deposit saldo (bukan aktivasi langganan)', 'wallet')`,
      [invoiceId, `TOP-${r.id}`, r.tenant_id, r.amount_idr, r.amount_idr, r.gateway, r.gateway_ref],
    );
    await walletPostEntryOn(conn, {
      tenantId: r.tenant_id,
      type: "topup",
      amount: Number(r.amount_idr),
      product: "platform",
      ref: r.id,
      idem: `topup:${r.id}`,
      description: "Deposit saldo",
      actor: p.actor ?? null,
      invoice: invoiceId,
    });
    const late =
      r.status === "expired" ||
      (r.expires_at !== null &&
        Date.parse(String(r.expires_at).replace(" ", "T") + "Z") < Date.now())
        ? 1
        : 0;
    await conn.execute(
      "UPDATE topups SET status = 'paid', paid_at = NOW(6), reviewed_at = NOW(6), approved_by = ?, review_note = ?, invoice_id = ?, late_payment = ? WHERE id = ?",
      [p.actor ?? null, note, invoiceId, late, p.id],
    );
    // Referral (New 12): komisi untuk referrer pada top-up pertama yang berhasil, satu transaksi dengan top-up.
    const { rewardReferralOn } = await import("./referral.server");
    await rewardReferralOn(conn, {
      id: r.id,
      tenant_id: r.tenant_id,
      amount_idr: Number(r.amount_idr),
    });
    const [after] = await conn.execute("SELECT * FROM topups WHERE id = ?", [p.id]);
    return (after as TopupRow[])[0];
  });
  // Bukti pembayaran via email: best-effort, di luar transaksi; dedupe per invoice mencegah kirim ganda.
  if (settled.status === "paid" && settled.invoice_id) {
    const invoiceId = String(settled.invoice_id);
    void import("./billing-notifications.server")
      .then((m) => m.sendInvoiceReceiptNow(invoiceId))
      .catch(() => {});
  }
  return settled;
}
