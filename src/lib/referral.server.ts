/**
 * Referral (BS New 12, migrasi 0024): padanan fungsi SQL `referral_my_code`, `referral_claim` dan trigger
 * `topups_referral_reward`. Tanpa trigger di Old → `rewardReferralOn` dipanggil di dalam transaksi `walletSettleTopup`.
 */
import type { PoolConnection } from "mysql2/promise";
import { createHash } from "node:crypto";
import { execute, executeOne, uuid } from "@/integrations/mysql/pool";
import { walletPostEntryOn } from "./wallet.server";

/** Tenant milik pengguna (pemilik terlama), sama dengan `... WHERE owner_id=auth.uid() ORDER BY created_at LIMIT 1`. */
async function ownTenant(userId: string) {
  return executeOne<{ id: string; created_at: string }>(
    "SELECT id, created_at FROM tenants WHERE owner_id = ? ORDER BY created_at LIMIT 1",
    [userId],
  );
}

const newCode = () => createHash("md5").update(uuid()).digest("hex").slice(0, 8).toUpperCase();

export async function referralMyCode(userId: string): Promise<string> {
  const t = await ownTenant(userId);
  if (!t) throw new Error("no_tenant");
  const have = await executeOne<{ code: string }>(
    "SELECT code FROM referral_codes WHERE tenant_id = ?",
    [t.id],
  );
  if (have) return have.code;
  for (let i = 0; i < 8; i++) {
    const code = newCode();
    try {
      await execute("INSERT INTO referral_codes (tenant_id, code) VALUES (?, ?)", [t.id, code]);
      return code;
    } catch (e) {
      if ((e as { code?: string }).code !== "ER_DUP_ENTRY") throw e;
      const again = await executeOne<{ code: string }>(
        "SELECT code FROM referral_codes WHERE tenant_id = ?",
        [t.id],
      );
      if (again) return again.code; // balapan: tenant sudah punya kode
    }
  }
  throw new Error("referral_code_unavailable");
}

/** Klaim kode: hanya tenant ≤7 hari, belum pernah top-up berbayar, kode ada, bukan kode sendiri. */
export async function referralClaim(userId: string, rawCode: string): Promise<boolean> {
  const t = await ownTenant(userId);
  if (!t) return false;
  if (Date.parse(`${String(t.created_at).replace(" ", "T")}Z`) < Date.now() - 7 * 86_400_000)
    return false;
  const code = (rawCode ?? "").trim().toUpperCase();
  const r = await executeOne<{ tenant_id: string }>(
    "SELECT tenant_id FROM referral_codes WHERE code = ?",
    [code],
  );
  if (!r || r.tenant_id === t.id) return false;
  if (
    await executeOne("SELECT 1 AS ok FROM topups WHERE tenant_id = ? AND status = 'paid' LIMIT 1", [
      t.id,
    ])
  )
    return false;
  const res = await execute(
    "INSERT IGNORE INTO referrals (referred_tenant_id, referrer_tenant_id) VALUES (?, ?)",
    [t.id, r.tenant_id],
  );
  return Boolean((res as unknown as { affectedRows?: number })?.affectedRows);
}

/**
 * Komisi referral dibayar pada pembelian paket berbayar pertama teman (mis. Pro/Agency), di transaksi yang sama.
 * Syarat: program aktif, nilai pembelian >= minimum (`min_topup_idr`, dipakai sebagai minimal pembelian paket),
 * dan teman pernah top-up dengan uang sungguhan (paket tidak dibayar dari saldo bonus semata).
 * Komisi = persen x nilai pembelian, maksimal `max_idr`; hanya sekali per teman.
 */
export async function rewardReferralOn(
  conn: PoolConnection,
  purchase: { ref: string; tenant_id: string; amount_idr: number },
) {
  const [srows] = await conn.execute("SELECT * FROM referral_settings WHERE singleton = 1");
  const s = (
    srows as { enabled: number; percent: number; max_idr: number; min_topup_idr: number }[]
  )[0];
  const amount = Number(purchase.amount_idr);
  if (!s || !s.enabled || amount <= 0 || amount < Number(s.min_topup_idr)) return;
  const [rrows] = await conn.execute(
    "SELECT * FROM referrals WHERE referred_tenant_id = ? AND status = 'pending' FOR UPDATE",
    [purchase.tenant_id],
  );
  const ref = (rrows as { referrer_tenant_id: string }[])[0];
  if (!ref) return;
  const [paid] = await conn.execute(
    "SELECT 1 AS ok FROM topups WHERE tenant_id = ? AND status = 'paid' LIMIT 1",
    [purchase.tenant_id],
  );
  if (!(paid as unknown[]).length) return;
  const amt = Math.min(Math.floor((amount * Number(s.percent)) / 100), Number(s.max_idr));
  if (amt > 0)
    await walletPostEntryOn(conn, {
      tenantId: ref.referrer_tenant_id,
      type: "voucher",
      amount: amt,
      product: "referral",
      ref: purchase.ref,
      idem: `referral:${purchase.tenant_id}`,
      description: "Komisi referral",
      actor: null,
      invoice: null,
    });
  await conn.execute(
    "UPDATE referrals SET status = 'rewarded', commission_idr = ?, topup_id = NULL, rewarded_at = NOW(6) WHERE referred_tenant_id = ?",
    [amt, purchase.tenant_id],
  );
}
